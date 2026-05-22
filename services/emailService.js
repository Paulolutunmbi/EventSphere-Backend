import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function getFromEmail() {
  const fromEmail = process.env.FROM_EMAIL
  if (!fromEmail) {
    throw new Error('FROM_EMAIL is missing')
  }
  return fromEmail
}

export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing')
  }

  const from = getFromEmail()
  const { data, error } = await resend.emails.send({ from, to, subject, html, text })

  if (error) {
    throw new Error(error.message || 'Failed to send email')
  }

  return data
}
