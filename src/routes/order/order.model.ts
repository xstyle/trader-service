import { MoneyAmount, Operation, OperationStatus, OperationTrade, OperationTypeWithCommission, OrderStatus } from '@tinkoff/invest-openapi-js-sdk'
import moment from 'moment'
import mongoose, { Document, Model, Schema, Types } from 'mongoose'
import api from '../../utils/openapi'
export const model_name = 'LimitOrder'

interface MyOperation extends Operation {
    quantityExecuted: number
}

const LimitOrderSchema = new Schema<LimitOrderDocument, LimitOrderModel>({
    orderId: {
        type: String,
        required: true
    },
    figi: {
        type: String,
        required: true
    },
    operation: {
        type: String,
        enum: ["Buy", "Sell", "BuyCard"]
    },
    status: {
        type: String,
        enum: ['New', 'PartiallyFill', 'Fill', 'Cancelled', 'Replaced', 'PendingCancel', 'Rejected', 'PendingReplace', 'PendingNew', 'Done', 'Decline']
    },
    rejectReason: {
        type: String
    },
    message: {
        type: String
    },
    requestedLots: {
        type: Number
    },
    executedLots: {
        type: Number
    },
    commission: {
        currency: {
            type: String,
            enum: ['RUB', 'USD', 'EUR', 'GBP', 'HKD', 'CHF', 'JPY', 'CNY', 'TRY']
        },
        value: {
            type: Number
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    date: {
        type: Date
    },
    isSynced: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number
    },
    requestedPrice: {
        type: Number
    },
    payment: {
        type: Number
    },
    currency: {
        type: String
    },
    collections: [Schema.Types.ObjectId],
    trades: [{
        tradeId: { type: String, required: true },
        date: { type: Date, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
})

interface LimitOrder {
    orderId: string;
    figi: string;
    operation: OperationTypeWithCommission;
    status: OperationStatus | OrderStatus;
    rejectReason?: string;
    message?: string;
    requestedLots: number;
    executedLots: number;
    commission?: MoneyAmount;
    createdAt: Date;
    updatedAt: Date;
    date?: Date;
    isSynced?: Boolean;
    price: number;
    requestedPrice: number;
    payment?: number;
    currency?: string;
    collections: Types.Array<Types.ObjectId>;
    trades: Types.Array<OperationTrade>;
}

export interface LimitOrderDocument extends LimitOrder, Document {
    addCollection(collection: string): Promise<LimitOrderDocument>
    removeCollection(collection: Types.ObjectId): Promise<LimitOrderDocument>
    cancel(): Promise<void>
    sync(): Promise<LimitOrderDocument>
}

interface LimitOrderModel extends Model<LimitOrderDocument> {
    findOrCreate(id: string, date: string): Promise<LimitOrderDocument>
    findOrCreateByOperation(operation: Operation): Promise<LimitOrderDocument>
    import(id: string, date: string): Promise<LimitOrderDocument>
    createByOperation(operation: Operation): Promise<LimitOrderDocument>
    load(id: string, date: string): Promise<MyOperation | undefined>
    checkPaymnets(): Promise<void>
}

LimitOrderSchema.index({ collections: 1 })
LimitOrderSchema.index({ collections: 1, status: 1 })

LimitOrderSchema.statics.findOrCreate = async function (
    id: string,
    date: string
): Promise<LimitOrderDocument> {
    const order = await this.findOne({ orderId: id })

    if (order) return order
    return this.import(id, date)
}

LimitOrderSchema.statics.findOrCreateByOperation = async function (
    operation: Operation
): Promise<LimitOrderDocument> {
    const order = await this.findOne({ orderId: operation.id })
    if (order) return order
    return this.createByOperation(operation)
}

LimitOrderSchema.statics.import = async function (
    id: string,
    date: string
): Promise<LimitOrderDocument | void> {
    const operation = await this.load(id, date)
    if (operation) return this.createByOperation(operation)
}

LimitOrderSchema.statics.createByOperation = async function (operation: MyOperation) {
    return this.create({
        orderId: operation.id,
        figi: operation.figi,
        operation: operation.operationType,
        requestedLots: operation.quantity,
        executedLots: operation.quantityExecuted,
        price: operation.price,
        createdAt: operation.date,
        status: operation.status,
        trades: [],
        date: operation.date,
        updatedAt: new Date(),
        requestedPrice: 0,
        collections: []
    })
}

LimitOrderSchema.statics.load = async function (
    id: string,
    date: string
): Promise<MyOperation | void> {
    const query = {
        from: moment(date).add(-1, 'd').toISOString(),
        to: moment(date).add(1, 'd').toISOString(),
    }
    const { operations } = await api.operations(query)
    console.log(`Поиск ордера ${id} ${date} [${operations.length}]`)
    return operations.find(operation => operation.id === id) as MyOperation
}

LimitOrderSchema.methods.addCollection = async function (collection: Types.ObjectId): Promise<LimitOrderDocument> {
    this.date
    this.collections.push(collection)
    return this.save()
}

LimitOrderSchema.methods.removeCollection = async function (collection: Types.ObjectId): Promise<LimitOrderDocument> {
    this.collections.pull(collection)
    return this.save()
}

LimitOrderSchema.methods.cancel = async function (): Promise<void> {
    await api.cancelOrder({ orderId: this.orderId })
    await this.sync()
}

LimitOrderSchema.methods.sync = async function (): Promise<LimitOrderDocument> {
    const operation = await model.load(this.orderId, this.createdAt.toISOString())
    if (operation) {

        this.executedLots = operation.quantityExecuted
        this.status = operation.status
        this.date = new Date(operation.date)
        this.price = operation.price || this.price
        this.commission = operation.commission
        this.payment = operation.payment
        this.currency = operation.currency
        this.trades = operation.trades as Types.Array<OperationTrade>
        this.isSynced = (
            operation.payment > 0 &&
            operation.commission &&
            operation.commission.value &&
            operation.trades &&
            operation.trades.length > 0
        ) ||
            (this.status == "Decline")
        this.updatedAt = new Date()

        return this.save()
    }
    return this
}

LimitOrderSchema.statics.checkPaymnets = async function () {
    const query = model.find({ status: "Done", isSynced: false })
    const operations = await query
    console.log(`Syncing ${operations.length} operations...`)
    for (const operation of operations) {
        await operation.sync()
    }
}

export const model = mongoose.model<LimitOrderDocument, LimitOrderModel>(model_name, LimitOrderSchema)

