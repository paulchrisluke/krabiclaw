import type { DbClient } from '~/server/db'
import { listPendingDeliveryOutbox, markOutboxPublished, markOutboxPublishFailed } from './deliveries'

export interface GuestDeliveryQueueMessage {
  schemaVersion: 1
  outboxId: string
  deliveryId: string
}

export interface GuestDeliveryQueueEnv {
  GUEST_DELIVERY_QUEUE?: Queue<GuestDeliveryQueueMessage>
}

export async function publishPendingGuestDeliveryOutbox(
  db: DbClient,
  env: GuestDeliveryQueueEnv,
  limit = 25,
): Promise<{ published: number; failed: number }> {
  if (!env.GUEST_DELIVERY_QUEUE) {
    throw new Error('GUEST_DELIVERY_QUEUE binding is not configured')
  }

  let published = 0
  let failed = 0
  const rows = await listPendingDeliveryOutbox(db, limit)
  for (const row of rows) {
    if (!row.delivery_id) {
      await markOutboxPublishFailed(db, row.id, 'Outbox row has no delivery_id')
      failed += 1
      continue
    }
    try {
      await env.GUEST_DELIVERY_QUEUE.send({
        schemaVersion: 1,
        outboxId: row.id,
        deliveryId: row.delivery_id,
      })
      await markOutboxPublished(db, row.id)
      published += 1
    } catch (error) {
      await markOutboxPublishFailed(db, row.id, error instanceof Error ? error.message : String(error))
      failed += 1
    }
  }

  return { published, failed }
}
