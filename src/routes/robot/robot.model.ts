import { Candle, CandleResolution, FIGI, LimitOrderRequest, Order as OrderType } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema, Types } from 'mongoose'
import { Locker } from '../../utils/Locker'
import api from '../../utils/openapi'
import { isSubscribed, subscribe, unsubscribe } from '../../utils/subscribes-manager'
import bot from '../../utils/telegram'
import { LimitOrderDocument, model as Order } from "../order/order.model"

export const model_name = 'Robot'

const TELEGRAM_ID: string = process.env.TELEGRAM_ID || ""

const RobotSchema = new Schema<RobotDocument, RobotModel>({
    figi: {
        type: String,
        required: true
    },
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
    strategy?: 'stepper'
}

export interface RobotDocument extends Robot, Document {
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
    enable(): Promise<void>
}

export interface RobotModel extends Model<RobotDocument> {
    getRobotById(_id: string): Promise<RobotDocument>
    getRobotByIdSync: (_id: string) => RobotDocument | undefined
    isLoaded(_id: string): boolean
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

const order_check_locker = new Locker()
const force_order_check_locker = new Locker()

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
        || force_order_check_locker.isLocked(this._id)
    ) {
        force_order_check_locker.unlock(this._id)
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

RobotSchema.methods.onAllSellShares = async function () {
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

RobotSchema.methods.onAllBuyShares = async function () {
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

RobotSchema.methods.checkOrders = async function () {
    if (order_check_locker.isLocked(this._id)) {
        force_order_check_locker.lock(this._id)
        return
    }
    console.log(`[${this._id}] ${this.ticker} проверяю ордера.`, logRobotState(this))
    order_check_locker.lock(this._id)

    const executing_orders = await Order.find({ collections: this._id, status: 'New' })
    if (!executing_orders.length) {
        console.log(`[${this._id}] ${this.ticker} По моим данным ордеров не должно быть. У брокера даже спрашивать не будем.`)
        return order_check_locker.unlockWithTimeout(this._id, 5000)
    }

    let orders: OrderType[] = []
    try {
        orders = await api.orders()
    } catch (error) {
        order_check_locker.unlockWithTimeout(this._id, 5000)
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

    order_check_locker.unlockWithTimeout(this._id, 5000)
}

RobotSchema.methods.cancelAllOrders = async function (): Promise<void> {
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

const robot_locker: Locker = new Locker()

function logRobotState(instrument: RobotDocument) {
    return `${instrument.ticker} State [${instrument._id}]. Shares numbers [${instrument.min_shares_number}, ${instrument.shares_number}, ${instrument.max_shares_number}].`
}

/**
 * Расчитывает сколько акции нужно выставить на покупку, с учетом уже выставленных на покупку ордерах. Если в ордерах пусто то продает по продажной цене.
 */
RobotSchema.methods.buy = async function () {
    if (robot_locker.isLocked(this._id)) return
    robot_locker.lock(this._id)
    console.log(`[${this._id}] ${this.ticker} другие покупки заблокированны`)

    const number = await this.getNumberForBuy()
    if (number > 0) {
        console.log(`[${this._id}] ${this.ticker} можно отправить ордер на покупку ${number} лотов`)
        await this.needBuy(number)
    } else {
        console.log(`[${this._id}] ${this.ticker} новый ордер отправлять не буду.`)
    }
    robot_locker.unlock(this._id)
    console.log(`[${this._id}] ${this.ticker} покупки разблокированны`)
}

RobotSchema.methods.getNumberForBuy = async function () {
    const numberInOrders = await this.getNumberInBuyOrders()
    const number = Math.floor((this.max_shares_number - this.shares_number) / this.lot) - numberInOrders
    console.log(`[${this._id}] ${this.ticker} в getNumberForBuy в ордерах на покупку ${numberInOrders} лотов. Максимум ${this.max_shares_number} на текущий момент уже есть ${this.shares_number}. Берем ${number} лотов по ${this.lot} акций.`)
    return number
}


RobotSchema.methods.getNumberInBuyOrders = async function () {
    const buy_orders = await this.getBuyOrdersV2()
    const amount = buy_orders.reduce((amount, buy_order) => amount + buy_order.requestedLots - buy_order.executedLots, 0)
    console.log(`[${this._id}] ${this.ticker} в getNumberInBuyOrders количество ордеров на покупку ${buy_orders.length} ожидает покупки ${amount}`)
    return amount
}

RobotSchema.methods.getBuyOrdersV2 = async function () {
    const orders = await Order.find({ collections: this._id, status: 'New', operation: 'Buy' })
    console.log(`[${this._id}] ${this.ticker} в getBuyOrdersмV2 ${orders.length} ордера на покупку`)
    return orders
}

const buy_locker: Locker = new Locker()

RobotSchema.methods.needBuy = async function (lots: number) {
    if (buy_locker.isLocked(this._id)) throw new Error('WTF????')
    buy_locker.lock(this._id)

    const {
        figi,
        buy_price: price
    } = this

    const request: LimitOrderRequest & FIGI = {
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

        force_order_check_locker.lock(this._id) // при малейшем изменении в ордерах перепроверяем их

        setTimeout(() => buy_locker.unlock(this._id), 10000)
    } catch (error) {
        setTimeout(() => buy_locker.unlock(this._id), 60 * 1000)
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this._id}] ${this.ticker} Ошибка при отправке ордера на покупку ${lots} лотов по цене ${price}`)
        console.log(`[${this._id}]`, error, request)
    }
}

/**
 * Расчитывает сколько акции нужно выставить на продажу, с учетом уже выставленных на продажу ордерах.
 */
RobotSchema.methods.sell = async function () {
    if (robot_locker.isLocked(this._id)) return
    robot_locker.lock(this._id)

    const number = await this.getNumberForSell()

    if (number > 0) {
        await this.needSell(number)
    }

    robot_locker.unlock(this._id)
}

RobotSchema.methods.getNumberForSell = async function (): Promise<number> {
    const numberInOrders = await this.getNumberInSellOrders()
    return Math.floor((this.shares_number - this.min_shares_number) / this.lot) - numberInOrders
}

RobotSchema.methods.getNumberInSellOrders = async function (): Promise<number> {
    const sell_orders = await this.getSellOrdersV2()
    return sell_orders.reduce((result, sell_order) => result + sell_order.requestedLots - sell_order.executedLots, 0)
}

RobotSchema.methods.getSellOrdersV2 = async function (): Promise<LimitOrderDocument[]> {
    const orders = await Order.find({ collections: this._id, status: 'New', operation: 'Sell' })
    console.log(`[${this._id}] ${this.ticker} в getSellOrdersV2 ${orders.length} ордера на продажу`)
    return orders
}

RobotSchema.methods.needSell = async function (lots: number) {
    const {
        figi,
        sell_price: price
    } = this
    const request: LimitOrderRequest & FIGI = {
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

        force_order_check_locker.lock(this._id) // при малейшем изменении в ордерах перепроверяем их

    } catch (error) {
        bot.telegram.sendMessage(TELEGRAM_ID, `[${this._id}] ${this.ticker} Ошибка при отправке ордера на продажу ${lots} лотов по цене ${price}`, { parse_mode: "Markdown" })
        return console.log(`[${this._id}]`, error, request)
    }
}

const INTERVAL_1_MIN: CandleResolution = '1min'

RobotSchema.methods.disable = async function () {
    this.is_enabled = false
    await this.save()
    if (isSubscribed({ figi: this.figi, _id: this._id, interval: INTERVAL_1_MIN })) {
        unsubscribe({ figi: this.figi, _id: this._id, interval: INTERVAL_1_MIN })
    }
}

RobotSchema.methods.enable = async function () {
    const robot = await model.getRobotById(this._id)
    robot.is_enabled = true
    await robot.save()
    if (isSubscribed({ figi: robot.figi, _id: robot._id, interval: INTERVAL_1_MIN })) {
        subscribe({ figi: robot.figi, _id: robot._id, interval: INTERVAL_1_MIN }, async (data: Candle) => {
            const { c: price, v: value } = data
            try {
                await robot.priceWasUpdated(price, value)
            } catch (error) {
                console.error(error)
            }
        })
    }
}

type RobotsIndex = { [id: string]: RobotDocument | undefined }

const robots_index: RobotsIndex = {};

RobotSchema.statics.getRobotById = async function (_id: string) {
    if (robots_index[_id]) return robots_index[_id]
    const robot = await this.findById(_id)
    if (!robot) return
    return robots_index[_id] = robot
}

RobotSchema.statics.getRobotByIdSync = function (_id: string) {
    return robots_index[_id]
}

RobotSchema.statics.isLoaded = function (_id: string) {
    return !!robots_index[_id]
}

export const model = mongoose.model<RobotDocument, RobotModel>(model_name, RobotSchema)


