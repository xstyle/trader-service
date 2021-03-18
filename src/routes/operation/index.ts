import express from 'express'
import { index } from './operation.controller'

const router = express.Router()

router.get('/', index)

export default router