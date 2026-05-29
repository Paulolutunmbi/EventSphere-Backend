import Contestant from '../model/contestant.model.js'
import Event from '../model/event.model.js'
import { sendError } from '../utils/response.js'

export async function requireEventOwner(req, res, next) {
  try {
    const { eventId } = req.params
    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')

    const ownerId = event.createdByAdminId || event.organizerId
    if (String(ownerId || '') !== String(req.user?.userId || '')) {
      return sendError(res, 403, 'Access denied')
    }

    req.event = event
    return next()
  } catch (error) {
    console.error('Require event owner error:', error)
    return sendError(res, 500, 'Failed to authorize event owner')
  }
}

export async function requireNomineeOwner(req, res, next) {
  try {
    const { nomineeId } = req.params
    const nominee = await Contestant.findById(nomineeId)
    if (!nominee) return sendError(res, 404, 'Nominee not found')

    if (String(nominee.createdByAdminId || '') !== String(req.user?.userId || '')) {
      return sendError(res, 403, 'Access denied')
    }

    req.nominee = nominee
    return next()
  } catch (error) {
    console.error('Require nominee owner error:', error)
    return sendError(res, 500, 'Failed to authorize nominee owner')
  }
}
