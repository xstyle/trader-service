import { Router } from 'express';
import {
    create,
    index,
    show,
    update,
    run,
    stop
} from './watchdog.controller';
const router = Router()


router.get('/', index)
router.get('/:id', show)
router.get('/:id/run', run)
router.get('/:id/stop', stop)
router.post('/', create)
router.post('/:id', update)

export default router
