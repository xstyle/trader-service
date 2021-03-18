import { OperationType } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema, Types } from 'mongoose'
import api from '../../utils/openapi'
import bot from '../../utils/telegram'
import { LimitOrderDocument, model as Order } from "../order/order.model"

export const model_name = 'Robot'

const TELEGRAM_ID: string = process.env.TELEGRAM_ID

const RobotSchema = new Schema<RobotDocument>({
    figi: { type: String, required: true },
    name: String,
    ticker: String,
    budget: Number,
    buy_price: {
        type: Number,
        required: true
    },
    sell_price: {
        type: Number,
        required: true
    },
    price_for_placing_sell_order: Number,
    price_for_placing_buy_order: Number,
    min_shares_number: {
        type: Number,
        required: true
    },
    max_shares_number: {
        type: Number,
        required: true
    },
    initial_min_shares_number: {
        type: Number,
        required: true,
        default: -40
    },
    initial_max_shares_number: {
        type: Number,
        required: true,
        default: 0
    },
    start_shares_number: {
        type: Number,
        default: 0
    },
    lot: {
        type: Number,
        default: 1,
        required: true
    },
    shares_number: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['waiting_buy', 'buy', 'waiting_sell', 'sell'],
        default: 'waiting_buy',
    },
    orders: [{
        orderId: String,
        operation: {
            type: String,
            enum: ['Buy', 'Sell']
        },
        figi: String,
        status: String,
        requestedLots: Number,
        executedLots: Number,
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: Date,
        price: Number
    }],
    profit_capitalization: {
        type: Boolean,
        default: true,
    },
    is_enabled: {
        type: Boolean,
        default: false,
    },
    is_removed: {
        type: Boolean,
        default: false
    },
    stop_after_sell: {
        type: Boolean,
        default: false
    },
    tags: [String],
    strategy: {
        type: String,
        enum: ['stepper']
    }
}, {
    toJSON: { getters: true, virtuals: false },
    toObject: { getters: true, virtuals: false },
})

export interface Robot {
    figi: string;
    name: string;
    ticker: string;
    budget: number;
    buy_price: number;
    sell_price: number;
    price_for_placing_sell_order: number
    price_for_placing_buy_order: number
    min_shares_number: number
    max_shares_number: number
    initial_min_shares_number: number
    initial_max_shares_number: number
    start_shares_number: number
    lot: number
    shares_number: number
    status: 'waiting_buy' | 'buy' | 'waiting_sell' | 'sell'
    is_enabled: boolean
    is_removed: boolean
    stop_after_sell: boolean
    stop_after_buy: boolean
    tags: string[]
    strategy: 'stepper' | undefined
}

interface RobotDocument extends Robot, Document {
    priceWasUpdated(price: number, value: number): Promise<void>
    onBuyShares(number: number, price: number): Promise<void>
    onSellShares(number: number, price: number): Promise<void>
    onAllSellShares(): Promise<void>
    onAllBuyShares(): Promise<void>
    checkOrders(): Promise<void>
    cancelAllOrders(): Promise<void>
    buy(): Promise<void>
    getNumberForBuy(): Promise<number>
    getNumberInBuyOrders(): Promise<number>
    getBuyOrdersV2(): Promise<LimitOrderDocument[]>
    needBuy(lots: number): Promise<void>
    sell(): Promise<void>
    getNumberForSell(): Promise<number>
    getNumberInSellOrders(): Promise<number>
    getSellOrdersV2(): Promise<LimitOrderDocument[]>
    needSell(lots: number): Promise<void>
    disable(): Promise<void>
}

export interface RobotModel extends Model<RobotDocument> {
    getRobotById(_id: string): Promise<RobotDocument>
    getRobotByIdSync(_id: string): RobotDocument | undefined
    isLoaded(_id: string): boolean
    registerSubscribeApi(subscribe: any, unsubscribe: any, isSubscribed: any): void
}

RobotSchema.pre('save', function () {
    console.log(`[${this._id}] save`)
})

RobotSchema.path('price_for_placing_buy_order').get(function (this: RobotDocument, value: number): number {
    if (value) return value
    return this.buy_price
})

RobotSchema.path('price_for_placing_sell_order').get(function (this: RobotDocument, value: number): number {
    if (value) return value
    return this.sell_price
})

const lock = {}
const order_lock = {}
const forse_order_check = {}

RobotSchema.methods.priceWasUpdated = async function (
    this: RobotDocument,
    price: number,
    value: number
): Promise<void> {
    if (this.price_for_placing_buy_order >= price) {
        if (this.shares_number < this.max_shares_number) {
            // Все указывает на то что нужно покупать
            console.log(`[${this._id}] ${this.ticker} waybe buy? Buy price ${this.price_for_placing_buy_order} >= ${price} and Shares Number ${this.shares_number} < Max Shares Number ${this.max_shares_number}`)
            await this.buy()
        }
    } else if (this.price_for_placing_sell_order <= price) {
        if (this.shares_number > this.min_shares_number) {
            // Все указывает на то что можно и нужно продавать
            console.log(`[${this._id}] ${this.ticker} waybe sell? Sell price ${this.price_for_placing_sell_order} <= ${price} and Shares Number ${this.shares_number} > Min Shares Number ${this.min_shares_number}`)
            await this.sell()
        }
    }
    if (
        ((this.buy_price >= price) && (this.shares_number < this.max_shares_number))
        || ((this.sell_price <= price) && (this.shares_number > this.min_shares_number))
        || forse_order_check[this._id]
    ) {
        forse_order_check[this._id] = false
        await this.checkOrders()
    }
}

function comission(price: number) {
    return Math.ceil(price * 0.0005 * 100) / 100
}

function round(value: number) {
    return Math.round(value * 100) / 100
}

RobotSchema.methods.onBuyShares = async function (number, price) {
    console.log(`[${this._id}] ${this.ticker} onBuyShares(${number}, ${price})`)

    const shares_number = number * this.lot
    const sum = round(shares_number * price + comission(shares_number * price))
    this.shares_number += shares_number
    this.budget = round(this.budget - sum)
    console.log(`[${this._id}] ${this.ticker} onBuyShares() { this.lot = ${this.lot}; shares_number = ${shares_number}; sum = ${sum}; this.shares_number = ${this.shares_number}; this.budget = ${this.budget}}`)
    try {
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) have bought ${number} lots at ${price}$ for ${sum}$. [app](https://www.tinkoff.ru/invest/stocks/${this.ticker})`, { parse_mode: "Markdown", disable_web_page_preview: true })
    } catch (error) {

    }

    if (this.shares_number == this.max_shares_number) {
        await this.onAllBuyShares()
    }
}

RobotSchema.methods.onSellShares = async function (
    this: RobotDocument,
    number: number,
    price: number
): Promise<void> {
    const shares_number = number * this.lot
    const sum = round(shares_number * price - comission(shares_number * price))
    this.shares_number -= shares_number
    this.budget = round(this.budget + sum)

    try {
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) have sold ${number} lots at ${price}$ for ${sum}$. [app](https://www.tinkoff.ru/invest/stocks/${this.ticker})`, { parse_mode: "Markdown", disable_web_page_preview: true })
    } catch (error) {
    }

    if (this.shares_number == this.min_shares_number) {
        await this.onAllSellShares()
    }
}

async function getOrdersAmount(_id: Types.ObjectId): Promise<[number, number]> {
    const orders = await Order.find({ collections: _id, status: "Done" })
    return orders.reduce((result, order) => {
        if (order.operation == 'Sell') { // SELL
            result[0] += order.executedLots
        } else { // BUY
            result[1] += order.executedLots
        }
        return result
    }, [0, 0])
}

RobotSchema.methods.onAllSellShares = async function (this: RobotDocument) {
    if (this.stop_after_sell) {
        await this.disable()
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) has been disabled after all stocks were sold.`, { parse_mode: "Markdown" })
    }
    if (this.strategy == 'stepper') {
        const [sell, buy] = await getOrdersAmount(this._id)
        const sell_floor = Math.floor(sell / 40)
        console.log(`[${this._id}] ${this.ticker} sell ${sell} sell_floor ${sell_floor} initial ${this.initial_max_shares_number} max ${this.initial_max_shares_number + sell_floor}`)

        this.max_shares_number = this.initial_max_shares_number + sell_floor
        await this.save()
    }
}

RobotSchema.methods.onAllBuyShares = async function (this: RobotDocument) {
    if (this.stop_after_buy) {
        await this.disable()
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) has been disabled after all stoks were purchased.`, { parse_mode: "Markdown" })
    }
    if (this.strategy == 'stepper') {
        const [sell, buy] = await getOrdersAmount(this._id)
        const buy_floor = Math.floor(buy / 40)
        console.log(`[${this._id}] ${this.ticker} buy ${buy} sell_floor ${buy_floor} initial ${this.initial_min_shares_number} max ${this.initial_min_shares_number + buy_floor}`)

        this.min_shares_number = this.initial_min_shares_number + buy_floor
        await this.save()
    }
}

function isCheckOrdersLocked(this: void, _id: string): boolean {
    if (order_lock[_id]) {
        forse_order_check[_id] = true
    }
    return order_lock[_id]
}

function lockCheckOrder(this: void, _id: string) {
    order_lock[_id] = true
}

function unlockCheckOrder(this: void, _id: string, timeout = 0) {
    if (timeout === 0) {
        order_lock[_id] = false
        return
    }
    setTimeout(() => unlockCheckOrder(_id), timeout)
}

RobotSchema.methods.checkOrders = async function (this: RobotDocument) {
    if (isCheckOrdersLocked(this._id)) return
    console.log(`[${this._id}] ${this.ticker} проверяю ордера.`, logRobotState(this))
    lockCheckOrder(this._id)

    const executing_orders = await Order.find({ collections: this._id, status: 'New' })
    if (!executing_orders.length) {
        console.log(`[${this._id}] ${this.ticker} По моим данным ордеров не должно быть. У брокера даже спрашивать не будем.`)
        return unlockCheckOrder(this._id, 5000)
    }

    let orders = []
    try {
        orders = await api.orders()
    } catch (error) {
        unlockCheckOrder(this._id, 5000)
        return console.error(`[${this._id}]`, error, `${this.ticker} Ошибка при проверке статуса существующих ордеров.`)
    }

    console.log(`[${this._id}] ${this.ticker} у брокера нашлось ${orders.length} ордера на исполнении. По моим данным должно быть ${executing_orders.length}`)

    for (const item of executing_orders) {

        const {
            orderId,
            executedLots,
            operation,
            requestedLots
        } = item

        const order = orders.find((order) => order.orderId == orderId)

        if (order) {
            if (executedLots < order.executedLots) {
                const number = order.executedLots - executedLots
                if (operation == 'Buy') {
                    await this.onBuyShares(number, this.buy_price)
                } else if (operation == 'Sell') {
                    await this.onSellShares(number, this.sell_price)
                }
                item.executedLots = order.executedLots
                item.updatedAt = new Date()
                await item.save()
            }
        } else {
            await item.sync()
            const number = item.executedLots - executedLots
            if (number > 0) {
                switch (operation) {
                    case 'Buy':
                        await this.onBuyShares(number, this.buy_price)
                        break;
                    case 'Sell':
                        await this.onSellShares(number, this.sell_price)
                        break;
                    default:
                        break;
                }
            }
        }
    }

    await this.save()

    unlockCheckOrder(this._id, 5000)
}

RobotSchema.methods.cancelAllOrders = async function (this: RobotDocument) {
    console.log(`[${this._id}] ${this.ticker} Запущенна отмена всех активных ордеров.`, logRobotState(this))
    const executed_orders = await Order.find({ collections: this._id, status: 'New' })
    const orders = await api.orders()

    console.log(`[${this._id}] ${this.ticker} для отмены нашлось ${orders.length} активных ордера`)

    for (const item of executed_orders) {

        const order = orders.find(order => order.orderId == item.orderId)

        if (order) {
            console.log(`[${this._id}] ${this.ticker} отменяю ордер ${JSON.stringify(order)}`)
            await item.cancel()
        } else {
            await item.sync()
        }
    }

    console.log(`[${this._id}] ${this.ticker} Все ордера отменены`)
    await this.save()
}

function isTransactionLocked(_id: string) {
    return lock[_id]
}

function lockTransaction(_id: string) {
    console.log(`[${_id}] transaction was locked for ${_id}`)
    lock[_id] = true
}

function unlockTransacion(_id: string) {
    console.log(`[${_id}] transaction was unlocked for ${_id}`)
    lock[_id] = false
}

function logRobotState(instrument: RobotDocument) {
    return `${instrument.ticker} State [${instrument._id}]. Shares numbers [${instrument.min_shares_number}, ${instrument.shares_number}, ${instrument.max_shares_number}].`
}

/**
 * Расчитывает сколько акции нужно выставить на покупку, с учетом уже выставленных на покупку ордерах. Если в ордерах пусто то продает по продажной цене.
 */
RobotSchema.methods.buy = async function (this: RobotDocument) {
    if (isTransactionLocked(this._id)) return

    lockTransaction(this._id)
    console.log(`[${this._id}] ${this.ticker} другие покупки заблокированны`)

    const number = await this.getNumberForBuy()
    if (number > 0) {
        console.log(`[${this._id}] ${this.ticker} можно отправить ордер на покупку ${number} лотов`)
        await this.needBuy(number)
    } else {
        console.log(`[${this._id}] ${this.ticker} новый ордер отправлять не буду.`)
    }
    unlockTransacion(this._id)
    console.log(`[${this._id}] ${this.ticker} покупки разблокированны`)
}

RobotSchema.methods.getNumberForBuy = async function (this: RobotDocument) {
    const numberInOrders = await this.getNumberInBuyOrders()
    const number = Math.floor((this.max_shares_number - this.shares_number) / this.lot) - numberInOrders
    console.log(`[${this._id}] ${this.ticker} в getNumberForBuy в ордерах на покупку ${numberInOrders} лотов. Максимум ${this.max_shares_number} на текущий момент уже есть ${this.shares_number}. Берем ${number} лотов по ${this.lot} акций.`)
    return number
}


RobotSchema.methods.getNumberInBuyOrders = async function (this: RobotDocument) {
    const buy_orders = await this.getBuyOrdersV2()
    const amount = buy_orders.reduce((amount, buy_order) => amount + buy_order.requestedLots - buy_order.executedLots, 0)
    console.log(`[${this._id}] ${this.ticker} в getNumberInBuyOrders количество ордеров на покупку ${buy_orders.length} ожидает покупки ${amount}`)
    return amount
}

RobotSchema.methods.getBuyOrdersV2 = async function (this: RobotDocument) {
    const orders = await Order.find({ collections: this._id, status: 'New', operation: 'Buy' })
    console.log(`[${this._id}] ${this.ticker} в getBuyOrdersмV2 ${orders.length} ордера на покупку`)
    return orders
}

const lock_buy = {}

RobotSchema.methods.needBuy = async function (
    this: RobotDocument,
    lots: number
) {
    if (lock_buy[this._id]) throw new Error('WTF????')
    lock_buy[this._id] = true

    const {
        figi,
        buy_price: price
    } = this
    const request: {
        figi: string,
        lots: number,
        operation: OperationType,
        price: number
    } = {
        figi,
        lots,
        operation: 'Buy',
        price,
    }

    try {
        const order = await api.limitOrder(request)
        try {
            bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) create order for buy ${lots} lots by ${price}. [app](https://www.tinkoff.ru/invest/stocks/${this.ticker})`, { parse_mode: "Markdown", disable_web_page_preview: true })
        } catch (err) {
        }

        console.log(`[${this._id}]`, JSON.stringify({ order, request }))

        await Order.create({
            ...order,
            figi,
            price,
            requestedPrice: price,
            collections: [this._id],
            trades: [],
            createdAt: new Date(),
            updatedAt: new Date
        })

        if (order.executedLots > 0) {
            await this.onBuyShares(order.executedLots, price)
        }

        await this.save()

        forse_order_check[this._id] = true // при малейшем изменении в ордерах перепроверяем их

        setTimeout(() => lock_buy[this._id] = false, 10000)


    } catch (error) {
        setTimeout(() => lock_buy[this._id] = false, 60 * 1000)
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this._id}] ${this.ticker} Ошибка при отправке ордера на покупку ${lots} лотов по цене ${price}`)
        console.log(`[${this._id}]`, error, request)
    }
}

/**
 * Расчитывает сколько акции нужно выставить на продажу, с учетом уже выставленных на продажу ордерах.
 */
RobotSchema.methods.sell = async function (this: RobotDocument) {
    if (isTransactionLocked(this._id)) return
    lockTransaction(this._id)

    const number = await this.getNumberForSell()
    if (number > 0) {
        await this.needSell(number)
    }

    unlockTransacion(this._id)
}

RobotSchema.methods.getNumberForSell = async function (this: RobotDocument): Promise<number> {
    const numberInOrders = await this.getNumberInSellOrders()
    return Math.floor((this.shares_number - this.min_shares_number) / this.lot) - numberInOrders
}

RobotSchema.methods.getNumberInSellOrders = async function (this: RobotDocument): Promise<number> {
    const sell_orders = await this.getSellOrdersV2()
    return sell_orders.reduce((result, sell_order) => result + sell_order.requestedLots - sell_order.executedLots, 0)
}

RobotSchema.methods.getSellOrdersV2 = async function (this: RobotDocument): Promise<LimitOrderDocument[]> {
    const orders = await Order.find({ collections: this._id, status: 'New', operation: 'Sell' })
    console.log(`[${this._id}] ${this.ticker} в getSellOrdersV2 ${orders.length} ордера на продажу`)
    return orders
}

RobotSchema.methods.needSell = async function (
    this: RobotDocument,
    lots: number
) {
    const {
        figi,
        sell_price: price
    } = this
    const request: {
        figi: string,
        lots: number,
        operation: OperationType,
        price: number
    } = {
        figi,
        lots,
        operation: 'Sell',
        price,
    }

    try {
        const order = await api.limitOrder(request)
        try {
            bot.telegram.sendMessage(TELEGRAM_ID, `[${this.ticker}](http://ubuntu.lan:3000/instrument/${this._id}) create order for sell ${lots} lots by ${price}$. [app](https://www.tinkoff.ru/invest/stocks/${this.ticker})`, { parse_mode: "Markdown", disable_web_page_preview: true })
        } catch (err) {
        }

        console.log(`[${this._id}]`, JSON.stringify({ order, request }))

        await Order.create({
            ...order,
            figi,
            price,
            requestedPrice: price,
            collections: [this._id],
            trades: [],
            createdAt: new Date(),
            updatedAt: new Date()
        })

        if (order.executedLots > 0) {
            await this.onSellShares(order.executedLots, price)
        }

        await this.save()

        forse_order_check[this._id] = true // при малейшем изменении в ордерах перепроверяем их


    } catch (error) {
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this._id}] ${this.ticker} Ошибка при отправке ордера на продажу ${lots} лотов по цене ${price}`, { parse_mode: "Markdown" })
        return console.log(`[${this._id}]`, error, request)
    }


}

const interval = '1min'

RobotSchema.methods.disable = async function (this: RobotDocument) {
    this.is_enabled = false
    await this.save()
    if (subscribe_api.isSubscribed({ figi: this.figi, _id: this._id, interval })) {
        subscribe_api.unsubscribe({ figi: this.figi, _id: this._id, interval })
    }
}

const instruments: { [id: string]: RobotDocument } = {};

RobotSchema.statics.getRobotById = async function (
    this: RobotModel,
    _id: string
) {
    if (instruments[_id]) return instruments[_id]
    return instruments[_id] = await this.findById(_id)
}

RobotSchema.statics.getRobotByIdSync = function (_id: string) {
    return instruments[_id]
}

RobotSchema.statics.isLoaded = function (_id: string) {
    return !!instruments[_id]
}

const subscribe_api = {
    subscribe: null,
    unsubscribe: null,
    isSubscribed: null
}

RobotSchema.statics.registerSubscribeApi = function (subscribe, unsubscribe, isSubscribed) {
    subscribe_api.subscribe = subscribe
    subscribe_api.unsubscribe = unsubscribe
    subscribe_api.isSubscribed = isSubscribed
}

export const model = mongoose.model<RobotDocument, RobotModel>(model_name, RobotSchema)


