import { Router } from 'express'
import { index, update } from './state.controller'

const router = Router()

router.get('/', index)
router.post('/', update)

export default router
