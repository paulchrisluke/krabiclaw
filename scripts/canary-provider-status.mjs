#!/usr/bin/env node

const nowIso = () => new Date().toISOString()

function env(name, opts = {}) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    if (opts.optional) return ''
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

async function main() {
  const baseUrl = env('CANARY_BASE_URL')
  const secret = env('CANARY_STATUS_SECRET')

  const res = await fetch(`${baseUrl}/api/canary/provider-status`, {
    headers: { 'x-canary-secret': secret },
  })
  const text = await res.text()
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error(`Provider status returned ${res.status} ${res.headers.get('content-type')}: ${text.slice(0, 500)}`)
  }
  const body = JSON.parse(text)

  const status = body?.ok ? 'pass' : 'fail'
  const details = {
    checked_at: nowIso(),
    base_url: baseUrl,
    http_status: res.status,
    whatsapp: body?.whatsapp ?? null,
    resend: body?.resend ?? null,
  }

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
