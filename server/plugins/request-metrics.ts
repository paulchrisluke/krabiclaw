import type { H3Event } from 'h3'
import { flushRequestMetrics } from '~/server/utils/request-metrics'
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', (_response, event: H3Event) => {
    flushRequestMetrics(event)
  })
})
