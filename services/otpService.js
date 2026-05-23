import OTP from '../model/otp.model.js'
import { sendEmail } from './emailService.js'
import { otpEmailTemplate } from './emailTemplates.js'

const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_SECONDS = 30

/**
 * Generate a 6-digit OTP code
 */
function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * Create and send OTP to email
 */
export async function createAndSendOtp({ email, name = '' }) {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required')
  }

  const normalizedEmail = email.toLowerCase().trim()
  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  // Delete any existing OTP for this email (resend scenario)
  await OTP.deleteOne({ email: normalizedEmail })

  // Create new OTP record
  const otpRecord = new OTP({
    email: normalizedEmail,
    code,
    expiresAt,
    name: name.trim(),
    attempts: 0,
  })

  await otpRecord.save()

  // Send email
  const template = otpEmailTemplate({ otp: code, expiresMinutes: OTP_EXPIRY_MINUTES })
  let deliveryMode = 'email'

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error
    }

    deliveryMode = 'console'
    console.warn('OTP email delivery failed, continuing in development mode:', error.message)
    console.log(`OTP for ${normalizedEmail}: ${code}`)
  }

  return {
    email: normalizedEmail,
    expiresAt,
    expiresIn: OTP_EXPIRY_MINUTES * 60,
    deliveryMode,
    debugCode: deliveryMode === 'console' ? code : undefined,
  }
}

/**
 * Verify OTP code and return result
 */
export async function verifyOtpCode({ email, code }) {
  if (!email || !code) {
    throw new Error('Email and OTP code are required')
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedCode = String(code).trim()

  // Find OTP record
  const otpRecord = await OTP.findOne({ email: normalizedEmail })

  if (!otpRecord) {
    throw new Error('No verification code found for this email. Please request a new one.')
  }

  // Check expiration
  if (new Date() > otpRecord.expiresAt) {
    await OTP.deleteOne({ email: normalizedEmail })
    throw new Error('Verification code expired. Please request a new one.')
  }

  // Check attempt limit
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    await OTP.deleteOne({ email: normalizedEmail })
    throw new Error('Too many failed attempts. Please request a new verification code.')
  }

  // Verify code
  if (otpRecord.code !== normalizedCode) {
    otpRecord.attempts += 1
    await otpRecord.save()
    const remaining = MAX_ATTEMPTS - otpRecord.attempts
    throw new Error(`Invalid code. ${remaining} attempts remaining.`)
  }

  // Success - delete the OTP record
  await OTP.deleteOne({ email: normalizedEmail })

  return {
    email: normalizedEmail,
    name: otpRecord.name || normalizedEmail.split('@')[0],
  }
}

/**
 * Check if user can request a new OTP (rate limiting)
 */
export async function canRequestNewOtp({ email }) {
  const normalizedEmail = email.toLowerCase().trim()
  const otpRecord = await OTP.findOne({ email: normalizedEmail })

  if (!otpRecord) {
    return { canRequest: true, secondsUntilRetry: 0 }
  }

  const createdAt = new Date(otpRecord.createdAt)
  const now = new Date()
  const secondsSinceCreation = Math.floor((now - createdAt) / 1000)

  if (secondsSinceCreation < RESEND_COOLDOWN_SECONDS) {
    const secondsUntilRetry = RESEND_COOLDOWN_SECONDS - secondsSinceCreation
    return { canRequest: false, secondsUntilRetry }
  }

  return { canRequest: true, secondsUntilRetry: 0 }
}

/**
 * Delete OTP for an email (cleanup)
 */
export async function deleteOtp(email) {
  const normalizedEmail = email.toLowerCase().trim()
  await OTP.deleteOne({ email: normalizedEmail })
}
