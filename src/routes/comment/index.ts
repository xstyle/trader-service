import { Router } from 'express'
import {
    index
} from './comment.controller'

const router = Router()

router.get('/', index)

export default router