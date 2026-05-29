import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { addHost, createEvent, deleteEvent, getEvent, getEventAdminStats, getPublicEvent, listEvents, listPublicEvents, sendInvitations, submitRsvp, updateEvent, updateEventVisibility } from '../controller/event.controller.js'

const router = express.Router()

router.get('/', requireAuth, listEvents)
router.post('/', requireAuth, createEvent)
router.get('/public', listPublicEvents)
router.get('/public/:eventId', getPublicEvent)
router.get('/:eventId', requireAuth, getEvent)
router.get('/:eventId/admin', requireAuth, getEventAdminStats)
router.patch('/:eventId/visibility', requireAuth, updateEventVisibility)
router.patch('/:eventId', requireAuth, updateEvent)
router.put('/:eventId', requireAuth, updateEvent)
router.delete('/:eventId', requireAuth, deleteEvent)
router.post('/:eventId/hosts', requireAuth, addHost)
router.post('/:eventId/invitations', requireAuth, sendInvitations)
router.post('/public/:eventId/rsvp', submitRsvp)

export default router