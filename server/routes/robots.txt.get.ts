import { defineEventHandler, getRequestURL, setHeader } from 'h3'
import { getSeoOrigin, isNonIndexableHost, PRIVATE_EXACT_ROUTES, PRIVATE_ROUTE_PREFIXES } from '~/server/utils/seo-policy'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=300')

  if (isNonIndexableHost(url.hostname)) {
    return [
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n')
  }

  const disallow = [
    ...PRIVATE_ROUTE_PREFIXES,
    ...Array.from(PRIVATE_EXACT_ROUTES),
  ].sort()

  return [
    'User-agent: *',
    'Allow: /',
    ...disallow.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${getSeoOrigin(event)}/sitemap.xml`,
    '',
  ].join('\n')
})
