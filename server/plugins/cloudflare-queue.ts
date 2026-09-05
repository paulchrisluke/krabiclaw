import { definePlugin } from 'nitro'
import { retryFrozenQueueBatch, type DatabaseWriteFreezeEnv } from '~/server/utils/database-write-freeze'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', ({ batch, env }) => {
    if (retryFrozenQueueBatch(env as DatabaseWriteFreezeEnv, batch)) return
    throw new Error('Retired guest delivery queue must remain paused during the Epoch 4 rollback window')
  })
})
