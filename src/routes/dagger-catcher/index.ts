import { Router } from 'express'
import {
    create,
    index,
    loader,
    order,
    show,
    update
} from './dagger-catcher.controller'

const router = Router()

router.get('/', index)
router.get('/:id', loader, show)
router.post('/', create)
router.post('/:id', loader, update)
router.post('/:id/order', loader, order)

export default router