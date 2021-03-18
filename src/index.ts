#!/usr/bin/env node
import { CandleResolution } from "@tinkoff/invest-openapi-js-sdk"
import compression from 'compression'
import cors from 'cors'
import { env } from "custom-env"
env(process.env.ENV === 'production' ? 'production' : 'development')

import express from 'express'
import mongoose from 'mongoose'
import { Server, Socket } from "socket.io"
import router from './routes'
import { subscribe as _subscribe, unsubscribe as _unsubscribe } from "./routes/robot/robot.controller"

const {
    MONGO_DB,
    HOSTNAME
} = process.env

mongoose.connect(
    MONGO_DB,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, (error) => {
        if (error) return console.error(error)
        console.log(`I DB I connected to ${MONGO_DB}`)
    })
const app = express()
import http from "http"
const server = new http.Server(app)
const port = 3001

app.use(compression())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(router)
app.use(function (err, req, res, next) {
    console.error(err)
    res.status(500).send('Something broke!')
})

const io = app.locals.io = new Server(server, {
    cors: {
        origin: `*`,
        methods: ["GET", "POST"]
    }
})

function getLastData({ figi, interval }) {
    if (!last_data[figi]) return
    if (!last_data[figi][interval]) return
    return last_data[figi][interval]
}

function setLastData({ figi, interval, data }) {
    if (!last_data[figi]) last_data[figi] = {}
    last_data[figi][interval] = data
}

function subscribe(socket, { figi, interval }) {
    const room_name = `${figi}:${interval}`
    socket.join(room_name)

    const data = getLastData({ figi, interval })
    if (data) {
        socket.emit(`TICKER:${figi}:${interval}`, data)
    }
}

function unsubscribe(socket, { figi, interval }) {
    const room_name = `${figi}:${interval}`
    socket.leave(room_name)
}

const last_data = {}

function handlePriceUpdated(data) {
    const { figi, interval } = data;
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

function unsubscribeApi({ figi, interval }) {
    console.log(`SOCKET unsubsribe API ${figi} ${interval}`);
    try {
        _unsubscribe({ figi, _id: figi, interval })
    } catch (error) {
        console.error('SOCKET', error);
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
        const [figi, interval]  = room.split(':')
        if (interval) {
            console.log(`SOCKET room ${room} was created`);
            subscribeApi({ figi, interval: interval as CandleResolution })
        }
    })
    .on("delete-room", (room: string) => {
        const [figi, interval] = room.split(':')
        if (interval) {
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

server.listen(port, () => {
    console.log(`Example app listening at http://${HOSTNAME}:${port}`)
})