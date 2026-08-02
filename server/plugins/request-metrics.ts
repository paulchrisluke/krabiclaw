import type { H3Event } from 'h3'
import { flushRequestMetrics, finalizeTrackedRequestMetrics } from '~/server/utils/request-metrics'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    finalizeTrackedRequestMetrics(event, response?.body)
  })

  nitroApp.hooks.hook('afterResponse', (event: H3Event, response?: { body?: unknown }) => {
    flushRequestMetrics(event, response?.body)
  })
})
