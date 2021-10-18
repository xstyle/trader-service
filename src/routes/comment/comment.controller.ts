import { RequestHandler } from "express"

type InstrumentComment = {
    "type": "share",
    "ticker": string,
    "lastPrice": number,
    "currency": "usd",
    "image": string,
    "briefName": string,
    "dailyYield": null,
    "relativeDailyYield": number,
    "price": number,
    "relativeYield": number
}

type Comment = {
    "id": string,
    "text": string,
    "likesCount": number,
    "commentsCount": number,
    "isLiked": boolean,
    "inserted": string,
    "isEditable": boolean,
    "instruments": InstrumentComment[],
    "profiles": [],
    "serviceTags": [],
    "profileId": string,
    "nickname": string,
    "image": null,
    "postImages": [],
    "hashtags": [],
    "owner": {
        "id": string,
        "nickname": string,
        "image": null,
        "donationActive": boolean,
        "block": boolean,
        "serviceTags": string[]
    },
    "reactions": {
        "totalCount": number,
        "myReaction": null,
        "counters": any[]
    },
    "content": {
        "type": "simple",
        "text": string,
        "instruments": InstrumentComment[],
        "hashtags": string[],
        "profiles": string[],
        "images": string[],
        "strategies": string[]
    },
    "baseTariffCategory": "unauthorized",
    "isBookmarked": boolean,
    "status": "published"
}


export const index: RequestHandler<{}, Comment[], undefined, { ticker: string }> = async (req, res, next) => {
    const { ticker } = req.query
    if (!ticker) return res.sendStatus(404)
    try {
        const response = await fetch(`https://www.tinkoff.ru/api/invest-gw/social/v1/post/instrument/${ticker}`)
        const data: { payload: { items: Comment[] } } = await response.json()
        res.send(data.payload.items)
    } catch (error) {
        next(error)
    }
}