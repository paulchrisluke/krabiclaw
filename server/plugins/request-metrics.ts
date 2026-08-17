import type { HTTPEvent } from 'nitro/h3'
import { flushRequestMetrics } from '~/server/utils/request-metrics'
import { definePlugin } from 'nitro';

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', async (response, event: HTTPEvent) => {
    await flushRequestMetrics(event, response)
  })
})
