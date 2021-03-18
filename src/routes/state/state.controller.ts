import { RequestHandler } from 'express'
import { model as State } from './state.model'

export const index: RequestHandler = async (req, res, next) => {
    res.send(await State.getState())
}

export const update: RequestHandler = async (req, res, next) => {
    const state = await State.getState()
    const { body } = req
    if (!state.is_running && body.is_running) {
        await state.run()
    } else if (state.is_running && !body.is_running) {
        await state.stop()
    }
    res.send(state)
}