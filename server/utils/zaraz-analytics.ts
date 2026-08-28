import { execute, queryAll } from '~/server/db'
import { platformAnalyticsHostnames, type DomainEnv } from '~/server/utils/domains'
import { ZARAZ_ANALYTICS_PURPOSE, ZARAZ_ANALYTICS_PURPOSE_ID } from '~/utils/zaraz-consent'

export interface ZarazEnv extends DomainEnv {
  CF_ZARAZ_API_TOKEN?: string
}

interface ZarazAction {
  actionType: string
  firingTriggers: string[]
  blockingTriggers?: string[]
  enabled: boolean
}

interface ZarazTool {
  component: string
  name: string
  enabled: boolean
  settings: Record<string, unknown>
  defaultFields?: Record<string, string | boolean>
  defaultPurpose?: string
  vendorName?: string
  vendorPolicyUrl?: string
  actions: Record<string, ZarazAction>
  [key: string]: unknown
}

interface ZarazTrigger {
  name?: string
  loadRules: Array<{ match: string; op: string; value: string }>
  [key: string]: unknown
}

export interface ZarazConfig {
  tools: Record<string, ZarazTool>
  triggers: Record<string, ZarazTrigger | Record<string, unknown>>
  consent?: {
    enabled?: boolean
    hideModal?: boolean
    purposes?: Record<string, { name: string; description: string }>
    defaultLanguage?: string
    tcfCompliant?: boolean
    consentModalIntroHTML?: string
    customCSS?: string
    buttonTextTranslations?: {
      accept_all?: Record<string, string>
      confirm_my_choices?: Record<string, string>
      reject_all?: Record<string, string>
    }
    [key: string]: unknown
  }
  historyChange?: boolean
  variables?: Record<string, unknown>
  [key: string]: unknown
}

type CloudflareEnvelope<T> = {
  success: boolean
  result: T
  errors?: Array<{ message?: string }>
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const LOCK_ID = 'zone'
const LOCK_STALE_MS = 30_000
const LOCK_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000]
const ANALYTICS_KEY_PREFIX = 'ga-'
const TENANT_KEY_PREFIX = 'ga-tenant-'
const PLATFORM_KEY = 'ga-platform'
const GOOGLE_VENDOR_NAME = 'Google Analytics'
const GOOGLE_VENDOR_POLICY_URL = 'https://policies.google.com/privacy'

function requireZarazEnv(env: ZarazEnv) {
  if (!env.CF_ZONE_ID) throw new Error('CF_ZONE_ID is required')
  if (!env.CF_ZARAZ_API_TOKEN) throw new Error('CF_ZARAZ_API_TOKEN is required')
}

async function zarazRequest<T>(env: ZarazEnv, init: RequestInit = {}): Promise<T> {
  requireZarazEnv(env)
  const response = await fetch(`${CF_API_BASE}/zones/${env.CF_ZONE_ID}/settings/zaraz/config`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CF_ZARAZ_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const payload = await response.json() as CloudflareEnvelope<T>
  if (!response.ok || !payload.success) {
    const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ')
    throw new Error(message || `Cloudflare Zaraz API request failed (${response.status})`)
  }
  return payload.result
}

export async function getZarazConfig(env: ZarazEnv): Promise<ZarazConfig> {
  return await zarazRequest<ZarazConfig>(env)
}

export async function putZarazConfig(env: ZarazEnv, config: ZarazConfig): Promise<ZarazConfig> {
  return await zarazRequest<ZarazConfig>(env, { method: 'PUT', body: JSON.stringify(config) })
}

async function acquireLock(db: D1Database): Promise<string> {
  await execute(db, `INSERT OR IGNORE INTO zaraz_sync_lock (id, locked_at) VALUES (?, NULL)`, [LOCK_ID])
  for (const delay of LOCK_RETRY_DELAYS_MS) {
    const now = new Date()
    const staleBefore = new Date(now.getTime() - LOCK_STALE_MS).toISOString()
    const result = await execute(db, `
      UPDATE zaraz_sync_lock
      SET locked_at = ?
      WHERE id = ? AND (locked_at IS NULL OR locked_at < ?)
    `, [now.toISOString(), LOCK_ID, staleBefore])
    if ((result.meta?.changes ?? 0) > 0) return now.toISOString()
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  throw new Error('Timed out waiting for Zaraz configuration sync lock')
}

async function releaseLock(db: D1Database, lockedAt: string): Promise<void> {
  await execute(db, `UPDATE zaraz_sync_lock SET locked_at = NULL WHERE id = ? AND locked_at = ?`, [LOCK_ID, lockedAt])
}

function tenantKey(siteId: string): string {
  return `${TENANT_KEY_PREFIX}${siteId}`
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function tenantPageLocationRegex(hostnames: string[]): string {
  return `^(${hostnames.map(escapeRegex).join('|')})$`
}

export function platformPageLocationRegex(hostnames: string[]): string {
  return tenantPageLocationRegex(hostnames)
}

function configureZarazConsentManagement(config: ZarazConfig) {
  config.consent ||= {}
  config.consent.enabled = true
  config.consent.hideModal = false
  config.consent.defaultLanguage = 'en'
  config.consent.tcfCompliant = true
  config.consent.consentModalIntroHTML = 'We use optional analytics to understand site usage and improve our services. Read our <a href="https://krabiclaw.com/privacy">privacy policy</a>.'
  config.consent.customCSS = `
.cf_modal_container { color: #1c1917; font-family: ui-sans-serif, system-ui, sans-serif; }
.cf_modal { background: #fff; border-radius: 0.75rem; color: #1c1917; }
.cf_button { border-radius: 0.375rem; }
`.trim()
  config.consent.buttonTextTranslations = {
    accept_all: { en: 'Accept all' },
    confirm_my_choices: { en: 'Confirm my choices' },
    reject_all: { en: 'Reject all' },
  }
  config.consent.purposes ||= {}
  config.consent.purposes[ZARAZ_ANALYTICS_PURPOSE_ID] = ZARAZ_ANALYTICS_PURPOSE
}

function makeHostBlockTrigger(name: string, hostnames: string[]): ZarazTrigger {
  return {
    name,
    loadRules: [{
      match: '{{ system.page.url.hostname }}',
      op: 'NOT_MATCH_REGEX',
      value: tenantPageLocationRegex(hostnames),
    }],
  }
}

function firingTriggersForAction(action: ZarazAction): string[] {
  if (action.actionType === 'pageview') return ['Pageview']
  if (action.actionType === 'event') return ['AllTracks']
  return action.firingTriggers?.length ? action.firingTriggers : ['Pageview']
}

function scopeActionsToTrigger(actions: Record<string, ZarazAction> | undefined, blockingTriggers: string[]) {
  const source = actions && Object.keys(actions).length
    ? actions
    : { AllPageviews: { actionType: 'pageview', firingTriggers: [], enabled: true } }
  return Object.fromEntries(Object.entries(source).map(([key, action]) => [
    key,
    {
      ...action,
      firingTriggers: firingTriggersForAction(action),
      blockingTriggers,
      enabled: action.enabled !== false,
    },
  ]))
}

function isGa4Tool(tool: ZarazTool | undefined): tool is ZarazTool {
  return tool?.component === 'google-analytics_v4'
}

function ga4ToolTemplate(config: ZarazConfig): ZarazTool | undefined {
  return Object.values(config.tools ?? {}).find(tool =>
    isGa4Tool(tool) && tool.defaultFields
  )
}

function zarazFieldMap(value: unknown): Record<string, string | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) =>
      typeof fieldValue === 'string' || typeof fieldValue === 'boolean'
    ),
  )
}

function upsertGa4Tool(
  config: ZarazConfig,
  key: string,
  input: { name: string; measurementId: string; triggerKey: string; existing?: ZarazTool },
) {
  const existing = input.existing
  const template = existing?.defaultFields ? existing : ga4ToolTemplate(config)
  config.tools[key] = {
    ...template,
    ...existing,
    component: 'google-analytics_v4',
    name: existing?.name || input.name,
    enabled: true,
    settings: { ...(template?.settings ?? {}), ...(existing?.settings ?? {}), tid: input.measurementId },
    defaultFields: {
      ...zarazFieldMap(template?.defaultFields),
      ...zarazFieldMap(existing?.defaultFields),
      user_id: '{{ client.user_id }}',
    },
    defaultPurpose: ZARAZ_ANALYTICS_PURPOSE_ID,
    vendorName: GOOGLE_VENDOR_NAME,
    vendorPolicyUrl: GOOGLE_VENDOR_POLICY_URL,
    actions: scopeActionsToTrigger(existing?.actions ?? template?.actions, [input.triggerKey]),
  }
}

export function upsertPlatformZarazAnalytics(
  config: ZarazConfig,
  input: { measurementId: string | null | undefined; hostnames: string[] },
) {
  if (!input.measurementId || !input.hostnames.length) return
  config.triggers ||= {}
  config.tools ||= {}
  configureZarazConsentManagement(config)
  config.historyChange = false
  config.triggers[PLATFORM_KEY] = makeHostBlockTrigger('Block non-platform hosts', input.hostnames)

  upsertGa4Tool(config, PLATFORM_KEY, {
    name: 'Platform GA4',
    measurementId: input.measurementId,
    triggerKey: PLATFORM_KEY,
    existing: config.tools[PLATFORM_KEY],
  })
}

export function upsertTenantZarazAnalytics(
  config: ZarazConfig,
  input: { siteId: string; measurementId: string | null | undefined; hostnames: string[] },
) {
  if (!input.measurementId || !input.hostnames.length) return
  config.triggers ||= {}
  config.tools ||= {}
  configureZarazConsentManagement(config)
  config.historyChange = false
  const key = tenantKey(input.siteId)
  config.triggers[key] = makeHostBlockTrigger(`Block non-tenant hosts (${input.siteId})`, input.hostnames)
  upsertGa4Tool(config, key, {
    name: `Tenant GA4 (${input.siteId})`,
    measurementId: input.measurementId,
    triggerKey: key,
    existing: config.tools[key],
  })
}

function removeUndesiredAnalyticsConfig(config: ZarazConfig, desiredKeys: Set<string>): number {
  let removedTools = 0
  for (const key of Object.keys(config.tools ?? {})) {
    if (isGa4Tool(config.tools[key]) && !desiredKeys.has(key)) {
      Reflect.deleteProperty(config.tools, key)
      removedTools += 1
    }
  }
  for (const key of Object.keys(config.triggers ?? {})) {
    if (key.startsWith(ANALYTICS_KEY_PREFIX) && !desiredKeys.has(key)) {
      Reflect.deleteProperty(config.triggers, key)
    }
  }
  return removedTools
}

interface ActiveTenantAnalyticsRow {
  site_id: string
  ga4_measurement_id: string
  domain: string
}

export interface ZarazAnalyticsReconciliationResult {
  configuredTenants: number
  removedAnalyticsTools: number
  updated: boolean
}

export interface ZarazAnalyticsTenant {
  siteId: string
  measurementId: string
  hostnames: string[]
}

export function reconcileZarazAnalyticsConfig(
  config: ZarazConfig,
  input: {
    platformMeasurementId?: string | null
    platformHostnames: string[]
    tenants: ZarazAnalyticsTenant[]
  },
): ZarazAnalyticsReconciliationResult {
  config.triggers ||= {}
  config.tools ||= {}
  const before = JSON.stringify(config)
  const desiredKeys = new Set(input.tenants.map(tenant => tenantKey(tenant.siteId)))
  if (input.platformMeasurementId && input.platformHostnames.length) desiredKeys.add(PLATFORM_KEY)

  upsertPlatformZarazAnalytics(config, {
    measurementId: input.platformMeasurementId,
    hostnames: input.platformHostnames,
  })
  for (const tenant of input.tenants) {
    upsertTenantZarazAnalytics(config, tenant)
  }
  const removedAnalyticsTools = removeUndesiredAnalyticsConfig(config, desiredKeys)

  return {
    configuredTenants: input.tenants.length,
    removedAnalyticsTools,
    updated: JSON.stringify(config) !== before,
  }
}

export async function reconcileZarazAnalytics(
  env: ZarazEnv,
  db: D1Database,
): Promise<ZarazAnalyticsReconciliationResult> {
  const rows = await queryAll<ActiveTenantAnalyticsRow>(db, `
    SELECT site.id AS site_id,
           COALESCE(connection.ga4_measurement_id, setting.value) AS ga4_measurement_id,
           domain.domain
      FROM sites site
      LEFT JOIN google_analytics_connections connection
        ON connection.site_id = site.id
       AND connection.organization_id = site.organization_id
       AND connection.status = 'active'
      LEFT JOIN site_config setting
        ON setting.site_id = site.id
       AND setting.organization_id = site.organization_id
       AND setting.key = 'google_analytics_measurement_id'
      JOIN site_domains domain
        ON domain.site_id = site.id
       AND domain.organization_id = site.organization_id
     WHERE site.status = 'active'
       AND site.onboarding_status = 'active'
       AND domain.status = 'active'
       AND COALESCE(connection.ga4_measurement_id, setting.value) IS NOT NULL
       AND COALESCE(connection.ga4_measurement_id, setting.value) <> ''
     ORDER BY site.id, domain.domain
  `)

  const tenants = new Map<string, {
    measurementId: string
    hostnames: string[]
  }>()
  for (const row of rows) {
    const existing = tenants.get(row.site_id)
    if (existing) {
      existing.hostnames.push(row.domain.toLowerCase())
      continue
    }
    tenants.set(row.site_id, {
      measurementId: row.ga4_measurement_id,
      hostnames: [row.domain.toLowerCase()],
    })
  }

  const lockedAt = await acquireLock(db)
  try {
    const config = await getZarazConfig(env)
    const result = reconcileZarazAnalyticsConfig(config, {
      platformMeasurementId: env.GA4_MEASUREMENT_ID,
      platformHostnames: platformAnalyticsHostnames(env),
      tenants: [...tenants.entries()].map(([siteId, tenant]) => ({
        siteId,
        measurementId: tenant.measurementId,
        hostnames: [...new Set(tenant.hostnames)].sort(),
      })),
    })
    if (result.updated) await putZarazConfig(env, config)
    return result
  } finally {
    await releaseLock(db, lockedAt)
  }
}
