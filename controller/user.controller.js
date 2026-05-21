import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import User from '../model/user.model.js'

const otpStore = new Map()

function sendError(res, status, message) {
  return res.status(status).json({ message, success: false })
}
 
// ── Email transporter ──
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})
 
function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}
 
/* ─────────────────────────────────────
   POST /api/auth/send-otp
   Body: { email }
───────────────────────────────────── */
async function sendOtp(req, res) {
  const { email } = req.body
 
  if (!email || !email.includes('@')) {
    return sendError(res, 400, 'Valid email required')
  }
 
  const otp = makeOtp()
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes
 
  otpStore.set(email.toLowerCase(), { otp, expiresAt })
 
  try {
    await transporter.sendMail({
      from:    `"EventSphere" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: `${otp} is your EventSphere code`,
      text:    `Your one-time sign-in code is: ${otp}\n\nExpires in 10 minutes.`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;
                    background:#14141a;color:#e8e8ec;border-radius:16px;">
          <p style="font-size:28px;margin:0 0 16px">✦</p>
          <h2 style="margin:0 0 8px;font-size:20px">Your sign-in code</h2>
          <p style="color:#8a8a96;margin:0 0 24px">
            Use this code to sign in to EventSphere. It expires in 10 minutes.
          </p>
          <div style="font-size:36px;font-weight:700;letter-spacing:0.15em;text-align:center;
                      padding:20px;background:rgba(255,255,255,0.05);border-radius:12px;
                      border:1px solid rgba(255,255,255,0.08)">
            ${otp}
          </div>
          <p style="color:#55555e;font-size:12px;margin-top:24px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    })
 
    res.json({ message: 'OTP sent' })
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
  const { email, otp } = req.body
  const key            = email?.toLowerCase()
  const record         = otpStore.get(key)
 
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
    user = await User.create({ email: key, name: key.split('@')[0] })
  }
 
  // Sign JWT
  const token = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
 
  res.json({
    user:  { id: user._id, email: user.email, name: user.name },
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
  res.json({ user })
}
 
export { sendOtp, verifyOtp, getMe }