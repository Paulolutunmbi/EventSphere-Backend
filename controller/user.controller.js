import jwt from 'jsonwebtoken'
import User from '../model/user.model.js'
import { sendEmail } from '../services/emailService.js'
import { otpEmailTemplate } from '../services/emailTemplates.js'
import { sendError, sendSuccess } from '../utils/response.js'

const otpStore = new Map()
 
function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function issueOtp({ email, name = '', purpose = 'login' }) {
  const otp = makeOtp()
  const expiresAt = Date.now() + 10 * 60 * 1000

  otpStore.set(email.toLowerCase(), { otp, expiresAt, name, purpose })

  const template = otpEmailTemplate({ otp, expiresMinutes: 10 })
  await sendEmail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  })
}
 
/* ─────────────────────────────────────
   POST /api/auth/send-otp
   Body: { email }
───────────────────────────────────── */
async function sendOtp(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const name = String(req.body?.name || '').trim()
 
  if (!email || !email.includes('@')) {
    return sendError(res, 400, 'Valid email required')
  }
 
  try {
    await issueOtp({ email, name })
    return sendSuccess(res, 'OTP sent', { email })
  } catch (err) {
    console.error('Email send error:', err)
    return sendError(res, 500, 'Failed to send email')
  }
}
 
/* ─────────────────────────────────────
   POST /api/auth/verify-otp
   Body: { email, otp }
───────────────────────────────────── */
async function verifyOtp(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const otp = String(req.body?.otp || '').trim()
  const key = email?.toLowerCase()
  const record = otpStore.get(key)
 
  if (!record) {
    return sendError(res, 400, 'No code was sent to this email')
  }
 
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key)
    return sendError(res, 400, 'Code expired — please request a new one')
  }
 
  if (record.otp !== otp) {
    return sendError(res, 400, 'Incorrect code')
  }
 
  // ✅ Valid — consume it so it can't be reused
  otpStore.delete(key)
 
  // Look up existing user or create a new one
  let user = await User.findOne({ email: key })
  if (!user) {
    const fallbackName = key.split('@')[0] || ''
    user = await User.create({ email: key, name: record.name || fallbackName })
  }
 
  // Sign JWT
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
 
  return sendSuccess(res, 'Verification successful', {
    user: { id: user._id, email: user.email, name: user.name },
    token,
  })
}
 
/* ─────────────────────────────────────
   GET /api/auth/me  (protected)
───────────────────────────────────── */
async function getMe(req, res) {
  // req.user is set by requireAuth middleware
  const user = await User.findById(req.user.userId).select('-__v')
  if (!user) return sendError(res, 404, 'User not found')
  return sendSuccess(res, 'Profile loaded', { user })
}

async function register(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const name = String(req.body?.name || '').trim()
  if (!email || !email.includes('@')) return sendError(res, 400, 'Valid email required')

  try {
    await issueOtp({ email, name, purpose: 'register' })
    return sendSuccess(res, 'Registration code sent', { email })
  } catch (err) {
    console.error('Register email error:', err)
    return sendError(res, 500, 'Failed to send registration code')
  }
}

async function login(req, res) {
  return sendOtp(req, res)
}

async function logout(req, res) {
  return sendSuccess(res, 'Logged out', null)
}

async function resetPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return sendError(res, 400, 'Valid email required')

  try {
    await issueOtp({ email, purpose: 'reset' })
    return sendSuccess(res, 'Password reset code sent', { email })
  } catch (err) {
    console.error('Reset email error:', err)
    return sendError(res, 500, 'Failed to send reset code')
  }
}

async function verifyEmail(req, res) {
  return verifyOtp(req, res)
}
 
export { sendOtp, verifyOtp, getMe, register, login, logout, resetPassword, verifyEmail }