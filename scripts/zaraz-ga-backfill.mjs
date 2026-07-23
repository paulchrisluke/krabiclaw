#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const targets = ['--preview', '--staging', '--remote'].filter(flag => process.argv.includes(flag))
if (targets.length !== 1) {
  console.error('Choose exactly one target: --preview, --staging, or --remote (production).')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const target = targets[0]
const wranglerToml = readFileSync('wrangler.toml', 'utf8')
const readWranglerVar = (name) => wranglerToml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? ''
const readWranglerZoneName = () => wranglerToml.match(/zone_name\s*=\s*"([^"]+)"/)?.[1] ?? ''
const stripOrigin = value => String(value || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
const token = process.env.CF_ZARAZ_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
const zoneName = process.env.CF_ZONE_NAME || readWranglerVar('CF_ZONE_NAME') || readWranglerZoneName()
if (!token) {
  console.error('CF_ZARAZ_API_TOKEN or CLOUDFLARE_API_TOKEN is required.')
  process.exit(1)
}
const platformMeasurementId = process.env.GA4_MEASUREMENT_ID || readWranglerVar('GA4_MEASUREMENT_ID')
const platformHostnames = Array.from(new Set([
  stripOrigin(process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN || readWranglerVar('NUXT_PUBLIC_FREE_SITE_DOMAIN') || 'https://krabiclaw.com'),
  stripOrigin(process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || readWranglerVar('NUXT_PUBLIC_PLATFORM_DOMAIN') || 'https://krabiclaw.com'),
  'krabiclaw.com',
  'www.krabiclaw.com',
].filter(Boolean))).sort()

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

const raw = execFileSync('npx', ['wrangler', ...wranglerArgs], { encoding: 'utf8' })
const parsed = JSON.parse(raw)
const rows = parsed.flatMap(result => result.results ?? result.result?.[0]?.results ?? [])
const resolveZoneId = async () => {
  const configuredZoneId = process.env.CF_ZONE_ID || readWranglerVar('CF_ZONE_ID')
  if (configuredZoneId) return configuredZoneId
  if (!zoneName) {
    throw new Error('CF_ZONE_ID is not configured and no zone_name could be read from wrangler.toml.')
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const envelope = await response.json()
  if (!response.ok || !envelope.success) {
    throw new Error(envelope.errors?.map(error => error.message).filter(Boolean).join('; ') || `Cloudflare zones lookup failed (${response.status})`)
  }
  const zoneId = envelope.result?.[0]?.id
  if (!zoneId) throw new Error(`Cloudflare zone ${zoneName} was not found.`)
  return zoneId
}
const zoneId = await resolveZoneId()
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

const analyticsPurposeId = 'kc_analytics'
config.consent ||= {}
config.consent.enabled = false
config.historyChange = true

const pageLocationRegex = hostnames => `^https://(${hostnames.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})/`
const scopeActions = (actions, triggerKey) => Object.fromEntries(Object.entries(
  actions && Object.keys(actions).length
    ? actions
    : { AllPageviews: { actionType: 'pageview', firingTriggers: [], enabled: true } },
).map(([key, action]) => [
  key,
  { ...action, firingTriggers: [triggerKey], enabled: action.enabled !== false },
]))
const ga4ToolTemplate = () => Object.values(config.tools).find(tool =>
  tool?.component === 'google-analytics_v4' && tool?.defaultFields
)
const upsertGaTool = (key, { name, measurementId, triggerKey, existing }) => {
  const template = existing?.defaultFields ? existing : ga4ToolTemplate()
  config.tools[key] = {
    ...template,
    ...existing,
    component: 'google-analytics_v4',
    name: existing?.name || name,
    enabled: true,
    settings: { ...(template?.settings || {}), ...(existing?.settings || {}), tid: measurementId },
    defaultPurpose: undefined,
    actions: scopeActions(existing?.actions || template?.actions, triggerKey),
  }
}

if (platformMeasurementId && platformHostnames.length) {
  const triggerKey = 'ga-platform'
  config.triggers[triggerKey] = {
    name: 'Platform hosts',
    loadRules: [{ match: '{{ system.page.url }}', op: 'MATCH_REGEX', value: pageLocationRegex(platformHostnames) }],
  }
  const existingEntry = Object.entries(config.tools).find(([, tool]) =>
    tool?.component === 'google-analytics_v4' && tool.settings?.tid === platformMeasurementId
  )
  upsertGaTool(existingEntry?.[0] || triggerKey, {
    name: 'Platform GA4',
    measurementId: platformMeasurementId,
    triggerKey,
    existing: existingEntry?.[1],
  })
}

const activeTenantKeys = new Set(rows.map(row => `ga-tenant-${row.site_id}`))
for (const key of Object.keys(config.tools)) {
  if (key.startsWith('ga-tenant-') && !activeTenantKeys.has(key)) delete config.tools[key]
}
for (const key of Object.keys(config.triggers)) {
  if (key.startsWith('ga-tenant-') && !activeTenantKeys.has(key)) delete config.triggers[key]
}

for (const row of rows) {
  const key = `ga-tenant-${row.site_id}`
  const hostnames = String(row.hostnames).split('|').map(value => value.toLowerCase()).sort()
  config.triggers[key] = {
    name: `Tenant hosts (${row.site_id})`,
    loadRules: [{ match: '{{ system.page.url }}', op: 'MATCH_REGEX', value: pageLocationRegex(hostnames) }],
  }
  upsertGaTool(key, {
    name: `Tenant GA4 (${row.site_id})`,
    measurementId: row.ga4_measurement_id,
    triggerKey: key,
    existing: config.tools[key],
  })
}

if (dryRun) {
  console.log(JSON.stringify({ target, platformMeasurementId, platformHostnames, sites: rows.map(row => row.site_id), tools: rows.length }, null, 2))
  process.exit(0)
}

const putResponse = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(config) })
const putEnvelope = await putResponse.json()
if (!putResponse.ok || !putEnvelope.success) {
  throw new Error(putEnvelope.errors?.map(error => error.message).filter(Boolean).join('; ') || `Zaraz PUT failed (${putResponse.status})`)
}
console.log(`Synced ${rows.length} tenant GA4 connection(s) to Zaraz (${target.slice(2)}).`)
