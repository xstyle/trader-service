import { Router } from 'express'
import {
    create,
    index,
    loader,
    order,
    setPinned,
    show,
    update
} from './dagger-catcher.controller'

const router = Router()

router.get('/', index)
router.get('/:id', loader, show)
router.get('/:id/pinned', loader, setPinned)
router.post('/', create)
router.post('/:id', loader, update)
router.post('/:id/order', loader, order)

export default router