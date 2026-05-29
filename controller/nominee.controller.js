import Award from '../model/award.model.js'
import Contestant from '../model/contestant.model.js'
import Event from '../model/event.model.js'
import { sendError, sendSuccess } from '../utils/response.js'
import { syncContestantsForAward } from '../controller/award.controller.js'

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function updateNominee(req, res) {
  try {
    const { nomineeId } = req.params

    const nominee = req.nominee || await Contestant.findById(nomineeId)
    if (!nominee) {
      return sendError(res, 404, 'Nominee not found')
    }

    const event = await Event.findById(nominee.eventId).select('status')
    if (!event) {
      return sendError(res, 404, 'Event not found')
    }

    if (event.status === 'inactive') {
      return sendError(res, 409, 'Event is inactive')
    }

    const allowed = {
      name: typeof req.body?.name === 'string' ? String(req.body.name).trim() : undefined,
      description: typeof req.body?.description === 'string' ? String(req.body.description).trim() : undefined,
      imageUrl: typeof req.body?.imageUrl === 'string' ? String(req.body.imageUrl).trim() : undefined,
      category: typeof req.body?.category === 'string' ? String(req.body.category).trim() : undefined,
      voteMetadata: req.body?.voteMetadata !== undefined ? req.body.voteMetadata : undefined,
    }

    Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key])

    if (allowed.name !== undefined && !allowed.name) {
      return sendError(res, 400, 'Nominee name is required')
    }

    if (Object.keys(allowed).length === 0) {
      return sendError(res, 400, 'No update fields provided')
    }

    const nextName = allowed.name ?? nominee.name
    const nextSlug = slugify(nextName)

    const updatedNominee = await Contestant.findByIdAndUpdate(
      nomineeId,
      {
        ...allowed,
        slug: nextSlug,
      },
      { new: true, runValidators: true }
    )

    const award = await Award.findById(nominee.awardId)
    if (award) {
      const currentSlug = nominee.slug
      const nextNomineePayload = {
        name: nextName,
        imageUrl: allowed.imageUrl ?? nominee.imageUrl ?? '',
        description: allowed.description ?? nominee.description ?? '',
        category: allowed.category ?? nominee.category ?? '',
        voteMetadata: allowed.voteMetadata ?? nominee.voteMetadata ?? null,
        slug: nextSlug,
        createdByAdminId: nominee.createdByAdminId,
      }

      const updatedNominees = Array.isArray(award.nominees)
        ? award.nominees.map(entry => {
            if (typeof entry === 'string') {
              return slugify(entry) === currentSlug ? nextNomineePayload : entry
            }

            const entrySlug = slugify(entry?.slug || entry?.name || '')
            if (entrySlug === currentSlug) {
              return { ...entry, ...nextNomineePayload }
            }

            return entry
          })
        : []

      award.nominees = updatedNominees
      await award.save()
      await syncContestantsForAward(award, nominee.eventId)
    }

    return sendSuccess(res, 'Nominee updated', {
      nominee: {
        id: updatedNominee._id,
        eventId: updatedNominee.eventId,
        awardId: updatedNominee.awardId,
        name: updatedNominee.name,
        description: updatedNominee.description || '',
        imageUrl: updatedNominee.imageUrl || '',
        category: updatedNominee.category || '',
        voteMetadata: updatedNominee.voteMetadata ?? null,
        slug: updatedNominee.slug,
        isActive: updatedNominee.isActive,
        voteCount: updatedNominee.voteCount,
        voterCount: updatedNominee.voterCount,
        createdByAdminId: updatedNominee.createdByAdminId,
        updatedAt: updatedNominee.updatedAt,
      },
    })
  } catch (error) {
    console.error('Update nominee error:', error)
    return sendError(res, 500, 'Failed to update nominee')
  }
}
