import { Resend } from 'resend'
import { ticketEmailTemplate } from './emailTemplates.js'

const resend = new Resend(process.env.RESEND_API_KEY)

function getFromEmail() {
  const fromEmail = process.env.EMAIL_FROM
  if (!fromEmail) {
    throw new Error('EMAIL_FROM is missing')
  }
  return fromEmail
}

export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing')
  }

  const payload = {
    from: getFromEmail(),
    to,
    subject,
    html,
    text,
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments
  }

  const { data, error } = await resend.emails.send(payload)

  if (error) {
    throw new Error(error.message || 'Failed to send email')
  }

  return data
}

export async function sendTicketPurchaseEmail({ to, event, ticket, ticketUrl, qrDataUrl, payment }) {
  const template = ticketEmailTemplate({ event, ticket, ticketUrl, qrDataUrl, payment })
  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  })
}

export async function sendVoteConfirmationEmail({ to, nomineeName, voteCount }) {
  const subject = 'Vote Successfully Recorded'
  const safeNominee = nomineeName || 'your nominee'
  const safeVotes = Number(voteCount || 0)

  const text = `Thank you for your submission.\n\nYou have successfully voted for:\n${safeNominee}\n\nNumber of Votes:\n${safeVotes}\n\nYour votes have been securely updated on the platform.`

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#14141a;color:#e8e8ec;border-radius:16px;">
      <h2 style="margin:0 0 12px">Vote Successfully Recorded</h2>
      <p style="margin:0 0 16px">Thank you for your submission.</p>
      <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
        <div style="font-weight:700;margin-bottom:4px">You have successfully voted for:</div>
        <div style="color:#d4d4de">${safeNominee}</div>
        <div style="font-weight:700;margin:12px 0 4px">Number of Votes:</div>
        <div style="color:#d4d4de">${safeVotes}</div>
      </div>
      <p style="margin:16px 0 0;color:#8a8a96">Your votes have been securely updated on the platform.</p>
    </div>
  `

  return sendEmail({ to, subject, text, html })
}

export async function sendEventCreationEmail({ to, event, creator }) {
  const subject = 'Event Created Successfully'
  const name = creator?.name || 'Event Organizer'
  const eventTitle = event?.title || 'Your event'
  const eventDate = event?.startDate || 'Date TBC'
  const eventLocation = event?.location || 'Location TBC'
  const eventId = event?._id ? String(event._id) : ''

  const text = `Hi ${name},\n\nYour event has been created successfully.\n\nEvent Name: ${eventTitle}\nEvent Date: ${eventDate}\nEvent Location: ${eventLocation}\nEvent ID: ${eventId}\n\nYou can now share the event with your guests.`

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#14141a;color:#e8e8ec;border-radius:16px;">
      <h2 style="margin:0 0 10px">Event Created Successfully</h2>
      <p style="margin:0 0 16px">Hi ${name}, your event has been created successfully.</p>
      <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
        <div style="font-weight:700;margin-bottom:4px">Event Name</div>
        <div style="color:#d4d4de">${eventTitle}</div>
        <div style="font-weight:700;margin:12px 0 4px">Event Date</div>
        <div style="color:#d4d4de">${eventDate}</div>
        <div style="font-weight:700;margin:12px 0 4px">Event Location</div>
        <div style="color:#d4d4de">${eventLocation}</div>
        <div style="font-weight:700;margin:12px 0 4px">Event ID</div>
        <div style="color:#d4d4de">${eventId}</div>
      </div>
      <p style="margin:16px 0 0;color:#8a8a96">You can now share the event with your guests.</p>
    </div>
  `

  return sendEmail({ to, subject, text, html })
}
