import { expect, test } from '@playwright/test'
import { blawbyBaseURL, blawbyExtraHeaders } from './helpers'

function ogImageUrl(html: string): string {
  const tags = html.match(/<meta[^>]+>/g) ?? []
  const tag = tags.find(candidate => /property=["']og:image["']/.test(candidate))
  const content = tag?.match(/content=["']([^"']+)/)?.[1]
  if (!content) throw new Error('Page did not emit an og:image meta tag')
  return content.replaceAll('&amp;', '&')
}

function pngDimensions(bytes: Buffer): { width: number, height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

async function expectGeneratedOgImage(
  request: import('@playwright/test').APIRequestContext,
  pageUrl: string,
  headers: Record<string, string> = {},
) {
  const pageResponse = await request.get(pageUrl, { headers })
  expect(pageResponse.ok()).toBe(true)

  const emittedImageUrl = new URL(ogImageUrl(await pageResponse.text()))
  const testedOrigin = new URL(pageUrl)
  emittedImageUrl.protocol = testedOrigin.protocol
  emittedImageUrl.host = testedOrigin.host
  const imageResponse = await request.get(emittedImageUrl.toString(), { headers })
  expect(imageResponse.ok()).toBe(true)
  expect(imageResponse.headers()['content-type']).toContain('image/png')
  expect(['generated', 'cache']).toContain(imageResponse.headers()['x-og-image-source'])

  const dimensions = pngDimensions(await imageResponse.body())
  expect(dimensions).toEqual({ width: 1200, height: 630 })
}

test('platform homepage emits a generated OG image', async ({ request, baseURL }) => {
  await expectGeneratedOgImage(request, new URL('/', baseURL!).toString())
})

test('NCLS article emits a generated Blawby OG image', async ({ request }) => {
  await expectGeneratedOgImage(
    request,
    `${blawbyBaseURL}/article/getting-a-divorce-in-north-carolina`,
    blawbyExtraHeaders,
  )
})
