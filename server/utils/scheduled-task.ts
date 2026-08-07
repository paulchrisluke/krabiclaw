import type { Task } from 'nitropack/types'

/**
 * Runtime-safe task definition helper.
 *
 * Nitro's `defineTask` is an auto-import backed by Nitro's virtual task
 * registry. The Cloudflare entrypoint runs these handlers directly, so task
 * modules must not import that registry (or its cron runner) into the Worker.
 */
export function defineScheduledTask<RT = unknown>(definition: Task<RT>): Task<RT> {
  return definition
}
