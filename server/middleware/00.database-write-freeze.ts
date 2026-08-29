import { defineHandler } from 'nitro'
import { isDatabaseWriteFrozen } from '~/server/utils/database-write-freeze'

export default defineHandler((event) => {
  const env = event.req.runtime?.cloudflare?.env as Record<string, unknown> | undefined
  if (!isDatabaseWriteFrozen(env)) return

  return new Response(
    JSON.stringify({
      error: 'Service temporarily unavailable during database maintenance',
    }),
    {
      status: 503,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
        'retry-after': '300',
      },
    },
  )
})
