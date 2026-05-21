import express from 'express'
const router  = express.Router()
// const { sendOtp, verifyOtp, getMe } = require('../controllers/auth.controller')
import { sendOtp, verifyOtp, getMe } from '../controller/user.controller.js'

import requireAuth from '../middleware/RequireAuth.js'

// POST /api/auth/send-otp
router.post('/send-otp', sendOtp)
 
// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOtp)
 
// GET /api/auth/me  (protected — needs Bearer token)
router.get('/me', requireAuth, getMe)
 
export default router