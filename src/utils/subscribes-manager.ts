import { CandleResolution, CandleStreaming } from "@tinkoff/invest-openapi-js-sdk"
import { model as Ticker } from "../routes/ticker/ticker.model"
import api from "./openapi"


export async function safeSubscribeCandle({ figi, interval }: { figi: string, interval: CandleResolution }, cb: (x: CandleStreaming) => void): Promise<() => void> {
    // на плохие тикеры
    const ticker = await Ticker.getOrCreateTickerByFigiOrTicker(figi)
    if (!ticker || !ticker.minPriceIncrement) {
        console.log(`ROBOT Ticker ${figi} ${interval} is bad FIGI`)
        return () => { }
    }
    console.log(`ROBOT Subscribe FIGI ${figi} ${interval}`)
    return api.candle({ figi, interval }, cb)
}
