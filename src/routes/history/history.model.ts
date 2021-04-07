import mongoose, { Document, Model, Schema } from "mongoose";

export const model_name = 'History'

const HistorySchema = new Schema<HistoryDocument, HistoryModel>({
    title: { type: String },
    description: { type: String },
    created_at: { type: Date, default: Date.now },
    type: { type: String },
    figi: { type: String },
    collection_id: { type: String },
})

interface History {
    title: string;
    description: string;
    created_at: Date;
    type: string;
    figi: string;
    collection_id: string;
}

interface HistoryDocument extends Document, History {

}

interface HistoryModel extends Model<HistoryDocument> {

}

export const model = mongoose.model<HistoryDocument, HistoryModel>(model_name, HistorySchema)