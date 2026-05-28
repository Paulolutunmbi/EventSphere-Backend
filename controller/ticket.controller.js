import QRCode from 'qrcode'
import Ticket from '../model/ticket.model.js'
import Event from '../model/event.model.js'
import { sendEmail } from '../services/emailService.js'
import { ticketEmailTemplate } from '../services/emailTemplates.js'
import { initializePaystackPayment, verifyPaystackPayment as verifyPaystackTransaction } from '../services/paystackService.js'
import { sendError, sendSuccess } from '../utils/response.js'

/* ── send ticket email with QR ── */
/* ── send ticket email with QR (Fixed using CID) ── */
async function sendTicketEmail(ticket, event) {
  const ticketUrl = buildTicketUrl(ticket.ticketId)
  
  // 1. Generate a Buffer instead of a Data URL
  const qrBuffer = await QRCode.toBuffer(ticketUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#0a0a0a', light: '#ffffff' },
  })

  // 2. Pass a static CID string to your template instead of the huge base64 string
  const template = ticketEmailTemplate({ event, ticket, ticketUrl, qrDataUrl: 'cid:ticketqrcode' })
  
  await sendEmail({
    to: ticket.attendeeEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    // 3. Add the attachments array for Nodemailer (or your email service provider)
    attachments: [
      {
        filename: 'qrcode.png',
        content: qrBuffer,
        cid: 'ticketqrcode' // This must match the string inside your template's img src
      }
    ]
  })
}

export async function getTicketQr(req, res) {
  try {
    const { ticketId } = req.params
    const ticket = await Ticket.findOne({ ticketId })
    if (!ticket) return sendError(res, 404, 'Ticket not found')

    const ticketUrl = buildTicketUrl(ticket.ticketId)
    const buffer = await QRCode.toBuffer(ticketUrl, { width: 400, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } })

    res.setHeader('Content-Type', 'image/png')
    return res.send(buffer)
  } catch (err) {
    console.error('Get ticket QR error:', err)
    return sendError(res, 500, 'Failed to generate QR')
  }
}

/* ─────────────────────────────────────────────────
   Paystack initialization — single place so both
   new tickets and retries share the same metadata
───────────────────────────────────────────────── */
function getTicketBaseKobo(event, ticketType) {
  // ticketPrices stored in Naira as numbers (regular, vip, table)
  if (event?.ticketPrices && typeof event.ticketPrices === 'object') {
    const val = event.ticketPrices[ticketType]
    if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val * 100)
  }
  return parsePriceToKobo(event.ticketPrice)
}

async function initializeTicketPayment({ email, name, ticket, event, ticketType, donationNaira = 0 }) {
  const priceInKobo = getTicketBaseKobo(event, ticketType)
  const donationKobo = Math.max(0, Math.round(Number(donationNaira || 0) * 100))
  const feeInKobo = calculateTicketFee(priceInKobo)
  const totalAmountInKobo = priceInKobo + donationKobo + feeInKobo
  const appUrl      = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')

  const metadata = {
    platform: 'eventsnest',
    ticket_id: ticket.ticketId,
    ticket_type: ticketType,
    event_id: String(event._id),
    event_title: event.title,
    event_date: event.startDate,
    event_time: event.startTime,
    event_location: event.location || '',
    organiser_id: String(event.organizerId),
    base_amount: String(priceInKobo),
    fee_amount: String(feeInKobo),
    donation_amount: String(donationKobo),
    total_amount: String(totalAmountInKobo),
    attendee_name: name,
    attendee_email: email,
    custom_fields: [
      { display_name: 'Platform', variable_name: 'platform', value: 'EventsNest' },
      { display_name: 'Event', variable_name: 'event_title', value: event.title },
      { display_name: 'Ticket ID', variable_name: 'ticket_id', value: ticket.ticketId },
      { display_name: 'Attendee', variable_name: 'attendee_name', value: name },
    ],
  }

  const { authorizationUrl, reference } = await initializePaystackPayment({
    email,
    amount: totalAmountInKobo,
    currency: 'NGN',
    callbackUrl: `${appUrl}/tickets/${ticket.ticketId}?reference={PAYSTACK_REFERENCE}`,
    metadata,
    channels: ['card', 'bank_transfer', 'ussd', 'bank'],
  })

  return {
    authUrl: authorizationUrl,
    reference,
    amount:    totalAmountInKobo,
    fee:       feeInKobo,
    baseAmount: priceInKobo,
    donation: donationKobo,
  }
}

/* ─────────────────────────────────────────────────
   POST /api/events/:eventId/register
   Body: { name, email, ticketType? }
───────────────────────────────────────────────── */
export async function registerForEvent(req, res) {
  try {
    const { eventId } = req.params
    const nameInput  = String(req.body?.name  || '').trim()
    const email      = String(req.body?.email || '').trim().toLowerCase()
    const ticketType = String(req.body?.ticketType || 'regular').trim() || 'regular'
    const name       = nameInput || deriveNameFromEmail(email)

    if (!email) return sendError(res, 400, 'Email is required')

    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')

    if (!name) return sendError(res, 400, 'Could not derive a name from the email provided')

    const isFree = isFreeTicketPrice(event.ticketPrice)
      const donationInput = Number(req.body?.donation || 0)
      const donationNaira = Number.isFinite(donationInput) && donationInput > 0 ? donationInput : 0

    /* ── duplicate check ── */
    const existing = await Ticket.findOne({ eventId, attendeeEmail: email })
    if (existing) {
      if (existing.status === 'confirmed' || existing.status === 'checked-in') {
        return sendSuccess(res, 'A ticket for this email already exists', {
          ticket: toClientTicket(existing), paymentRequired: false, redirect: null,
        })
      }

      if (existing.status === 'pending') {
        if (isFree) {
          existing.status = 'confirmed'
          existing.attendeeName = existing.attendeeName || name
          await existing.save()
          sendTicketEmail(existing, event).catch(console.error)
          return sendSuccess(res, 'Your ticket has been confirmed.', {
            ticket: toClientTicket(existing), paymentRequired: false, redirect: null,
          })
        }

        // retry payment for existing pending ticket
        const { authUrl, reference } = await initializeTicketPayment({ email, name, ticket: existing, event, ticketType, donationNaira })
        existing.paymentReference = reference
        await existing.save()
        return sendSuccess(res, 'Proceed to payment', {
          ticket: toClientTicket(existing), paymentRequired: true, redirect: authUrl,
        })
      }
    }

    /* ── FREE flow ── */
    if (isFree) {
      const ticket = await Ticket.create({
        eventId, attendeeName: name, attendeeEmail: email,
        ticketType, price: 0, status: 'confirmed',
      })
      sendTicketEmail(ticket, event).catch(console.error)
      return sendSuccess(res, 'Registered! Check your email for your ticket.', {
        ticket: toClientTicket(ticket), paymentRequired: false, redirect: null,
      }, 201)
    }

    /* ── PAID flow ── */
    const priceInKobo = getTicketBaseKobo(event, ticketType)
    const donationKobo = Math.max(0, Math.round(donationNaira * 100))

    // create pending ticket first so we have a ticketId for the metadata
    const ticket = await Ticket.create({
      eventId, attendeeName: name, attendeeEmail: email,
      ticketType, price: (priceInKobo + donationKobo) / 100, status: 'pending',
    })

    const { authUrl, reference } = await initializeTicketPayment({ email, name, ticket, event, ticketType, donationNaira })
    ticket.paymentReference = reference
    await ticket.save()

    return sendSuccess(res, 'Proceed to payment', {
      ticket: toClientTicket(ticket),
      paymentRequired: true,
      redirect: authUrl,
    }, 201)
  } catch (err) {
    console.error('Register error:', err)
    return sendError(res, 500, 'Registration failed')
  }
}

/* ─────────────────────────────────────────────────
   POST /api/tickets/paystack/verify
   Body: { ticketId, reference }
   Called by the ticket page after Paystack redirects back.
───────────────────────────────────────────────── */
export async function verifyPaystackPayment(req, res) {
  try {
    const ticketId  = String(req.body?.ticketId  || '').trim()
    const reference = String(req.body?.reference || '').trim()

    if (!ticketId || !reference) {
      return sendError(res, 400, 'ticketId and reference are required')
    }
    const ticket = await Ticket.findOne({ ticketId })
    if (!ticket) return sendError(res, 404, 'Ticket not found')

    // idempotent — already confirmed, just return it
    if (ticket.status === 'confirmed' || ticket.status === 'checked-in') {
      const event = await Event.findById(ticket.eventId)
      return sendSuccess(res, 'Payment already verified', { ticket: toClientTicket(ticket), event })
    }

    // verify with Paystack
    const payload = await verifyPaystackTransaction(reference)
    if (payload.data?.status !== 'success') {
      return sendError(res, 400, 'Payment not completed yet')
    }

    // safety check — metadata ticket_id must match
    const meta = payload.data?.metadata || {}
    if (meta.ticket_id && meta.ticket_id !== ticket.ticketId) {
      return sendError(res, 400, 'Reference does not match this ticket')
    }

    // ensure paid amount matches expected total recorded in metadata
    const paidAmount = Number(payload.data?.amount || 0)
    const expectedTotal = Number(meta.total_amount || meta.totalAmount || 0)
    if (expectedTotal && paidAmount !== expectedTotal) {
      return sendError(res, 400, 'Payment amount does not match expected total')
    }

    ticket.status           = 'confirmed'
    ticket.paymentReference = reference
    await ticket.save()

    const event = await Event.findById(ticket.eventId)
    if (event) sendTicketEmail(ticket, event).catch(console.error)

    return sendSuccess(res, 'Payment verified. Check your email for your ticket.', {
      ticket: toClientTicket(ticket),
      event,
    })
  } catch (err) {
    console.error('Verify payment error:', err)
    return sendError(res, 500, 'Payment verification failed')
  }
}

/* ─────────────────────────────────────────────────
   GET /api/tickets/:ticketId   (public)
───────────────────────────────────────────────── */
export async function getTicket(req, res) {
  try {
    const ticket = await Ticket.findOne({ ticketId: req.params.ticketId })
    if (!ticket) return sendError(res, 404, 'Ticket not found')
    const event = await Event.findById(ticket.eventId)
    return sendSuccess(res, 'Ticket loaded', { ticket: toClientTicket(ticket), event })
  } catch (err) {
    return sendError(res, 500, 'Failed to load ticket')
  }
}

/* ─────────────────────────────────────────────────
   POST /api/tickets/:ticketId/verify   (protected)
   QR scanner calls this at the door
───────────────────────────────────────────────── */
export async function verifyTicket(req, res) {
  try {
    const { ticketId } = req.params
    const ticket = await Ticket.findOne({ ticketId })

    if (!ticket) return sendError(res, 404, 'Ticket not found', { valid: false })

    const event = await Event.findOne({ _id: ticket.eventId, organizerId: req.user.userId })
    if (!event)  return sendError(res, 403, 'Not your event', { valid: false })

    if (ticket.status === 'pending')     return sendError(res, 400, 'Payment not completed', { valid: false })
    if (ticket.status === 'checked-in')  return sendError(res, 409, 'Ticket already used', { valid: false, checkedInAt: ticket.checkedInAt })

    ticket.status      = 'checked-in'
    ticket.checkedInAt = new Date()
    await ticket.save()

    return sendSuccess(res, 'Check-in successful', {
      valid: true,
      ticket: toClientTicket(ticket),
      event: { title: event.title, startDate: event.startDate, startTime: event.startTime },
    })
  } catch (err) {
    return sendError(res, 500, 'Verification failed', { valid: false })
  }
}

/* ─────────────────────────────────────────────────
   GET /api/events/:eventId/tickets   (protected)
───────────────────────────────────────────────── */
export async function listEventTickets(req, res) {
  try {
    const { eventId } = req.params
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')
    const tickets = await Ticket.find({ eventId }).sort({ createdAt: -1 })
    return sendSuccess(res, 'Tickets loaded', { tickets: tickets.map(toClientTicket) })
  } catch (err) {
    return sendError(res, 500, 'Failed to load tickets')
  }
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function toClientTicket(t) {
  return {
    id: t._id, ticketId: t.ticketId, eventId: t.eventId,
    attendeeName: t.attendeeName, attendeeEmail: t.attendeeEmail,
    ticketType: t.ticketType, price: t.price, status: t.status,
    paymentReference: t.paymentReference,
    checkedInAt: t.checkedInAt, createdAt: t.createdAt,
  }
}

function parsePriceToKobo(priceString) {
  const num = parseFloat(String(priceString).replace(/[^0-9.]/g, ''))
  if (isNaN(num) || num <= 0) return 50000
  return Math.round(num * 100)
}

function calculateTicketFee(priceInKobo) {
  if (!Number.isFinite(priceInKobo) || priceInKobo <= 0) return 0

  const percentageFee = Math.round(priceInKobo * 0.02)
  const minimumFee = 10000
  return Math.max(minimumFee, percentageFee)
}

function deriveNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || ''
  return local.replace(/[._+-]+/g, ' ').trim()
    .split(' ').filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function buildTicketUrl(ticketId) {
  return `${(process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')}/tickets/${ticketId}`
}

function isFreeTicketPrice(priceValue) {
  const n = String(priceValue ?? '').trim().toLowerCase()
  if (!n || n === 'free') return true
  const num = Number(n.replace(/[^0-9.]/g, ''))
  return Number.isFinite(num) && num <= 0
}