import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { getTicket, listEventTickets, registerForEvent, verifyPaystackPayment, verifyTicket, verifyTicketByReference, getTicketQr } from '../controller/ticket.controller.js'

const router = express.Router()

router.post('/events/:eventId/register', registerForEvent)
router.post('/paystack/verify', verifyPaystackPayment)
router.get('/events/:eventId', requireAuth, listEventTickets)
router.post('/:ticketId/verify', requireAuth, verifyTicket)
router.post('/verify', requireAuth, verifyTicketByReference)
router.get('/:ticketId', getTicket)

// GET /api/tickets/:ticketId/qr  → PNG QR code for the ticket
router.get('/:ticketId/qr', getTicketQr)

export default router