import { RequestHandler } from "express"

const { model: History } = require("./history.model")

export const index: RequestHandler = async (req, res, next) => {
    return res.send(await History.find())
}

export const show: RequestHandler = (req, res, next) => {
    res.send(res.locals.history)
}

export const create: RequestHandler = async (req, res, next) => {
    const { body } = req
    const history = await History.create({
        title: body.title,
        description: body.description,
        figi: body.figi,
    })
    res.send(history)
}

export const update: RequestHandler = async (req, res, next) => {
    const { history } = res.locals
    const { body } = req

    history.title = body.title
    history.description = body.description

    res.send(await history.save())
}

export const provider: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    try {

        const history = await History.findById(id)
        if (!history) return res.sendStatus(404)
        res.locals.history = history
        next()

    } catch (err) {
        next(err)
    }
}

export const makeArchive: RequestHandler = async (req, res, next) => {
    const {
        title,
        description,
        type,
        figi,
        collection_id,
    } = req.body

    const history = await History.create({
        type,
        title,
        description,
        figi,
        collection_id,
    })
    const orders = await Orders.find({ collections: collection_id })
    for (const order of orders) {
        order.collections.addToSet(history._id)
        await order.save()
    }
    res.send(history)
}

import { model as Orders } from '../order/order.model'