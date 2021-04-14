import { RequestHandler } from 'express'

import bot from '../../utils/telegram'
import { runRobots } from '../robot/robot.controller'
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


State.getState().then(state => {
    console.log('App is starting...', state)
    if (state.is_running) {
        runRobots()
        console.log(`Robots has been running automaticaly.`)
    } else {
        console.log(`Robots hasn't been running. Because was disabled.`)
    }
})

bot.command('run', async () => {
    const state = await State.getState()
    await state.run()
})

bot.command('stop', async () => {
    const state = await State.getState()
    await state.stop()
})