import type { H3Event } from 'h3'
import { flushRequestMetrics } from '~/server/utils/request-metrics'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event: H3Event, response?: { body?: unknown }) => {
    flushRequestMetrics(event, response?.body)
  })
})
