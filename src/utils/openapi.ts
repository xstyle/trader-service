import OpenAPI, { CandleStreaming, CandleStreamingMetaParams, Interval } from '@tinkoff/invest-openapi-js-sdk'
import { EventEmitter } from 'events'
const {
    API_TOKEN = "",
    API_URL = "",
} = process.env

const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws'

const api = new OpenAPI({
    apiURL: API_URL,
    secretToken: API_TOKEN,
    socketURL
})

export default api

export const subscribe: ({ figi, interval }: {
    figi: string;
    interval?: Interval;
}, cb: (x: CandleStreaming, metaParams: CandleStreamingMetaParams) => any) => () => void = function ({ figi, interval }, cb) {
    const eventName = `${figi}-${interval}`
    if (!emitter.listenerCount(eventName)) {
        subscribers[eventName] = api.candle({ figi, interval }, (x, metaParams) => {
            lastCandles[eventName] = { x, metaParams }
            emitter.emit(eventName, x, metaParams)
        })
        console.log('---> Subscribe', eventName);

    } else {
        const lastCandle = lastCandles[eventName]
        if (lastCandle) {
            cb(lastCandle.x, lastCandle.metaParams)
        }
    }
    emitter.on(eventName, cb)
    return () => {
        emitter.off(eventName, cb)
        // временная подписка что бы emitter.listenerCount(eventName) не был нулевым, для новых слушателей
        const tmpCb = () => { }
        emitter.on(eventName, tmpCb)
        setTimeout(() => {
            emitter.off(eventName, tmpCb)
            if (!emitter.listenerCount(eventName)) {
                const subscriber = subscribers[eventName]
                if (!subscriber) return console.log('Error: Subscriber not found.')
                else console.log('-x-> Unsubscribe', eventName)
                delete subscribers[eventName]
                subscriber()
            }
        }, 5000);
    }
}
const lastCandles: { [id: string]: { x: CandleStreaming, metaParams: CandleStreamingMetaParams } } = {}
const subscribers: { [id: string]: () => void } = {}

class Emitter extends EventEmitter { }

const emitter = new Emitter()