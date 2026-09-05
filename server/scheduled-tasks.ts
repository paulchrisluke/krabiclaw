import type { TaskEvent } from 'nitro/types'

type ScheduledTaskEnvironment = ApiRecord

interface ScheduledTaskDefinition {
  run(_event: TaskEvent): Promise<unknown> | unknown
}

export type ScheduledTaskName =
  | 'blog-scheduled-publish'
  | 'post-scheduled-publish'
  | 'public-resource-cache-invalidation'
  | 'domain-reconciliation'
  | 'zaraz-analytics-reconciliation'
  | 'domain-reconciliation-daily'
  | 'analytics-aggregate-daily'
  | 'site-transfer-reminders'
  | 'google-places-sync'
  | 'instagram-sync-process'
  | 'review-request-automation'
  | 'stripe-reconciliation'

type TaskLoader = () => Promise<{ default: ScheduledTaskDefinition }>

/** The single source of truth for cron-to-task dispatch in Nitro's scheduled hook. */
export const SCHEDULED_TASKS: Readonly<Record<string, readonly ScheduledTaskName[]>> = {
  '*/5 * * * *': ['blog-scheduled-publish', 'post-scheduled-publish'],
  '*/2 * * * *': ['public-resource-cache-invalidation'],
  '*/10 * * * *': ['domain-reconciliation', 'zaraz-analytics-reconciliation'],
  '0 3 * * *': ['domain-reconciliation-daily', 'analytics-aggregate-daily'],
  '0 4 * * *': ['site-transfer-reminders'],
  '0 0 * * SUN': ['google-places-sync'],
  '0 * * * *': ['instagram-sync-process', 'review-request-automation', 'stripe-reconciliation'],
}

const TASK_LOADERS: Readonly<Record<ScheduledTaskName, TaskLoader>> = {
  'blog-scheduled-publish': async () => import('./tasks/blog-scheduled-publish'),
  'post-scheduled-publish': async () => import('./tasks/post-scheduled-publish'),
  'public-resource-cache-invalidation': async () => import('./tasks/public-resource-cache-invalidation'),
  'domain-reconciliation': async () => import('./tasks/domain-reconciliation'),
  'zaraz-analytics-reconciliation': async () => import('./tasks/zaraz-analytics-reconciliation'),
  'domain-reconciliation-daily': async () => import('./tasks/domain-reconciliation-daily'),
  'analytics-aggregate-daily': async () => import('./tasks/analytics-aggregate-daily'),
  'site-transfer-reminders': async () => import('./tasks/site-transfer-reminders'),
  'google-places-sync': async () => import('./tasks/google-places-sync'),
  'instagram-sync-process': async () => import('./tasks/instagram-sync-process'),
  'review-request-automation': async () => import('./tasks/review-request-automation'),
  'stripe-reconciliation': async () => import('./tasks/stripe-reconciliation'),
}

export function getScheduledTaskNames(cron: string): readonly ScheduledTaskName[] {
  return SCHEDULED_TASKS[cron] ?? []
}

export interface ScheduledTaskRunOptions {
  loadTask?: (_name: ScheduledTaskName) => Promise<ScheduledTaskDefinition>
  scheduledTime?: number
  onError?: (_name: ScheduledTaskName, _error: unknown) => void
}

/**
 * Execute all jobs mapped to a Cloudflare cron expression.
 *
 * Each job is isolated so one failing integration does not prevent its peers
 * from running while the native Cloudflare scheduled hook remains the only
 * Worker event entrypoint.
 */
export async function runScheduledTasks(
  cron: string,
  env: ScheduledTaskEnvironment,
  options: ScheduledTaskRunOptions = {},
): Promise<void> {
  const names = getScheduledTaskNames(cron)
  const loadTask = options.loadTask ?? (async (name: ScheduledTaskName) => (await TASK_LOADERS[name]()).default)
  const scheduledTime = options.scheduledTime ?? Date.now()
  const onError = options.onError ?? ((name, error) => {
    console.error(`Error while running scheduled task "${name}"`, error)
  })

  await Promise.all(names.map(async (name) => {
    try {
      const task = await loadTask(name)
      await task.run({
        name,
        payload: { scheduledTime },
        context: { cloudflare: { env } },
      })
    } catch (error) {
      onError(name, error)
    }
  }))
}
