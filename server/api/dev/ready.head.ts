import { defineHandler } from 'nitro';
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineHandler((event) => {
  assertDevRouteAllowed(event)

  return new Response(null, { status: 200 })
})
