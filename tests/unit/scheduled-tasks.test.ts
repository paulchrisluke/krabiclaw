import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getScheduledTaskNames,
  runScheduledTasks,
  SCHEDULED_TASKS,
  type ScheduledTaskName,
} from '~/server/scheduled-tasks'

test('Cloudflare cron expressions cover every production scheduled task', () => {
  assert.deepEqual(SCHEDULED_TASKS, {
    '*/5 * * * *': ['blog-scheduled-publish'],
    '*/2 * * * *': ['public-resource-cache-invalidation'],
    '*/10 * * * *': ['domain-reconciliation'],
    '0 3 * * *': ['domain-reconciliation-daily', 'analytics-aggregate-daily'],
    '0 4 * * *': ['site-transfer-reminders'],
    '0 0 * * SUN': ['google-places-sync'],
    '0 * * * *': ['instagram-sync-process', 'review-request-automation', 'stripe-reconciliation'],
  })
})

test('scheduled task dispatch passes the Cloudflare environment and scheduled time', async () => {
  const calls: Array<{ name: ScheduledTaskName; env: ApiRecord; scheduledTime: number }> = []
  const env = { DB: { marker: 'test-db' }, CRON_SECRET: 'test-secret' }
  const scheduledTime = 1_754_512_345_678

  await runScheduledTasks('0 * * * *', env, {
    scheduledTime,
    loadTask: async (name) => ({
      run: async ({ context, payload }) => {
        calls.push({
          name,
          env: context.cloudflare.env,
          scheduledTime: payload.scheduledTime,
        })
      },
    }),
  })

  assert.deepEqual(calls.map((call) => call.name).sort(), [
    'instagram-sync-process',
    'review-request-automation',
    'stripe-reconciliation',
  ])
  assert.ok(calls.every((call) => call.env === env))
  assert.ok(calls.every((call) => call.scheduledTime === scheduledTime))
})

test('one failed scheduled task does not prevent sibling tasks from running', async () => {
  const completed: string[] = []
  const errors: Array<{ name: ScheduledTaskName; error: unknown }> = []

  await runScheduledTasks('0 3 * * *', {}, {
    loadTask: async (name) => ({
      run: async () => {
        if (name === 'domain-reconciliation-daily') throw new Error('test failure')
        completed.push(name)
      },
    }),
    onError: (name, error) => errors.push({ name, error }),
  })

  assert.deepEqual(completed, ['analytics-aggregate-daily'])
  assert.equal(errors.length, 1)
  assert.equal(errors[0]?.name, 'domain-reconciliation-daily')
  assert.equal((errors[0]?.error as Error).message, 'test failure')
})

test('unknown Cloudflare cron expressions are a no-op', async () => {
  assert.deepEqual(getScheduledTaskNames('0 1 * * *'), [])
  await assert.doesNotReject(() => runScheduledTasks('0 1 * * *', {}))
})
