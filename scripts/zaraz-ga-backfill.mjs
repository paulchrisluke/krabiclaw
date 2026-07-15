#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const targets = ['--preview', '--staging', '--remote'].filter(flag => process.argv.includes(flag))
if (targets.length !== 1) {
  console.error('Choose exactly one target: --preview, --staging, or --remote (production).')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const target = targets[0]
const zoneId = process.env.CF_ZONE_ID
const token = process.env.CF_ZARAZ_API_TOKEN
if (!zoneId || !token) {
  console.error('CF_ZONE_ID and CF_ZARAZ_API_TOKEN are required.')
  process.exit(1)
}

const wranglerArgs = ['d1', 'execute', 'DB']
if (target === '--preview') wranglerArgs.push('--env', 'preview')
if (target === '--staging') wranglerArgs.push('--env', 'staging')
wranglerArgs.push('--remote', '--json', '--command', `
  SELECT gac.site_id, gac.organization_id, gac.ga4_measurement_id,
         GROUP_CONCAT(sd.domain, '|') AS hostnames
  FROM google_analytics_connections gac
  JOIN site_domains sd ON sd.site_id = gac.site_id AND sd.status = 'active'
  WHERE gac.status = 'active' AND gac.ga4_measurement_id IS NOT NULL
  GROUP BY gac.site_id, gac.organization_id, gac.ga4_measurement_id
`)

const raw = execFileSync('yarn', ['wrangler', ...wranglerArgs], { encoding: 'utf8' })
const parsed = JSON.parse(raw)
const rows = parsed.flatMap(result => result.results ?? result.result?.[0]?.results ?? [])
const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/zaraz/config`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const response = await fetch(endpoint, { headers })
const envelope = await response.json()
if (!response.ok || !envelope.success) {
  throw new Error(envelope.errors?.map(error => error.message).filter(Boolean).join('; ') || `Zaraz GET failed (${response.status})`)
}

const config = envelope.result
config.tools ||= {}
config.triggers ||= {}
for (const row of rows) {
  const key = `ga-tenant-${row.site_id}`
  const hostnames = String(row.hostnames).split('|').map(value => value.toLowerCase()).sort()
  const escaped = hostnames.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  config.triggers[key] = {
    loadRules: [{ match: '{{ client.pageLocation }}', op: 'MATCH_REGEX', value: `^https://(${escaped.join('|')})/` }],
  }
  config.tools[key] = {
    component: 'google-analytics_v4',
    name: `Tenant GA4 (${row.site_id})`,
    enabled: true,
    settings: { tid: row.ga4_measurement_id },
    actions: { AllPageviews: { actionType: 'pageview', firingTriggers: [key], enabled: true } },
  }
}

if (dryRun) {
  console.log(JSON.stringify({ target, sites: rows.map(row => row.site_id), tools: rows.length }, null, 2))
  process.exit(0)
}

const putResponse = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(config) })
const putEnvelope = await putResponse.json()
if (!putResponse.ok || !putEnvelope.success) {
  throw new Error(putEnvelope.errors?.map(error => error.message).filter(Boolean).join('; ') || `Zaraz PUT failed (${putResponse.status})`)
}
console.log(`Synced ${rows.length} tenant GA4 connection(s) to Zaraz (${target.slice(2)}).`)
