import { HTTPError, defineHandler  } from 'nitro';
import { setHeader } from 'nitro/h3';

export default defineHandler((event) => {
  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive')
  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

  throw new HTTPError({
    statusCode: 410,
    statusMessage: 'Gone',
  })
})
