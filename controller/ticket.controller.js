import QRCode from 'qrcode'
import nodemailer from 'nodemailer'
import Ticket from '../model/ticket.model.js'
import Event from '../model/event.model.js'

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY

function sendError(res, status, message) {
  return res.status(status).json({ message, success: false })
}

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   Number(process.env.EMAIL_PORT),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  })
}

/* ── send ticket email with QR ── */
async function sendTicketEmail(ticket, event) {
  const ticketUrl = buildTicketUrl(ticket.ticketId)
  const qrDataUrl = await QRCode.toDataURL(ticketUrl, {
    width: 400, margin: 2,
    color: { dark: '#0a0a0a', light: '#ffffff' },
  })
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '')

  const transporter = getTransporter()
  await transporter.sendMail({
    from:    `"EventSphere" <${process.env.EMAIL_USER}>`,
    to:      ticket.attendeeEmail,
    subject: `Your ticket for ${event.title} ✦`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;
                  background:#14141a;color:#e8e8ec;border-radius:16px;overflow:hidden;">
        <div style="background:#1c1c24;padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.07)">
          <p style="margin:0 0 4px;font-size:22px;color:#a78bfa">✦</p>
          <h1 style="margin:0;font-size:22px;font-weight:800">${event.title}</h1>
          <p style="margin:6px 0 0;color:#6b6b76;font-size:14px">
            ${event.startDate} · ${event.startTime}${event.location ? ' · ' + event.location : ''}
          </p>
        </div>
        <div style="padding:28px 32px;text-align:center">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b6b76">Your ticket</p>
          <p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#f0f0f4">${ticket.attendeeName}</p>
          <img src="cid:qrcode" alt="QR code" style="width:200px;height:200px;border-radius:12px;border:4px solid #2a2a32" />
          <p style="margin:16px 0 0;font-size:11px;color:#3d3d4a;font-family:monospace;letter-spacing:.1em">${ticket.ticketId}</p>
          <p style="margin:10px 0 0;font-size:12px;color:#6b6b76">
            Open your ticket: <a href="${ticketUrl}" style="color:#a78bfa;text-decoration:none">${ticketUrl}</a>
          </p>
        </div>
        <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:#3d3d4a;font-size:12px">
          Show this QR code at the entrance. One-time use only.
        </div>
      </div>
    `,
    attachments: [{
      filename: 'ticket-qr.png', content: qrBase64,
      encoding: 'base64', cid: 'qrcode', contentType: 'image/png',
    }],
  })
}

/* ─────────────────────────────────────────────────
   Paystack initialization — single place so both
   new tickets and retries share the same metadata
───────────────────────────────────────────────── */
async function initializePaystackPayment({ email, name, ticket, event, ticketType }) {
  const priceInKobo = parsePriceToKobo(event.ticketPrice)
  const feeInKobo = calculateTicketFee(priceInKobo)
  const totalAmountInKobo = priceInKobo + feeInKobo
  const appUrl      = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')

  const body = {
    email,
    amount:       totalAmountInKobo,
    currency:     'NGN',
    // Paystack redirects here after payment — we read ?reference= to verify
    callback_url: `${appUrl}/tickets/${ticket.ticketId}?reference={PAYSTACK_REFERENCE}`,

    metadata: {
      // ─── platform tag ───────────────────────────────────────────────────
      // This is what tells you "this money is EventSphere, not Streambox"
      // when you look at a transaction in your Paystack dashboard.
      platform: 'eventsphere',

      // ─── ticket ─────────────────────────────────────────────────────────
      ticket_id:   ticket.ticketId,
      ticket_type: ticketType,

      // ─── event ──────────────────────────────────────────────────────────
      event_id:       String(event._id),
      event_title:    event.title,
      event_date:     event.startDate,
      event_time:     event.startTime,
      event_location: event.location || '',

      // ─── organiser ──────────────────────────────────────────────────────
      // Lets you trace which organiser earned what when you add payouts
      organiser_id: String(event.organizerId),

      // ─── amount breakdown ──────────────────────────────────────────────
      base_amount: String(priceInKobo),
      fee_amount: String(feeInKobo),
      total_amount: String(totalAmountInKobo),

      // ─── attendee ───────────────────────────────────────────────────────
      attendee_name:  name,
      attendee_email: email,

      // ─── custom_fields ──────────────────────────────────────────────────
      // These show as labelled rows inside each transaction in the
      // Paystack dashboard — makes manual review very easy
      custom_fields: [
        {
          display_name:  'Platform',
          variable_name: 'platform',
          value:         'EventSphere',   // vs "Streambox"
        },
        {
          display_name:  'Event',
          variable_name: 'event_title',
          value:         event.title,
        },
        {
          display_name:  'Ticket ID',
          variable_name: 'ticket_id',
          value:         ticket.ticketId,
        },
        {
          display_name:  'Attendee',
          variable_name: 'attendee_name',
          value:         name,
        },
      ],
    },
  }

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json()
  if (!response.ok || !payload.status) {
    throw new Error(payload?.message || 'Failed to initialize Paystack payment')
  }

  return {
    authUrl:   payload.data.authorization_url,  // send this to the frontend
    reference: payload.data.reference,
    amount:    totalAmountInKobo,
    fee:       feeInKobo,
    baseAmount: priceInKobo,
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

    /* ── duplicate check ── */
    const existing = await Ticket.findOne({ eventId, attendeeEmail: email })
    if (existing) {
      if (existing.status === 'confirmed' || existing.status === 'checked-in') {
        return res.status(200).json({
          message: 'A ticket for this email already exists',
          ticket: toClientTicket(existing), paymentRequired: false, redirect: null,
        })
      }

      if (existing.status === 'pending') {
        if (isFree) {
          existing.status = 'confirmed'
          existing.attendeeName = existing.attendeeName || name
          await existing.save()
          sendTicketEmail(existing, event).catch(console.error)
          return res.status(200).json({
            message: 'Your ticket has been confirmed.',
            ticket: toClientTicket(existing), paymentRequired: false, redirect: null,
          })
        }

        // retry payment for existing pending ticket
        const { authUrl, reference } = await initializePaystackPayment({ email, name, ticket: existing, event, ticketType })
        existing.paymentReference = reference
        await existing.save()
        return res.status(200).json({
          message: 'Proceed to payment',
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
      return res.status(201).json({
        message: 'Registered! Check your email for your ticket.',
        ticket: toClientTicket(ticket), paymentRequired: false, redirect: null,
      })
    }

    /* ── PAID flow ── */
    const priceInKobo = parsePriceToKobo(event.ticketPrice)

    // create pending ticket first so we have a ticketId for the metadata
    const ticket = await Ticket.create({
      eventId, attendeeName: name, attendeeEmail: email,
      ticketType, price: priceInKobo / 100, status: 'pending',
    })

    const { authUrl, reference } = await initializePaystackPayment({ email, name, ticket, event, ticketType })
    ticket.paymentReference = reference
    await ticket.save()

    return res.status(201).json({
      message: 'Proceed to payment',
      ticket: toClientTicket(ticket),
      paymentRequired: true,
      redirect: authUrl,   // frontend: window.location.href = redirect
    })
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
    if (!paystackSecretKey) {
      return sendError(res, 500, 'Paystack secret key is missing')
    }

    const ticket = await Ticket.findOne({ ticketId })
    if (!ticket) return sendError(res, 404, 'Ticket not found')

    // idempotent — already confirmed, just return it
    if (ticket.status === 'confirmed' || ticket.status === 'checked-in') {
      const event = await Event.findById(ticket.eventId)
      return res.json({ message: 'Payment already verified', ticket: toClientTicket(ticket), event })
    }

    // verify with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${paystackSecretKey}` } }
    )
    const payload = await response.json()

    if (!response.ok || !payload.status) {
      return sendError(res, 400, payload?.message || 'Verification failed')
    }
    if (payload.data?.status !== 'success') {
      return sendError(res, 400, 'Payment not completed yet')
    }

    // safety check — metadata ticket_id must match
    const meta = payload.data?.metadata || {}
    if (meta.ticket_id && meta.ticket_id !== ticket.ticketId) {
      return sendError(res, 400, 'Reference does not match this ticket')
    }

    ticket.status           = 'confirmed'
    ticket.paymentReference = reference
    await ticket.save()

    const event = await Event.findById(ticket.eventId)
    if (event) sendTicketEmail(ticket, event).catch(console.error)

    return res.json({
      message: 'Payment verified. Check your email for your ticket.',
      ticket:  toClientTicket(ticket),
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
    return res.json({ ticket: toClientTicket(ticket), event })
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

    if (!ticket) return res.status(404).json({ valid: false, message: 'Ticket not found', success: false })

    const event = await Event.findOne({ _id: ticket.eventId, organizerId: req.user.userId })
    if (!event)  return res.status(403).json({ valid: false, message: 'Not your event', success: false })

    if (ticket.status === 'pending')     return res.status(400).json({ valid: false, message: 'Payment not completed', success: false })
    if (ticket.status === 'checked-in')  return res.status(409).json({ valid: false, message: 'Ticket already used', checkedInAt: ticket.checkedInAt, success: false })

    ticket.status      = 'checked-in'
    ticket.checkedInAt = new Date()
    await ticket.save()

    return res.json({
      valid: true, message: 'Check-in successful ✓',
      ticket: toClientTicket(ticket),
      event:  { title: event.title, startDate: event.startDate, startTime: event.startTime },
    })
  } catch (err) {
    return res.status(500).json({ valid: false, message: 'Verification failed', success: false })
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
    return res.json({ tickets: tickets.map(toClientTicket) })
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