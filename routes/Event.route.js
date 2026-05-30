import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { requireEventOwner } from '../middleware/RequireOwnership.js'
import { addHost, createEvent, deleteEvent, getEvent, getEventAdminStats, getEventLeaderboard, getPublicEvent, listEvents, listPublicEvents, sendInvitations, submitRsvp, updateEvent, updateEventVisibility } from '../controller/event.controller.js'

const router = express.Router()

router.get('/', requireAuth, listEvents)
router.post('/', requireAuth, createEvent)
router.get('/public', listPublicEvents)
router.get('/public/:eventId', getPublicEvent)
router.get('/:eventId/leaderboard', requireAuth, requireEventOwner, getEventLeaderboard)
router.get('/:eventId', requireAuth, getEvent)
router.get('/:eventId/admin', requireAuth, getEventAdminStats)
router.patch('/:eventId/visibility', requireAuth, requireEventOwner, updateEventVisibility)
router.patch('/:eventId', requireAuth, requireEventOwner, updateEvent)
router.put('/:eventId', requireAuth, requireEventOwner, updateEvent)
router.delete('/:eventId', requireAuth, requireEventOwner, deleteEvent)
router.post('/:eventId/hosts', requireAuth, addHost)
router.post('/:eventId/invitations', requireAuth, sendInvitations)
router.post('/public/:eventId/rsvp', submitRsvp)

export default router