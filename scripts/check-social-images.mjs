import process from 'node:process'

import sharp from 'sharp'

const args = process.argv.slice(2)
const requireGeneratedSize = args.includes('--require-generated-size')
const pageUrls = args.filter(arg => arg !== '--require-generated-size')

if (pageUrls.length === 0) {
  console.error('usage: node scripts/check-social-images.mjs [--require-generated-size] <page-url> [...]')
  process.exit(2)
}

function readAttributes(tag) {
  const attributes = new Map()
  const pattern = /([^\s=]+)\s*=\s*(["'])(.*?)\2/g
  for (const match of tag.matchAll(pattern)) attributes.set(match[1].toLowerCase(), match[3])
  return attributes
}

function readMetaContent(html, attribute, value) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(match => readAttributes(match[0]))
    .filter(attributes => attributes.get(attribute) === value)
    .map(attributes => attributes.get('content')?.trim() ?? '')
}

function requireSingleAbsoluteImage(values, tagName, pageUrl) {
  if (values.length !== 1) throw new Error(`${pageUrl} has ${values.length} ${tagName} tags`)
  const value = values[0]
  if (!value) throw new Error(`${pageUrl} has a blank ${tagName}`)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${pageUrl} has a non-HTTP ${tagName}`)
  }
  if (parsed.pathname === '/og-image-render.png') {
    throw new Error(`${pageUrl} still emits /og-image-render.png`)
  }
  return parsed.toString()
}

async function checkPage(pageUrl) {
  const pageResponse = await fetch(pageUrl, {
    headers: { 'user-agent': 'facebookexternalhit/1.1' },
    redirect: 'follow',
  })
  if (!pageResponse.ok) throw new Error(`${pageUrl} returned HTTP ${pageResponse.status}`)

  const html = await pageResponse.text()
  const ogImage = requireSingleAbsoluteImage(readMetaContent(html, 'property', 'og:image'), 'og:image', pageUrl)
  const twitterImage = requireSingleAbsoluteImage(readMetaContent(html, 'name', 'twitter:image'), 'twitter:image', pageUrl)
  if (ogImage !== twitterImage) throw new Error(`${pageUrl} emits different OG and Twitter images`)

  const imageResponse = await fetch(ogImage, { redirect: 'follow' })
  const contentType = imageResponse.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? ''
  if (!imageResponse.ok) throw new Error(`${ogImage} returned HTTP ${imageResponse.status}`)
  if (!contentType.startsWith('image/')) throw new Error(`${ogImage} returned ${contentType || 'no content type'}`)

  const bytes = Buffer.from(await imageResponse.arrayBuffer())
  const metadata = await sharp(bytes).metadata()
  if (!metadata.width || !metadata.height) throw new Error(`${ogImage} has no decodable dimensions`)
  if (requireGeneratedSize && (metadata.width !== 1200 || metadata.height !== 630)) {
    throw new Error(`${ogImage} is ${metadata.width}x${metadata.height}, expected 1200x630`)
  }

  return {
    pageUrl,
    ogImage,
    twitterImage,
    status: imageResponse.status,
    contentType,
    width: metadata.width,
    height: metadata.height,
  }
}

const results = await Promise.allSettled(pageUrls.map(checkPage))
let failed = false

for (let index = 0; index < results.length; index += 1) {
  const result = results[index]
  if (result.status === 'fulfilled') {
    console.log(JSON.stringify(result.value))
  } else {
    failed = true
    console.error(JSON.stringify({ pageUrl: pageUrls[index], error: String(result.reason?.message ?? result.reason) }))
  }
}

if (failed) process.exit(1)
