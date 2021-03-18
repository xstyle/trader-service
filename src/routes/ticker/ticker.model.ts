import { Currency, InstrumentId, InstrumentType, MarketInstrument } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema } from 'mongoose'
import api from '../../utils/openapi'

export const model_name = 'Ticker'

const TickerSchema = new Schema<TickerDocument>({
    figi: {
        type: String,
        unique: true,
        required: true,
    },
    ticker: String,
    isin: String,
    minPriceIncrement: Number,
    lot: Number,
    currency: String,
    name: String,
    type: String,
})

interface Ticker {
    figi: string;
    ticker: string;
    isin?: string;
    minPriceIncrement?: number;
    lot: number;
    currency?: Currency;
    name: string;
    type: InstrumentType;
}

interface TickerDocument extends Ticker, Document {

}

interface TickerModel extends Model<TickerDocument> {
    getOrCreateTickerByFigiOrTicker(id: string): Promise<TickerDocument>
    getTickerByFigiOrTicker(id: string): Promise<TickerDocument | undefined>
    importTickerByFigiOrTicker(id: string): Promise<MarketInstrument>
}

TickerSchema.statics.getOrCreateTickerByFigiOrTicker = async function (
    this: TickerModel,
    id: string
) {
    const ticker = await this.getTickerByFigiOrTicker(id)
    if (ticker) {
        return ticker
    }
    const data = await this.importTickerByFigiOrTicker(id)
    return this.create(data)
}

TickerSchema.statics.getTickerByFigiOrTicker = async function (
    this: TickerModel,
    id: string
) {
    const query = isFigi(id) ? { figi: id } : { ticker: id }
    return this.findOne(query)
}

function isFigi(id: string): boolean {
    return id.length === 12
}

TickerSchema.statics.importTickerByFigiOrTicker = async function (id: string): Promise<MarketInstrument> {
    const query: InstrumentId = isFigi(id) ? { figi: id } : { ticker: id }
    return api.searchOne(query)
}

export const model = mongoose.model<TickerDocument, TickerModel>(model_name, TickerSchema)