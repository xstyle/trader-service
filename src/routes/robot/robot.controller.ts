import { PortfolioPosition } from "@tinkoff/invest-openapi-js-sdk"
import { RequestHandler } from "express"
import { LeanDocument } from "mongoose"
import api from '../../utils/openapi'
import { isSubscribed, unsubscribe } from "../../utils/subscribes-manager"
import bot from '../../utils/telegram'
import { model as Order } from "../order/order.model"
import { model as State } from '../state/state.model'
import { model as Ticker } from '../ticker/ticker.model'
import { model as Robot, Robot as RobotType, RobotDocument } from "./robot.model"
import { job } from "./robot.service"

const TELEGRAM_ID: string = process.env.TELEGRAM_ID || ""

export const index: RequestHandler<{}, LeanDocument<RobotDocument>[], undefined> = async (req, res, next) => {
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

export const show: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = (req, res, next) => {
    res.send(res.locals.robot)
}

export const enable: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = async (req, res, next) => {
    try {
        const { robot } = res.locals
        if (!robot.is_enabled) {
            const state = await State.getState()
            // Горячее включение робота
            if (state.is_running) {
                await robot.enable()
            } else {
                robot.is_enabled = true
                await robot.save()
            }
        }

        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const disable: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = async (req, res, next) => {
    try {
        const { robot } = res.locals
        await robot.disable()
        res.send(robot)
    } catch (error) {
        next(error)
    }
}

export const loader: RequestHandler<{ id: string }, any, any, any, { robot?: RobotDocument }> = async (req, res, next) => {
    const { id } = req.params
    const robot = Robot.getRobotByIdSync(id) || await Robot.findById(id)
    if (!robot) return res.sendStatus(404)
    res.locals.robot = robot
    next()
}

export const sync: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = async (req, res, next) => {
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

export const reset: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = async (req, res, next) => {
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

export const create: RequestHandler<{}, {}, RobotType> = async (req, res, next) => {
    try {
        const { body } = req
        const market_instrument = await Ticker.getOrCreateTickerByFigiOrTicker(body.figi)
        if (!market_instrument) return next(new Error(`Error: Ticker ${body.ticker} not found`))
        body.ticker = market_instrument.ticker
        if (!body.strategy) delete body.strategy
        res.send(await Robot.create(body))
    } catch (error) {
        next(error)
    }
}

export const update: RequestHandler<{}, RobotDocument, RobotType, {}, { robot: RobotDocument }> = async (req, res, next) => {
    const { body } = req;

    if (req.body.buy_price >= req.body.sell_price) {
        return next(new Error('WTF? Whats wrong with you?'))
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
    robot.stop_after_sell = body.stop_after_sell
    robot.tags = body.tags
    robot.lot = body.lot
    robot.strategy = body.strategy

    await robot.save()
    res.json(robot)
}

export const remove: RequestHandler<{}, RobotDocument, undefined, {}, { robot: RobotDocument }> = async (req, res, next) => {
    const { robot } = res.locals
    if (robot.is_enabled) return next(new Error('Robot is enabled'))
    robot.is_removed = true
    await robot.save()
    res.json(robot)
}

let positionsCache: PortfolioPosition[] | undefined;
export const portfolio: RequestHandler = async (req, res, next) => {
    try {
        const positions = positionsCache || (await api.portfolio()).positions;
        if (!positionsCache) {
            positionsCache = positions
            setTimeout(() => positionsCache = undefined, 1000 * 60 * 30)
        }
        res.send(positions)
    } catch (error) {
        next(error)
    }
}

export async function runRobots() {
    const robots = await Robot.find({ is_enabled: true }, '_id')
    console.log(`Setup ${robots.length} robots`)
    for (const robot of robots) {
        await robot.enable()
    }
    try {
        bot.telegram.sendMessage(TELEGRAM_ID, `${robots.length} robots have been started`)
    } catch (error) {

    }
}

export async function stopRobots() {
    const robots = await Robot.find({ is_enabled: { $exists: true } })
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