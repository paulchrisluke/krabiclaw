// Turning a bare Better Auth organization into a serving tenant: its address,
// its template, its source locale and its seeded structure. The target
// organization is always an explicit input from the caller — this module never
// picks one from the user's memberships. Handles the same-organization retry,
// subdomain uniqueness, and seeding.
import { seedNewOrganization } from '~/server/utils/organization-seed'
import { createSystemSubdomain, isSystemSubdomainSpent } from '~/server/utils/domains'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { ALL_VERTICALS, type OrganizationVertical } from '~/utils/vertical-copy'
import type { CurrencyCode } from '~/shared/currencies'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { isOrganizationWideRole, organizationAdapter, type OrganizationAdapter } from '~/server/utils/member-access'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

type SetupEnv = CloudflareEnv

interface ExistingSubdomainRow {
  id: string
  onboarding_status: string | null
}

const ORGANIZATION_CREATION_MARKER_KEY = '__krabiclaw_organization_creation_marker'

interface CreateOrganizationApi {
  createOrganization(_input: {
    body: {
      name: string
      slug: string
      userId: string
      keepCurrentActiveOrganization: true
      metadata: Record<string, string>
    }
  }): Promise<{ id: string }>
}

// Re-exported for existing callers (endpoint validation, tests) — the
// canonical list itself lives in utils/vertical-copy.ts (ALL_VERTICALS) so a
// third supported vertical only needs one array to update, not a duplicate
// here plus one in every UI vertical picker.
export const VALID_VERTICALS: OrganizationVertical[] = ALL_VERTICALS

export interface OrganizationProvisioningResult {
  status: number
  data: Record<string, unknown>
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function markProvisioningFailed(db: D1Database, organizationId: string, cause: unknown): Promise<Error> {
  try {
    await execute(db, `UPDATE organization SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), organizationId])
  } catch (cleanupError) {
    return new AggregateError(
      [asError(cause), asError(cleanupError)],
      `Organization ${organizationId} setup failed and its failure status could not be persisted`,
    )
  }
  return asError(cause)
}

// Registry-driven: the template (and therefore theme_id) a tenant gets is
// derived from the same publicTemplateRegistry that already drives tenant
// routing/rendering (utils/template-registry.ts) — this is the only place
// provisioning decides a theme_id, so a future third template only needs a new
// registry entry, not a second hardcoded vertical-to-theme switch here.
function resolveThemeId(vertical: OrganizationVertical): string {
  return resolvePublicTemplate({ vertical }).themeId
}

export async function provisionOrganization(
  env: SetupEnv,
  db: D1Database,
  userId: string,
  // `defaultCurrency` is the owner's answer or null. A tenant that goes live on
  // creation has to carry one; onboarding's first save has not asked yet, and
  // stores null until the currency step answers it.
  params: { organizationId: string; name: string; subdomain: string; vertical: OrganizationVertical; defaultCurrency: CurrencyCode | null; activate?: boolean },
): Promise<OrganizationProvisioningResult> {
  const { organizationId, name, vertical, defaultCurrency } = params
  const normalizedSubdomain = params.subdomain.toLowerCase()

  try {
    const adapter = await organizationAdapter(env)
    const member = await adapter.findMemberByOrgId({ userId, organizationId })
    if (!member || !isOrganizationWideRole(String(member.role))) {
      return { status: 403, data: { error: 'Organization-level access required to provision this organization' } }
    }

    const themeId = resolveThemeId(vertical)
    const now = new Date().toISOString()

    const existingSubdomain = await queryFirst<ExistingSubdomainRow>(db, `
      SELECT id, onboarding_status FROM organization WHERE subdomain = ? LIMIT 1
    `, [normalizedSubdomain])
    if (existingSubdomain) {
      const isRetryable = existingSubdomain.id === organizationId
        && (existingSubdomain.onboarding_status === 'pending' || existingSubdomain.onboarding_status === 'failed')
      if (!isRetryable) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      // Retry: the same subdomain in the same explicit organization is still
      // pending/failed from a previous attempt. It may have been left under a
      // stale default (theme_id='saya-theme-v1', vertical='restaurant') —
      // correct both here so a professional-service retry can never be left on Saya.
      await execute(db, `UPDATE organization SET theme_id = ?, vertical = ?, updated_at = ? WHERE id = ?`,
        [themeId, vertical, now, organizationId])
      return await performSeeding(env, db, organizationId, name, vertical, normalizedSubdomain, params.activate !== false)
    }
    // The guard above answers "is this subdomain taken", which was the only
    // question while provisioning inserted a `organizations` row: a second run made a
    // second row and the organization was untouched. Provisioning now writes
    // the organization itself, so a run naming a different subdomain rewrites a
    // live tenant's address, status and vertical in place. An organization that
    // already carries one is already provisioned, and re-provisioning it is
    // refused rather than performed.
    const target = await queryFirst<{ subdomain: string | null }>(db, `
      SELECT subdomain FROM organization WHERE id = ? LIMIT 1
    `, [organizationId])
    if (target?.subdomain && target.subdomain !== normalizedSubdomain) {
      return { status: 409, data: { error: 'This organization is already provisioned' } }
    }

    if (await isSystemSubdomainSpent(env, db, normalizedSubdomain)) {
      return { status: 409, data: { error: 'This subdomain is permanently unavailable' } }
    }

    try {
      await executeBatch(db, [
        {
          query: `
            UPDATE organization
               SET theme_id = ?, vertical = ?, subdomain = ?, default_currency = ?,
                   status = 'active', onboarding_status = 'pending',
                   analytics_data_start_at = COALESCE(analytics_data_start_at, ?), updated_at = ?
             WHERE id = ?
          `,
          params: [themeId, vertical, normalizedSubdomain, defaultCurrency, now, now, organizationId],
        },
        {
          query: `
            INSERT OR IGNORE INTO organization_locales
              (id, organization_id, locale, label, is_source, status, created_at, updated_at)
            VALUES (?, ?, 'en', 'English', 1, 'published', ?, ?)
          `,
          params: [`locale::${organizationId}::en`, organizationId, now, now],
        },
      ], { operation: 'provision organization and source locale' })
    } catch (provisioningError) {
      const msg = provisioningError instanceof Error ? provisioningError.message : ''
      if (msg.includes('UNIQUE constraint failed')) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      throw provisioningError
    }

    return await performSeeding(env, db, organizationId, name, vertical, normalizedSubdomain, params.activate !== false)

  } catch (error) {
    console.error('Organization provisioning failed:', asError(error))
    const failure = await markProvisioningFailed(db, organizationId, error)
    return { status: 500, data: { error: failure.message } }
  }
}

/** Makes a pending tenant public. */
export async function activateOrganization(db: D1Database, organizationId: string): Promise<void> {
  await execute(db, `UPDATE organization SET onboarding_status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), organizationId])
}

// Creates a brand-new organization owned by `userId`. Callers decide when a new
// organization is wanted (the "New Organization" onboarding entry point); this
// never reuses or renames an existing one.
export async function createOrganization(env: CloudflareEnv, userId: string, name: string) {
  const adapter = await organizationAdapter(env)
  const slug = await uniqueOrganizationSlug(adapter, name)
  const auth = createAuth(env)
  const organizationApi = auth.api as unknown as CreateOrganizationApi
  const creationMarker = crypto.randomUUID()
  try {
    const organization = await organizationApi.createOrganization({
      body: {
        name,
        slug,
        userId,
        keepCurrentActiveOrganization: true,
        metadata: { [ORGANIZATION_CREATION_MARKER_KEY]: creationMarker },
      },
    })
    const created = await adapter.findOrganizationBySlug(slug)
    if (created?.id === organization.id) {
      const metadata = organizationMetadata(created.metadata)
      if (metadata[ORGANIZATION_CREATION_MARKER_KEY] === creationMarker) {
        Reflect.deleteProperty(metadata, ORGANIZATION_CREATION_MARKER_KEY)
        await adapter.updateOrganization(organization.id, {
          metadata,
        })
      }
    }
    return { organizationId: organization.id }
  } catch (error) {
    // Better Auth creates the organization before adding its owner member.
    // If that second step fails, locate the just-created unique slug and
    // remove it only when the expected owner member is absent. Never delete an
    // organization that already has this user as its owner.
    let partial
    try {
      partial = await adapter.findOrganizationBySlug(slug)
    } catch (lookupError) {
      throw new AggregateError(
        [asError(error), asError(lookupError)],
        `Organization creation failed and partial organization ${slug} could not be inspected`, { cause: lookupError },
      )
    }
    if (partial) {
      let expectedOwner
      try {
        expectedOwner = await adapter.findMemberByOrgId({
          userId,
          organizationId: partial.id,
        })
      } catch (lookupError) {
        throw new AggregateError(
          [asError(error), asError(lookupError)],
          `Organization creation failed and owner state for ${partial.id} could not be inspected`, { cause: lookupError },
        )
      }
      const metadata = organizationMetadata(partial.metadata)
      if (metadata[ORGANIZATION_CREATION_MARKER_KEY] === creationMarker
        && (!expectedOwner || String(expectedOwner.role) !== 'owner')) {
        try {
          await adapter.deleteOrganization(partial.id)
        } catch (cleanupError) {
          throw new AggregateError(
            [asError(error), asError(cleanupError)],
            `Organization creation failed and partial organization ${partial.id} could not be deleted`, { cause: cleanupError },
          )
        }
      }
    }
    throw error
  }
}

function organizationMetadata(value: unknown): Record<string, unknown> {
  if (isMetadataRecord(value)) return { ...value }
  if (typeof value !== 'string') return {}
  const parsed: unknown = JSON.parse(value)
  if (!isMetadataRecord(parsed)) throw new Error('Stored organization metadata is invalid')
  return { ...parsed }
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function uniqueOrganizationSlug(adapter: OrganizationAdapter, name: string) {
  const base = slugifyName(name)
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await adapter.findOrganizationBySlug(slug)
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}


function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'organization'
}

async function performSeeding(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  name: string,
  vertical: OrganizationVertical,
  subdomain: string,
  // Onboarding provisions the tenant before the owner has finished answering,
  // so it stays pending: the address is reserved and the tenant is previewable
  // with its preview token, but it is not public until activateOrganization()
  // is called.
  activate: boolean,
): Promise<OrganizationProvisioningResult> {
  const locationId = await seedNewOrganization(db, { env: env as CloudflareEnv, organizationId, name, vertical })

  await createSystemSubdomain(env, db, organizationId, subdomain)

  if (activate) await activateOrganization(db, organizationId)

  return {
    status: 200,
    data: {
      organizationId,
      subdomain,
      locationId,
      message: 'Organization provisioned successfully',
    }
  }
}
