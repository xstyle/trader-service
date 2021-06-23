import { CronJob } from "cron"
import { RequestHandler } from "express"
import api from '../../utils/openapi'
import { LimitOrderDocument, model as Order } from './order.model'


export const index: RequestHandler = async (req, res, next) => {
    const { collection, figi, start_date, end_date, status } = req.query

    const query = Order
        .find()
        .sort({ createdAt: -1 })

    if (collection) query.where({ collections: collection })
    if (figi) query.where({ figi })
    if (start_date) query.where({ createdAt: { $gt: start_date } })
    if (end_date) query.where({ createdAt: { $lt: end_date } })
    if (status) query.where({ status })

    const orders = await query.lean()
    res.send(orders)
}

export const addCollection: RequestHandler<{}, LimitOrderDocument, undefined, { id: string, date: string, collection: string }> = async (req, res, next) => {
    const { id, date, collection } = req.query
    const order = await Order.findOrCreate(id, date)
    if (order) {
        await order.addCollection(collection)
        return res.send(order)
    }
    res.sendStatus(500)
}

export const removeCollection: RequestHandler = async (req, res, next) => {
    const { collection } = req.query
    const { order } = res.locals
    await order.removeCollection(collection)
    return res.send(order)
}

export const loader: RequestHandler<{ id: string }> = async (req, res, next) => {
    const { id } = req.params
    const order = await Order.findById(id)
    if (order) {
        res.locals.order = order
        return next()
    }
    res.sendStatus(404)
}

export const sync: RequestHandler = async (req, res, next) => {
    const { order } = res.locals
    try {
        await order.sync()
        return res.send(order)
    } catch (err) {
        next(err)
    }
}

export const cancel: RequestHandler = async (req, res, next) => {
    const { order } = res.locals
    try {
        await order.cancel()
    } catch (err) {
        console.error(err);
    }
    try {
        await order.sync()
        return res.send(order)
    } catch (err) {
        next(err)
    }
}

export const active: RequestHandler = async (req, res, next) => {
    res.send(await api.orders())
}

export const cancelActiveOrder: RequestHandler<{ id: string }> = async (req, res, next) => {
    try {
        await api.cancelOrder({ orderId: req.params.id })
        res.sendStatus(200)
    } catch (error) {
        next(error)
    }
}
const job = new CronJob('12 */10 * * * *', async function () {
    await Order.checkPaymnets()
}, null, true, 'Europe/Moscow');