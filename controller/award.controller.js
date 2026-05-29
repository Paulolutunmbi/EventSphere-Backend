import Award from '../model/award.model.js'
import Event from '../model/event.model.js'
import Contestant from '../model/contestant.model.js'
import Vote from '../model/vote.model.js'
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
  const slugifyValue = value => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const extractName = value => {
    if (!value) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
    if (typeof value !== 'object') return ''
    if (typeof value.name === 'string' || typeof value.name === 'number') return String(value.name).trim()
    if (value.name && typeof value.name === 'object') {
      return String(value.name.name || value.name.label || value.name.value || '').trim()
    }
    return String(value.nominee || value.label || value.value || value.title || value.text || value.fullName || '').trim()
  }

  const extractImageUrl = value => {
    if (!value || typeof value !== 'object') return ''
    const img = value.image || value.photo || value.picture || value.avatar || value.imageUrl || ''
    if (typeof img === 'string') return img.trim()
    if (img && typeof img === 'object') return String(img.url || img.src || img.path || img.value || '').trim()
    return ''
  }

  const nominees = Array.isArray(input)
    ? input
    : String(input || '').split(/\n|,/).map(v => v.trim())

  const normalized = nominees
    .map(v => {
      const name = extractName(v)
      if (!name) return null
      return {
        name,
        imageUrl: extractImageUrl(v),
        slug: typeof v === 'object' && v.slug ? String(v.slug).trim() : slugifyValue(name),
      }
    })
    .filter(Boolean)

  return normalized.slice(0, 6)
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function syncContestantsForAward(award, eventId) {
  const nominees = Array.isArray(award.nominees) ? award.nominees : []
  const activeSlugs = new Set()
  const contestants = []

  for (const nominee of nominees) {
    const name = String(
      typeof nominee === 'string'
        ? nominee
        : nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || ''
    ).trim()
    if (!name) continue

    const slug = slugify(name)
    activeSlugs.add(slug)
    const contestant = await Contestant.findOneAndUpdate(
      { eventId, awardId: award._id, slug },
      {
        eventId,
        awardId: award._id,
        name,
        slug,
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    contestants.push(contestant)
  }

  if (activeSlugs.size > 0) {
    await Contestant.updateMany(
      { eventId, awardId: award._id, slug: { $nin: [...activeSlugs] } },
      { isActive: false }
    )
  }

  return contestants
}

async function resolveContestant({ eventId, awardId, nominee, contestantId }) {
  if (contestantId) {
    const contestant = await Contestant.findOne({ _id: contestantId, eventId, awardId, isActive: true })
    if (contestant) return contestant
  }

  const targetSlug = slugify(nominee)
  if (!targetSlug) return null

  return Contestant.findOne({ eventId, awardId, slug: targetSlug, isActive: true })
}

function getNomineeVoteCount(award, nominee) {
  const target = String(
    typeof nominee === 'string' ? nominee : nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || ''
  ).trim().toLowerCase()
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
    nominees:    Array.isArray(award.nominees)
      ? award.nominees.map(nominee => ({
          name: typeof nominee === 'string' ? nominee : nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || '',
          imageUrl: typeof nominee === 'object' ? (nominee.imageUrl || nominee.image || nominee.photo || nominee.picture || nominee.avatar || '') : '',
          slug: typeof nominee === 'object' ? (nominee.slug || slugify(nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || nominee || '')) : slugify(nominee),
        }))
      : [],
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
          name:      typeof nominee === 'string' ? nominee : nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || '',
          imageUrl:  typeof nominee === 'object' ? (nominee.imageUrl || nominee.image || nominee.photo || nominee.picture || nominee.avatar || '') : '',
          slug:      typeof nominee === 'object' ? (nominee.slug || slugify(nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || nominee || '')) : slugify(nominee),
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
    await syncContestantsForAward(award, eventId)

    const selectedContestant = await resolveContestant({ eventId, awardId, nominee })
    if (!selectedContestant) {
      return sendError(res, 400, 'Please select a valid nominee')
    }

    const totalKobo = quantity * VOTE_UNIT_AMOUNT
    const appUrl    = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')

    const metadata = {
      platform: 'eventsnest',
      payment_type: 'vote',
      nominee: selectedContestant.name,
      contestant_id: String(selectedContestant._id),
      contestant_slug: selectedContestant.slug,
      quantity,
      vote_unit_amount: VOTE_UNIT_AMOUNT,
      award_id: String(award._id),
      award_title: award.title,
      event_id: String(eventId),
      event_title: event?.title || '',
      name,
      email,
      custom_fields: [
        { display_name: 'Platform', variable_name: 'platform', value: 'EventsNest' },
        { display_name: 'Payment Type', variable_name: 'payment_type', value: 'Vote' },
        { display_name: 'Award', variable_name: 'award_title', value: award.title },
        { display_name: 'Voting For', variable_name: 'nominee', value: selectedContestant.name },
        { display_name: 'Votes', variable_name: 'quantity', value: String(quantity) },
        { display_name: 'Voter', variable_name: 'voter_name', value: name || email },
      ],
    }

    // Lines ~155-162 in your award.controller.js
    const { authorizationUrl, reference } = await initializePaystackPayment({
      email,
      amount: totalKobo,
      currency: 'NGN',
      channels: ['card', 'bank_transfer', 'ussd', 'bank'],
      
      // RIGHT HERE! 👇 It is already implemented:
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
    await Promise.all(awards.map(award => syncContestantsForAward(award, eventId)))
    return sendSuccess(res, 'Awards loaded', { awards: awards.map(toPublicAward) })
  } catch (error) {
    console.error('List awards error:', error)
    return sendError(res, 500, 'Failed to load awards')
  }
}

export async function listContestants(req, res) {
  try {
    const { eventId, awardId } = req.params
    const award = await Award.findOne({ _id: awardId, eventId })
    if (!award) return sendError(res, 404, 'Award not found')

    await syncContestantsForAward(award, eventId)

    const contestants = await Contestant.find({ eventId, awardId, isActive: true }).sort({ createdAt: 1 })
    const awardNominees = Array.isArray(award.nominees) ? award.nominees : []
    const nomineeMap = new Map(
      awardNominees.map(nominee => {
        const name = typeof nominee === 'string' ? nominee : nominee?.name || nominee?.title || nominee?.label || nominee?.nominee || ''
        const slug = typeof nominee === 'object' ? (nominee.slug || slugify(name)) : slugify(name)
        return [slug, {
          imageUrl: typeof nominee === 'object' ? (nominee.imageUrl || nominee.image || nominee.photo || nominee.picture || nominee.avatar || '') : '',
          name,
        }]
      })
    )
    return sendSuccess(res, 'Contestants loaded', {
      contestants: contestants.map(contestant => ({
        id: contestant._id,
        name: contestant.name,
        slug: contestant.slug,
        imageUrl: nomineeMap.get(contestant.slug)?.imageUrl || '',
        voteCount: contestant.voteCount,
        voterCount: contestant.voterCount,
      })),
    })
  } catch (error) {
    console.error('List contestants error:', error)
    return sendError(res, 500, 'Failed to load contestants')
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

    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')

    // authorization: allow organizer or listed co-hosts (by email)
    const requesterId = String(req.user?.userId || '')
    const requesterEmail = String(req.user?.email || '').trim().toLowerCase()
    const isOrganizer = requesterId && String(event.organizerId) === requesterId
    const isCoHost = requesterEmail && Array.isArray(event.coHosts) && event.coHosts.some(h => String(h.email || '').toLowerCase() === requesterEmail)
    if (!isOrganizer && !isCoHost) return sendError(res, 403, 'Not authorized to update this award')

    const award = await Award.create({ eventId, title, description, nominees })
    await syncContestantsForAward(award, eventId)
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
    await syncContestantsForAward(award, eventId)

    // idempotent — reference already recorded
    const existingVote = await Vote.findOne({ paymentReference: reference, eventId, awardId })
    if (existingVote) {
      return sendSuccess(res, 'Vote payment already verified', {
        award: toPublicAward(await Award.findById(award._id)),
      })
    }

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

    const contestant = await resolveContestant({
      eventId,
      awardId,
      nominee: metadata.contestant_slug || nomineeFromMeta,
      contestantId: metadata.contestant_id || req.body?.contestantId,
    })

    if (!contestant) {
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
      nominee:          contestant.name,
      quantity,
      amount:           paidAmount,
      paymentReference: reference,
    })
    await award.save()

    const vote = await Vote.create({
      eventId,
      awardId,
      contestantId: contestant._id,
      voterName: name,
      voterEmail: email,
      quantity,
      amountPaid: paidAmount,
      paymentReference: reference,
      paystackStatus: payload.data?.status || 'success',
      paystackPayload: payload.data,
    })

    contestant.voteCount += quantity
    contestant.voterCount += 1
    await contestant.save()

    if (email) {
      const template = voteConfirmationTemplate({
        eventTitle: metadata.event_title || event?.title || 'your event',
        nominee: contestant.name,
        quantity,
      })
      sendEmail({ to: email, subject: template.subject, text: template.text, html: template.html })
        .catch(err => console.error('Vote email error:', err))
    }

    return sendSuccess(res, 'Vote recorded', {
      award: toPublicAward(award),
      voteId: vote._id,
      contestant: {
        id: contestant._id,
        name: contestant.name,
        slug: contestant.slug,
        voteCount: contestant.voteCount,
        voterCount: contestant.voterCount,
      },
      quantity,
      amount: paidAmount,
    }, 201)
  } catch (error) {
    console.error('Vote award error:', error)
    return sendError(res, 500, 'Failed to submit vote')
  }
}

/* ═════════════════════════════════════════════════════════════════════
   deleteAward   DELETE /api/awards/events/:eventId/:awardId
   Protected — only event organizer may delete an award. When deleting,
   cleanup related votes and contestants.
═════════════════════════════════════════════════════════════════════ */
export async function deleteAward(req, res) {
  try {
    const { eventId, awardId } = req.params

    const award = await Award.findOne({ _id: awardId, eventId })
    if (!award) return sendError(res, 404, 'Award not found')

    // Verify requester is event organiser
    const event = await Event.findOne({ _id: eventId, organizerId: req.user.userId })
    if (!event) return sendError(res, 403, 'Not authorised to delete this award')

    // Remove dependent records
    await Vote.deleteMany({ eventId, awardId })
    await Contestant.deleteMany({ eventId, awardId })

    await Award.deleteOne({ _id: awardId })

    return sendSuccess(res, 'Award deleted')
  } catch (error) {
    console.error('Delete award error:', error)
    return sendError(res, 500, 'Failed to delete award')
  }
}

/* ══════════════════════════════════════════════════════════
   updateAward   PATCH /api/awards/events/:eventId/:awardId
   Body: { title?, description?, nominees? }
   Organizer only
══════════════════════════════════════════════════════════ */
export async function updateAward(req, res) {
  try {
    const { eventId, awardId } = req.params
    const title = typeof req.body?.title === 'string' ? String(req.body.title).trim() : undefined
    const description = typeof req.body?.description === 'string' ? String(req.body.description).trim() : undefined
    const nominees = req.body?.nominees ? normalizeNominees(req.body.nominees) : undefined

    const event = await Event.findById(eventId)
    if (!event) return sendError(res, 404, 'Event not found')

    const requesterId = String(req.user?.userId || '')
    const requesterEmail = String(req.user?.email || '').trim().toLowerCase()
    const isOrganizer = requesterId && String(event.organizerId) === requesterId
    const isCoHost = requesterEmail && Array.isArray(event.coHosts) && event.coHosts.some(host => String(host.email || '').toLowerCase() === requesterEmail)

    if (!isOrganizer && !isCoHost) {
      return sendError(res, 403, 'Not authorized to update this award')
    }

    const allowed = {}
    if (title !== undefined) allowed.title = title
    if (description !== undefined) allowed.description = description
    if (nominees !== undefined) allowed.nominees = nominees

    if (Object.keys(allowed).length === 0) return sendError(res, 400, 'No update fields provided')

    const award = await Award.findOneAndUpdate(
      { _id: awardId, eventId },
      allowed,
      { new: true }
    )

    if (!award) return sendError(res, 404, 'Award not found')

    await syncContestantsForAward(award, eventId)

    return sendSuccess(res, 'Award updated', { award: toAdminAward(award) })
  } catch (error) {
    console.error('Update award error:', error)
    return sendError(res, 500, 'Failed to update award')
  }
}