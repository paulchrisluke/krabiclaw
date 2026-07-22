import { getRequestURL, setHeader } from 'h3'

export default defineEventHandler((event) => {
  const site = event.context.site as { brand_name?: string | null; logo_url?: string | null; favicon_url?: string | null } | undefined
  const requestUrl = getRequestURL(event)
  const brandName = site?.brand_name?.trim() || 'KrabiClaw'
  const origin = requestUrl.origin

  setHeader(event, 'content-type', 'application/manifest+json')
  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  const versionSource = site?.favicon_url || site?.logo_url || brandName
  let hash = 0
  for (let i = 0; i < versionSource.length; i++) {
    hash = (hash << 5) - hash + versionSource.charCodeAt(i)
    hash |= 0
  }
  const v = Math.abs(hash).toString(36)

  return {
    name: brandName,
    short_name: brandName.slice(0, 32),
    icons: [
      {
        src: `${origin}/tenant-icon.png?v=${v}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: `${origin}/tenant-icon.png?v=${v}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: `${origin}/tenant-icon.svg?v=${v}`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    theme_color: '#1F2547',
    background_color: '#F8F6F3',
    display: 'standalone',
    start_url: '/',
    scope: '/',
  }
})
