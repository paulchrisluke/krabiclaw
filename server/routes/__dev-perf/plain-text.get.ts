export default defineEventHandler((event) => {
  const host = getRequestHost(event).split(':')[0] || ''
  const allowedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'local.krabiclaw.com'])
  const isLocalWranglerPlatformHost = host === 'krabiclaw.com' && !getHeader(event, 'cf-ray')

  if (!allowedHosts.has(host) && !isLocalWranglerPlatformHost) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
    })
  }

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')

  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Raw Local Text Performance</title></head><body><main style="max-width:68ch;margin:0 auto;padding:48px 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111827;background:#fff"><h1 style="margin:0 0 16px;font-size:32px;line-height:1.15">KrabiClaw raw local text performance page</h1><p style="margin:0 0 12px;font-size:18px;line-height:1.6">This page is returned directly from a Nitro route with no Vue render, no layout, no components, no images, and no data fetching.</p><p style="margin:0 0 12px;font-size:18px;line-height:1.6">Compare it with /dev/perf-text to isolate Worker/Nitro response cost from the Nuxt app shell.</p></main></body></html>'
})
