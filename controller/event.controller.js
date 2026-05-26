import Event from '../model/event.model.js'
import User from '../model/user.model.js'
import Ticket from '../model/ticket.model.js'
import Award from '../model/award.model.js'
import { sendEmail } from '../services/emailService.js'
import { invitationEmailTemplate } from '../services/emailTemplates.js'
import { sendError, sendSuccess } from '../utils/response.js'

/* ── helpers (unchanged) ── */
function buildEventPayload(body = {}) {
  return {
    title: body.title || body.name,
    description: body.description || '',
    startDate: body.startDate,
    startTime: body.startTime,
    endDate: body.endDate,
    endTime: body.endTime,
    location: body.location || '',
    isPublic: body.isPublic ?? true,
    ticketPrice: body.ticketPrice ?? 'Free',
    requireApproval: body.requireApproval ?? false,
    capacity: body.capacity ?? 'Unlimited',
    theme: body.theme || 'minimal',
    coverImage: body.coverImage || '',
  }
}

function toClientEvent(event) { return toClientEventWithHost(event, null) }

function toClientEventWithHost(event, host) {
  return {
    id: event._id,
    organizerId: event.organizerId,
    title: event.title,
    description: event.description,
    startDate: event.startDate,
    startTime: event.startTime,
    endDate: event.endDate,
    endTime: event.endTime,
    location: event.location,
    isPublic: event.isPublic,
    ticketPrice: event.ticketPrice,
    requireApproval: event.requireApproval,
    capacity: event.capacity,
    theme: event.theme,
    coverImage: event.coverImage,
    invitedGuests: Array.isArray(event.invitedGuests)
      ? event.invitedGuests.map(g => ({ email: g.email, sentAt: g.sentAt })) : [],
    invitationsSent: Array.isArray(event.invitedGuests) ? event.invitedGuests.length : 0,
    coHosts: Array.isArray(event.coHosts)
      ? event.coHosts.map(h => ({ name: h.name, email: h.email, role: h.role, addedAt: h.addedAt })) : [],
    rsvps: Array.isArray(event.rsvps)
      ? event.rsvps.map(r => ({ name: r.name, email: r.email, note: r.note, createdAt: r.createdAt })) : [],
    rsvpCount: Array.isArray(event.rsvps) ? event.rsvps.length : 0,
    hostName: host?.name || '',
    hostEmail: host?.email || '',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }
}

function getVoteCount(award) {
  return Array.isArray(award.votes)
    ? award.votes.reduce((t, v) => t + Math.max(1, Number(v.quantity || 1)), 0) : 0
}

async function getHostProfile(userId) {
  return User.findById(userId).select('name email')
}

/* ─────────────────────────────────────────────────────────
   FIX: nominee vote counting now handles BOTH formats:
     - nominees stored as plain strings: ["Alice", "Bob"]
     - nominees stored as objects: [{ name:"Alice", ... }]
───────────────────────────────────────────────────────── */
function resolveNomineeName(nominee) {
  if (!nominee) return ''
  if (typeof nominee === 'string') return nominee.trim()
  if (typeof nominee === 'object') return String(nominee.name || nominee.label || nominee.value || '').trim()
  return ''
}

function getNomineeVoteCount(award, nomineeName) {
  const target = String(nomineeName || '').trim().toLowerCase()
  if (!target) return 0
  return Array.isArray(award.votes)
    ? award.votes.reduce((t, v) =>
        t + (String(v.nominee || '').trim().toLowerCase() === target
          ? Math.max(1, Number(v.quantity || 1)) : 0), 0)
    : 0
}

/* ── all exports unchanged except getEventAdminStats ── */
export async function createEvent(req, res) {
  try {
    const payload = buildEventPayload(req.body)
    if (!payload.title || !payload.startDate || !payload.startTime || !payload.endDate || !payload.endTime) {
      return sendError(res, 400, 'Event title and date/time fields are required')
    }
    const event = await Event.create({ ...payload, organizerId: req.user.userId })
    const host  = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Event created successfully', { event: toClientEventWithHost(event, host) }, 201)
  } catch (error) {
    console.error('Create event error:', error)
    return sendError(res, 500, 'Failed to create event')
  }
}

export async function listEvents(req, res) {
  try {
    const host   = await getHostProfile(req.user.userId)
    const events = await Event.find({ organizerId: req.user.userId }).sort({ createdAt: -1 })
    return sendSuccess(res, 'Events loaded', { events: events.map(e => toClientEventWithHost(e, host)) })
  } catch (error) {
    console.error('List events error:', error)
    return sendError(res, 500, 'Failed to load events')
  }
}

export async function getEvent(req, res) {
  try {
    const { eventId } = req.params
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')
    const host = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Event loaded', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Get event error:', error)
    return sendError(res, 500, 'Failed to load event')
  }
}

export async function updateEventVisibility(req, res) {
  try {
    const { eventId } = req.params
    const event = await Event.findOneAndUpdate(
      { _id: eventId, organizerId: req.user.userId },
      { isPublic: Boolean(req.body?.isPublic) }, { new: true }
    )
    if (!event) return sendError(res, 404, 'Event not found')
    const host = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Event visibility updated', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Update visibility error:', error)
    return sendError(res, 500, 'Failed to update visibility')
  }
}

export async function updateEvent(req, res) {
  try {
    const { eventId } = req.params
    const allowed = {
      title: req.body?.title, description: req.body?.description,
      startDate: req.body?.startDate, startTime: req.body?.startTime,
      endDate: req.body?.endDate, endTime: req.body?.endTime,
      location: req.body?.location, coverImage: req.body?.coverImage,
      isPublic: req.body?.isPublic,
    }
    Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k])
    const event = await Event.findOneAndUpdate(
      { _id: eventId, organizerId: req.user.userId }, allowed, { new: true }
    )
    if (!event) return sendError(res, 404, 'Event not found')
    const host = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Event updated', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Update event error:', error)
    return sendError(res, 500, 'Failed to update event')
  }
}

export async function sendInvitations(req, res) {
  try {
    const { eventId } = req.params
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails
      : String(req.body?.emails || '').split(/[\n,]/).map(v => v.trim()).filter(Boolean)
    const normalized = [...new Set(emails.map(e => e.toLowerCase()))]
    if (!normalized.length) return sendError(res, 400, 'Please provide at least one guest email')
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')
    const host = await getHostProfile(req.user.userId)
    const invitationLink = `${process.env.PUBLIC_APP_URL || 'http://localhost:5174'}/public/events/${event._id}`
    for (const email of normalized) {
      const template = invitationEmailTemplate({ eventTitle: event.title, hostName: host?.name || '', hostEmail: host?.email || '', invitationLink })
      await sendEmail({ to: email, subject: template.subject, text: template.text, html: template.html })
    }
    event.invitedGuests.push(...normalized.map(email => ({ email, sentAt: new Date() })))
    await event.save()
    return sendSuccess(res, 'Invitations sent', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Send invitations error:', error)
    return sendError(res, 500, 'Failed to send invitations')
  }
}

export async function getPublicEvent(req, res) {
  try {
    const { eventId } = req.params
    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')
    const host = await getHostProfile(event.organizerId)
    return sendSuccess(res, 'Event loaded', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Get public event error:', error)
    return sendError(res, 500, 'Failed to load event')
  }
}

export async function submitRsvp(req, res) {
  try {
    const { eventId } = req.params
    const name  = String(req.body?.name  || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const note  = String(req.body?.note  || '').trim()
    if (!name || !email) return sendError(res, 400, 'Name and email are required')
    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')
    if (event.rsvps.some(r => r.email.toLowerCase() === email)) return sendError(res, 409, "You have already RSVP'd for this event")
    event.rsvps.push({ name, email, note })
    await event.save()
    const host = await getHostProfile(event.organizerId)
    return sendSuccess(res, 'RSVP confirmed', { event: toClientEventWithHost(event, host) }, 201)
  } catch (error) {
    console.error('Submit RSVP error:', error)
    return sendError(res, 500, 'Failed to submit RSVP')
  }
}

/* ══════════════════════════════════════════════════
   getEventAdminStats — FIXED nominee mapping
   GET /api/events/:eventId/admin
══════════════════════════════════════════════════ */
export async function getEventAdminStats(req, res) {
  try {
    const { eventId } = req.params
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')

    const [tickets, awards] = await Promise.all([
      Ticket.find({ eventId }).sort({ createdAt: -1 }),
      Award.find({ eventId }).sort({ createdAt: -1 }),
    ])

    const paidTickets      = tickets.filter(t => t.status === 'confirmed' && Number(t.price || 0) > 0)
    const freeTickets      = tickets.filter(t => t.status === 'confirmed' && Number(t.price || 0) <= 0)
    const scannedTickets   = tickets.filter(t => t.status === 'checked-in')
    const unscannedTickets = tickets.filter(t => t.status === 'confirmed')

    const mapTicket = t => ({
      id: t._id, ticketId: t.ticketId,
      attendeeName: t.attendeeName, attendeeEmail: t.attendeeEmail,
      ticketType: t.ticketType, price: t.price, status: t.status,
      checkedInAt: t.checkedInAt, createdAt: t.createdAt,
    })

    return sendSuccess(res, 'Admin stats loaded', {
      event: toClientEventWithHost(event, await getHostProfile(event.organizerId)),
      tickets:          tickets.map(mapTicket),
      paidTickets:      paidTickets.map(mapTicket),
      paidCount:        paidTickets.length,
      freeCount:        freeTickets.length,
      scannedCount:     scannedTickets.length,
      unscannedCount:   unscannedTickets.length,
      scannedTickets:   scannedTickets.map(mapTicket),
      unscannedTickets: unscannedTickets.map(mapTicket),

      /* ─── FIXED: nominees now resolve names from both string and object formats ─── */
      awards: awards.map(award => ({
        id:          award._id,
        title:       award.title,
        description: award.description,
        nominees: Array.isArray(award.nominees)
          ? award.nominees.map(nominee => {
              const name = resolveNomineeName(nominee)  // handles string OR object
              return {
                name,
                imageUrl: typeof nominee === 'object' ? (nominee.imageUrl || '') : '',
                voteCount: getNomineeVoteCount(award, name),
              }
            })
          : [],
        voteCount: getVoteCount(award),
        votes: Array.isArray(award.votes)
          ? award.votes.map(v => ({
              name: v.name, email: v.email, nominee: v.nominee,
              quantity: Math.max(1, Number(v.quantity || 1)),
              amount: Number(v.amount || 0),
              paymentReference: v.paymentReference || '',
              createdAt: v.createdAt,
            }))
          : [],
        createdAt: award.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get admin stats error:', error)
    return sendError(res, 500, 'Failed to load admin stats')
  }
}

export async function addHost(req, res) {
  try {
    const { eventId } = req.params
    const name  = String(req.body?.name  || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role  = String(req.body?.role  || 'Co-host').trim() || 'Co-host'
    if (!name || !email) return sendError(res, 400, 'Host name and email are required')
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')
    if (Array.isArray(event.coHosts) && event.coHosts.some(h => h.email.toLowerCase() === email)) {
      return sendError(res, 400, 'This host is already added')
    }
    event.coHosts.push({ name, email, role, addedAt: new Date() })
    await event.save()
    const host = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Host added', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Add host error:', error)
    return sendError(res, 500, 'Failed to add host')
  }
}