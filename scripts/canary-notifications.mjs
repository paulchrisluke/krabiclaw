#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const nowIso = () => new Date().toISOString()

function env(name, opts = {}) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    if (opts.optional) return ''
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function sqlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")
}

function describeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      cause: error.cause ? String(error.cause) : null,
    }
  }

  return {
    name: 'NonError',
    message: String(error),
    stack: null,
    cause: null,
  }
}

function d1Raw(sql, label = 'd1Raw') {
  const res = spawnSync('yarn', ['-s', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  })
  if (res.error) {
    throw new Error(`${label} failed before execution: ${res.error.message}`, { cause: res.error })
  }
  if (res.status !== 0) {
    throw new Error(`${label} failed with exit ${res.status}: ${(res.stderr || '').trim() || 'no stderr output'}`)
  }
  return JSON.parse(res.stdout)?.[0]
}

function d1Query(sql, label = 'd1Query') {
  return d1Raw(sql, label)?.results ?? []
}

async function postJson(url, data, label) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (error) {
    throw new Error(`${label} fetch failed for ${url}`, { cause: error })
  }
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  return { res, body, text }
}

async function main() {
  const baseUrl = env('CANARY_BASE_URL')
  const siteId = env('CANARY_SITE_ID')
  const orgId = env('CANARY_ORG_ID')
  const canaryEmail = env('CANARY_NOTIFICATION_EMAIL')
  const canaryPhone = env('CANARY_NOTIFICATION_PHONE_E164')

  const since = nowIso()
  const suffix = Date.now()

  const contactUrl = `${baseUrl}/api/public/sites/${encodeURIComponent(siteId)}/contact`
  const contact = await postJson(contactUrl, {
    name: `Prod Canary ${suffix}`,
    email: canaryEmail,
    message: 'Hello, this is an automated notification check message to confirm delivery.',
  }, 'contact trigger')

  if (contact.res.status >= 400) {
    throw new Error(`Contact canary trigger failed for ${contactUrl} (${contact.res.status}): ${contact.text}`)
  }

  const reservationDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const reservationUrl = `${baseUrl}/api/public/sites/${encodeURIComponent(siteId)}/reservations`
  const reservation = await postJson(reservationUrl, {
    name: `Prod Canary ${suffix}`,
    email: canaryEmail,
    phone: canaryPhone,
    date: reservationDate,
    time: '18:00',
    guests: '2',
    requests: `notification canary ${suffix}`,
  }, 'reservation trigger')

  if (reservation.res.status >= 400) {
    throw new Error(`Reservation canary trigger failed for ${reservationUrl} (${reservation.res.status}): ${reservation.text}`)
  }

  const deadline = Date.now() + 45_000
  let emailRow = null
  let whatsappRow = null
  while (Date.now() < deadline) {
    const rows = d1Query(`
      SELECT id, channel, template, status, provider_message_id, error, created_at
      FROM notifications
      WHERE organization_id = '${sqlEscape(orgId)}'
        AND site_id = '${sqlEscape(siteId)}'
        AND template IN ('new_contact_msg', 'new_reservation')
        AND created_at >= '${sqlEscape(since)}'
      ORDER BY created_at DESC
      LIMIT 100
    `, 'notification poll')

    emailRow = rows.find((r) => r.channel === 'email' && r.status === 'sent' && r.provider_message_id)
    whatsappRow = rows.find((r) => r.channel === 'whatsapp' && r.status === 'sent' && r.provider_message_id)

    if (emailRow && whatsappRow) break
    await new Promise((r) => setTimeout(r, 1500))
  }

  if (!emailRow || !whatsappRow) {
    const rows = d1Query(`
      SELECT id, channel, template, status, provider_message_id, error, created_at
      FROM notifications
      WHERE organization_id = '${sqlEscape(orgId)}'
        AND site_id = '${sqlEscape(siteId)}'
        AND created_at >= '${sqlEscape(since)}'
      ORDER BY created_at DESC
      LIMIT 100
    `, 'notification final read')
    throw new Error(`Provider-level canary assertions failed. email_sent=${Boolean(emailRow)} whatsapp_sent=${Boolean(whatsappRow)} rows=${JSON.stringify(rows)}`)
  }

  const runId = `canary-notify-${crypto.randomUUID()}`
  const details = {
    started_at: since,
    completed_at: nowIso(),
    base_url: baseUrl,
    triggers: {
      contact_status: contact.res.status,
      reservation_status: reservation.res.status,
      reservation_id: reservation.body?.id ?? null,
    },
    notification_ids: {
      email: emailRow.id,
      whatsapp: whatsappRow.id,
    },
    provider_message_ids: {
      email: emailRow.provider_message_id,
      whatsapp: whatsappRow.provider_message_id,
    },
  }

  d1Raw(`
    INSERT INTO canary_runs (id, run_type, environment, status, organization_id, site_id, details_json, created_at)
    VALUES (
      '${sqlEscape(runId)}',
      'notifications',
      'production',
      'pass',
      '${sqlEscape(orgId)}',
      '${sqlEscape(siteId)}',
      '${sqlEscape(JSON.stringify(details))}',
      '${sqlEscape(nowIso())}'
    )
  `, 'canary success audit')

  console.log(JSON.stringify({ status: 'pass', run_id: runId, ...details }, null, 2))
}

main().catch((error) => {
  const orgId = process.env.CANARY_ORG_ID
  const siteId = process.env.CANARY_SITE_ID
  try {
    if (orgId && siteId) {
      const failure = {
        failed_at: nowIso(),
        error: describeError(error),
      }
      d1Raw(`
        INSERT INTO canary_runs (id, run_type, environment, status, organization_id, site_id, details_json, created_at)
        VALUES (
          'canary-notify-${sqlEscape(crypto.randomUUID())}',
          'notifications',
          'production',
          'fail',
          '${sqlEscape(orgId)}',
          '${sqlEscape(siteId)}',
          '${sqlEscape(JSON.stringify(failure))}',
          '${sqlEscape(nowIso())}'
        )
      `, 'canary failure audit')
    }
  } catch {
    // Best-effort failure audit; do not mask original canary error.
  }

  console.error('canary:notifications failed')
  console.error(JSON.stringify(describeError(error), null, 2))
  process.exit(1)
})
