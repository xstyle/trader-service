import express from 'express'
import {
    checkOrders,
    create,
    disable,
    enable,
    index,
    loader,
    portfolio,
    remove,
    reset,
    show,
    sync,
    update
} from './robot.controller'

const router = express.Router()

router.get('/', index)
router.get('/portfolio', portfolio)

router.get('/:id', loader, show)
router.get('/:id/enable', loader, enable)
router.get('/:id/disable', loader, disable)
router.get('/:id/reset', loader, reset)
router.get('/:id/check_orders', loader, checkOrders)
router.get('/:id/sync', loader, sync)
router.post('/', create)
router.post('/:id', loader, update)
router.delete('/:id', loader, remove)

export default router
