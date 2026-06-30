import { getRequestURL, setHeader } from 'h3'

export default defineEventHandler((event) => {
  const site = event.context.site as { brand_name?: string | null } | undefined
  const requestUrl = getRequestURL(event)
  const iconUrl = new URL('/tenant-icon.svg', requestUrl.origin).toString()
  const brandName = site?.brand_name?.trim() || 'KrabiClaw'

  setHeader(event, 'content-type', 'application/manifest+json')
  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  setHeader(event, 'x-robots-tag', 'noindex')

  return {
    name: brandName,
    short_name: brandName.slice(0, 32),
    icons: [
      {
        src: iconUrl,
        sizes: 'any',
        purpose: 'any maskable',
      },
    ],
    theme_color: '#1F2547',
    background_color: '#F8F6F3',
    display: 'standalone',
    start_url: '/',
    scope: '/',
  }
})
