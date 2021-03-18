import { Router } from "express";
import {
    create,
    index,
    makeArchive,
    provider,
    show,
    update
} from "./history.controller";

const router = Router()

router.get('/', index)
router.get('/:id', provider, show)
router.post('/', create)
router.post('/make_archive', makeArchive)
router.post('/:id', provider, update)

export default router