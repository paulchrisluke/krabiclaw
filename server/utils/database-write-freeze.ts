import type { MessageBatch } from '@cloudflare/workers-types'

export interface DatabaseWriteFreezeEnv {
  DB_WRITE_FROZEN?: string
}

export const isDatabaseWriteFrozen = (env: DatabaseWriteFreezeEnv | undefined): boolean =>
  env?.DB_WRITE_FROZEN === 'true'

export function retryFrozenQueueBatch(
  env: DatabaseWriteFreezeEnv | undefined,
  batch: Pick<MessageBatch, 'retryAll'>,
): boolean {
  if (!isDatabaseWriteFrozen(env)) return false

  // Keep the batch out of D1 while the epoch cutover snapshot is copied. The
  // delay also avoids a hot retry loop during the short maintenance window.
  batch.retryAll({ delaySeconds: 300 })
  return true
}
