import express from "express"
import DaggerCatcher from "./dagger-catcher"
import History from "./history"
import Robot from "./robot"
import List from "./list"
import Operation from "./operation"
import Order from "./order"
import State from "./state"
import Ticker from "./ticker"
import Watchdog from "./watchdog"
import Comment from "./comment"

const router = express.Router()

router.use('/robot', Robot)
router.use('/order', Order)
router.use('/ticker', Ticker)
router.use('/operation', Operation)
router.use('/state', State)
router.use('/list', List)
router.use('/watchdog', Watchdog)
router.use('/dagger-catcher', DaggerCatcher)
router.use('/history', History)
router.use('/history', History)
router.use('/comment', Comment)

router.get('/', (req, res, next) => {
    res.sendStatus(200)
})

export default router