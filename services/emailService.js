import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function getFromEmail() {
  const fromEmail = process.env.FROM_EMAIL
  if (!fromEmail) {
    throw new Error('FROM_EMAIL is missing')
  }
  return fromEmail
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing')
  }

  const from = getFromEmail()
  const payload = { from, to, subject, html, text }
  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments
  }

  const { data, error } = await resend.emails.send(payload)

  if (error) {
    throw new Error(error.message || 'Failed to send email')
  }

  return data
}
