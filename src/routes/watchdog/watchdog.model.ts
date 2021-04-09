import { Candle, CandleStreaming } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema } from 'mongoose'
import { subscribe, unsubscribe } from '../../utils/subscribes-manager'
import bot from '../../utils/telegram'
import { model as Ticker } from '../ticker/ticker.model'

export const model_name = 'Watchdog'

const TELEGRAM_ID: string = process.env.TELEGRAM_ID || ""

const WatchdogSchema = new Schema<WatchDogDocument, WatchDogModel>({
    figi: {
        type: String,
        unique: true,
        required: true,
    },
    is_enabled: {
        type: Boolean,
        required: true,
        default: false
    },
    threshold: {
        type: Number,
        require: true,
        default: 1
    }
})

interface WatchDog {
    figi: string;
    is_enabled: boolean;
    threshold: number;
}

export interface WatchDogDocument extends WatchDog, Document {
    run(): Promise<void>
    stop(): Promise<void>
    handleChangePrice(data: CandleStreaming): Promise<void>
}

export interface WatchDogModel extends Model<WatchDogDocument> {
    runAll(): Promise<number>
}

WatchdogSchema.statics.runAll = async function (this: WatchDogModel) {
    const watch_dogs = await this.find({ is_enabled: true }).exec()
    for (const watch_dog of watch_dogs) {
        await watch_dog.run()
    }
    return watch_dogs.length
}

WatchdogSchema.methods.run = async function (this: WatchDogDocument): Promise<void> {
    const { figi, _id } = this
    const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(figi)
    if (subscribers[figi]) return console.log(`WatchDog $${ticker.ticker} Already work!`)
    subscribers[figi] = true
    subscribe({
        _id,
        figi,
        interval: '1min'
    }, (data) => {
        this.handleChangePrice(data)
    })

    this.is_enabled = true
    await this.save()
    return
}

WatchdogSchema.methods.stop = async function (this: WatchDogDocument): Promise<void> {
    const { figi, _id } = this
    const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(figi)
    if (!subscribers[figi]) return console.log(`Watchdog $${ticker.ticker} Already was stopped!`)
    subscribers[figi] = false
    unsubscribe({
        _id,
        figi,
        interval: '1min'
    })

    this.is_enabled = false
    await this.save()
    return
}

WatchdogSchema.methods.handleChangePrice = async function (
    this: WatchDogDocument,
    data: Candle
) {
    const { figi } = this
    if (!history[figi]) history[figi] = []

    const log = history[figi]

    log.push({
        ...data,
        _time: Date.now()
    })
    const median = log.reduce((sum, item) => sum + item.c, 0) / log.length
    const delta = data.c - median

    if (!statistica[figi]) statistica[figi] = { min: delta, max: delta }

    const statistics = statistica[figi]
    if (statistics.min > delta) statistics.min = delta;
    if (statistics.max < delta) statistics.max = delta;

    //console.log(this.figi, data.c.toFixed(2), median.toFixed(2), `[${format(statistics.min)}, ${format(delta)}, ${format(statistics.max)}]`, log.length)

    if (this.threshold < Math.abs(delta)) {
        const step = (this.threshold - this.threshold % delta) / delta
        const id = `${figi}-${step}`
        const timeout = 10000
        if (canSendMessageAndDisable(id, timeout)) {
            const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(figi)
            bot.telegram.sendMessage(TELEGRAM_ID, `$${ticker.ticker} ∆${delta.toFixed(2)}$ ${data.c.toFixed(2)}$ [${log.length}]`)
        }
    }
}

function canSendMessage(id: string): boolean {
    return !stop_send_message[id]
}

function canSendMessageAndDisable(
    id: string,
    timeout?: number
) {
    if (!canSendMessage(id)) return false
    disableSendMessage(id, timeout)
    return true
}


function disableSendMessage(
    id: string,
    timeout: number = 10000
) {
    stop_send_message[id] = true
    setTimeout(() => enableSendMessage(id), timeout)
}

function enableSendMessage(id: string) {
    stop_send_message[id] = false
}

const stop_send_message: { [id: string]: boolean } = {}

function format(value: number) {
    return `${value >= 0 ? ' ' : ''}${value.toFixed(2)}`
}

const INTERVAL_5_SECONDS = 5 * 1000

setInterval(() => {
    const time = Date.now() - INTERVAL_5_SECONDS // 5 секунд
    Object.keys(history).forEach(figi => {
        history[figi] = history[figi].filter(item => item._time > time)
    })
}, 1000)

const history: { [id: string]: (Candle & { _time: number })[] } = {}
const statistica = {}
const subscribers = {}

export const model = mongoose.model<WatchDogDocument, WatchDogModel>(model_name, WatchdogSchema)

model.runAll().then((amount) => console.log(`WatchDogs ${amount} had been running...`))
