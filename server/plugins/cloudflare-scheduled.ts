import { definePlugin } from 'nitro'
import { publishPendingGuestDeliveryOutbox } from '~/server/domain/guest-threads/outbox-publisher'
import { createDb } from '~/server/db'
import { runScheduledTasks } from '~/server/scheduled-tasks'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async ({ controller, env }) => {
    const workerEnv = env as ApiRecord
    const jobs: Promise<unknown>[] = [
      runScheduledTasks(controller.cron, workerEnv, {
        scheduledTime: controller.scheduledTime,
      }),
    ]
    if (controller.cron === '*/5 * * * *') {
      jobs.push(publishPendingGuestDeliveryOutbox(createDb(workerEnv.DB as D1Database), workerEnv, 50))
    }
    await Promise.all(jobs)
  })
})
