import express from 'express'
const router  = express.Router()
// const { sendOtp, verifyOtp, getMe } = require('../controllers/auth.controller')
import {
	sendOtp,
	verifyOtp,
	getMe,
	register,
	login,
	logout,
	resetPassword,
	verifyEmail,
} from '../controller/user.controller.js'

import requireAuth from '../middleware/RequireAuth.js'

// POST /api/auth/send-otp
router.post('/send-otp', sendOtp)

// POST /api/auth/register
router.post('/register', register)

// POST /api/auth/login
router.post('/login', login)

// POST /api/auth/logout
router.post('/logout', logout)

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword)
 
// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOtp)

// POST /api/auth/verify-email
router.post('/verify-email', verifyEmail)
 
// GET /api/auth/me  (protected — needs Bearer token)
router.get('/me', requireAuth, getMe)
 
export default router