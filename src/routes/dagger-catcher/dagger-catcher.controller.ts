import { OperationType, PlacedLimitOrder } from '@tinkoff/invest-openapi-js-sdk'
import { RequestHandler } from 'express'
import { DaggerCatcherDocument, DaggerCatcherType, model as DaggerCatcher } from './dagger-catcher.model'

export const index: RequestHandler<{}, DaggerCatcherDocument[]> = async (req, res, next) => {
    const daggerCatchers = await DaggerCatcher.find().sort({ is_pinned: -1 })
    return res.send(daggerCatchers)
}

export const show: RequestHandler<{}, DaggerCatcherDocument, {}, {}, { daggerCatcher: DaggerCatcherDocument }> = async (req, res, next) => {
    res.send(res.locals.daggerCatcher)
}

export const setPinned: RequestHandler<{}, DaggerCatcherDocument, undefined, {}, { daggerCatcher: DaggerCatcherDocument }> = async (req, res, next) => {
    const { daggerCatcher } = res.locals
    daggerCatcher.is_pinned = !daggerCatcher.is_pinned
    await daggerCatcher.save()
    res.send(daggerCatcher)
}

export const create: RequestHandler<{}, DaggerCatcherDocument, DaggerCatcherType> = async (req, res, next) => {
    const { body } = req
    const daggerCatcher = await DaggerCatcher.create(body)
    res.send(daggerCatcher)
}

export const update: RequestHandler<{}, DaggerCatcherDocument, DaggerCatcherType, {}, { daggerCatcher: DaggerCatcherDocument }> = async (req, res, next) => {
    const { body } = req
    const { daggerCatcher } = res.locals

    daggerCatcher.figi = body.figi
    daggerCatcher.min = body.min
    daggerCatcher.max = body.max

    res.send(await daggerCatcher.save())
}

export const order: RequestHandler<{}, PlacedLimitOrder, { price: number, operation: OperationType, lots: number }, {}, { daggerCatcher: DaggerCatcherDocument }> = async (req, res, next) => {
    const { daggerCatcher } = res.locals
    const { body } = req
    try {
        const order = await daggerCatcher.execute(body)
        res.send(order)
    } catch (err) {
        console.error(err);
        next(err)
    }
}

function isFigi(id: string): boolean {
    return id.length === 12
}

export const loader: RequestHandler<{ id: string }, any, any, any, { daggerCatcher: DaggerCatcherDocument }> = async (req, res, next) => {
    const { id } = req.params

    const daggerCatcher = isFigi(id) ? await DaggerCatcher.findOne({ figi: id }) : await DaggerCatcher.findById(id)
    if (!daggerCatcher) return res.sendStatus(404)
    res.locals.daggerCatcher = daggerCatcher
    next()
}