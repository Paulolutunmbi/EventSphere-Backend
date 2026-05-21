import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { getTicket, listEventTickets, registerForEvent, verifyPaystackPayment, verifyTicket } from '../controller/ticket.controller.js'

const router = express.Router()

router.post('/events/:eventId/register', registerForEvent)
router.post('/paystack/verify', verifyPaystackPayment)
router.get('/events/:eventId', requireAuth, listEventTickets)
router.post('/:ticketId/verify', requireAuth, verifyTicket)
router.get('/:ticketId', getTicket)

export default router