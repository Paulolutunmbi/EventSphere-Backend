export function otpEmailTemplate({ otp, expiresMinutes = 10 }) {
  return {
    subject: `${otp} is your EventsNest code`,
    text: `Your one-time sign-in code is: ${otp}\n\nExpires in ${expiresMinutes} minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px;background:#14141a;color:#e8e8ec;border-radius:16px;">
        <p style="font-size:28px;margin:0 0 16px">✦</p>
        <h2 style="margin:0 0 8px;font-size:20px">Your sign-in code</h2>
        <p style="color:#8a8a96;margin:0 0 24px">Use this code to sign in to EventsNest. It expires in ${expiresMinutes} minutes.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:0.15em;text-align:center;padding:20px;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
          ${otp}
        </div>
        <p style="color:#55555e;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  }
}

export function invitationEmailTemplate({ eventTitle, hostName, hostEmail, invitationLink }) {
  return {
    subject: `You are invited to ${eventTitle}`,
    text: `${hostName || 'The host'} invited you to ${eventTitle}. View it here: ${invitationLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#111118;color:#f0f0f5;padding:24px;border-radius:16px">
        <h2 style="margin-top:0">You are invited to ${eventTitle}</h2>
        <p>${hostName || 'The host'}${hostEmail ? ` (${hostEmail})` : ''} invited you to this event.</p>
        <p><a href="${invitationLink}" style="color:#a78bfa">Open the event page</a></p>
      </div>
    `,
  }
}

export function ticketEmailTemplate({ event, ticket, ticketUrl, qrDataUrl }) {
  return {
    subject: `Your ticket for ${event.title} ✦`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#14141a;color:#e8e8ec;border-radius:16px;overflow:hidden;">
        <div style="background:#1c1c24;padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.07)">
          <p style="margin:0 0 4px;font-size:22px;color:#a78bfa">✦</p>
          <h1 style="margin:0;font-size:22px;font-weight:800">${event.title}</h1>
          <p style="margin:6px 0 0;color:#6b6b76;font-size:14px">${event.startDate} · ${event.startTime}${event.location ? ` · ${event.location}` : ''}</p>
        </div>
        <div style="padding:28px 32px;text-align:center">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b6b76">Your ticket</p>
          <p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#f0f0f4">${ticket.attendeeName}</p>
          <img src="${qrDataUrl}" alt="QR code" style="width:200px;height:200px;border-radius:12px;border:4px solid #2a2a32" />
          <p style="margin:16px 0 0;font-size:11px;color:#3d3d4a;font-family:monospace;letter-spacing:.1em">${ticket.ticketId}</p>
          <p style="margin:10px 0 0;font-size:12px;color:#6b6b76">Open your ticket: <a href="${ticketUrl}" style="color:#a78bfa;text-decoration:none">${ticketUrl}</a></p>
        </div>
        <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:#3d3d4a;font-size:12px">
          Show this QR code at the entrance. One-time use only.
        </div>
      </div>
    `,
  }
}

export function voteConfirmationTemplate({ eventTitle, nominee, quantity }) {
  return {
    subject: `Your vote for ${eventTitle} was recorded`,
    text: `Thanks for voting! Your vote for ${nominee} (${quantity} votes) has been recorded.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#14141a;color:#e8e8ec;border-radius:16px;">
        <h2 style="margin:0 0 8px">Vote confirmed</h2>
        <p style="color:#8a8a96;margin:0 0 16px">Thanks for supporting ${eventTitle}.</p>
        <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
          <div style="font-weight:700;margin-bottom:4px">Nominee</div>
          <div style="color:#d4d4de">${nominee}</div>
          <div style="font-weight:700;margin:12px 0 4px">Votes</div>
          <div style="color:#d4d4de">${quantity}</div>
        </div>
      </div>
    `,
  }
}
