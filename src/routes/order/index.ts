import express from 'express'
import {
    active,
    addCollection,
    cancel,
    cancelActiveOrder,
    index,
    loader,
    removeCollection,
    sync
} from './order.controller'

const router = express.Router()

router.get('/', index)
router.get('/add_collection', addCollection)
router.get('/:id/remove_collection', loader, removeCollection)
router.get('/:id/sync', loader, sync)
router.get('/:id/cancel', loader, cancel)
router.get('/active', active)
router.get('/active/:id/cancel', cancelActiveOrder)

export default router