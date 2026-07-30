import { createError, defineEventHandler, setHeader } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive')
  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  throw createError({
    statusCode: 410,
    statusMessage: 'Gone',
  })
})
