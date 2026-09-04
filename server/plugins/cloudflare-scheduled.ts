import { definePlugin } from 'nitro';
import { runScheduledTasks } from '~/server/scheduled-tasks'
import { isDatabaseWriteFrozen } from '~/server/utils/database-write-freeze'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async ({ controller, env }) => {
    const workerEnv = env as ApiRecord
    if (isDatabaseWriteFrozen(workerEnv)) {
      console.warn(`Scheduled work skipped during database maintenance (${controller.cron})`)
      return
    }
    await runScheduledTasks(controller.cron, workerEnv, {
      scheduledTime: controller.scheduledTime,
    })
  })
})
