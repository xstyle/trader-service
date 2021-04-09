import { Server, Socket } from "socket.io";
import { Candle, CandleResolution, CandleStreaming } from "@tinkoff/invest-openapi-js-sdk"
import { subscribe as _subscribe, unsubscribe as _unsubscribe } from "../routes/robot/robot.controller"

export default function SocketConfig(io: Server) {

    function handlePriceUpdated(data: Candle) {
        const { figi, interval } = data
        //console.log(`SOCKET Update ticker ${JSON.stringify(data)}`);
        setLastData({ data, figi, interval })
        io.to(`${figi}:${interval}`).emit(`TICKER:${figi}:${interval}`, data)
    }

    function subscribeApi({ figi, interval }: { figi: string, interval: CandleResolution }) {
        console.log(`SOCKET subsribe API ${figi} ${interval}`)
        try {
            _subscribe({ figi, _id: figi, interval }, handlePriceUpdated)
        } catch (error) {
            console.error(error);
        }
    }

    io.on('connection', (socket: Socket) => {
        socket.on('subscribe', (data) => {
            console.log('SOCKET subscribe', data)
            subscribe(socket, data)
        })
        socket.on('unsubscribe', (data) => {
            console.log('SOCKET unsubscribe', data.figi)
            unsubscribe(socket, data)
        })
        console.log('Connection work!')
    })

    io.of("/").adapter
        .on("create-room", (room: string) => {
            const [figi, interval] = room.split(':')
            if (isCandleResolution(interval)) {
                console.log(`SOCKET room ${room} was created`);
                subscribeApi({ figi, interval })
            }
        })
        .on("delete-room", (room: string) => {
            const [figi, interval] = room.split(':')
            if (isCandleResolution(interval)) {
                console.log(`SOCKET room ${room} was deleted`);
                unsubscribeApi({ figi, interval })
            }
        })
        .on("join-room", (room: string, id) => {
            //console.log(`socket ${id} has joined room ${room}`);
        })
        .on("leave-room", (room: string, id) => {
            //console.log(`socket ${id} has leaved room ${room}`);
        });
}

function getLastData({ figi, interval }: { figi: string, interval: CandleResolution }) {
    if (!last_data[figi]) return
    if (!last_data[figi][interval]) return
    return last_data[figi][interval]
}

function setLastData({ figi, interval, data }: { figi: string, interval: CandleResolution, data: CandleStreaming }) {
    if (!last_data[figi]) last_data[figi] = {}
    last_data[figi][interval] = data
}

function subscribe(socket: Socket, { figi, interval }: { figi: string, interval: CandleResolution }) {
    const room_name = `${figi}:${interval}`
    socket.join(room_name)

    const data = getLastData({ figi, interval })
    if (data) {
        socket.emit(`TICKER:${figi}:${interval}`, data)
    }
}

function unsubscribe(socket: Socket, { figi, interval }: { figi: string, interval: CandleResolution }) {
    const room_name = `${figi}:${interval}`
    socket.leave(room_name)
}

type TickerDataIndex = {
    [id: string]: {
        [interval in CandleResolution]?: CandleStreaming
    }
}

const last_data: TickerDataIndex = {}

function isCandleResolution(interval: string): interval is CandleResolution {
    if (!interval) return false
    return true
}

function unsubscribeApi({ figi, interval }: { figi: string, interval: CandleResolution }) {
    console.log(`SOCKET unsubsribe API ${figi} ${interval}`);
    try {
        _unsubscribe({ figi, _id: figi, interval })
    } catch (error) {
        console.error('SOCKET', error);
    }
}