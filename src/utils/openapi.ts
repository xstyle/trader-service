import OpenAPI from '@tinkoff/invest-openapi-js-sdk'

const {
    API_TOKEN = "",
    API_URL = "",
} = process.env

const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws'

const api = new OpenAPI({
    apiURL: API_URL,
    secretToken: API_TOKEN,
    socketURL
})

export default api