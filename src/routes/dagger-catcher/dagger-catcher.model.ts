import { OperationType, PlacedLimitOrder } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema } from 'mongoose'
import api from '../../utils/openapi'
import { model as Order } from '../order/order.model'

export const model_name = 'DaggerCatcher'

const DaggerCatcherSchema = new Schema<DaggerCatcherDocument>({
    figi: {
        type: String,
        required: true,
    },
    min: {
        type: Number,
        required: true
    },
    max: {
        type: Number,
        required: true
    }
})

DaggerCatcherSchema.methods.execute = async function (
    this: DaggerCatcherDocument,
    data: { price: number, operation: OperationType, lots: number }
) {
    const params = {
        figi: this.figi,
        lots: data.lots,
        operation: data.operation,
        price: data.price,
    }

    const order = await api.limitOrder(params)
    await Order.create({
        ...order,
        figi: params.figi,
        price: params.price,
        requestedPrice: params.price,
        collections: [this._id],
        createdAt: new Date(),
        updatedAt: new Date(),
        trades: []
    })
    return order
}

interface DaggerCatcher {
    figi: string;
    min: number;
    max: number;
}

interface DaggerCatcherDocument extends DaggerCatcher, Document {
    execute(data: { price: number, operation: OperationType, lots: number }): Promise<PlacedLimitOrder>
}

interface DaggerCatcherModel extends Model<DaggerCatcherDocument> {

}

export const model = mongoose.model<DaggerCatcherDocument, DaggerCatcherModel>(model_name, DaggerCatcherSchema)

