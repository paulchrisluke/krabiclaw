import { execute } from '~/server/db'
import { platformAnalyticsHostnames, type DomainEnv } from '~/server/utils/domains'
import { getSiteDomains } from '~/server/utils/domain-read-model'
import { ZARAZ_ANALYTICS_PURPOSE, ZARAZ_ANALYTICS_PURPOSE_ID } from '~/utils/zaraz-consent'

export interface ZarazEnv extends DomainEnv {
  CF_ZARAZ_API_TOKEN?: string
}

interface ZarazAction {
  actionType: string
  firingTriggers: string[]
  enabled: boolean
}

interface ZarazTool {
  component: string
  name: string
  enabled: boolean
  settings: Record<string, unknown>
  actions: Record<string, ZarazAction>
  defaultPurpose?: string
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
  return `ga-tenant-${siteId}`
}

const PLATFORM_KEY = 'ga-platform'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function tenantPageLocationRegex(hostnames: string[]): string {
  return `^https://(${hostnames.map(escapeRegex).join('|')})/`
}

export function platformPageLocationRegex(hostnames: string[]): string {
  return tenantPageLocationRegex(hostnames)
}

function consentPurposeId() {
  return ZARAZ_ANALYTICS_PURPOSE_ID
}

function ensureAnalyticsConsentPurpose(config: ZarazConfig) {
  config.consent ||= {}
  config.consent.enabled = true
  config.consent.hideModal = true
  config.consent.purposes ||= {}
  config.consent.purposes[consentPurposeId()] ||= ZARAZ_ANALYTICS_PURPOSE
}

function makePageLocationTrigger(name: string, hostnames: string[]): ZarazTrigger {
  return {
    name,
    loadRules: [{
      match: '{{ client.pageLocation }}',
      op: 'MATCH_REGEX',
      value: tenantPageLocationRegex(hostnames),
    }],
  }
}

function scopeActionsToTrigger(actions: Record<string, ZarazAction> | undefined, triggerKey: string) {
  const source = actions && Object.keys(actions).length
    ? actions
    : { AllPageviews: { actionType: 'pageview', firingTriggers: [], enabled: true } }
  return Object.fromEntries(Object.entries(source).map(([key, action]) => [
    key,
    {
      ...action,
      firingTriggers: [triggerKey],
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
    defaultPurpose: consentPurposeId(),
    actions: scopeActionsToTrigger(existing?.actions ?? template?.actions, input.triggerKey),
  }
}

export function upsertPlatformZarazAnalytics(
  config: ZarazConfig,
  input: { measurementId: string | null | undefined; hostnames: string[] },
) {
  if (!input.measurementId || !input.hostnames.length) return
  config.triggers ||= {}
  config.tools ||= {}
  ensureAnalyticsConsentPurpose(config)
  config.historyChange = true
  config.triggers[PLATFORM_KEY] = makePageLocationTrigger('Platform hosts', input.hostnames)

  const existingEntry = Object.entries(config.tools).find(([, tool]) =>
    isGa4Tool(tool) && tool.settings?.tid === input.measurementId
  )
  const key = existingEntry?.[0] ?? PLATFORM_KEY
  upsertGa4Tool(config, key, {
    name: 'Platform GA4',
    measurementId: input.measurementId,
    triggerKey: PLATFORM_KEY,
    existing: existingEntry?.[1],
  })
}

export function upsertTenantZarazAnalytics(
  config: ZarazConfig,
  input: { siteId: string; measurementId: string | null | undefined; hostnames: string[] },
) {
  if (!input.measurementId || !input.hostnames.length) return
  config.triggers ||= {}
  config.tools ||= {}
  ensureAnalyticsConsentPurpose(config)
  config.historyChange = true
  const key = tenantKey(input.siteId)
  config.triggers[key] = makePageLocationTrigger(`Tenant hosts (${input.siteId})`, input.hostnames)
  upsertGa4Tool(config, key, {
    name: `Tenant GA4 (${input.siteId})`,
    measurementId: input.measurementId,
    triggerKey: key,
    existing: config.tools[key],
  })
}

export function removeStaleTenantZarazAnalytics(config: ZarazConfig, activeSiteIds: string[]) {
  const activeKeys = new Set(activeSiteIds.map(tenantKey))
  for (const key of Object.keys(config.tools ?? {})) {
    if (key.startsWith('ga-tenant-') && !activeKeys.has(key)) Reflect.deleteProperty(config.tools, key)
  }
  for (const key of Object.keys(config.triggers ?? {})) {
    if (key.startsWith('ga-tenant-') && !activeKeys.has(key)) Reflect.deleteProperty(config.triggers, key)
  }
}

export async function syncTenantZarazAnalytics(
  env: ZarazEnv,
  db: D1Database,
  input: { siteId: string; organizationId: string; measurementId: string | null | undefined },
): Promise<void> {
  if (!input.measurementId) {
    console.info('zaraz_sync_skipped', { siteId: input.siteId, reason: 'missing_measurement_id' })
    return
  }
  const hostnames = (await getSiteDomains(db, input.siteId))
    .filter(domain => domain.status === 'active')
    .map(domain => domain.domain.toLowerCase())
    .sort()
  if (hostnames.length === 0) {
    console.info('zaraz_sync_skipped', { siteId: input.siteId, reason: 'no_active_hostnames' })
    return
  }

  const lockedAt = await acquireLock(db)
  try {
    const config = await getZarazConfig(env)
    config.triggers ||= {}
    config.tools ||= {}
    upsertPlatformZarazAnalytics(config, {
      measurementId: env.GA4_MEASUREMENT_ID,
      hostnames: platformAnalyticsHostnames(env),
    })
    upsertTenantZarazAnalytics(config, { ...input, measurementId: input.measurementId, hostnames })
    await putZarazConfig(env, config)
  } finally {
    await releaseLock(db, lockedAt)
  }
}

export async function removeTenantZarazAnalytics(
  env: ZarazEnv,
  db: D1Database,
  siteId: string,
): Promise<void> {
  const lockedAt = await acquireLock(db)
  try {
    const config = await getZarazConfig(env)
    const key = tenantKey(siteId)
    if (!config.tools?.[key] && !config.triggers?.[key]) return
    Reflect.deleteProperty(config.tools, key)
    Reflect.deleteProperty(config.triggers, key)
    await putZarazConfig(env, config)
  } finally {
    await releaseLock(db, lockedAt)
  }
}
