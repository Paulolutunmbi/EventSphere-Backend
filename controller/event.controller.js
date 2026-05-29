import Event from '../model/event.model.js'
import User from '../model/user.model.js'
import Ticket from '../model/ticket.model.js'
import Award from '../model/award.model.js'
import Contestant from '../model/contestant.model.js'
import Vote from '../model/vote.model.js'
import { sendEmail } from '../services/emailService.js'
import { invitationEmailTemplate } from '../services/emailTemplates.js'
import { sendError, sendSuccess } from '../utils/response.js'

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
    ticketPrices: body.ticketPrices ?? null,
    requireApproval: body.requireApproval ?? false,
    votingRules: body.votingRules || '',
    capacity: body.capacity ?? 'Unlimited',
    theme: body.theme || 'minimal',
    coverImage: body.coverImage || '',
    status: body.status || 'active',
  }
}

function toClientEvent(event) {
  return toClientEventWithHost(event, null)
}

function toClientEventWithHost(event, host) {
  return {
    id: event._id,
    organizerId: event.organizerId,
    createdByAdminId: event.createdByAdminId,
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
    votingRules: event.votingRules || '',
    capacity: event.capacity,
    theme: event.theme,
    coverImage: event.coverImage,
    status: event.status || 'active',
    ticketPrices: event.ticketPrices || null,
    invitedGuests: Array.isArray(event.invitedGuests) ? event.invitedGuests.map(guest => ({
      email: guest.email,
      sentAt: guest.sentAt,
    })) : [],
    invitationsSent: Array.isArray(event.invitedGuests) ? event.invitedGuests.length : 0,
    coHosts: Array.isArray(event.coHosts) ? event.coHosts.map(host => ({
      name: host.name,
      email: host.email,
      role: host.role,
      addedAt: host.addedAt,
    })) : [],
    rsvps: Array.isArray(event.rsvps) ? event.rsvps.map(rsvp => ({
      name: rsvp.name,
      email: rsvp.email,
      note: rsvp.note,
      createdAt: rsvp.createdAt,
    })) : [],
    rsvpCount: Array.isArray(event.rsvps) ? event.rsvps.length : 0,
    hostName: host?.name || '',
    hostEmail: host?.email || '',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }
}

function getVoteCount(award) {
  return Array.isArray(award.votes)
    ? award.votes.reduce((total, vote) => total + Math.max(1, Number(vote.quantity || 1)), 0)
    : 0
}

async function getHostProfile(userId) {
  return User.findById(userId).select('name email')
}

function getRequesterEmail(user) {
  return String(user?.email || '').trim().toLowerCase()
}

async function findAccessibleEvent(eventId, user) {
  const email = getRequesterEmail(user)
  const query = {
    _id: eventId,
    $or: [
      { organizerId: user.userId },
    ],
  }

  if (email) {
    query.$or.push({ 'coHosts.email': email })
  }

  return Event.findOne(query)
}

export async function createEvent(req, res) {
  try {
    const payload = buildEventPayload(req.body)

    if (!payload.title || !payload.startDate || !payload.startTime || !payload.endDate || !payload.endTime) {
      return sendError(res, 400, 'Event title and date/time fields are required')
    }

    const event = await Event.create({
      ...payload,
      organizerId: req.user.userId,
      createdByAdminId: req.user.userId,
    })
    const host = await getHostProfile(req.user.userId)

    return sendSuccess(res, 'Event created successfully', { event: toClientEventWithHost(event, host) }, 201)
  } catch (error) {
    console.error('Create event error:', error)
    return sendError(res, 500, 'Failed to create event')
  }
}

export async function listEvents(req, res) {
  try {
    const email = getRequesterEmail(req.user)
    const events = await Event.find({
      $or: [
        { organizerId: req.user.userId },
        ...(email ? [{ 'coHosts.email': email }] : []),
      ],
    }).sort({ createdAt: -1 })

    const hostIds = [...new Set(events.map(event => String(event.organizerId)).filter(Boolean))]
    const hosts = await User.find({ _id: { $in: hostIds } }).select('name email')
    const hostMap = new Map(hosts.map(host => [String(host._id), host]))

    return sendSuccess(res, 'Events loaded', {
      events: events.map(event => toClientEventWithHost(event, hostMap.get(String(event.organizerId)))),
    })
  } catch (error) {
    console.error('List events error:', error)
    return sendError(res, 500, 'Failed to load events')
  }
}

export async function listPublicEvents(req, res) {
  try {
    const events = await Event.find({ isPublic: true }).sort({ createdAt: -1 })

    const hostIds = [...new Set(events.map(event => String(event.organizerId)).filter(Boolean))]
    const hosts = await User.find({ _id: { $in: hostIds } }).select('name email')
    const hostMap = new Map(hosts.map(host => [String(host._id), host]))

    return sendSuccess(res, 'Public events loaded', {
      events: events.map(event => toClientEventWithHost(event, hostMap.get(String(event.organizerId))))
    })
  } catch (error) {
    console.error('List public events error:', error)
    return sendError(res, 500, 'Failed to load public events')
  }
}

export async function getEvent(req, res) {
  try {
    const { eventId } = req.params
    const event = await findAccessibleEvent(eventId, req.user)

    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    const host = await getHostProfile(event.organizerId)
    return sendSuccess(res, 'Event loaded', { event: toClientEventWithHost(event, host) })
  } catch (error) {
    console.error('Get event error:', error)
    return sendError(res, 500, 'Failed to load event')
  }
}

export async function updateEventVisibility(req, res) {
  try {
    const { eventId } = req.params
    const nextIsPublic = Boolean(req.body?.isPublic)

    const event = await Event.findById(eventId)

    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    if (!isEventOwner(event, req.user)) {
      return sendError(res, 403, 'Access denied')
    }

    event.isPublic = nextIsPublic
    await event.save()

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
    const event = await Event.findById(eventId)

    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    if (!isEventOwner(event, req.user)) {
      return sendError(res, 403, 'Access denied')
    }

    const allowed = {
      title: req.body?.title,
      description: req.body?.description,
      startDate: req.body?.startDate,
      startTime: req.body?.startTime,
      endDate: req.body?.endDate,
      endTime: req.body?.endTime,
      location: req.body?.location,
      ticketPrices: req.body?.ticketPrices,
      coverImage: req.body?.coverImage,
      isPublic: req.body?.isPublic,
      requireApproval: req.body?.requireApproval,
      votingRules: req.body?.votingRules,
      status: req.body?.status,
    }

    Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key])

    if (allowed.title !== undefined && !String(allowed.title || '').trim()) {
      return sendError(res, 400, 'Event title is required')
    }

    if (allowed.status !== undefined && !['active', 'inactive'].includes(String(allowed.status))) {
      return sendError(res, 400, 'Invalid event status')
    }

    if (event.status === 'inactive') {
      const updates = Object.keys(allowed).filter(key => allowed[key] !== undefined && key !== 'status')
      if (updates.length > 0) {
        return sendError(res, 409, 'Event is inactive')
      }
    }

    Object.assign(event, allowed)
    await event.save()

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
      : String(req.body?.emails || '')
          .split(/[\n,]/)
          .map(value => value.trim())
          .filter(Boolean)

    const normalized = [...new Set(emails.map(email => email.toLowerCase()))]

    if (normalized.length === 0) {
      return sendError(res, 400, 'Please provide at least one guest email')
    }

    const event = await findAccessibleEvent(eventId, req.user)
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    const host = await getHostProfile(req.user.userId)
    const invitationLink = `${process.env.PUBLIC_APP_URL || 'http://localhost:5174'}/public/events/${event._id}`

    for (const email of normalized) {
      const template = invitationEmailTemplate({
        eventTitle: event.title,
        hostName: host?.name || '',
        hostEmail: host?.email || '',
        invitationLink,
      })
      await sendEmail({
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
      })
    }

    const invitedGuests = normalized.map(email => ({ email, sentAt: new Date() }))
    event.invitedGuests.push(...invitedGuests)
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

    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

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
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const note = String(req.body?.note || '').trim()

    if (!name || !email) {
      return sendError(res, 400, 'Name and email are required')
    }

    const event = await Event.findById(eventId)
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    const duplicate = event.rsvps.some(rsvp => rsvp.email.toLowerCase() === email)
    if (duplicate) {
      return sendError(res, 409, 'You have already RSVP’d for this event')
    }

    event.rsvps.push({ name, email, note })
    await event.save()

    const host = await getHostProfile(event.organizerId)
    return sendSuccess(res, 'RSVP confirmed', { event: toClientEventWithHost(event, host) }, 201)
  } catch (error) {
    console.error('Submit RSVP error:', error)
    return sendError(res, 500, 'Failed to submit RSVP')
  }
}

export async function getEventAdminStats(req, res) {
  try {
    const { eventId } = req.params
    const event = await findAccessibleEvent(eventId, req.user)
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    const [tickets, awards, contestants] = await Promise.all([
      Ticket.find({ eventId }).sort({ createdAt: -1 }),
      Award.find({ eventId }).sort({ createdAt: -1 }),
      Contestant.find({ eventId }).sort({ createdAt: -1 }),
    ])

    const paidTickets = tickets.filter(ticket => ticket.status === 'confirmed' && Number(ticket.price || 0) > 0)
    const freeTickets = tickets.filter(ticket => ticket.status === 'confirmed' && Number(ticket.price || 0) <= 0)
    const scannedTickets = tickets.filter(ticket => ticket.status === 'checked-in')
    const unscannedTickets = tickets.filter(ticket => ticket.status === 'confirmed')

    return sendSuccess(res, 'Admin stats loaded', {
      event: toClientEventWithHost(event, await getHostProfile(event.organizerId)),
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        ticketId: ticket.ticketId,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        ticketType: ticket.ticketType,
        price: ticket.price,
        status: ticket.status,
        createdAt: ticket.createdAt,
      })),
      paidTickets: paidTickets.map(ticket => ({
        id: ticket._id,
        ticketId: ticket.ticketId,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        ticketType: ticket.ticketType,
        price: ticket.price,
        createdAt: ticket.createdAt,
      })),
      paidCount: paidTickets.length,
      freeCount: freeTickets.length,
      scannedCount: scannedTickets.length,
      unscannedCount: unscannedTickets.length,
      scannedTickets: scannedTickets.map(ticket => ({
        id: ticket._id,
        ticketId: ticket.ticketId,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        ticketType: ticket.ticketType,
        price: ticket.price,
        status: ticket.status,
        checkedInAt: ticket.checkedInAt,
        createdAt: ticket.createdAt,
      })),
      unscannedTickets: unscannedTickets.map(ticket => ({
        id: ticket._id,
        ticketId: ticket.ticketId,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        ticketType: ticket.ticketType,
        price: ticket.price,
        status: ticket.status,
        checkedInAt: ticket.checkedInAt,
        createdAt: ticket.createdAt,
      })),
      awards: awards.map(award => ({
        id: award._id,
        title: award.title,
        description: award.description,
        nominees: Array.isArray(award.nominees)
          ? award.nominees.map(nominee => ({
              name: typeof nominee === 'string' ? nominee : (nominee?.name || ''),
              voteCount: Array.isArray(award.votes)
                ? award.votes.reduce(
                    (total, vote) => total + (String(vote.nominee || '').toLowerCase() === String(typeof nominee === 'string' ? nominee : nominee?.name || '').toLowerCase()
                      ? Math.max(1, Number(vote.quantity || 1))
                      : 0),
                    0
                  )
                : 0,
            }))
          : [],
        voteCount: getVoteCount(award),
        votes: Array.isArray(award.votes) ? award.votes.map(vote => ({
          name: vote.name,
          email: vote.email,
          quantity: Math.max(1, Number(vote.quantity || 1)),
          amount: Number(vote.amount || 0),
          paymentReference: vote.paymentReference || '',
          createdAt: vote.createdAt,
        })) : [],
        createdAt: award.createdAt,
      })),
      nominees: contestants.map(contestant => ({
        id: contestant._id,
        eventId: contestant.eventId,
        awardId: contestant.awardId,
        name: contestant.name,
        description: contestant.description || '',
        imageUrl: contestant.imageUrl || '',
        category: contestant.category || '',
        voteMetadata: contestant.voteMetadata ?? null,
        slug: contestant.slug,
        isActive: contestant.isActive,
        voteCount: contestant.voteCount,
        voterCount: contestant.voterCount,
        createdByAdminId: contestant.createdByAdminId,
        updatedAt: contestant.updatedAt,
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
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role = String(req.body?.role || 'Co-host').trim() || 'Co-host'

    if (!name || !email) {
      return sendError(res, 400, 'Host name and email are required')
    }

    const event = await findAccessibleEvent(eventId, req.user)
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    const duplicate = Array.isArray(event.coHosts) && event.coHosts.some(host => host.email.toLowerCase() === email)
    if (duplicate) {
      return sendError(res, 400, 'This host is already added')
    }

    event.coHosts.push({ name, email, role, addedAt: new Date() })
    await event.save()

    // send co-host notification email (best-effort) and report status
    let emailSent = false
    try {
      const inviter = await getHostProfile(req.user.userId)
      const invitationLink = `${process.env.PUBLIC_APP_URL || 'http://localhost:5174'}/events/${event._id}/admin`
      const template = invitationEmailTemplate({
        eventTitle: event.title,
        hostName: inviter?.name || '',
        hostEmail: inviter?.email || '',
        invitationLink,
      })
      await sendEmail({
        to: email,
        subject: `You've been added as a co-host — ${event.title}`,
        text: template.text,
        html: template.html,
      })
      emailSent = true
    } catch (emailErr) {
      console.error('Failed to send co-host invitation email:', emailErr)
      emailSent = false
    }

    const host = await getHostProfile(req.user.userId)
    return sendSuccess(res, 'Host added', { event: toClientEventWithHost(event, host), emailSent }, 201)
  } catch (error) {
    console.error('Add host error:', error)
    return sendError(res, 500, 'Failed to add host')
  }
}

export async function deleteEvent(req, res) {
  try {
    const { eventId } = req.params

    const event = await Event.findOne({ _id: eventId, createdByAdminId: req.user.userId })
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    await Promise.all([
      Ticket.deleteMany({ eventId }),
      Vote.deleteMany({ eventId }),
      Contestant.deleteMany({ eventId }),
      Award.deleteMany({ eventId }),
      Event.deleteOne({ _id: eventId, organizerId: req.user.userId }),
    ])

    return sendSuccess(res, 'Event deleted successfully')
  } catch (error) {
    console.error('Delete event error:', error)
    return sendError(res, 500, 'Failed to delete event')
  }
}

function isEventOwner(event, user) {
  return String(event?.createdByAdminId || '') === String(user?.userId || '')
}