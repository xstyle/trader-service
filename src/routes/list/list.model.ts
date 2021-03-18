import mongoose, { Document, Model, Types } from 'mongoose'

export const model_name = 'List'

const ListSchema = new mongoose.Schema<ListDocument>({
    name: {
        type: String,
        required: true
    },
    figis: [String]
})

interface List {
    name: string;
    figis: Types.Array<string>;
}

interface ListDocument extends List, Document {

}

interface ListModel extends Model<ListDocument> {

}

export const model = mongoose.model<ListDocument, ListModel>(model_name, ListSchema)