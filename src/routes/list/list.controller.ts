import { RequestHandler } from 'express'
import { model as List } from './list.model'

export const index: RequestHandler = async (req, res, next) => {
    const query = List.find()
    res.send(await query.exec())
}

export const show: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const list = await List.findById(id).exec()
    if (!list) return res.sendStatus(404)

    res.send(list)
}

export const create: RequestHandler = async (req, res, next) => {
    const { body } = req
    const list = await List.create(body)
    res.send(list)
}

export const update: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    const { body } = req
    const list = await List.findById(id).exec()

    if (!list) return res.sendStatus(404)

    list.name = body.name
    list.figis = body.figis

    res.send(await list.save())
}

export const add: RequestHandler = async (req, res, next) => {
    const { figi } = req.query
    const { id } = req.params
    const list = await List.findById(id).exec()
    if (!list) return res.sendStatus(404)
    list.figis.addToSet(figi)
    res.send(await list.save())
}

export const remove: RequestHandler = async (req, res, next) => {
    const { figi } = req.query
    const { id } = req.params
    const list = await List.findById(id).exec()
    if (!list) return res.sendStatus(404)

    list.figis.pull(figi)
    res.send(await list.save())
}