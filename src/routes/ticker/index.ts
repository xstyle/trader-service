import { Router } from 'express'
import {
    candles,
    importOrders,
    index,
    loader,
    price,
    show,
    updatedb
} from './ticker.controller'

const router = Router()

router.get('/', index)
router.get('/updatedb', updatedb)
router.get('/:id', loader, show)
router.get('/:id/candles', loader, candles)
router.get('/:id/price', loader, price)
router.get('/:id/import_orders', loader, importOrders)

export default router
