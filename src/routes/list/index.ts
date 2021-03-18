import express from 'express'
import {
    add,
    create,
    index,
    remove,
    show,
    update
} from './list.controller'

const router = express.Router()

router.get('/', index)
router.get('/:id', show)
router.post('/', create)
router.post('/:id', update)
router.get('/:id/add', add)
router.get('/:id/remove', remove)


export default router
