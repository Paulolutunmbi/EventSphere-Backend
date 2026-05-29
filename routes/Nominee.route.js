import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { requireNomineeOwner } from '../middleware/RequireOwnership.js'
import { updateNominee } from '../controller/nominee.controller.js'

const router = express.Router()

router.put('/:nomineeId', requireAuth, requireNomineeOwner, updateNominee)

export default router
