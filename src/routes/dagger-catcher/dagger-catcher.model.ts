import { OperationType, PlacedLimitOrder } from '@tinkoff/invest-openapi-js-sdk'
import mongoose, { Document, Model, Schema } from 'mongoose'
import api from '../../utils/openapi'
import { model as Order } from '../order/order.model'

export const model_name = 'DaggerCatcher'

const DaggerCatcherSchema = new Schema<DaggerCatcherDocument, DaggerCatcherModel>({
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
    },
    is_pinned: {
        type: Boolean,
        required: true,
        default: false
    },
    is_hidden: {
        type: Boolean,
        default: false
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

export interface DaggerCatcherType {
    figi: string;
    min: number;
    max: number;
    is_pinned: boolean;
    is_hidden: boolean;
}

export interface DaggerCatcherDocument extends DaggerCatcherType, Document {
    execute(data: { price: number, operation: OperationType, lots: number }): Promise<PlacedLimitOrder>
}

export interface DaggerCatcherModel extends Model<DaggerCatcherDocument> {

}

export const model = mongoose.model<DaggerCatcherDocument, DaggerCatcherModel>(model_name, DaggerCatcherSchema)

