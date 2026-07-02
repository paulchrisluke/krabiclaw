import { toWebRequest } from 'h3'
import { cleanString, cloudflareEnv, jsonResponse } from '../utils/api-response'
import { execute } from '~/server/db'

type ReviewStatus = 'pending' | 'approved' | 'rejected'

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}



export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const request = toWebRequest(event)
  let body: ApiRecord

  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const menuItemSlug = cleanString(body.menuItemSlug, 120)
  const author = cleanString(body.author, 80)
  const title = cleanString(body.title, 120)
  const content = cleanString(body.content, 1200)
  const rating = Number(body.rating)


  if (!menuItemSlug) return jsonResponse({ error: 'Missing menu item slug.' }, { status: 400 })
  if (!author) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!title) return jsonResponse({ error: 'Please add a short review title.' }, { status: 400 })
  if (content.length < 10) return jsonResponse({ error: 'Review text must be at least 10 characters.' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonResponse({ error: 'Rating must be between 1 and 5.' }, { status: 400 })



  const id = crypto.randomUUID()
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? '')
  const userAgent = cleanString(request.headers.get('User-Agent'), 300)
  const status: ReviewStatus = 'pending'

  await execute(env.DB,
    `INSERT INTO reviews (id, menu_item_slug, author_name, rating, title, content, status, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, menuItemSlug, author, rating, title, content, status, ipHash, userAgent]
  )

  return jsonResponse({
    review: { id, menuItemSlug, author, rating, title, content, status },
    message: 'Thanks. Your review is pending moderation.'
  }, { status: 201 })
})
