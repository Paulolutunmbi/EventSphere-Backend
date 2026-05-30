import express from 'express'
import { handlePaystackWebhook } from '../controller/ticket.controller.js'

const router = express.Router()

// POST /api/payments/paystack/webhook
router.post('/paystack/webhook', handlePaystackWebhook)

// POST /api/payments/paystack/verify
router.post('/paystack/verify', handlePaystackWebhook)

export default router
