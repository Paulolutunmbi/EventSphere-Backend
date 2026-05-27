import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import {
  listAwards,
  createAward,
  initializeVotePayment,
  listContestants,
  voteAward,
  deleteAward,
} from '../controller/award.controller.js'

const router = express.Router()

// GET  /api/awards/events/:eventId          → list all awards for event
router.get('/events/:eventId', listAwards)

// GET  /api/awards/events/:eventId/:awardId/contestants
router.get('/events/:eventId/:awardId/contestants', listContestants)

// POST /api/awards/events/:eventId          → create award (organiser only)
router.post('/events/:eventId', requireAuth, createAward)

// DELETE /api/awards/events/:eventId/:awardId → delete award (organiser only)
router.delete('/events/:eventId/:awardId', requireAuth, deleteAward)

// POST /api/awards/events/:eventId/:awardId/vote/initialize
// Step 1 — get Paystack checkout URL before showing payment popup
router.post('/events/:eventId/:awardId/vote/initialize', initializeVotePayment)

// POST /api/awards/events/:eventId/:awardId/vote
// Step 2 — verify payment reference and record the vote
router.post('/events/:eventId/:awardId/vote', voteAward)

// DELETE /api/awards/events/:eventId/:awardId
// Remove award and related votes/contestants (organiser only)
router.delete('/events/:eventId/:awardId', requireAuth, deleteAward)


export default router