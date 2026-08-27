import { execute } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getClientIp, hashClientIp, HOUR_MS, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { loadPublicProductApiDetail } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'

type ReviewStatus = 'pending'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationSlug = getRouterParam(event, 'locationSlug')
  const productSlug = getRouterParam(event, 'productSlug')
  if (!siteId || !locationSlug || !productSlug) return jsonResponse({ error: 'Site, location, and Product slugs are required' }, { status: 400 })
  try {
    const db = cloudflareEnv(event).DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const resolved = await loadPublicProductApiDetail(db, siteId, locationSlug, productSlug)
    if (!resolved) return jsonResponse({ error: 'Product not found' }, { status: 404 })
    const body = await readBody(event) as ApiRecord
    const author = cleanString(body.author, 80)
    const title = cleanString(body.title, 120)
    const content = cleanString(body.content, 1200)
    const rating = Number(body.rating)
    if (!author) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
    if (!title) return jsonResponse({ error: 'Please add a short review title.' }, { status: 400 })
    if (content.length < 10) return jsonResponse({ error: 'Review text must be at least 10 characters.' }, { status: 400 })
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonResponse({ error: 'Rating must be between 1 and 5.' }, { status: 400 })
    const ipHash = await hashClientIp(getClientIp(event))
    const hourWindow = Math.floor(Date.now() / HOUR_MS)
    const rateOk = await incrementHourlyRateLimit(db, `rate:product-review:${resolved.product.id}:${ipHash}:${hourWindow}`, 5, HOUR_MS)
    if (!rateOk) return jsonResponse({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    const id = crypto.randomUUID()
    const status: ReviewStatus = 'pending'
    const userAgent = cleanString(event.req.headers.get('User-Agent'), 300)
    await execute(db, `
      INSERT INTO reviews (id, organization_id, site_id, location_id, product_id, author_name, rating, title, content, status, ip_hash, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, resolved.site.organization_id, siteId, resolved.location.id, resolved.product.id, author, rating, title, content, status, ipHash, userAgent])
    return jsonResponse({ review: { id, product_id: resolved.product.id, author, rating, title, content, status }, message: 'Thanks. Your review is pending moderation.' }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_product_review_create_failed', { siteId, locationSlug, productSlug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create Product review' }, { status: 500 })
  }
})
