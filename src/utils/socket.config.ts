import { CandleResolution, CandleStreaming, Depth, OrderbookStreaming } from "@tinkoff/invest-openapi-js-sdk";
import { Server, Socket } from "socket.io";
import api from "./openapi";
import { safeSubscribeCandle } from "./subscribes-manager";

export default function SocketConfig(io: Server) {

    io.on('connection', (socket: Socket) => {
        socket.on('candle:subscribe', (data: { figi: string, interval: CandleResolution }) => {
            console.log('SOCKET subscribe', data)
            const room_name = `candle:${data.figi}:${data.interval}`
            socket.join(room_name)
            const candle = getLastCandle(room_name)
            if (candle) {
                socket.emit(room_name, candle)
            }
        })
        socket.on('candle:unsubscribe', (data: { figi: string, interval: CandleResolution }) => {
            console.log('SOCKET unsubscribe', data.figi)
            const room_name = `candle:${data.figi}:${data.interval}`
            socket.leave(room_name)
        })
        socket.on('orderbook:subscribe', (data: { figi: string, depth: Depth }) => {
            const room_name = `orderbook:${data.figi}:${data.depth}`
            socket.join(room_name)
        })
        socket.on('orderbook:unsubscribe', (data: { figi: string, depth: Depth }) => {
            const room_name = `orderbook:${data.figi}:${data.depth}`
            socket.leave(room_name)
        })
        console.log('Connection work!')
    })

    const orderbookSubscribers = {}
    const candleSubscribers = {}

    io.of("/").adapter
        .on("create-room", async (room_name: string) => {
            const [type, figi, param] = room_name.split(':')
            switch (type) {
                case "candle":
                    if (figi && param && isCandleResolution(param)) {
                        console.log(`SOCKET room ${room_name} was created`);
                        try {
                            candleSubscribers[room_name] = await safeSubscribeCandle({ figi, interval: param }, (x: CandleStreaming) => {
                                if (!setLastCandle(room_name, x)) return
                                io.to(room_name).emit(room_name, x)
                            })
                        } catch (error) {
                            console.error('Error subscribe instrument')
                        }
                    }
                    break;
                case "orderbook":
                    if (figi && param) {
                        const depth = parseInt(param)
                        if (isDepth(depth)) {
                            orderbookSubscribers[room_name] = api.orderbook({ figi, depth }, (x: OrderbookStreaming) => {
                                io.to(room_name).emit(room_name, x)
                            })
                        }
                    }
                    break;
                default:
                    break;
            }

        })
        .on("delete-room", (room_name: string) => {
            const [type, figi, param] = room_name.split(':')

            switch (type) {
                case "candle":
                    if (figi && param && isCandleResolution(param)) {
                        console.log(`SOCKET room ${room_name} was deleted`);
                        if (candleSubscribers[room_name]) {
                            candleSubscribers[room_name]()
                            delete candleSubscribers[room_name]
                        } else {
                            console.error('Subscriber not found')
                        }
                    }
                    break
                case "orderbook":
                    if (figi && param) {
                        console.log(`SOCKET room ${room_name} was deleted`);
                        if (orderbookSubscribers[room_name]) {
                            orderbookSubscribers[room_name]()
                            delete orderbookSubscribers[room_name]
                        }
                    }
                    break
                default:
                    break
            }
        })
        .on("join-room", (room: string, id) => {
            console.log(`socket ${id} has joined room ${room}`);
        })
        .on("leave-room", (room: string, id) => {
            console.log(`socket ${id} has leaved room ${room}`);
        });
}

function getLastCandle(name: string): CandleStreaming | undefined {
    return last_candles[name]
}

function setLastCandle(name: string, x: CandleStreaming): boolean {
    if (last_candles[name]?.v === x.v) return false
    last_candles[name] = x
    return true
}

type LastCandlesIndex = {
    [id: string]: CandleStreaming
}

const last_candles: LastCandlesIndex = {}

function isCandleResolution(interval: string): interval is CandleResolution {
    if (!interval) return false
    return true
}
function isDepth(depth: number): depth is Depth {
    if (!depth) return false
    return true
}