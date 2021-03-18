import { RequestHandler } from 'express'
import { model as DaggerCatcher } from './dagger-catcher.model'

export const index: RequestHandler = async (req, res, next) => {
    const daggerCatchers = await DaggerCatcher.find()
    return res.send(daggerCatchers)
}

export const show: RequestHandler = async (req, res, next) => {
    res.send(res.locals.daggerCatcher)
}

export const create: RequestHandler = async (req, res, next) => {
    const { body } = req
    const daggerCatcher = await DaggerCatcher.create(body)
    res.send(daggerCatcher)
}

export const update: RequestHandler = async (req, res, next) => {
    const { body } = req
    const { daggerCatcher } = res.locals

    daggerCatcher.figi = body.figi
    daggerCatcher.min = body.min
    daggerCatcher.max = body.max

    res.send(await daggerCatcher.save())
}

export const order: RequestHandler = async (req, res, next) => {
    const { daggerCatcher } = res.locals
    const { body } = req
    try {
        const order = await daggerCatcher.execute(body)
        console.log(body, order)
        res.send(order)
    } catch (err) {
        console.error(err);
        next(err)
    }
}

function isFigi(id: string): boolean {
    return id.length === 12
}

export const loader: RequestHandler = async (req, res, next) => {
    const { id } = req.params

    const daggerCatcher = isFigi(id) ? await DaggerCatcher.findOne({ figi: id }) : await DaggerCatcher.findById(id)
    if (!daggerCatcher) return res.sendStatus(404)
    res.locals.daggerCatcher = daggerCatcher
    next()
}