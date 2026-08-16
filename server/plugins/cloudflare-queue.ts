import { definePlugin } from 'nitro';
import type { MessageBatch } from '@cloudflare/workers-types'
import { processGuestDelivery, type GuestDeliveryWorkerEnv } from '~/server/cloudflare/guest-delivery-queue'
import type { GuestDeliveryQueueMessage } from '~/server/domain/guest-threads/outbox-publisher'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch, env }) => {
    const typedBatch = batch as MessageBatch<GuestDeliveryQueueMessage>
    const workerEnv = env as GuestDeliveryWorkerEnv
    for (const message of typedBatch.messages) {
      try {
        if (message.body.schemaVersion !== 1) throw new Error('Unsupported guest delivery queue message schema')
        await processGuestDelivery(workerEnv, message.body)
        message.ack()
      } catch (error) {
        console.error('Guest delivery queue message failed', error)
        message.retry()
      }
    }
  })
})
