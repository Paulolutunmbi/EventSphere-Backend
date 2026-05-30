import Event from '../model/event.model.js'
import Ticket from '../model/ticket.model.js'
import User from '../model/user.model.js'
import Vote from '../model/vote.model.js'
import { sendError, sendSuccess } from '../utils/response.js'

const CACHE_TTL_MS = 30_000
const statsCache = {
  value: null,
  expiresAt: 0,
  pending: null,
}

export async function getSystemStats(req, res) {
  try {
    const now = Date.now()
    if (statsCache.value && statsCache.expiresAt > now) {
      return sendSuccess(res, 'System stats loaded', statsCache.value)
    }

    if (!statsCache.pending) {
      statsCache.pending = Promise.all([
        User.countDocuments(),
        Event.countDocuments(),
        Ticket.countDocuments({ status: { $in: ['confirmed', 'checked-in'] } }),
        Vote.aggregate([
          { $group: { _id: null, totalVotes: { $sum: '$quantity' } } },
        ]),
      ]).then(([totalUsers, totalEvents, totalTicketsSold, voteAgg]) => ({
        totalUsers,
        totalEvents,
        totalTicketsSold,
        totalVotes: Number(voteAgg?.[0]?.totalVotes || 0),
      })).finally(() => {
        statsCache.pending = null
      })
    }

    const payload = await statsCache.pending
    statsCache.value = payload
    statsCache.expiresAt = now + CACHE_TTL_MS

    return sendSuccess(res, 'System stats loaded', payload)
  } catch (error) {
    console.error('System stats error:', error)
    return sendError(res, 500, 'Failed to load system stats')
  }
}
