import {
  createCustomDomainPair,
  deleteCustomDomain,
  platformDomain,
  type DomainEnv,
} from '~/server/utils/domains'
import { rootDomainForPair } from '~/server/utils/domain-shared'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { notifySiteTransferReminder } from '~/server/utils/site-transfer-notifications'
import {
  validateOrganizationBillingProjection,
  type OrganizationBillingProjectionRow,
} from '~/server/utils/organization-billing'
import {
  RESOURCE_TEAM_GENERATION_CONFIG_KEY,
  SITE_TRANSFER_REPARENT_TABLES,
  SITE_TRANSFER_RETAIN_TABLES,
  SITE_TRANSFER_REVOKE_TABLES,
  serializeResourceTeamGeneration,
} from '~/shared/site-transfer-policy'

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDER_THRESHOLDS_DAYS = [1, 3, 7] as const

type SiteTransferEnv = DomainEnv & {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
  STRIPE_SECRET_KEY?: string
}

/**
 * site_transfer_requests.status is constrained to the historical
 * pending/accepted/cancelled values.  A pending row is therefore a small
 * state machine encoded by the checkout-session column:
 *
 *   claiming       pending + stripe_checkout_session_id = claim:<nonce>
 *   checkout_pending pending + a real Checkout id + exact claimant/org
 *
 * The sentinel is written with a compare-and-set before any provider or
 * Better Auth side effect.  It is intentionally not a Stripe identifier and
 * must never be sent to the provider.
 */
export const TRANSFER_CLAIM_SENTINEL_PREFIX = 'claim:'

export function isTransferClaimSentinel(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TRANSFER_CLAIM_SENTINEL_PREFIX)
}

export function newTransferClaimSentinel(): string {
  return `${TRANSFER_CLAIM_SENTINEL_PREFIX}${crypto.randomUUID()}`
}

export function isTransferCheckoutPending(row: {
  status?: string | null
  stripe_checkout_session_id?: string | null
  claiming_user_id?: string | null
  claiming_organization_id?: string | null
}): boolean {
  return row.status === 'pending'
    && Boolean(row.stripe_checkout_session_id)
    && !isTransferClaimSentinel(row.stripe_checkout_session_id)
    && Boolean(row.claiming_user_id)
    && Boolean(row.claiming_organization_id)
}

function isStripeResourceMissing(error: unknown): boolean {
  const candidate = error as { code?: unknown; statusCode?: unknown; type?: unknown } | null
  return candidate?.code === 'resource_missing'
    || (candidate?.statusCode === 404 && candidate?.type === 'StripeInvalidRequestError')
}

export interface TransferDomainSnapshot {
  domain: string
  include_www: boolean
}

interface TransferCleanupRow {
  id: string
  site_id: string
  from_organization_id: string
  status: string
  requires_payment: number
  claiming_user_id: string | null
  claiming_organization_id: string | null
  stripe_checkout_session_id: string | null
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
}

interface TransferCompletionRow {
  id: string
  site_id: string
  from_organization_id: string
  status: string
  claiming_user_id: string | null
  claiming_organization_id: string | null
  stripe_checkout_session_id: string | null
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
  payment_completed_at: string | null
}

interface TransferReminderRow {
  id: string
  site_id: string
  from_organization_id: string
  to_email: string
  token: string
  created_at: string
  invited_plan: string | null
  invited_domain: string | null
  reminder_count: number | null
  requires_payment: number
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
  site_name: string | null
}

export function serializeTransferDomainSnapshot(snapshot: TransferDomainSnapshot[]): string {
  return JSON.stringify(snapshot)
}

const TRANSFER_DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function transferDomainSnapshotError(message: string): Error {
  return new Error(`Invalid custom-domain restoration snapshot: ${message}`)
}

function normalizeTransferSnapshotDomain(raw: unknown, index: number): string {
  if (typeof raw !== 'string') {
    throw transferDomainSnapshotError(`entry ${index} has a non-string domain`)
  }

  const candidate = raw.trim().toLowerCase()
  const root = rootDomainForPair(candidate)
  if (!root || (candidate !== root && candidate !== `www.${root}`)) {
    throw transferDomainSnapshotError(`entry ${index} has an unsupported domain value`)
  }

  if (root.length < 3 || root.length > 253 || root.startsWith('www.')) {
    throw transferDomainSnapshotError(`entry ${index} has an unsupported domain value`)
  }

  const labels = root.split('.')
  if (labels.length < 2 || labels.some((label) => !TRANSFER_DOMAIN_LABEL_PATTERN.test(label))) {
    throw transferDomainSnapshotError(`entry ${index} has an unsupported domain value`)
  }

  return root
}

export function parseTransferDomainSnapshot(raw: string | null | undefined): TransferDomainSnapshot[] {
  if (raw === null || raw === undefined) return []
  if (typeof raw !== 'string') {
    throw transferDomainSnapshotError('snapshot must be a JSON string')
  }
  if (raw.trim() === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw transferDomainSnapshotError('snapshot is not valid JSON')
  }

  if (!Array.isArray(parsed)) {
    throw transferDomainSnapshotError('snapshot must be an array')
  }

  const byRoot = new Map<string, TransferDomainSnapshot>()
  for (const [index, entry] of parsed.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw transferDomainSnapshotError(`entry ${index} must be an object`)
    }

    const keys = Object.keys(entry)
    if (keys.length !== 2 || !keys.includes('domain') || !keys.includes('include_www')) {
      throw transferDomainSnapshotError(`entry ${index} has an unsupported shape`)
    }

    const candidate = entry as { domain: unknown; include_www: unknown }
    if (typeof candidate.include_www !== 'boolean') {
      throw transferDomainSnapshotError(`entry ${index} has a non-boolean include_www value`)
    }

    const domain = normalizeTransferSnapshotDomain(candidate.domain, index)
    const existing = byRoot.get(domain)
    if (existing) {
      // A legacy snapshot may contain both root and www rows for the same
      // pair. Restore that pair once, retaining the broader include_www
      // request rather than issuing duplicate provider calls.
      existing.include_www = existing.include_www || candidate.include_www
    } else {
      byRoot.set(domain, { domain, include_www: candidate.include_www })
    }
  }

  return Array.from(byRoot.values())
}

function hasTransferDomainSnapshot(raw: string | null | undefined): raw is string {
  return typeof raw === 'string' && raw.trim() !== ''
}

export async function buildTransferDomainSnapshot(db: D1Database, siteId: string): Promise<TransferDomainSnapshot[]> {
  const rows = await queryAll<{ domain: string }>(db, `
    SELECT domain
    FROM site_domains
    WHERE site_id = ? AND type = 'custom' AND status != 'deleted'
    ORDER BY created_at ASC
  `, [siteId])

  const byRoot = new Map<string, { hasRoot: boolean; hasWww: boolean }>()

  for (const row of rows || []) {
    const domain = String(row.domain || '').trim().toLowerCase()
    if (!domain) continue
    const root = rootDomainForPair(domain)
    const current = byRoot.get(root) ?? { hasRoot: false, hasWww: false }
    if (domain === root) current.hasRoot = true
    if (domain === `www.${root}`) current.hasWww = true
    byRoot.set(root, current)
  }

  return Array.from(byRoot.entries()).map(([domain, flags]) => ({
    domain,
    include_www: flags.hasWww || !flags.hasRoot,
  }))
}

export async function deleteSiteCustomDomains(
  env: SiteTransferEnv,
  db: D1Database,
  siteId: string,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null,
): Promise<{ deletedCount: number; failedDomainIds: string[] }> {
  const domains = await queryAll<{ id: string }>(db, `
    SELECT id
    FROM site_domains
    WHERE site_id = ? AND type = 'custom' AND status != 'deleted'
    ORDER BY created_at ASC
  `, [siteId])

  let deletedCount = 0
  const failedDomainIds: string[] = []

  for (const domain of domains || []) {
    try {
      await deleteCustomDomain(env, db, domain.id, actorType, actorId)
      deletedCount += 1
    } catch (error) {
      failedDomainIds.push(domain.id)
      console.error('delete_site_custom_domain_failed', {
        siteId,
        domainId: domain.id,
        actorType,
        actorId,
        error,
      })
    }
  }

  return { deletedCount, failedDomainIds }
}

export async function restoreSiteCustomDomains(
  env: SiteTransferEnv,
  db: D1Database,
  siteId: string,
  organizationId: string,
  snapshotRaw: string | null | undefined,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null,
): Promise<number> {
  const snapshot = parseTransferDomainSnapshot(snapshotRaw)
  let restored = 0

  for (const entry of snapshot) {
    await createCustomDomainPair(env, db, {
      siteId,
      organizationId,
      domain: entry.domain,
      includeWww: entry.include_www,
      actorType: actorType === 'system' ? 'admin' : actorType,
      actorId,
    })
    restored += 1
  }

  return restored
}

export type OrganizationBillingMirrorRow = OrganizationBillingProjectionRow

export interface SiteTransferBillingProjection {
  organizationId: string
  organizationBilling: OrganizationBillingMirrorRow | null
}

async function loadSiteTransferBillingProjection(
  db: D1Database,
  organizationId: string,
): Promise<SiteTransferBillingProjection> {
  // Read the organization billing row once and validate that exact snapshot.
  // A malformed recipient projection must abort before any transfer mutation.
  const organizationBilling = await queryFirst<OrganizationBillingMirrorRow>(db, `
    SELECT organization_id, stripe_customer_id, stripe_subscription_id,
           payment_status, paid_through, past_due_since,
           last_paid_invoice_id, last_payment_event_created, last_payment_event_id,
           access_plan, access_expires_at, updated_at
      FROM organization_billing
     WHERE organization_id = ?
     LIMIT 1
  `, [organizationId])

  const projection = validateOrganizationBillingProjection(organizationBilling, organizationId)

  return {
    organizationId: projection.organizationId,
    organizationBilling: organizationBilling ?? null,
  }
}

const MEDIA_ASSET_COLUMNS = [
  'id',
  'organization_id',
  'site_id',
  'kind',
  'provider',
  'source',
  'cloudflare_image_id',
  'r2_key',
  'public_url',
  'thumbnail_url',
  'mime_type',
  'file_name',
  'file_size',
  'width',
  'height',
  'duration',
  'alt_text',
  'category',
  'status',
  'created_by_user_id',
  'created_at',
  'updated_at',
] as const

const MEDIA_ASSET_COPY_COLUMNS = MEDIA_ASSET_COLUMNS.slice(3).join(', ')

function transferAssertion(query: string, params: unknown[], message: string): BatchQuery {
  // SQLite's JSON function is deliberately used as a conditional assertion:
  // malformed JSON raises an error only when the invariant is false, which
  // aborts the surrounding D1 batch without creating schema objects.
  return {
    query: `SELECT CASE WHEN EXISTS (${query}) THEN json(?) ELSE NULL END`,
    params: [...params, message],
  }
}

function buildMediaClusterQueries(
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
  transferPrefix: string,
): BatchQuery[] {
  const mediaAssetTable = SITE_TRANSFER_REPARENT_TABLES.find(table => table === 'media_assets')
  if (!mediaAssetTable) throw new Error('Site transfer policy is missing media_assets')

  const assetColumns = MEDIA_ASSET_COLUMNS.join(', ')
  return [
    {
      query: `
        INSERT INTO ${mediaAssetTable} (${assetColumns})
        SELECT ? || id, ?, site_id, ${MEDIA_ASSET_COPY_COLUMNS}
          FROM ${mediaAssetTable}
         WHERE site_id = ? AND organization_id = ?
      `,
      params: [transferPrefix, toOrgId, siteId, fromOrgId],
    },
    // Move every media usage to recipient-scoped temporary assets before the
    // guarded asset scope update.
    {
      query: `
        UPDATE media_placements
           SET organization_id = ?, asset_id = ? || asset_id
         WHERE site_id = ? AND organization_id = ?
      `,
      params: [toOrgId, transferPrefix, siteId, fromOrgId],
    },
    {
      query: `
        UPDATE ${mediaAssetTable}
           SET organization_id = ?
         WHERE site_id = ? AND organization_id = ?
      `,
      params: [toOrgId, siteId, fromOrgId],
    },
    // Restore the original IDs after the guarded parent scope update.
    {
      query: `
        UPDATE media_placements
           SET asset_id = CASE
                 WHEN substr(asset_id, 1, length(?)) = ? THEN substr(asset_id, length(?) + 1)
                 ELSE asset_id
               END
         WHERE site_id = ? AND organization_id = ?
      `,
      params: [transferPrefix, transferPrefix, transferPrefix, siteId, toOrgId],
    },
    {
      query: `DELETE FROM ${mediaAssetTable}
               WHERE substr(id, 1, length(?)) = ? AND site_id = ? AND organization_id = ?`,
      params: [transferPrefix, transferPrefix, siteId, toOrgId],
    },
  ]
}

function buildSiteTransferAssertions(
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
  transferPrefix: string,
): BatchQuery[] {
  const assertions: BatchQuery[] = []
  for (const table of SITE_TRANSFER_REPARENT_TABLES) {
    assertions.push(transferAssertion(
      `SELECT 1 FROM ${table} WHERE site_id = ? AND organization_id = ? LIMIT 1`,
      [siteId, fromOrgId],
      `site transfer left source rows in ${table}`,
    ))
    assertions.push(transferAssertion(
      `SELECT 1 FROM ${table} WHERE site_id = ? AND (organization_id IS NULL OR organization_id != ?) LIMIT 1`,
      [siteId, toOrgId],
      `site transfer left a scope mismatch in ${table}`,
    ))
  }
  assertions.push(transferAssertion(
    `SELECT 1 FROM media_assets WHERE substr(id, 1, length(?)) = ?`,
    [transferPrefix, transferPrefix],
    'site transfer left temporary media rows',
  ))
  for (const table of SITE_TRANSFER_RETAIN_TABLES) {
    assertions.push(transferAssertion(
      `SELECT 1 FROM ${table} WHERE site_id = ? AND organization_id = ? LIMIT 1`,
      [siteId, toOrgId],
      `retained ${table} rows were reparented`,
    ))
  }
  for (const table of SITE_TRANSFER_REVOKE_TABLES) {
    if (table === 'mcp_workspace_preferences') continue
    assertions.push(transferAssertion(
      `SELECT 1 FROM ${table} WHERE site_id = ? LIMIT 1`,
      [siteId],
      `revoked ${table} rows remain`,
    ))
  }
  assertions.push(transferAssertion(
    `SELECT 1 FROM mcp_workspace_preferences
      WHERE site_id = ? OR location_id IN (SELECT id FROM business_locations WHERE site_id = ?)` ,
    [siteId, siteId],
    'mcp workspace selection still references transferred site',
  ))
  assertions.push(transferAssertion(
    `SELECT 1 FROM site_config WHERE site_id = ? AND organization_id = ?
       AND key IN ('whatsapp_phone', 'owner_notification_channels') LIMIT 1`,
    [siteId, toOrgId],
    'sensitive site configuration survived transfer',
  ))
  assertions.push(transferAssertion(
    `SELECT 1 FROM business_locations WHERE site_id = ? AND (notification_phone IS NOT NULL OR team_id IS NOT NULL) LIMIT 1`,
    [siteId],
    'location notification or team state survived transfer',
  ))
  assertions.push(transferAssertion(
    `SELECT 1 FROM sites WHERE id = ? AND (organization_id != ? OR team_id IS NOT NULL) LIMIT 1`,
    [siteId, toOrgId],
    'site organization or team scope is invalid after transfer',
  ))
  return assertions
}

/**
 * Shared ownership/projection batch used by both real transfers and the
 * development fixture reassigner. Callers must resolve the recipient
 * projection before invoking this builder so malformed state cannot result in
 * a partially-mutated transfer.
 */
export function buildSiteTransferMutationBatch(input: {
  siteId: string
  fromOrgId: string
  toOrgId: string
  projection: SiteTransferBillingProjection
  now?: string
  transferId?: string
  teamGeneration?: string | number
  requirePendingTransferId?: string
}): BatchQuery[] {
  if (input.projection.organizationId !== input.toOrgId) {
    throw new Error('Site transfer billing projection organization does not match recipient organization')
  }
  const now = input.now ?? new Date().toISOString()
  const transferId = input.transferId ?? `reassign-${input.siteId}-${now}`
  const transferPrefix = `__site_transfer_${transferId}__`
  const resourceTeamGeneration = serializeResourceTeamGeneration({
    transfer_id: transferId,
    generation: String(input.teamGeneration ?? now),
  })
  const mediaTables = new Set(['media_assets', 'media_placements'])
  const batch: BatchQuery[] = [{ query: 'PRAGMA defer_foreign_keys = ON' }]

  // The site scope is the root invariant for every transfer mutation. Check
  // the exact source owner before any child row can be reparented; an absent or
  // already-reassigned site must abort the whole D1 batch rather than relying
  // on a later mismatch assertion that cannot distinguish a missing root.
  batch.push(transferAssertion(
    `SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
    )`,
    [input.siteId, input.fromOrgId],
    'site transfer source site is missing or no longer owned by the source organization',
  ))
  batch.push(transferAssertion(
    `SELECT 1 FROM site_language_licenses WHERE site_id = ? AND status != 'disabled' LIMIT 1`,
    [input.siteId],
    'all paid site languages must be disabled before transfer',
  ))

  // The projection was read before constructing this batch. Re-check the
  // exact recipient row before any mutation so a concurrent subscription
  // transition cannot leave stale compatibility state behind.
  const billing = input.projection.organizationBilling
  const billingSnapshotQuery = billing
    ? `SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM organization_billing
          WHERE organization_id = ?
            AND stripe_customer_id IS ?
            AND stripe_subscription_id IS ?
            AND payment_status IS ?
            AND paid_through IS ?
            AND past_due_since IS ?
            AND last_paid_invoice_id IS ?
            AND last_payment_event_created IS ?
            AND last_payment_event_id IS ?
            AND access_plan IS ?
            AND access_expires_at IS ?
            AND updated_at IS ?
          LIMIT 1
       )`
    : 'SELECT 1 FROM organization_billing WHERE organization_id = ? LIMIT 1'
  const billingSnapshotParams = billing
    ? [
        input.toOrgId,
        billing.stripe_customer_id,
        billing.stripe_subscription_id,
        billing.payment_status,
        billing.paid_through,
        billing.past_due_since,
        billing.last_paid_invoice_id,
        billing.last_payment_event_created,
        billing.last_payment_event_id,
        billing.access_plan,
        billing.access_expires_at,
        billing.updated_at,
      ]
    : [input.toOrgId]
  batch.push(transferAssertion(
    billingSnapshotQuery,
    billingSnapshotParams,
    billing ? 'recipient billing projection changed during transfer' : 'recipient billing row appeared during transfer',
  ))

  if (input.requirePendingTransferId) {
    batch.push(transferAssertion(
      `SELECT 1 WHERE NOT EXISTS (
        SELECT 1 FROM site_transfer_requests
          WHERE id = ?
            AND site_id = ?
            AND from_organization_id = ?
            AND status = 'pending'
          LIMIT 1
      )`,
      [input.requirePendingTransferId, input.siteId, input.fromOrgId],
      'site transfer is no longer pending for this site and source organization',
    ))
  }
  batch.push(transferAssertion(
    `SELECT 1 FROM media_assets WHERE substr(id, 1, length(?)) = ? LIMIT 1`,
    [transferPrefix, transferPrefix],
    'site transfer temporary media prefix collides with an existing asset',
  ))

  // Site access is inherited from its organization. Transfers only reparent
  // domain state and never materialize site billing or entitlement mirrors.
  batch.push({
    query: `UPDATE sites SET organization_id = ?, team_id = NULL, updated_at = ? WHERE id = ? AND organization_id = ?`,
    params: [input.toOrgId, now, input.siteId, input.fromOrgId],
  })

  const facebookConnections = SITE_TRANSFER_REVOKE_TABLES.find(table => table === 'facebook_pages_connections')
  const googleAnalyticsConnections = SITE_TRANSFER_REVOKE_TABLES.find(table => table === 'google_analytics_connections')
  const siteLanguageLicenses = SITE_TRANSFER_REVOKE_TABLES.find(table => table === 'site_language_licenses')
  if (!facebookConnections || !googleAnalyticsConnections || !siteLanguageLicenses) {
    throw new Error('Site transfer policy is missing a revoke table')
  }
  batch.push(
    { query: `DELETE FROM ${facebookConnections} WHERE site_id = ?`, params: [input.siteId] },
    { query: `DELETE FROM ${googleAnalyticsConnections} WHERE site_id = ?`, params: [input.siteId] },
    { query: `DELETE FROM ${siteLanguageLicenses} WHERE site_id = ? AND status = 'disabled'`, params: [input.siteId] },
    { query: `UPDATE site_locales SET status = 'disabled', updated_at = ? WHERE site_id = ? AND is_source = 0`, params: [now, input.siteId] },
    {
      query: `UPDATE mcp_workspace_preferences
                 SET site_id = NULL, location_id = NULL, updated_at = ?
               WHERE site_id = ? OR location_id IN (SELECT id FROM business_locations WHERE site_id = ?)`,
      params: [now, input.siteId, input.siteId],
    },
    {
      query: `UPDATE dashboard_preferences
                 SET selected_location_id = NULL
               WHERE selected_location_id IN (SELECT id FROM business_locations WHERE site_id = ?)`,
      params: [input.siteId],
    },
    {
      query: `UPDATE chowbot_channel_state
                 SET selected_site_id = NULL, active_conversation_id = NULL,
                     pending_message_id = NULL, pending_confirmation = NULL
               WHERE selected_site_id = ?
                  OR active_conversation_id IN (
                    SELECT id FROM chowbot_conversations WHERE site_id = ?
                  )`,
      params: [input.siteId, input.siteId],
    },
    {
      query: `DELETE FROM site_config
               WHERE site_id = ? AND organization_id = ?
                 AND key IN ('whatsapp_phone', 'owner_notification_channels')`,
      params: [input.siteId, input.fromOrgId],
    },
  )

  batch.push(...buildMediaClusterQueries(input.siteId, input.fromOrgId, input.toOrgId, transferPrefix))

  batch.push({
    query: `UPDATE business_locations SET notification_phone = NULL, team_id = NULL WHERE site_id = ? AND organization_id = ?`,
    params: [input.siteId, input.fromOrgId],
  })

  // Parent rows and all ordinary business/content rows use deferred composite
  // FKs. The media cluster above is kept separate because its scope triggers
  // intentionally reject a naive media_assets organization update.
  for (const table of SITE_TRANSFER_REPARENT_TABLES) {
    if (mediaTables.has(table)) continue
    batch.push({
      query: `UPDATE ${table} SET organization_id = ? WHERE site_id = ? AND organization_id = ?`,
      params: [input.toOrgId, input.siteId, input.fromOrgId],
    })
  }

  const siteConfigTable = 'site_config'
  batch.push({
    query: `
      INSERT INTO ${siteConfigTable} (organization_id, site_id, key, value, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, key) DO UPDATE SET
        value = excluded.value, updated_at = excluded.updated_at
    `,
    params: [input.toOrgId, input.siteId, RESOURCE_TEAM_GENERATION_CONFIG_KEY, resourceTeamGeneration, now],
  })

  batch.push(...buildSiteTransferAssertions(input.siteId, input.fromOrgId, input.toOrgId, transferPrefix))

  return batch
}

export async function reassignSiteOwnership(
  db: D1Database,
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
): Promise<void> {
  const projection = await loadSiteTransferBillingProjection(db, toOrgId)
  await executeBatch(db, buildSiteTransferMutationBatch({
    siteId,
    fromOrgId,
    toOrgId,
    projection,
    transferId: `reassign-${siteId}`,
  }))
}

export async function executeSiteTransfer(
  db: D1Database,
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
  transferId: string,
  acceptedByUserId: string,
  options: {
    paymentCompletedAt?: string | null
    expectedCheckoutSessionId?: string | null
    expectedClaimingUserId?: string | null
    expectedClaimingOrganizationId?: string | null
  } = {},
): Promise<void> {
  const now = new Date().toISOString()
  const projection = await loadSiteTransferBillingProjection(db, toOrgId)
  const batch = buildSiteTransferMutationBatch({
    siteId,
    fromOrgId,
    toOrgId,
    projection,
    now,
    transferId,
    requirePendingTransferId: transferId,
  })

  // mark the transfer request complete
  const transferConditions = [
    `id = ?`,
    `status = 'pending'`,
  ]
  const transferParams: unknown[] = [transferId]
  if (options.expectedCheckoutSessionId !== undefined) {
    transferConditions.push('stripe_checkout_session_id = ?')
    transferParams.push(options.expectedCheckoutSessionId)
  }
  if (options.expectedClaimingUserId !== undefined) {
    transferConditions.push('claiming_user_id = ?')
    transferParams.push(options.expectedClaimingUserId)
  }
  if (options.expectedClaimingOrganizationId !== undefined) {
    transferConditions.push('claiming_organization_id = ?')
    transferParams.push(options.expectedClaimingOrganizationId)
  }

  batch.push({
    query: `UPDATE site_transfer_requests
         SET status = 'accepted',
             accepted_by_user_id = ?,
             claiming_user_id = ?,
             claiming_organization_id = ?,
             completed_at = ?,
             payment_completed_at = ?
         WHERE ${transferConditions.join(' AND ')}`,
    params: [
      acceptedByUserId,
      acceptedByUserId,
      toOrgId,
      now,
      options.paymentCompletedAt ?? null,
      ...transferParams,
    ],
  })
  batch.push(transferAssertion(
    `SELECT 1 WHERE changes() = 0`,
    [],
    'site transfer completion lost its pending-state compare-and-set',
  ))

  await executeBatch(db, batch)
}

export async function cancelPendingSiteTransfer(
  env: SiteTransferEnv,
  db: D1Database,
  transferId: string,
): Promise<{ cancelled: boolean; customDomainsDeleted: number; reason?: 'payment_completed' }> {
  const transfer = await queryFirst<TransferCleanupRow>(db, `
    SELECT id, site_id, from_organization_id, status, requires_payment,
           claiming_user_id, claiming_organization_id, stripe_checkout_session_id,
           custom_domains_snapshot, custom_domains_removed_at
    FROM site_transfer_requests
    WHERE id = ?
    LIMIT 1
  `, [transferId])

  const cleanupRetry = transfer?.status === 'cancelled' && Boolean(transfer.custom_domains_removed_at)
  if (!transfer || (transfer.status !== 'pending' && !cleanupRetry)) {
    return { cancelled: false, customDomainsDeleted: 0 }
  }

  let snapshotRaw = transfer.custom_domains_snapshot
  let customDomainsDeleted = 0
  const hadRemovalMarker = Boolean(transfer.custom_domains_removed_at)

  if (hadRemovalMarker && !hasTransferDomainSnapshot(snapshotRaw)) {
    throw new Error('Transfer is missing the custom-domain restoration snapshot')
  }
  // Validate the immutable legacy snapshot before any Checkout/provider work.
  // Restoration below parses again at the side-effect boundary so this guard
  // cannot be bypassed by a future caller that invokes the helper directly.
  if (hadRemovalMarker) parseTransferDomainSnapshot(snapshotRaw)

  if (transfer.status === 'pending' && transfer.requires_payment && !snapshotRaw) {
    snapshotRaw = serializeTransferDomainSnapshot(await buildTransferDomainSnapshot(db, transfer.site_id))
  }

  const checkoutSessionId = transfer.stripe_checkout_session_id
  const isClaiming = isTransferClaimSentinel(checkoutSessionId)
  const isCheckoutPending = isTransferCheckoutPending(transfer)

  // A claim sentinel can be inside the provider-create interval: Stripe may
  // already have accepted an idempotent Checkout create even though the real
  // session ID is not durable yet. Cancellation must not win that interval or
  // the newly-created Checkout could remain payable without a row that its
  // webhook is allowed to complete. The acceptance request must first bind,
  // expire, or quarantine the exact provider resource; cancellation can then
  // retry through the real-session branch below.
  if (transfer.status === 'pending' && isClaiming) {
    return { cancelled: false, customDomainsDeleted: 0 }
  }

  // A real open Checkout must be expired before the durable cancellation CAS.
  // Never report a completed or ambiguous provider state as cancellation: the
  // webhook owns a completed Checkout and can still finish the handoff.
  if (transfer.status === 'pending' && isCheckoutPending && checkoutSessionId) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured; transfer cancellation is retryable')
    }
    const { getStripe } = await import('~/server/utils/billing')
    const stripe = getStripe(env)
    let checkoutSession: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>
    try {
      checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId)
    } catch (error) {
      if (!isStripeResourceMissing(error)) throw error
      // A missing exact session cannot still be open. Proceed to the fenced
      // cancellation CAS; webhook completion cannot target a missing resource.
      checkoutSession = { id: checkoutSessionId, status: 'expired' } as typeof checkoutSession
    }

    if (checkoutSession.status === 'complete') {
      return { cancelled: false, customDomainsDeleted: 0, reason: 'payment_completed' }
    }
    if (checkoutSession.status !== 'expired') {
      if (checkoutSession.status !== 'open') {
        throw new Error(`Stripe Checkout ${checkoutSessionId} is in an ambiguous ${String(checkoutSession.status)} state`)
      }
      try {
        const expired = await stripe.checkout.sessions.expire(checkoutSessionId)
        if (expired.status !== 'expired') {
          const latest = await stripe.checkout.sessions.retrieve(checkoutSessionId)
          if (latest.status === 'complete') {
            return { cancelled: false, customDomainsDeleted: 0, reason: 'payment_completed' }
          }
          if (latest.status !== 'expired') {
            throw new Error(`Stripe Checkout ${checkoutSessionId} expiration was not proven`)
          }
        }
      } catch (error) {
        // Stripe reports a completed session as a conflict if its webhook won
        // after the retrieve. Re-read once and keep the transfer pending for
        // webhook completion; all other failures remain retryable.
        try {
          const latest = await stripe.checkout.sessions.retrieve(checkoutSessionId)
          if (latest.status === 'complete') {
            return { cancelled: false, customDomainsDeleted: 0, reason: 'payment_completed' }
          }
        } catch {
          // Preserve the original provider error below; ambiguity must not be
          // converted into a successful cancellation.
        }
        throw error
      }
    }

    const cancelResult = await execute(db, `
      UPDATE site_transfer_requests
      SET status = 'cancelled'
      WHERE id = ? AND status = 'pending'
        AND stripe_checkout_session_id = ?
        AND claiming_user_id = ?
        AND claiming_organization_id = ?
    `, [
      transferId,
      checkoutSessionId,
      transfer.claiming_user_id,
      transfer.claiming_organization_id,
    ])
    if ((cancelResult.meta?.changes ?? 0) === 0) {
      return { cancelled: false, customDomainsDeleted: 0 }
    }
  }

  if (transfer.status === 'pending' && !isClaiming && !isCheckoutPending && checkoutSessionId) {
    throw new Error('Transfer has an unowned legacy Checkout session; cancellation is retryable')
  }

  if (transfer.status === 'pending' && !isClaiming && !isCheckoutPending) {
    // Claim cancellation before any external Cloudflare restoration. The
    // cancelled state is durable and terminal for acceptance, while the
    // removed-at marker remains set until the restoration saga succeeds.
    const cancelResult = await execute(db, `
      UPDATE site_transfer_requests
      SET status = 'cancelled',
          custom_domains_snapshot = COALESCE(custom_domains_snapshot, ?)
      WHERE id = ? AND status = 'pending'
        AND stripe_checkout_session_id IS NULL
    `, [snapshotRaw ?? null, transferId])

    if ((cancelResult.meta?.changes ?? 0) === 0) {
      return { cancelled: false, customDomainsDeleted: 0 }
    }
  }

  if (transfer.requires_payment && transfer.custom_domains_removed_at) {
    const removedAt = transfer.custom_domains_removed_at
    // The source row is now durably cancelled. If this external saga fails,
    // leave the marker in place so an operator can retry only this cleanup
    // path without reopening acceptance.
    customDomainsDeleted = (await restoreSiteCustomDomains(
      env,
      db,
      transfer.site_id,
      transfer.from_organization_id,
      snapshotRaw,
      'system',
    ))

    const cleanupResult = await execute(db, `
      UPDATE site_transfer_requests
      SET custom_domains_removed_at = NULL
      WHERE id = ? AND status = 'cancelled' AND custom_domains_removed_at = ?
    `, [transferId, removedAt])

    // Another cleanup retry may have won the conditional clear while this
    // worker was restoring. The row is still terminally cancelled either way.
    if ((cleanupResult.meta?.changes ?? 0) === 0) return { cancelled: true, customDomainsDeleted }
  }

  return { cancelled: true, customDomainsDeleted }
}

export async function completePaidSiteTransfer(
  env: SiteTransferEnv,
  db: D1Database,
  transferId: string,
): Promise<{ completed: boolean; restoredDomains: number }> {
  const transfer = await queryFirst<TransferCompletionRow>(db, `
    SELECT id, site_id, from_organization_id, status,
           claiming_user_id, claiming_organization_id,
           stripe_checkout_session_id,
           custom_domains_snapshot, custom_domains_removed_at, payment_completed_at
    FROM site_transfer_requests
    WHERE id = ?
    LIMIT 1
  `, [transferId])

  if (!transfer) {
    return { completed: false, restoredDomains: 0 }
  }

  if (transfer.status !== 'pending' && transfer.status !== 'accepted') {
    return { completed: false, restoredDomains: 0 }
  }
  if (transfer.status === 'accepted' && transfer.payment_completed_at) {
    return { completed: false, restoredDomains: 0 }
  }

  if (!transfer.claiming_user_id || !transfer.claiming_organization_id) {
    throw new Error('Transfer is missing claiming user or organization')
  }
  if (transfer.status === 'pending' && (
    !transfer.stripe_checkout_session_id
    || (!isTransferClaimSentinel(transfer.stripe_checkout_session_id) && !isTransferCheckoutPending(transfer))
  )) {
    throw new Error('Transfer is missing an explicit claim session')
  }

  if (transfer.custom_domains_removed_at && !hasTransferDomainSnapshot(transfer.custom_domains_snapshot)) {
    // A removal marker without its immutable snapshot cannot be safely
    // restored. Keep payment incomplete so an operator can repair the legacy
    // record instead of silently clearing the marker and losing the domain.
    throw new Error('Transfer is missing the custom-domain restoration snapshot')
  }
  if (transfer.custom_domains_removed_at) parseTransferDomainSnapshot(transfer.custom_domains_snapshot)

  if (transfer.status === 'pending') {
    try {
      await executeSiteTransfer(
        db,
        transfer.site_id,
        transfer.from_organization_id,
        transfer.claiming_organization_id,
        transfer.id,
        transfer.claiming_user_id,
        {
          expectedCheckoutSessionId: transfer.stripe_checkout_session_id,
          expectedClaimingUserId: transfer.claiming_user_id,
          expectedClaimingOrganizationId: transfer.claiming_organization_id,
        },
      )
    } catch (error) {
      // A cancellation or another fulfillment may win the pending-state CAS
      // while this webhook was waiting on its projection read. Re-read the
      // row and treat that terminal race as an idempotent no-op; real
      // invariant failures (for example a media-prefix collision) remain
      // retryable errors.
      const latest = await queryFirst<Pick<TransferCompletionRow, 'status' | 'payment_completed_at'>>(
        db,
        `SELECT status, payment_completed_at FROM site_transfer_requests WHERE id = ? LIMIT 1`,
        [transfer.id],
      )
      if (!latest || latest.status !== 'pending') {
        return { completed: false, restoredDomains: 0 }
      }
      throw error
    }
  }

  let restoredDomains = 0
  if (transfer.custom_domains_removed_at && transfer.custom_domains_snapshot) {
    restoredDomains = await restoreSiteCustomDomains(
      env,
      db,
      transfer.site_id,
      transfer.claiming_organization_id,
      transfer.custom_domains_snapshot,
      'system',
      transfer.claiming_user_id,
    )
  }

  const paymentClaim = await execute(db, `
    UPDATE site_transfer_requests
    SET payment_completed_at = ?,
        custom_domains_removed_at = NULL
    WHERE id = ? AND status = 'accepted' AND payment_completed_at IS NULL
  `, [new Date().toISOString(), transfer.id])

  if ((paymentClaim.meta?.changes ?? 0) === 0) {
    return { completed: false, restoredDomains: 0 }
  }

  return { completed: true, restoredDomains }
}

function reminderThresholdForCount(reminderCount: number): number {
  if (reminderCount < REMINDER_THRESHOLDS_DAYS.length) {
    const threshold = REMINDER_THRESHOLDS_DAYS[reminderCount]
    if (typeof threshold === 'number') return threshold
    return REMINDER_THRESHOLDS_DAYS[REMINDER_THRESHOLDS_DAYS.length - 1] as number
  }
  return 7 + (reminderCount - 2) * 7
}

export async function processSiteTransferReminders(
  env: SiteTransferEnv,
  db: D1Database,
  opts: { force?: boolean; now?: Date } = {},
): Promise<{ reminded: number; paused_domains: number; checked: number }> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const transfers = await queryAll<TransferReminderRow>(db, `
    SELECT r.id, r.site_id, r.from_organization_id, r.to_email, r.token, r.created_at,
           r.invited_plan, r.invited_domain, r.reminder_count, r.requires_payment,
           r.custom_domains_snapshot, r.custom_domains_removed_at,
           s.brand_name AS site_name
    FROM site_transfer_requests r
    JOIN sites s ON s.id = r.site_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `)

  let checked = 0
  let reminded = 0
  // A reminder is informational only. The source owner keeps control of the
  // live domain while a handoff is pending; domain restoration/deletion belongs
  // to the acceptance or cancellation saga, where it can be compare-and-set
  // fenced against a competing terminal transition.
  const pausedDomains = 0

  for (const transfer of transfers || []) {
    checked += 1
    const createdAt = new Date(transfer.created_at)
    const daysPending = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS))
    const reminderCount = Math.max(0, Number(transfer.reminder_count || 0))

    const threshold = reminderThresholdForCount(reminderCount)
    if (!opts.force && daysPending < threshold) continue

    await notifySiteTransferReminder(env, db, {
      organizationId: transfer.from_organization_id,
      siteId: transfer.site_id,
      toEmail: transfer.to_email,
      siteName: transfer.site_name || transfer.site_id,
      transferUrl: `https://${platformDomain(env)}/transfer/${transfer.token}`,
      invitedPlan: transfer.invited_plan,
      invitedDomain: transfer.invited_domain,
      daysPending,
      customDomainsPaused: Boolean(transfer.requires_payment && transfer.custom_domains_removed_at),
    })

    const reminderResult = await execute(db, `
      UPDATE site_transfer_requests
      SET last_reminder_at = ?, reminder_count = COALESCE(reminder_count, 0) + 1
      WHERE id = ? AND status = 'pending'
    `, [nowIso, transfer.id])
    if ((reminderResult.meta?.changes ?? 0) > 0) reminded += 1
  }

  return { reminded, paused_domains: pausedDomains, checked }
}
