import express from 'express'
import requireAuth from '../middleware/RequireAuth.js'
import { updateNominee } from '../controller/nominee.controller.js'

const router = express.Router()

router.put('/:nomineeId', requireAuth, updateNominee)

export default router
