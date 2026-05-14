import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

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

  const name    = cleanString(body.name, 100)
  const email   = cleanString(body.email, 200)
  const message = cleanString(body.message, 2000)

  if (!name) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (message.length < 10)
    return jsonResponse({ error: 'Message must be at least 10 characters.' }, { status: 400 })

  const site = await db.prepare(
    'SELECT id, organization_id FROM sites WHERE id = ? AND status = ? LIMIT 1'
  ).bind(siteId, 'active').first()
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const id = crypto.randomUUID()
  const ipHash = await hashIp(getHeader(event, 'CF-Connecting-IP') ?? getHeader(event, 'x-forwarded-for') ?? '')

  await db.prepare(`
    INSERT INTO contact_submissions (id, organization_id, site_id, name, email, message, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, site.organization_id, siteId, name, email, message, ipHash).run()

  getOrgWhatsAppPhone(db, site.organization_id as string, siteId).then((phone) => {
    if (!phone) return
    sendWhatsAppNotification(env, db, {
      organizationId: site.organization_id as string,
      siteId,
      toPhone: phone,
      template: 'new_contact_msg',
      vars: { guest_name: name, email, message_preview: message },
    }).catch(console.error)
  }).catch(console.error)

  return jsonResponse({
    success: true,
    message: 'Your message has been sent. We will be in touch soon.',
  }, { status: 201 })
})
