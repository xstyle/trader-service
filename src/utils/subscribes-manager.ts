import { CandleResolution, CandleStreaming } from "@tinkoff/invest-openapi-js-sdk";
import api from './openapi'
import { model as Ticker } from '../routes/ticker/ticker.model'

type RootSubscribersIndex = {
    [figi: string]: {
        [interval in CandleResolution]?: () => void
    }
}

const root_subscribers: RootSubscribersIndex = {}

type SubscriberType = {
    cb(data: CandleStreaming): void,
    id: string
}

type SubscribersIndex = {
    [figi: string]: {
        [interval in CandleResolution]?: SubscriberType[]
    }
}

const subscribers: SubscribersIndex = {}

const last_data: {
    [figi: string]: {
        [interval in CandleResolution]?: CandleStreaming
    }
} = {}

function getRootSubscriber({ figi, interval }: { figi: string, interval: CandleResolution }) {
    if (!root_subscribers[figi]) return
    if (!root_subscribers[figi][interval]) return
    return root_subscribers[figi][interval]
}

async function apiSubscribe({ figi, interval }: { figi: string, interval: CandleResolution }) {
    console.log(`ROBOT apiSubscribe({figi: ${figi}, interval: ${interval}})`)
    if (getRootSubscriber({ figi, interval })) {
        return console.error({ figi, interval }, getRootSubscriber({ figi, interval }))
    }
    // на плохие тикеры делаем загруж
    const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(figi)
    if (!ticker || !ticker.minPriceIncrement) {
        console.log(`ROBOT Ticker ${figi} ${interval} is bad FIGI`)
        setRootSubscriber({
            figi,
            interval,
            cb: () => { }
        })
        return
    }
    console.log(`ROBOT Subscribe FIGI ${figi} ${interval}`)
    setRootSubscriber({
        figi,
        interval,
        cb: api.candle({ figi, interval }, tickerWasUpdated({ figi, interval }))
    })
}

function apiUnsubscribe({ figi, interval }: { figi: string, interval: CandleResolution }) {
    console.log(`ROBOT Unsubscribe FIGI ${figi} ${interval}`)
    const subscription = getRootSubscriber({ figi, interval })
    if (!subscription) throw new Error('There already is ticker')
    subscription()
    clearRootSubscriber({ figi, interval })
}

function setRootSubscriber({ figi, interval, cb }: { figi: string, interval: CandleResolution, cb: () => void }) {
    if (!root_subscribers[figi]) root_subscribers[figi] = {}
    root_subscribers[figi][interval] = cb
}

function clearRootSubscriber({ figi, interval }: { figi: string, interval: CandleResolution }) {
    delete root_subscribers[figi][interval]
}

function getAllRootSubscribers() {
    const root_subscribers: [string, CandleResolution][] = []
    for (const figi of Object.keys(root_subscribers)) {
        const test = root_subscribers[figi]
        for (const interval of Object.keys(test)) {
            root_subscribers.push([figi, interval as CandleResolution])
        }
    }
    return root_subscribers
}

export async function apiResubscribe() {
    const root_subscribers = getAllRootSubscribers()
    for (const [figi, interval] of root_subscribers) {
        apiUnsubscribe({ figi, interval })
        await apiSubscribe({ figi, interval })
    }
    return root_subscribers.length
}

function tickerWasUpdated({ figi, interval }: { figi: string, interval: CandleResolution }): (data: CandleStreaming) => void {
    return (data) => {
        setLastData({
            figi,
            interval,
            data
        })
        for (const subscriber of getSubscribers({ figi, interval })) {
            subscriber.cb(data)
        }
    }
}


function getSubscribers({ figi, interval }: { figi: string, interval: CandleResolution }): SubscriberType[] {
    const figisSubscriber = subscribers[figi]
    if (!figisSubscriber) return []
    const figiIntervalSubscribers = figisSubscriber[interval]
    if (!figiIntervalSubscribers) return []
    return figiIntervalSubscribers
}

export function subscribe({ _id, figi, interval }: { _id: string, figi: string, interval: CandleResolution }, cb: (data: CandleStreaming) => void) {

    if (getSubscribers({ figi, interval }).length === 0) {
        apiSubscribe({ figi, interval })
    }
    if (isSubscribed({ figi, _id, interval })) return console.log(`Figi ${figi} ID ${_id} ${interval} already subscribed`)

    addSubscriber({
        figi,
        interval,
        subscriber: {
            cb,
            id: _id.toString()
        }
    })

    const data: CandleStreaming | undefined = getLastData({ figi, interval })
    data && cb(data)
}


export function isSubscribed({ figi, _id, interval }: { figi: string, _id: string, interval: CandleResolution }) {
    const subscribers = getSubscribers({ figi, interval })
    return subscribers.find(subscriber => subscriber.id == _id)
}

export function unsubscribe({ figi, _id, interval }: { figi: string, _id: string, interval: CandleResolution }) {
    const subscribers = getSubscribers({ figi, interval })
    if (!subscribers.length) return
    const index = subscribers.findIndex(subscriber => subscriber.id == _id);
    if (index === -1) return
    subscribers.splice(index, 1)
    console.log(`[${_id}]   Robot has been unsubscribed`)
    if (subscribers.length === 0) apiUnsubscribe({ figi, interval })
}


function addSubscriber({ figi, interval, subscriber }: { figi: string, interval: CandleResolution, subscriber: SubscriberType }): void {
    const figiSubscribers = subscribers[figi] || (subscribers[figi] = {})
    const figiIntervalSubscribers = figiSubscribers[interval] || (figiSubscribers[interval] = [])
    figiIntervalSubscribers.push(subscriber)
}

function setLastData({ figi, interval, data }: { figi: string, interval: CandleResolution, data: CandleStreaming }) {
    const figiLastData = last_data[figi] || (last_data[figi] = {})
    figiLastData[interval] = data
}

function getLastData({ figi, interval }: { figi: string, interval: CandleResolution }): CandleStreaming | undefined {
    const figisData = last_data[figi]
    if (!figisData) return
    if (!figisData[interval]) return
    return figisData[interval]
}