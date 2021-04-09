#!/usr/bin/env node
import compression from 'compression'
import http from "http"
import cors from 'cors'
import { env } from "custom-env"
import express from 'express'
import mongoose from 'mongoose'
import { Server } from "socket.io"
env(process.env.ENV === 'production' ? 'production' : 'development')

import router from './routes'
import SocketConfig from './utils/socket.config'

const {
    MONGO_DB,
    HOSTNAME
} = process.env

if (MONGO_DB && HOSTNAME) {
    mongoose.connect(
        MONGO_DB,
        {
            useNewUrlParser: true,
            useUnifiedTopology: true
        },
        (error) => {
            if (error) return console.error(error)
            console.log(`I DB I connected to ${MONGO_DB}`)
        }
    )
    const app = express()

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
    SocketConfig(io)
    server.listen(port, () => {
        console.log(`Example app listening at http://${HOSTNAME}:${port}`)
    })
}
