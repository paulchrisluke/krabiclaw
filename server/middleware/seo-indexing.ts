import { defineHandler } from 'nitro';
import {  setHeader } from 'nitro/h3';
import { isNonIndexableHost, isPrivateSeoPath, isTechnicalAssetSeoPath } from '~/server/utils/seo-policy'

export default defineHandler((event) => {
  const url = event.url
  const nonIndexableHost = isNonIndexableHost(url.hostname)
  const privatePath = isPrivateSeoPath(url.pathname)
  const technicalAssetPath = isTechnicalAssetSeoPath(url.pathname)

  if (!nonIndexableHost && !privatePath && !technicalAssetPath) return

  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive')

  if (privatePath) {
    setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  }
})
