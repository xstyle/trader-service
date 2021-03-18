import { RequestHandler } from "express"
import api from "../../utils/openapi"
import moment from "moment"

export const index: RequestHandler = async (req, res, next) => {
    const {
        figi,
        start_date,
        end_date,
    }: {
        figi?: string
        start_date?: string,
        end_date?: string,
    } = req.query

    if (!start_date || !end_date) return res.send([])

    const query: { from: string, to: string, figi?: string } = {
        from: moment(start_date).toISOString(),
        to: moment(end_date).toISOString()
    }

    if (figi) query.figi = figi as string

    try {
        const { operations } = await api.operations(query)
        res.send(operations)
    } catch (error) {
        console.error(error)
        next(error)
    }
}