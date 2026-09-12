import { requestInsertQueries } from '~/server/domain/requests'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { siteSupportsBlawbyTemplate } from '~/utils/template-registry'
import { executeBatch, queryFirst } from '~/server/db'
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { notifyContactSubmitted } from '~/server/utils/notifications'
import { DEFAULT_EMAIL_DAILY_LIMIT as EMAIL_DAILY_LIMIT, DEFAULT_IP_HOURLY_LIMIT as IP_HOURLY_LIMIT, getClientIp, hashClientIp, hashIdentifier, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { resolveContactSubmissionAssignment } from '~/server/utils/contact-assignment'
import { recordSubmissionConversionSafe } from '~/server/utils/site-conversions'
import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'

const VALID_SUBJECTS = ['general', 'press', 'partnerships', 'catering', 'careers']

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  let body: ApiRecord
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const name    = cleanString(body.name, 100)
  const email   = cleanString(body.email, 200)
  const message = cleanString(body.message, 2000)
  const subject = cleanString(body.subject, 30)
  // Free-text context the KrabiClaw help form and ChowBot escalations attach.
  const topic = cleanString(body.topic, 200)
  const source = cleanString(body.source, 100)
  const routeContext = cleanString(body.route_context, 500)
  const suggestedSummary = cleanString(body.suggested_summary, 1000)
  const agentMetadata = body.agent_metadata_json !== undefined && body.agent_metadata_json !== null
    ? (() => { try { return JSON.parse(JSON.stringify(body.agent_metadata_json)) as ApiValue } catch { return null } })()
    : null
  if (agentMetadata !== null && JSON.stringify(agentMetadata).length > 10_000) return jsonResponse({ error: 'agent_metadata_json is too large.' }, { status: 400 })
  const locationIdInput = cleanString(body.location_id, 100) || cleanString(body.locationId, 100)

  if (!name) return jsonResponse({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonResponse({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (message.length < 10)
    return jsonResponse({ error: 'Message must be at least 10 characters.' }, { status: 400 })
  if (subject && !VALID_SUBJECTS.includes(subject))
    return jsonResponse({ error: 'Please choose a valid subject.' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string; brand_name?: string | null; vertical?: string | null; theme_id?: string | null }>(
    db, 'SELECT id, organization_id, brand_name, vertical, theme_id FROM sites WHERE id = ? AND status = ? LIMIT 1', [siteId, 'active'], )
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  const requiresConsent = siteSupportsBlawbyTemplate({ themeId: site.theme_id, vertical: site.vertical })
  const consentAcknowledged = body.consent === true
  if (requiresConsent && !consentAcknowledged) {
    return jsonResponse({ error: 'Please acknowledge the contact and privacy notice.' }, { status: 400 })
  }

  const assignment = await resolveContactSubmissionAssignment(db, {
    siteId, locationId: locationIdInput || null, })
  if (assignment.error) return jsonResponse({ error: assignment.error }, { status: 400 })
  const { assignedLocationId } = assignment

  const id = crypto.randomUUID()
  const clientIp = getClientIp(event)
  const ipHash = await hashClientIp(clientIp)

  // Rate limiting (skipped in dev so local work and E2E can submit repeatedly)
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!import.meta.dev && !e2eOverride) {
    const hourWindow = Math.floor(Date.now() / 3_600_000)
    const today = new Date().toISOString().split('T')[0]

    const ipOk = await incrementHourlyRateLimit(db, `rate:contact:ip:${ipHash}:${hourWindow}`, IP_HOURLY_LIMIT, 3_600_000)
    if (!ipOk) return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })

    const emailHash = await hashIdentifier(email)
    const emailOk = await incrementHourlyRateLimit(db, `rate:contact:email:${emailHash}:${today}`, EMAIL_DAILY_LIMIT, 86_400_000)
    if (!emailOk) return jsonResponse({ error: 'Too many messages from this email. Please try again tomorrow.' }, { status: 429 })
  }

  const consentAt = consentAcknowledged ? new Date().toISOString() : null
  const now = new Date().toISOString()
  await executeBatch(db, requestInsertQueries({ id, kind: 'contact', organization_id: site.organization_id, site_id: siteId, location_id: assignedLocationId,
    customer_id: null, review_id: null, conversation_state: 'needs_attention', resolved_at: null,
    payload: { guest: { name, email, phone: null }, subject: subject || topic || null, message, consent_at: consentAt, ip_hash: ipHash,
      source: source || null, route_context: routeContext || null, suggested_summary: suggestedSummary || null, agent_metadata: agentMetadata }, created_at: now, updated_at: now }))
  await publishGuestInboxThreadEvent(env, db, { threadId: id, type: 'thread.created' })

  try {
    await notifyContactSubmitted(env, db, {
      organizationId: site.organization_id, siteId, locationId: assignedLocationId, siteName: site.brand_name, contactId: id, guestName: name, email, subject: subject || topic || null, message, consentAcknowledged, })
  } catch (error) {
    console.error('contact_notification_failed', {
      organizationId: site.organization_id, siteId, contactId: id, error: error instanceof Error ? error.message : String(error)
    })
  }

  await recordSubmissionConversionSafe(db, event, {
    organizationId: site.organization_id,
    siteId,
    eventName: 'contact_submit',
    stage: 'submitted',
    locationId: assignedLocationId,
    entityType: 'request',
    entityId: id,
    pageType: 'contact',
    pagePath: '/contact',
  })

  return jsonResponse({
    success: true, message: 'Your message has been sent. We will be in touch soon.', }, { status: 201 })
})
