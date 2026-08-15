import { getRequestURL, setHeader } from 'h3'
import { isNonIndexableHost } from '~/server/utils/seo-policy'

export default defineEventHandler((event) => {
  const site = event.context.site as {
    brand_name?: string | null
    logo_url?: string | null
    logo_mime_type?: string | null
    favicon_url?: string | null
  } | undefined

  const brandName = site?.brand_name?.trim() || ''
  if (!brandName) throw createError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })

  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive')
  setHeader(event, 'content-type', 'application/manifest+json')
  const hostname = getRequestURL(event).hostname
  setHeader(event, 'cache-control', isNonIndexableHost(hostname)
    ? 'private, no-store, max-age=0'
    : 'public, max-age=3600, stale-while-revalidate=86400')

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
        src: `/tenant-icon-512.png?v=${v}`,
        sizes: '512x512',
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
import { defineEventHandler } from 'h3'
