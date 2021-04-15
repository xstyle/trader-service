import { Candle, CandleResolution } from "@tinkoff/invest-openapi-js-sdk"
import { RequestHandler } from "express"
import moment from "moment"
import api from '../../utils/openapi'
import { model as Order } from "../order/order.model"
import { model as Ticker, TickerDocument } from './ticker.model'

const FIRST_DAY = process.env.FIRST_DAY

export const index: RequestHandler<{}, TickerDocument[], undefined, { figi?: string | string[] }> = async (req, res, next) => {
    const { figi } = req.query
    const query = Ticker.find().sort({ ticker: 1 })

    if (figi) {
        query.where({figi})
    }

    res.send(await query)
}

export const show: RequestHandler = async (req, res, next) => {
    res.send(res.locals.ticker)
}

export const updatedb: RequestHandler = async (req, res, next) => {
    const { instruments } = await api.stocks()
    console.log(instruments)

    await Ticker.collection.drop()
    const tickers = await Ticker.create(instruments)
    res.json(tickers)
}

export const candles: RequestHandler = async (req, res, next) => {
    const {
        interval = 'day'
    } = req.query as { interval: CandleResolution }

    const { ticker } = res.locals
    const from = moment()
    switch (interval) {
        case 'day':
            from.add(-365, 'd')
            break
        case 'hour':
            from.add(-6, 'd')
            break
        case '1min':
            from.add(-1, 'd')
            break
        default:
            from.add(-365, 'd')
            break;
    }

    const request = {
        figi: ticker.figi,
        from: from.toISOString(),
        to: moment().toISOString(),
        interval
    }

    console.log(request)

    try {
        const data = await api.candlesGet(request)
        res.send(data)
    } catch (error) {
        next(error)
    }
}

export const loader: RequestHandler = async (req, res, next) => {
    const { id } = req.params
    try {
        const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(id)
        if (ticker) {
            res.locals.ticker = ticker
            return next()
        }
        res.sendStatus(404)
    } catch (error) {
        next(error)
    }
}

export const price: RequestHandler<{}, {}, {}, { date: string, interval: CandleResolution }, { ticker: TickerDocument }> = async (req, res, next) => {
    const { date, interval } = req.query
    const { ticker } = res.locals

    const range = getFromToDates(date, interval)
    if (!range) return res.sendStatus(404)
    const { from, to } = range
    const request: {
        figi: string,
        from: string,
        to: string,
        interval: CandleResolution
    } = {
        figi: ticker.figi,
        from: from.toISOString(),
        to: to.toISOString(),
        interval: interval
    }
    try {
        const data = await api.candlesGet(request)
        res.send({ data, request })
    } catch (error) {
        next(error)
    }
}


function getFromToDates(date: string, interval: CandleResolution) {
    const time = moment(date)
    switch (interval) {
        case '1min':
            return {
                from: time.startOf('minute'),
                to: time.clone().add(1, 'minute')
            }
            break;
        case 'day':
            return {
                from: time.startOf('day').add(10, 'h'),
                to: time.clone().add(1, 'day')
            }
            break;
        default:
            break;
    }
}

export const importOrders: RequestHandler = async (req, res, next) => {
    const { ticker } = res.locals
    const query = {
        from: moment(FIRST_DAY, 'YYYY.MM.DD').startOf('day').toISOString(),
        to: moment().endOf('day').toISOString(),
        figi: ticker.figi
    }

    try {
        const operations = (await api.operations(query)).operations.filter(operation => {
            switch (operation.operationType) {
                case 'Sell':
                case 'Buy':
                case 'BuyCard':
                    return true
                default:
                    return false
            }
        })

        console.log(`I TICKER_CTRL   ${operations.length} finded orders ticker ${ticker.ticker} (${query.from} => ${query.to})`)
        for (const operation of operations) {
            await Order.findOrCreateByOperation(operation)
        }
        res.send({ imported: operations.length })
    } catch (err) {
        next(err)
    }
}

