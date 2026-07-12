import { defineEventHandler, getRequestURL, setHeader } from 'h3'
import { isNonIndexableHost, isPrivateSeoPath } from '~/server/utils/seo-policy'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const nonIndexableHost = isNonIndexableHost(url.hostname)
  const privatePath = isPrivateSeoPath(url.pathname)

  if (!nonIndexableHost && !privatePath) return

  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive')

  if (privatePath) {
    setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  }
})
