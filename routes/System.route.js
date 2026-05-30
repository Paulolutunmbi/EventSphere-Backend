import express from 'express'
import { getSystemStats } from '../controller/system.controller.js'

const router = express.Router()

// GET /api/system/stats
router.get('/stats', getSystemStats)

export default router
