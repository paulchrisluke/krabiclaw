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

function d1Raw(sql, label = 'd1Raw') {
  const res = spawnSync('yarn', ['-s', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  })
  if (res.error) throw new Error(`${label} failed before execution: ${res.error.message}`, { cause: res.error })
  if (res.status !== 0) throw new Error(`${label} failed with exit ${res.status}: ${(res.stderr || '').trim() || 'no stderr output'}`)
  return JSON.parse(res.stdout)?.[0]
}

async function main() {
  const baseUrl = env('CANARY_BASE_URL')
  const orgId = env('CANARY_ORG_ID')
  const siteId = env('CANARY_SITE_ID')
  const secret = env('CANARY_STATUS_SECRET')

  const res = await fetch(`${baseUrl}/api/canary/provider-status`, {
    headers: { 'x-canary-secret': secret },
  })
  const body = await res.json().catch(() => ({}))

  const status = body?.ok ? 'pass' : 'fail'
  const details = {
    checked_at: nowIso(),
    base_url: baseUrl,
    http_status: res.status,
    whatsapp: body?.whatsapp ?? null,
    resend: body?.resend ?? null,
  }

  d1Raw(`
    INSERT INTO canary_runs (id, run_type, environment, status, organization_id, site_id, details_json, created_at)
    VALUES (
      'canary-status-${sqlEscape(crypto.randomUUID())}',
      'notifications',
      'production',
      '${sqlEscape(status)}',
      '${sqlEscape(orgId)}',
      '${sqlEscape(siteId)}',
      '${sqlEscape(JSON.stringify(details))}',
      '${sqlEscape(nowIso())}'
    )
  `, 'canary status audit')

  console.log(JSON.stringify({ status, ...details }, null, 2))

  if (status === 'fail') {
    throw new Error(`Provider status check failed: ${JSON.stringify(details)}`)
  }
}

main().catch((error) => {
  console.error('canary:status failed')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
