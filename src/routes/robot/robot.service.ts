import { CronJob } from "cron"
import { apiResubscribe } from "../../utils/subscribes-manager"
import bot from "../../utils/telegram"

const TELEGRAM_ID: string = process.env.TELEGRAM_ID || ""

export const job = new CronJob('2 0 10 * * *', async function () {
    try {
        const amount = await apiResubscribe()
        bot.telegram.sendMessage(TELEGRAM_ID, `${amount} instruments have been restarted by CronJob`)
    } catch (error) {
        console.error(error)
        bot.telegram.sendMessage(TELEGRAM_ID, `There has been error.`)
    }
}, null, true, 'Europe/Moscow')

job.start()