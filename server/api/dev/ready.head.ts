import { defineEventHandler } from 'h3'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineEventHandler((event) => {
  assertDevRouteAllowed(event)

  return new Response(null, { status: 200 })
})
