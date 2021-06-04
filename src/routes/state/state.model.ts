import mongoose, { Document, Model, Schema } from 'mongoose'
import { model as Robot } from '../robot/robot.model'
export const model_name = 'State'

const StateSchema = new Schema<StateDocument, StateModel>({
    is_running: {
        type: Boolean,
        default: false,
    }
})

interface State {
    is_running: boolean
}

interface StateDocument extends State, Document {
    stop(): Promise<StateDocument>
    run(): Promise<StateDocument>
}

interface StateModel extends Model<StateDocument> {
    getState(): Promise<StateDocument>
}

StateSchema.statics.getState = async function (this: StateModel): Promise<StateDocument> {
    const state = await this.findOne().exec()
    if (state) return state
    return this.create({ is_running: false })
}

StateSchema.methods.stop = async function (this: StateDocument): Promise<StateDocument> {
    this.is_running = false

    await Robot.stopRobots()
    return this.save()
}

StateSchema.methods.run = async function (this: StateDocument): Promise<StateDocument> {
    this.is_running = true
    await Robot.runRobots()
    return this.save()
}

export const model = mongoose.model<StateDocument, StateModel>(model_name, StateSchema)


