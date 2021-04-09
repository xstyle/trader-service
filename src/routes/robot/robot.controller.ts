import { Candle, CandleResolution, CandleStreaming } from "@tinkoff/invest-openapi-js-sdk"
import { CronJob } from "cron"
import { RequestHandler } from "express"
import api from '../../utils/openapi'
import { apiResubscribe, isSubscribed, subscribe, unsubscribe } from "../../utils/subscribes-manager"
import bot from '../../utils/telegram'
import { model as Order } from "../order/order.model"
import { model as State } from '../state/state.model'
import { model as Ticker } from '../ticker/ticker.model'
import { model as Robot, RobotDocument } from "./robot.model"

const TELEGRAM_ID: string = process.env.TELEGRAM_ID || ""

export const index: RequestHandler = async (req, res, next) => {
    const {
        figi,
        tag,
    } = req.query

    const query = Robot.find()
    query.or([{ is_removed: { $exists: false } }, { is_removed: false }])
    if (figi) query.where({ figi })
    if (tag) query.where({ tags: tag })

    query.sort({
        ticker: 1,
        buy_price: -1,
    })

    const robots = await query

    res.send(robots.map(robot => {
        robot = Robot.getRobotByIdSync(robot._id) || robot
        return robot.toObject()
    }))
}

export const show: RequestHandler = (req, res, next) => {
    res.send(res.locals.robot)
}

export const enable: RequestHandler = async (req, res, next) => {
    try {
        const { robot } = res.locals
        if (!robot.is_enabled) {
            robot.is_enabled = true
            await robot.save()
            const state = await State.getState()
            // Горячее включение робота
            if (state.is_running) {
                getRobotAndSubscribe(robot._id)
            }
        }

        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const disable: RequestHandler = async (req, res, next) => {
    try {
        const { robot } = res.locals
        await robot.disable()
        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const loader: RequestHandler<any, any, any, any, { robot?: RobotDocument }> = async (req, res, next) => {
    const { id } = req.params
    const robot = Robot.isLoaded(id) ? Robot.getRobotByIdSync(id) : await Robot.findById(id)
    if (!robot) return res.sendStatus(404)
    res.locals.robot = robot
    next()
}

export const sync: RequestHandler = async (req, res, next) => {
    const { robot } = res.locals
    const orders = await Order.find({ collections: robot._id })

    const amount = orders.reduce((amount, order) => {
        switch (order.operation) {
            case 'Buy':
                amount += order.executedLots
                break;
            case 'Sell':
                amount -= order.executedLots
                break;
            default:
                break;
        }
        return amount
    }, 0)
    if (robot.strategy == 'stepper') {
        const [sell, buy] = orders.reduce((result, order) => {
            if (order.operation == 'Sell') {
                result[0] += order.executedLots
            } else {
                result[1] += order.executedLots
            }
            return result
        }, [0, 0])
        console.log(`Sell ${sell} Floor ${Math.floor(sell / 40)} initial ${robot.initial_max_shares_number} max ${robot.max_shares_number}`)
        console.log(`Buy ${buy} Floor ${Math.floor(buy / 40)} initial ${robot.initial_min_shares_number} min ${robot.min_shares_number}`)
        robot.max_shares_number = Math.floor(sell / 40) + robot.initial_max_shares_number
        robot.min_shares_number = Math.floor(buy / 40) + robot.initial_min_shares_number
    }


    const budget = orders.reduce((budget, order) => {
        console.log(JSON.stringify(order));
        budget += order.payment || 0
        if (order.commission) budget += order.commission.value
        return budget
    }, 0)
    robot.shares_number = amount + robot.start_shares_number
    robot.budget = budget
    res.send(await robot.save())
}

export const reset: RequestHandler = async (req, res, next) => {
    try {
        const { robot } = res.locals
        await robot.cancelAllOrders()
        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const checkOrders: RequestHandler<{}, RobotDocument, {}, {}, { robot: RobotDocument }> = async (req, res, next) => {
    const { robot } = res.locals
    try {
        await robot.checkOrders()
        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const create: RequestHandler = async (req, res, next) => {
    const { body } = req
    const market_instrument = await Ticker.getOrCreateTickerByFigiOrTicker(body.figi)
    if (!market_instrument) return next(new Error(`Error: Ticker ${body.ticker} not found`))
    body.ticker = market_instrument.ticker
    res.send(await Robot.create(body))
}

export const update: RequestHandler = async (req, res, next) => {
    const { params: { id }, body } = req;

    if (req.body.buy_price >= req.body.sell_price) {
        return next(new Error('Suck a dick! WTF? Whats wrong with you?'))
    }
    const { robot } = res.locals

    robot.figi = body.figi
    robot.name = body.name
    robot.ticker = body.ticker
    robot.budget = body.budget
    robot.buy_price = body.buy_price
    robot.sell_price = body.sell_price

    robot.price_for_placing_sell_order = body.price_for_placing_sell_order
    robot.price_for_placing_buy_order = body.price_for_placing_buy_order

    robot.min_shares_number = body.min_shares_number
    robot.max_shares_number = body.max_shares_number
    robot.start_shares_number = body.start_shares_number
    robot.initial_min_shares_number = body.initial_min_shares_number
    robot.initial_max_shares_number = body.initial_max_shares_number

    robot.status = body.status
    robot.shares_number = body.shares_number
    robot.purchase_price = body.purchase_price
    robot.profit_capitalization = body.profit_capitalization
    robot.stop_after_sell = body.stop_after_sell
    robot.tags = body.tags
    robot.lot = body.lot
    robot.strategy = body.strategy

    await robot.save()
    res.json(robot)
}

export const remove: RequestHandler = async (req, res, next) => {
    const { robot } = res.locals
    if (robot.is_enabled) return next(new Error('Robot is enabled'))
    robot.is_removed = true
    await robot.save()
    res.json(robot)
}


export const state: RequestHandler = async (req, res, next) => {
    res.json(await State.getState())
}
let positionsCache;
export const portfolio: RequestHandler = async (req, res, next) => {
    try {
        const positions = positionsCache || (await api.portfolio()).positions;
        if (!positionsCache) {
            positionsCache = positions
            setTimeout(() => positionsCache = null, 1000 * 60 * 30)
        }
        for (const position of positions) {
            const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(position.figi)
            position.currency = ticker.currency
        }
        res.send(positions)
    } catch (error) {
        next(error)
    }
}

export const run: RequestHandler = async (req, res, next) => {
    const state = await State.getState()
    res.send(await state.run())
}

export async function justRun() {
    const robots = await Robot.find({ is_enabled: true }, '_id').exec()

    console.log(`Setup ${robots.length} robots`)
    for (const robot of robots) {
        await getRobotAndSubscribe(robot._id)
    }
    try {
        bot.telegram.sendMessage(TELEGRAM_ID, `${robots.length} robots have been started`)
    } catch (error) {

    }
}

bot.command('run', async () => {
    const state = await State.getState()
    await state.run()
})

bot.command('stop', async () => {
    const state = await State.getState()
    await state.stop()
})

async function getRobotAndSubscribe(_id: string) {
    const robot = await Robot.getRobotById(_id)
    subscribe({
        figi: robot.figi,
        _id: robot._id,
        interval: '1min'
    }, async (data: Candle) => {
        const { c: price, v: value } = data
        try {
            await robot.priceWasUpdated(price, value)
        } catch (error) {
            console.error(error)
        }
    })
}

export const stop: RequestHandler = async (req, res, next) => {
    const state = await State.getState()
    res.send(await state.stop())
}

export async function justStop() {
    const robots = await Robot.find({ is_enabled: { $exists: true } }).exec()
    console.log(`Down ${robots.length} robots`)
    for (const robot of robots) {
        if (isSubscribed({ figi: robot.figi, _id: robot._id, interval: "1min" })) {
            unsubscribe({
                figi: robot.figi,
                _id: robot._id,
                interval: '1min'
            })
        }
    }
    try {
        bot.telegram.sendMessage(TELEGRAM_ID, `${robots.length} robots have been stopped`)
    } catch (error) {

    }
}

const job = new CronJob('2 0 10 * * *', async function () {
    try {
        const amount = await apiResubscribe()
        bot.telegram.sendMessage(TELEGRAM_ID, `${amount} instruments have been restarted by CronJob`)
    } catch (error) {
        console.error(error)
        bot.telegram.sendMessage(TELEGRAM_ID, `There has been error.`)
    }
}, null, true, 'Europe/Moscow')

job.start()

State.getState().then(state => {
    console.log('App is starting...', state)
    if (state.is_running) {
        justRun()
        console.log(`Robots has been running automaticaly.`)
    } else {
        console.log(`Robots hasn't been running. Because was disabled.`)
    }
})
