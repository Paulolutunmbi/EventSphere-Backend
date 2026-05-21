import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import {
  listAwards,
  createAward,
  initializeVotePayment,
  voteAward,
} from '../controller/award.controller.js'

const router = express.Router()

// GET  /api/awards/events/:eventId          → list all awards for event
router.get('/events/:eventId', listAwards)

// POST /api/awards/events/:eventId          → create award (organiser only)
router.post('/events/:eventId', requireAuth, createAward)

// POST /api/awards/events/:eventId/:awardId/vote/initialize
// Step 1 — get Paystack checkout URL before showing payment popup
router.post('/events/:eventId/:awardId/vote/initialize', initializeVotePayment)

// POST /api/awards/events/:eventId/:awardId/vote
// Step 2 — verify payment reference and record the vote
router.post('/events/:eventId/:awardId/vote', voteAward)

export default router