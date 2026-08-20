import type { Task } from 'nitro/types'

/**
 * Runtime-safe task definition helper for the native Cloudflare scheduled hook.
 * The application owns the cron-to-task map and Nitro owns the event handler.
 */
export function defineScheduledTask<RT = unknown>(definition: Task<RT>): Task<RT> {
  return definition
}
