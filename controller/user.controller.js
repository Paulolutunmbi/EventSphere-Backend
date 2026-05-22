import jwt from 'jsonwebtoken'
import User from '../model/user.model.js'
import { sendError, sendSuccess } from '../utils/response.js'
import { createAndSendOtp, verifyOtpCode, canRequestNewOtp } from '../services/otpService.js'

/* ─────────────────────────────────────
   POST /api/auth/send-otp
   Body: { email, name? }
───────────────────────────────────── */
async function sendOtp(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || '').trim()

    if (!email || !email.includes('@')) {
      return sendError(res, 400, 'Valid email is required')
    }

    // Check rate limiting
    const { canRequest, secondsUntilRetry } = await canRequestNewOtp({ email })
    if (!canRequest) {
      return sendError(
        res,
        429,
        `Please wait ${secondsUntilRetry} seconds before requesting another code`
      )
    }

    await createAndSendOtp({ email, name, purpose: 'signup' })
    return sendSuccess(res, 'Verification code sent to your email', { email })
  } catch (err) {
    console.error('Send OTP error:', err.message)
    return sendError(res, 500, err.message || 'Failed to send verification code')
  }
}

/* ─────────────────────────────────────
   POST /api/auth/verify-otp
   Body: { email, code }
───────────────────────────────────── */
async function verifyOtp(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const code = String(req.body?.code || '').trim()

    if (!email || !code) {
      return sendError(res, 400, 'Email and verification code are required')
    }

    // Verify OTP code
    const otpResult = await verifyOtpCode({ email, code })

    // Find or create user
    let user = await User.findOne({ email: otpResult.email })
    if (!user) {
      user = await User.create({
        email: otpResult.email,
        name: otpResult.name,
        isEmailVerified: true,
        verifiedAt: new Date(),
      })
    } else {
      // Update verification status if needed
      if (!user.isEmailVerified) {
        user.isEmailVerified = true
        user.verifiedAt = new Date()
        await user.save()
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return sendSuccess(res, 'Email verified successfully', {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
      },
      token,
    })
  } catch (err) {
    console.error('Verify OTP error:', err.message)
    return sendError(res, 400, err.message || 'Verification failed')
  }
}

/* ─────────────────────────────────────
   GET /api/auth/me  (protected)
───────────────────────────────────── */
async function getMe(req, res) {
  try {
    // req.user is set by requireAuth middleware
    const user = await User.findById(req.user.userId).select('-__v')
    if (!user) {
      return sendError(res, 404, 'User not found')
    }
    return sendSuccess(res, 'Profile loaded', { user })
  } catch (err) {
    console.error('Get me error:', err.message)
    return sendError(res, 500, 'Failed to load profile')
  }
}

/* ─────────────────────────────────────
   POST /api/auth/logout
───────────────────────────────────── */
async function logout(req, res) {
  try {
    // Logout is client-side (token removal from localStorage)
    // Server can optionally maintain a token blacklist
    return sendSuccess(res, 'Logged out successfully', null)
  } catch (err) {
    console.error('Logout error:', err.message)
    return sendError(res, 500, 'Logout failed')
  }
}

export { sendOtp, verifyOtp, getMe, logout }