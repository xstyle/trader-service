import { RequestHandler } from 'express'
import { model as Watchdog, WatchDogDocument } from './watchdog.model'

export const index: RequestHandler = async (req, res, next) => {
    res.send(await Watchdog.find().exec())
}

export const show: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const watchdog = await Watchdog.findById(id).exec()
    if (!watchdog) return res.sendStatus(404)
    res.send(watchdog)
}

export const create: RequestHandler = async (req, res, next) => {
    const { body } = req
    res.send(await Watchdog.create(body))
}

export const update: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const watchdog = await Watchdog.findById(id).exec()
    if (!watchdog) return res.sendStatus(404)
    const { body } = req
    watchdog.figi = body.figi
    watchdog.threshold = body.threshold
    res.send(await watchdog.save())
}

export const run: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const watchdog: WatchDogDocument = await Watchdog.findById(id)
    if (!watchdog) return res.sendStatus(404)
    await watchdog.run()
    res.send(watchdog)
}

export const stop: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const watchdog = await Watchdog.findById(id).exec()
    if (!watchdog) return res.sendStatus(404)
    await watchdog.stop()
    res.send(watchdog)
}