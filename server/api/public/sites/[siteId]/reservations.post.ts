import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const VALID_TIMES = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const VALID_GUESTS = ['1','2','3','4','5','6','7','8+']

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  let body: ApiRecord
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const name     = cleanString(body.name, 100)
  const email    = cleanString(body.email, 200)
  const phone    = cleanString(body.phone, 30)
  const date     = cleanString(body.date, 10)
  const time     = cleanString(body.time, 5)
  const guests   = cleanString(body.guests, 3)
  const requests = cleanString(body.requests, 1000)

  if (!name) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!phone) return jsonResponse({ error: 'Please enter your phone number.' }, { status: 400 })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10))
    return jsonResponse({ error: 'Please choose a valid future date.' }, { status: 400 })
  if (!VALID_TIMES.includes(time))
    return jsonResponse({ error: 'Please choose a valid time.' }, { status: 400 })
  if (!VALID_GUESTS.includes(guests))
    return jsonResponse({ error: 'Please choose a valid party size.' }, { status: 400 })

  const site = await db.prepare(
    'SELECT id, organization_id FROM sites WHERE id = ? AND status = ? LIMIT 1'
  ).bind(siteId, 'active').first()
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const id = crypto.randomUUID()
  const ipHash = await hashIp(getHeader(event, 'CF-Connecting-IP') ?? getHeader(event, 'x-forwarded-for') ?? '')

  await db.prepare(`
    INSERT INTO reservation_submissions (id, organization_id, site_id, name, email, phone, date, time, guests, requests, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, site.organization_id, siteId, name, email, phone, date, time, guests, requests || null, ipHash).run()

  getOrgWhatsAppPhone(db, site.organization_id as string, siteId).then((ownerPhone) => {
    if (!ownerPhone) return
    sendWhatsAppNotification(env, db, {
      organizationId: site.organization_id as string,
      siteId,
      toPhone: ownerPhone,
      template: 'new_reservation',
      vars: { guest_name: name, date, time, guests, phone },
    }).catch(console.error)
  }).catch(console.error)

  return jsonResponse({
    success: true,
    id,
    message: 'Your reservation request has been received. We will confirm shortly.',
  }, { status: 201 })
})
