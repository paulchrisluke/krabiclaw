import type { GoogleCalendarIntegration } from '~/shared/organization-settings'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { linkedAccountAccessToken, type CloudflareEnv } from './auth'

export interface CalendarChoice { id: string; summary: string; accessRole: string }
export interface CalendarSubject {
  booking_kind: 'booking' | 'reservation'
  operational_id: string
  request_id: string | null
  status: string
  starts_at: string
  ends_at: string
  timezone: string
  guest_name: string | null
  revision: string
}
interface EventLink {
  id: string; organization_id: string; integration_revision: string; account_id: string
  calendar_id: string; event_id: string; booking_kind: CalendarSubject['booking_kind']; operational_id: string
  request_id: string | null; booking_revision: string; synced_revision: string | null
  state: string; attempts: number; lease_token: string | null
}
class CalendarError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Google Calendar returned ${status}. Check the account grant and calendar writer access.`)
    this.status = status
  }
}
const BASE = 'https://www.googleapis.com/calendar/v3'
async function google<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new CalendarError(response.status)
  return response.status === 204 ? undefined as T : await response.json() as T
}
export async function listWritableCalendars(token: string): Promise<CalendarChoice[]> {
  const calendars: CalendarChoice[] = []
  let next: string | undefined
  do {
    const result = await google<{ items?: CalendarChoice[]; nextPageToken?: string }>(token,
      `/users/me/calendarList?minAccessRole=writer&maxResults=250${next ? `&pageToken=${encodeURIComponent(next)}` : ''}`)
    calendars.push(...(result.items ?? []).filter(item => ['owner', 'writer'].includes(item.accessRole)))
    next = result.nextPageToken
  } while (next)
  return calendars
}
async function requireWriter(token: string, calendarId: string) {
  const calendar = await google<CalendarChoice>(token, `/users/me/calendarList/${encodeURIComponent(calendarId)}`)
  if (!['writer', 'owner'].includes(calendar.accessRole)) throw new Error('This account no longer has calendar writer access.')
  return calendar
}
export function calendarEvent(subject: CalendarSubject, dashboardUrl: string) {
  if (!Number.isFinite(Date.parse(subject.starts_at)) || !Number.isFinite(Date.parse(subject.ends_at)) || subject.ends_at <= subject.starts_at) throw new Error('Invalid canonical booking interval')
  new Intl.DateTimeFormat('en', { timeZone: subject.timezone }).format()
  const noun = subject.booking_kind === 'booking' ? 'Consultation' : 'Reservation'
  return {
    summary: `${subject.status === 'pending' ? 'Pending ' + noun.toLowerCase() : noun}${subject.guest_name ? ' — ' + subject.guest_name : ''}`,
    description: `Status: ${subject.status}\n${dashboardUrl}`,
    start: { dateTime: subject.starts_at, timeZone: subject.timezone },
    end: { dateTime: subject.ends_at, timeZone: subject.timezone },
    visibility: 'private',
  }
}
export async function readCalendarIntegration(db: DbClient, organizationId: string): Promise<GoogleCalendarIntegration | null> {
  const row = await queryFirst<{ value: string | null }>(db, "SELECT json_extract(integrations_json, '$.google_calendar') AS value FROM organization WHERE id = ?", [organizationId])
  return row?.value ? JSON.parse(row.value) as GoogleCalendarIntegration : null
}
export async function calendarGroups(db: DbClient, organizationId: string) {
  return await queryAll<{ calendar_group: string }>(db, 'SELECT DISTINCT calendar_group FROM product_booking_configs WHERE organization_id = ? AND calendar_group IS NOT NULL ORDER BY calendar_group', [organizationId])
}
// The source rows and committed activity form the durable lifecycle ledger.
// No HTTP booking response depends on a projection write or on Google I/O.
export async function calendarSubjects(db: DbClient, organizationId: string, integration: GoogleCalendarIntegration): Promise<CalendarSubject[]> {
  return await queryAll<CalendarSubject>(db, `
    SELECT 'booking' booking_kind, b.id operational_id, b.request_id, b.status,
      s.starts_at, s.ends_at, s.timezone, json_extract(r.payload_json, '$.guest.name') guest_name,
      b.updated_at || ':' || s.updated_at || ':' || COALESCE(r.updated_at, '') || ':' || c.updated_at || ':' || COALESCE((SELECT MAX(a.sequence) FROM activity_entries a WHERE a.request_id = b.request_id), 0) revision
    FROM bookings b JOIN product_sessions s ON s.id = b.product_session_id AND s.organization_id = b.organization_id
      JOIN product_booking_configs c ON c.product_id = b.product_id AND c.organization_id = b.organization_id
      LEFT JOIN requests r ON r.id = b.request_id AND r.organization_id = b.organization_id
    WHERE b.organization_id = ? AND c.calendar_group = ? AND b.status IN ('pending', 'confirmed') AND s.status = 'scheduled' AND s.ends_at > ?
    UNION ALL
    SELECT 'reservation', b.id, b.request_id, b.status, b.starts_at, b.ends_at, b.timezone,
      json_extract(r.payload_json, '$.guest.name'), b.updated_at || ':' || COALESCE(r.updated_at, '') || ':' || COALESCE((SELECT MAX(a.sequence) FROM activity_entries a WHERE a.request_id = b.request_id), 0)
    FROM reservations b LEFT JOIN requests r ON r.id = b.request_id AND r.organization_id = b.organization_id
    WHERE b.organization_id = ? AND ? = 1 AND b.status IN ('pending', 'confirmed') AND b.ends_at > ?
  `, [organizationId, integration.calendar_group, new Date().toISOString(), organizationId, integration.include_reservations ? 1 : 0, new Date().toISOString()])
}
async function projectionRevision(subject: CalendarSubject) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(subject)))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Persist intents before any provider I/O, including initial upcoming backfill. */
async function reconcileIntents(db: DbClient, organizationId: string, integration: GoogleCalendarIntegration) {
  const subjects = integration.status === 'disabled' ? [] : await calendarSubjects(db, organizationId, integration)
  const now = new Date().toISOString()
  for (const subject of subjects) {
    const revision = await projectionRevision(subject)
    const id = crypto.randomUUID()
    await execute(db, `INSERT INTO google_calendar_event_links
      (id, organization_id, integration_revision, account_id, calendar_id, event_id, booking_kind, operational_id, request_id, booking_revision, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM organization WHERE id = ? AND json_extract(integrations_json, '$.google_calendar.revision') = ? AND json_extract(integrations_json, '$.google_calendar.status') <> 'disabled'
      ON CONFLICT(organization_id, integration_revision, booking_kind, operational_id) DO UPDATE SET
      request_id = excluded.request_id, booking_revision = excluded.booking_revision,
      state = CASE WHEN google_calendar_event_links.booking_revision <> excluded.booking_revision THEN 'pending' ELSE google_calendar_event_links.state END,
      next_attempt_at = CASE WHEN google_calendar_event_links.booking_revision <> excluded.booking_revision THEN NULL ELSE google_calendar_event_links.next_attempt_at END,
      updated_at = excluded.updated_at`,
    [id, organizationId, integration.revision, integration.account_id, integration.calendar_id, 'kc' + id.replaceAll('-', ''), subject.booking_kind, subject.operational_id, subject.request_id, revision, now, now, organizationId, integration.revision])
  }
  const active = new Set(subjects.map(subject => `${subject.booking_kind}:${subject.operational_id}`))
  const links = await queryAll<EventLink>(db, "SELECT * FROM google_calendar_event_links WHERE organization_id = ? AND state <> 'deleted'", [organizationId])
  for (const link of links) {
    if (link.integration_revision !== integration.revision || !active.has(`${link.booking_kind}:${link.operational_id}`)) {
      // Ended successful events remain useful historical records. Cancelled,
      // disconnected, and unenrolled subjects must be removed instead.
      const historical = integration.status !== 'disabled' && link.integration_revision === integration.revision
        ? await queryFirst<{ status: string; ends_at: string }>(db, link.booking_kind === 'booking'
          ? 'SELECT b.status, s.ends_at FROM bookings b JOIN product_sessions s ON s.id=b.product_session_id WHERE b.id=? AND b.organization_id=?'
          : 'SELECT status, ends_at FROM reservations WHERE id=? AND organization_id=?', [link.operational_id, organizationId]) : null
      if (historical?.status === 'confirmed' && historical.ends_at <= now && link.state === 'synced') continue
      await execute(db, "UPDATE google_calendar_event_links SET state = 'cleanup' WHERE id = ? AND state <> 'deleted'", [link.id])
    }
  }
}
async function removeEvent(token: string, link: EventLink) {
  const path = `/calendars/${encodeURIComponent(link.calendar_id)}/events/${link.event_id}`
  await requireWriter(token, link.calendar_id)
  try { await google(token, `${path}?sendUpdates=none`, { method: 'DELETE' }) }
  catch (error) {
    if (!(error instanceof CalendarError) || ![404, 410].includes(error.status)) throw error
    // Event absence is only meaningful while the calendar remains accessible.
    await requireWriter(token, link.calendar_id)
  }
}
export interface CalendarProvider {
  token(accountId: string): Promise<string>
}
export async function syncCalendarOrganization(env: CloudflareEnv, organizationId: string, limit = 25, provider: CalendarProvider = {
  token: async accountId => (await linkedAccountAccessToken(env, accountId)).accessToken,
}) {
  const db = env.DB
  const integration = await readCalendarIntegration(db, organizationId)
  if (!integration) return { checked: 0, failed: 0 }
  await reconcileIntents(db, organizationId, integration)
  const now = new Date().toISOString()
  const links = await queryAll<EventLink>(db, `SELECT * FROM google_calendar_event_links WHERE organization_id = ?
    AND state IN ('pending', 'cleanup', 'error') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    AND (lease_until IS NULL OR lease_until <= ?) ORDER BY CASE state WHEN 'cleanup' THEN 0 ELSE 1 END, updated_at LIMIT ?`, [organizationId, now, now, limit])
  let checked = 0; let failed = 0
  for (const link of links) {
    const lease = crypto.randomUUID()
    const claim = await execute(db, 'UPDATE google_calendar_event_links SET lease_token=?, lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)',
      [lease, new Date(Date.now() + 120_000).toISOString(), link.id, now])
    if (claim.meta?.changes !== 1) continue
    checked++
    try {
      const token = await provider.token(link.account_id)
      const current = await readCalendarIntegration(db, organizationId)
      const subject = current?.revision === link.integration_revision && current.status !== 'disabled'
        ? (await calendarSubjects(db, organizationId, current)).find(item => item.operational_id === link.operational_id && item.booking_kind === link.booking_kind) : null
      if (!subject || link.state === 'cleanup') {
        await removeEvent(token, link)
        await execute(db, "UPDATE google_calendar_event_links SET state='deleted', last_error=NULL, lease_token=NULL, lease_until=NULL, updated_at=? WHERE id=? AND lease_token=?", [new Date().toISOString(), link.id, lease])
        continue
      }
      const revision = await projectionRevision(subject)
      if (revision !== link.booking_revision) {
        await execute(db, "UPDATE google_calendar_event_links SET state='pending', lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=?", [link.id, lease])
        continue
      }
      await requireWriter(token, link.calendar_id)
      const org = await queryFirst<{ slug: string }>(db, 'SELECT slug FROM organization WHERE id=?', [organizationId])
      if (!org) throw new Error('Organization disappeared')
      const url = new URL(`/dashboard/${encodeURIComponent(org.slug)}/inbox${subject.request_id ? '/' + encodeURIComponent(subject.request_id) : ''}`, env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'https://krabiclaw.com').href
      const payload = calendarEvent(subject, url)
      const path = `/calendars/${encodeURIComponent(link.calendar_id)}/events`
      if (!link.synced_revision) {
        try { await google(token, `${path}?sendUpdates=none`, { method: 'POST', body: JSON.stringify({ id: link.event_id, ...payload }) }) }
        catch (error) { if (!(error instanceof CalendarError) || error.status !== 409) throw error }
      }
      await google(token, `${path}/${link.event_id}?sendUpdates=none`, { method: 'PUT', body: JSON.stringify(payload) })
      // Fence late provider results against committed cancellation/disconnect.
      // Compensating deletion uses the same durable identity and retains errors.
      const after = await readCalendarIntegration(db, organizationId)
      const afterSubject = after?.revision === link.integration_revision && after.status !== 'disabled'
        ? (await calendarSubjects(db, organizationId, after)).find(item => item.operational_id === link.operational_id && item.booking_kind === link.booking_kind) : null
      if (!afterSubject) {
        await removeEvent(token, link)
        await execute(db, "UPDATE google_calendar_event_links SET state='deleted', lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=?", [link.id, lease])
      } else {
        await execute(db, `UPDATE google_calendar_event_links SET state=?, synced_revision=?, last_synced_at=?, last_error=NULL, attempts=0,
          lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=?`,
        [await projectionRevision(afterSubject) === revision ? 'synced' : 'pending', revision, new Date().toISOString(), link.id, lease])
      }
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : String(error)
      await executeBatch(db, [
        { query: "UPDATE google_calendar_event_links SET state=CASE WHEN state='cleanup' THEN state ELSE 'error' END, last_error=?, attempts=attempts+1, next_attempt_at=?, lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=?", params: [message, new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(link.attempts, 7))).toISOString(), link.id, lease] },
        { query: "UPDATE organization SET integrations_json=json_set(integrations_json, '$.google_calendar.status', CASE WHEN json_extract(integrations_json, '$.google_calendar.status')='disabled' THEN 'disabled' ELSE 'error' END, '$.google_calendar.last_error', ?) WHERE id=? AND json_extract(integrations_json, '$.google_calendar.revision')=?", params: [message, organizationId, integration.revision] },
      ])
    }
  }
  const remaining = await queryFirst<{ n: number }>(db, "SELECT count(*) n FROM google_calendar_event_links WHERE organization_id=? AND state IN ('pending','cleanup','error')", [organizationId])
  if (!remaining?.n && integration.status === 'disabled') {
    await execute(db, "UPDATE organization SET integrations_json=json_remove(integrations_json, '$.google_calendar') WHERE id=? AND json_extract(integrations_json, '$.google_calendar.revision')=? AND json_extract(integrations_json, '$.google_calendar.status')='disabled'", [organizationId, integration.revision])
  } else if (!remaining?.n) await execute(db, "UPDATE organization SET integrations_json=json_set(integrations_json, '$.google_calendar.status', CASE WHEN json_extract(integrations_json, '$.google_calendar.status')='disabled' THEN 'disabled' ELSE 'active' END, '$.google_calendar.last_error', NULL) WHERE id=? AND json_extract(integrations_json, '$.google_calendar.revision')=?", [organizationId, integration.revision])
  return { checked, failed, remaining: remaining?.n ?? 0 }
}
/** Disable first, then clean managed identities. A failed cleanup stays visible. */
export async function disconnectCalendar(db: DbClient, organizationId: string) {
  await execute(db, "UPDATE organization SET integrations_json=json_set(integrations_json, '$.google_calendar.status', 'disabled', '$.google_calendar.updated_at', ?) WHERE id=? AND json_extract(integrations_json, '$.google_calendar') IS NOT NULL", [new Date().toISOString(), organizationId])
  await execute(db, "UPDATE google_calendar_event_links SET state='cleanup', next_attempt_at=NULL WHERE organization_id=? AND state <> 'deleted'", [organizationId])
}
export async function storeCalendarSelection(db: DbClient, organizationId: string, selection: Pick<GoogleCalendarIntegration, 'account_id' | 'calendar_id' | 'calendar_name' | 'calendar_group' | 'include_reservations'>) {
  const pending = await queryFirst<{ n: number }>(db, "SELECT count(*) n FROM google_calendar_event_links WHERE organization_id=? AND state <> 'deleted'", [organizationId])
  const existing = await readCalendarIntegration(db, organizationId)
  if (existing && pending?.n) throw new Error('Disconnect and finish cleanup of the previous calendar before changing the selection.')
  const now = new Date().toISOString()
  const payload: GoogleCalendarIntegration = { ...selection, revision: crypto.randomUUID(), status: 'active', last_error: null, created_at: now, updated_at: now }
  const result = await execute(db, "UPDATE organization SET integrations_json=json_set(integrations_json, '$.google_calendar', json(?)) WHERE id=? AND json_extract(integrations_json, '$.google_calendar.revision') IS ? AND NOT EXISTS (SELECT 1 FROM google_calendar_event_links WHERE organization_id=organization.id AND state <> 'deleted')", [JSON.stringify(payload), organizationId, existing?.revision ?? null])
  if (result.meta?.changes !== 1) throw new Error('Calendar selection changed. Reload and try again.')
}
