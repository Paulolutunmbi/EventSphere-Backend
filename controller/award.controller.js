import Award from '../model/award.model.js'
import Event from '../model/event.model.js'
import { initializePaystackPayment, verifyPaystackPayment as verifyPaystackTransaction } from '../services/paystackService.js'
import { sendEmail } from '../services/emailService.js'
import { voteConfirmationTemplate } from '../services/emailTemplates.js'
import { sendError, sendSuccess } from '../utils/response.js'

const VOTE_UNIT_AMOUNT  = 5000   // kobo = ₦50 per vote

/* ══════════════════════════════════════
   HELPERS  (unchanged from your version)
══════════════════════════════════════ */
function normalizeName(name, email) {
  const trimmed = String(name || '').trim()
  if (trimmed) return trimmed

  const localPart = String(email || '').split('@')[0] || ''
  const cleaned = localPart
    .replace(/[._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getVoteCount(award) {
  return Array.isArray(award.votes)
    ? award.votes.reduce((total, vote) => total + Math.max(1, Number(vote.quantity || 1)), 0)
    : 0
}

function getVoterCount(award) {
  if (!Array.isArray(award.votes)) return 0
  return new Set(
    award.votes
      .map(vote => String(vote.email || '').trim().toLowerCase())
      .filter(Boolean)
  ).size
}

function normalizeNominees(input) {
  const nominees = Array.isArray(input)
    ? input
    : String(input || '').split(/\n|,/).map(v => v.trim())
  return [...new Set(nominees.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 6)
}

function getNomineeVoteCount(award, nominee) {
  const target = String(nominee || '').trim().toLowerCase()
  if (!target) return 0
  return Array.isArray(award.votes)
    ? award.votes.reduce(
        (total, vote) =>
          total + (String(vote.nominee || '').trim().toLowerCase() === target
            ? Math.max(1, Number(vote.quantity || 1))
            : 0),
        0
      )
    : 0
}

function toPublicAward(award) {
  return {
    id:          award._id,
    title:       award.title,
    description: award.description,
    nominees:    Array.isArray(award.nominees) ? award.nominees : [],
    voteCount:   getVoteCount(award),
    voterCount:  getVoterCount(award),
    createdAt:   award.createdAt,
  }
}

function toAdminAward(award) {
  return {
    id:          award._id,
    title:       award.title,
    description: award.description,
    nominees: Array.isArray(award.nominees)
      ? award.nominees.map(nominee => ({
          name:      nominee,
          voteCount: getNomineeVoteCount(award, nominee),
        }))
      : [],
    voteCount:  getVoteCount(award),
    voterCount: getVoterCount(award),
    votes: Array.isArray(award.votes)
      ? award.votes.map(vote => ({
          name:             vote.name,
          email:            vote.email,
          nominee:          vote.nominee,
          quantity:         Math.max(1, Number(vote.quantity || 1)),
          amount:           Number(vote.amount || 0),
          paymentReference: vote.paymentReference || '',
          createdAt:        vote.createdAt,
        }))
      : [],
    createdAt: award.createdAt,
  }
}

/* ══════════════════════════════════════════════════════════
   initializeVotePayment
   Call this from your FRONTEND before showing the Paystack
   popup — it creates the transaction on Paystack's side and
   bakes all the context into the metadata so voteAward can
   trust the data when verifying.

   POST /api/events/:eventId/awards/:awardId/vote/initialize
   Body: { name, email, nominee, quantity }
══════════════════════════════════════════════════════════ */
export async function initializeVotePayment(req, res) {
  try {
    const { eventId, awardId } = req.params
    const email    = String(req.body?.email    || '').trim().toLowerCase()
    const nominee  = String(req.body?.nominee  || '').trim()
    const quantity = Math.max(1, Number(req.body?.quantity || 1))
    const name     = normalizeName(String(req.body?.name || '').trim(), email)

    if (!email)   return sendError(res, 400, 'Email is required')
    if (!nominee) return sendError(res, 400, 'Nominee is required')

    const award = await Award.findOne({ _id: awardId, eventId })
    if (!award)  return sendError(res, 404, 'Award not found')

    const event = await Event.findById(eventId)

    const nominees      = Array.isArray(award.nominees) ? award.nominees : []
    const selectedNominee = nominees.find(n => n.toLowerCase() === nominee.toLowerCase())
    if (!selectedNominee) {
      return sendError(res, 400, 'Please select a valid nominee')
    }

    const totalKobo = quantity * VOTE_UNIT_AMOUNT
    const appUrl    = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')

    const metadata = {
      platform: 'eventsphere',
      payment_type: 'vote',
      nominee,
      quantity,
      vote_unit_amount: VOTE_UNIT_AMOUNT,
      award_id: String(award._id),
      award_title: award.title,
      event_id: String(eventId),
      event_title: event?.title || '',
      name,
      email,
      custom_fields: [
        { display_name: 'Platform', variable_name: 'platform', value: 'EventSphere' },
        { display_name: 'Payment Type', variable_name: 'payment_type', value: 'Vote' },
        { display_name: 'Award', variable_name: 'award_title', value: award.title },
        { display_name: 'Voting For', variable_name: 'nominee', value: selectedNominee },
        { display_name: 'Votes', variable_name: 'quantity', value: String(quantity) },
        { display_name: 'Voter', variable_name: 'voter_name', value: name || email },
      ],
    }

    const { authorizationUrl, reference } = await initializePaystackPayment({
      email,
      amount: totalKobo,
      currency: 'NGN',
      channels: ['card', 'bank_transfer', 'ussd', 'bank'],
      callbackUrl: `${appUrl}/events/${eventId}/vote?awardId=${awardId}&reference={PAYSTACK_REFERENCE}`,
      metadata,
    })

    return sendSuccess(res, 'Payment initialized', {
      authUrl: authorizationUrl,
      reference,
      amount: totalKobo,
      quantity,
    })
  } catch (error) {
    console.error('Initialize vote payment error:', error)
    return sendError(res, 500, 'Failed to initialize vote payment')
  }
}

/* ══════════════════════════════════════════════════════════
   listAwards   GET /api/events/:eventId/awards
══════════════════════════════════════════════════════════ */
export async function listAwards(req, res) {
  try {
    const { eventId } = req.params
    const awards = await Award.find({ eventId }).sort({ createdAt: -1 })
    return sendSuccess(res, 'Awards loaded', { awards: awards.map(toPublicAward) })
  } catch (error) {
    console.error('List awards error:', error)
    return sendError(res, 500, 'Failed to load awards')
  }
}

/* ══════════════════════════════════════════════════════════
   createAward   POST /api/events/:eventId/awards
══════════════════════════════════════════════════════════ */
export async function createAward(req, res) {
  try {
    const { eventId }   = req.params
    const title         = String(req.body?.title       || '').trim()
    const description   = String(req.body?.description || '').trim()
    const nominees      = normalizeNominees(req.body?.nominees)

    if (!title)              return sendError(res, 400, 'Award title is required')
    if (!nominees.length)    return sendError(res, 400, 'Add at least one nominee')

    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 404, 'Event not found')

    const award = await Award.create({ eventId, title, description, nominees })
    return sendSuccess(res, 'Award created', { award: toAdminAward(award) }, 201)
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, 'That award already exists for this event')
    }
    console.error('Create award error:', error)
    return sendError(res, 500, 'Failed to create award')
  }
}

/* ══════════════════════════════════════════════════════════
   voteAward   POST /api/events/:eventId/awards/:awardId/vote
   Body: { reference, nominee, email?, name?, quantity? }

   Called AFTER payment — verifies the Paystack reference and
   records the vote. Reads context from metadata (set by
   initializeVotePayment) so the data is trustworthy.
══════════════════════════════════════════════════════════ */
export async function voteAward(req, res) {
  try {
    const { eventId, awardId } = req.params
    const reference = String(req.body?.reference || '').trim()

    if (!reference) {
      return sendError(res, 400, 'Payment reference is required')
    }

    const award = await Award.findOne({ _id: awardId, eventId })
    if (!award) return sendError(res, 404, 'Award not found')

    // idempotent — reference already recorded
    const alreadyRecorded =
      Array.isArray(award.votes) &&
      award.votes.some(
        vote => String(vote.paymentReference || '').toLowerCase() === reference.toLowerCase()
      )
    if (alreadyRecorded) {
      return sendSuccess(res, 'Vote payment already verified', { award: toPublicAward(award) })
    }

    // verify with Paystack
    const payload = await verifyPaystackTransaction(reference)
    if (payload.data?.status !== 'success') {
      return sendError(res, 400, 'Payment not completed yet')
    }

    // ── read values from metadata (set during initialize) ──
    // Fall back to req.body only if metadata is missing (e.g. old requests)
    const metadata = payload.data?.metadata || {}

    const event = await Event.findById(eventId).select('title')

    const email = String(
      metadata.email || req.body?.email || payload.data?.customer?.email || ''
    ).trim().toLowerCase()

    const name = normalizeName(
      String(metadata.name || req.body?.name || '').trim(),
      email
    )

    const nomineeFromMeta = String(
      metadata.nominee || req.body?.nominee || ''
    ).trim()

    const nominees        = Array.isArray(award.nominees) ? award.nominees : []
    const selectedNominee = nominees.find(
      n => n.toLowerCase() === nomineeFromMeta.toLowerCase()
    )
    if (!selectedNominee) {
      return sendError(res, 400, 'Please select a valid nominee')
    }

    const paidAmount          = Number(payload.data?.amount || 0)
    const quantityFromAmount  = Math.round(paidAmount / VOTE_UNIT_AMOUNT)
    const quantityFromMeta    = Number(metadata.quantity || req.body?.quantity || 0)
    const quantity            = quantityFromAmount > 0 ? quantityFromAmount : quantityFromMeta

    if (!email) return sendError(res, 400, 'Email is required to record the vote')
    if (!name)  return sendError(res, 400, 'A valid name is required to record the vote')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return sendError(res, 400, 'Invalid vote quantity')
    }

    // safety: paid amount must match quantity × unit price
    if (paidAmount > 0 && quantity * VOTE_UNIT_AMOUNT !== paidAmount) {
      return sendError(res, 400, 'Payment amount does not match the vote quantity')
    }

    award.votes.push({
      name,
      email,
      nominee:          selectedNominee,
      quantity,
      amount:           paidAmount,
      paymentReference: reference,
    })
    await award.save()

    if (email) {
      const template = voteConfirmationTemplate({
        eventTitle: metadata.event_title || event?.title || 'your event',
        nominee: selectedNominee,
        quantity,
      })
      sendEmail({ to: email, subject: template.subject, text: template.text, html: template.html })
        .catch(err => console.error('Vote email error:', err))
    }

    return sendSuccess(res, 'Vote recorded', {
      award: toPublicAward(award),
      quantity,
      amount: paidAmount,
    }, 201)
  } catch (error) {
    console.error('Vote award error:', error)
    return sendError(res, 500, 'Failed to submit vote')
  }
}