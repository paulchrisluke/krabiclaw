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
  | 'google-places-sync'
  | 'instagram-sync-process'
  | 'review-request-automation'
  | 'social-card-backfill'
  | 'sessions-materialize'
  | 'deletion-sweep'
  | 'stripe-webhook-retry'
  | 'article-broadcast-send'

type TaskLoader = () => Promise<{ default: ScheduledTaskDefinition }>

/** The single source of truth for cron-to-task dispatch in Nitro's scheduled hook. */
export const SCHEDULED_TASKS: Readonly<Record<string, readonly ScheduledTaskName[]>> = {
  '*/5 * * * *': ['blog-scheduled-publish', 'post-scheduled-publish', 'social-card-backfill', 'sessions-materialize', 'article-broadcast-send'],
  '*/2 * * * *': ['public-resource-cache-invalidation'],
  '*/10 * * * *': ['domain-reconciliation', 'zaraz-analytics-reconciliation'],
  '0 3 * * *': ['domain-reconciliation-daily', 'analytics-aggregate-daily', 'deletion-sweep'],
  '0 0 * * SUN': ['google-places-sync'],
  '0 * * * *': ['instagram-sync-process', 'review-request-automation', 'stripe-webhook-retry'],
}

const TASK_LOADERS: Readonly<Record<ScheduledTaskName, TaskLoader>> = {
  'blog-scheduled-publish': async () => import('./tasks/blog-scheduled-publish'),
  'social-card-backfill': async () => import('./tasks/social-card-backfill'),
  'post-scheduled-publish': async () => import('./tasks/post-scheduled-publish'),
  'public-resource-cache-invalidation': async () => import('./tasks/public-resource-cache-invalidation'),
  'domain-reconciliation': async () => import('./tasks/domain-reconciliation'),
  'zaraz-analytics-reconciliation': async () => import('./tasks/zaraz-analytics-reconciliation'),
  'domain-reconciliation-daily': async () => import('./tasks/domain-reconciliation-daily'),
  'analytics-aggregate-daily': async () => import('./tasks/analytics-aggregate-daily'),
  'deletion-sweep': async () => import('./tasks/deletion-sweep'),
  'sessions-materialize': async () => import('./tasks/sessions-materialize'),
  'google-places-sync': async () => import('./tasks/google-places-sync'),
  'instagram-sync-process': async () => import('./tasks/instagram-sync-process'),
  'review-request-automation': async () => import('./tasks/review-request-automation'),
  'stripe-webhook-retry': async () => import('./tasks/stripe-webhook-retry'),
  'article-broadcast-send': async () => import('./tasks/article-broadcast-send'),
}

export function getScheduledTaskNames(cron: string): readonly ScheduledTaskName[] {
  return SCHEDULED_TASKS[cron] ?? []
}

export interface ScheduledTaskRunOptions {
  loadTask?: (_name: ScheduledTaskName) => Promise<ScheduledTaskDefinition>
  scheduledTime?: number
}

/**
 * Execute all jobs mapped to a Cloudflare cron expression.
 *
 * Each job is isolated so one failing integration does not prevent its peers
 * from running while the native Cloudflare scheduled hook remains the only
 * Worker event entrypoint. Once all have run, any failure fails the invocation,
 * so Cloudflare records the cron run as failed rather than a log line nobody
 * reads being the only trace of it.
 */
export async function runScheduledTasks(
  cron: string,
  env: ScheduledTaskEnvironment,
  options: ScheduledTaskRunOptions = {},
): Promise<void> {
  const names = getScheduledTaskNames(cron)
  const loadTask = options.loadTask ?? (async (name: ScheduledTaskName) => (await TASK_LOADERS[name]()).default)
  const scheduledTime = options.scheduledTime ?? Date.now()

  const outcomes = await Promise.allSettled(names.map(async (name) => {
    const task = await loadTask(name)
    await task.run({
      name,
      payload: { scheduledTime },
      context: { cloudflare: { env } },
    })
  }))
  const failures = outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
    ? [new Error(`Scheduled task "${names[index]}" failed`, { cause: outcome.reason })]
    : [])
  if (failures.length) throw new AggregateError(failures, `${failures.length} of ${names.length} scheduled tasks failed for "${cron}"`)
}
