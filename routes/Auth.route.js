import express from 'express'
import { sendOtp, verifyOtp, getMe, logout } from '../controller/user.controller.js'
import requireAuth from '../middleware/RequireAuth.js'

const router = express.Router()

// POST /api/auth/send-otp - Send OTP to email
router.post('/send-otp', sendOtp)

// POST /api/auth/verify-otp - Verify OTP code
router.post('/verify-otp', verifyOtp)

// GET /api/auth/me - Get current user profile (protected)
router.get('/me', requireAuth, getMe)

// POST /api/auth/logout - Logout user (client-side token removal)
router.post('/logout', logout)

export default router