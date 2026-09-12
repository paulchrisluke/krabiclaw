// Core site creation logic shared by site creation entry points. The target
// organization is always an explicit input from the caller — this module never
// picks one from the user's memberships. Handles the same-org retry, subdomain
// uniqueness, and seeding.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain, isSystemSubdomainSpent } from '~/server/utils/domains'
import { execute, executeBatch, queryFirst } from '~/server/db'
import { ALL_VERTICALS, type SiteVertical } from '~/utils/vertical-copy'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { ensureSiteTeam, isOrganizationWideRole, organizationAdapter, type OrganizationAdapter } from '~/server/utils/member-access'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

type SetupEnv = CloudflareEnv

interface ExistingSubdomainSiteRow {
  id: string
  organization_id: string
  onboarding_status: string | null
}

const SITE_CREATION_MARKER_KEY = '__krabiclaw_site_creation_marker'

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
export const VALID_VERTICALS: SiteVertical[] = ALL_VERTICALS

export interface SiteCreationResult {
  status: number
  data: Record<string, unknown>
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function markSiteCreationFailed(db: D1Database, siteId: string, cause: unknown): Promise<Error> {
  try {
    await execute(db, `UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), siteId])
  } catch (cleanupError) {
    return new AggregateError(
      [asError(cause), asError(cleanupError)],
      `Site ${siteId} setup failed and its failure status could not be persisted`,
    )
  }
  return asError(cause)
}

// Registry-driven: the template (and therefore theme_id) a site gets is derived
// from the same publicTemplateRegistry that already drives tenant routing/rendering
// (utils/template-registry.ts) — this is the only place site-creation decides a
// theme_id, so a future third template only needs a new registry entry, not a
// second hardcoded vertical-to-theme switch here.
function resolveThemeId(vertical: SiteVertical): string {
  return resolvePublicTemplate({ vertical }).themeId
}

export async function runSiteCreation(
  env: SetupEnv,
  db: D1Database,
  userId: string,
  params: { organizationId: string; name: string; subdomain: string; vertical: SiteVertical; activate?: boolean },
): Promise<SiteCreationResult> {
  const { organizationId, name, vertical } = params
  const normalizedSubdomain = params.subdomain.toLowerCase()
  let siteId = ''

  try {
    const adapter = await organizationAdapter(env)
    const member = await adapter.findMemberByOrgId({ userId, organizationId })
    if (!member || !isOrganizationWideRole(String(member.role))) {
      return { status: 403, data: { error: 'Organization-level access required to create a site in this organization' } }
    }

    const themeId = resolveThemeId(vertical)

    const existingSubdomain = await queryFirst<ExistingSubdomainSiteRow>(db, `
      SELECT id, organization_id, onboarding_status FROM sites WHERE subdomain = ? LIMIT 1
    `, [normalizedSubdomain])
    if (existingSubdomain) {
      const isRetryable = existingSubdomain.organization_id === organizationId
        && (existingSubdomain.onboarding_status === 'pending' || existingSubdomain.onboarding_status === 'failed')
      if (!isRetryable) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      // Retry: the same subdomain in the same explicit organization still has a
      // pending/failed site from a previous attempt. It may have been created
      // under a stale default (theme_id='saya-theme-v1', vertical='restaurant') —
      // correct both here so a professional-service retry can never be left on Saya.
      siteId = existingSubdomain.id
      await execute(db, `UPDATE sites SET theme_id = ?, vertical = ?, updated_at = ? WHERE id = ?`,
        [themeId, vertical, new Date().toISOString(), siteId])
      await ensureSiteTeam(db, { env, organizationId, siteId, name })
      return await performSeeding(env, db, siteId, organizationId, name, vertical, normalizedSubdomain, params.activate !== false)
    }
    if (await isSystemSubdomainSpent(env, db, normalizedSubdomain)) {
      return { status: 409, data: { error: 'This subdomain is permanently unavailable' } }
    }

    siteId = crypto.randomUUID()
    try {
      const now = new Date().toISOString()
      await executeBatch(db, [
        {
          query: `
            INSERT INTO sites
              (id, organization_id, theme_id, vertical, slug, subdomain, brand_name, default_currency, status, onboarding_status, analytics_data_start_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'active', 'pending', ?, ?, ?)
          `,
          params: [siteId, organizationId, themeId, vertical, normalizedSubdomain, normalizedSubdomain, name, now, now, now],
        },
        {
          query: `
            INSERT INTO site_locales
              (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
            VALUES (?, ?, ?, 'en', 'English', 1, 'published', ?, ?)
          `,
          params: [`locale::${organizationId}::${siteId}::en`, organizationId, siteId, now, now],
        },
      ], { operation: 'create site and source locale' })
    } catch (siteError) {
      const msg = siteError instanceof Error ? siteError.message : ''
      if (msg.includes('UNIQUE constraint failed')) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      throw siteError
    }
    await ensureSiteTeam(db, { env, organizationId, siteId, name })

    return await performSeeding(env, db, siteId, organizationId, name, vertical, normalizedSubdomain, params.activate !== false)

  } catch (error) {
    console.error('Site creation failed:', asError(error))
    const failure = siteId ? await markSiteCreationFailed(db, siteId, error) : asError(error)
    return { status: 500, data: { error: failure.message } }
  }
}

/** Makes a pending site public. */
export async function activateSite(db: D1Database, siteId: string): Promise<void> {
  await execute(db, `UPDATE sites SET onboarding_status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), siteId])
}

// Creates a brand-new organization owned by `userId`. Callers decide when a new
// organization is wanted (the "New Organization" onboarding entry point); this
// never reuses or renames an existing one.
export async function createOrganizationForSite(env: CloudflareEnv, userId: string, name: string) {
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
        metadata: { [SITE_CREATION_MARKER_KEY]: creationMarker },
      },
    })
    const created = await adapter.findOrganizationBySlug(slug)
    if (created?.id === organization.id) {
      const metadata = organizationMetadata(created.metadata)
      if (metadata[SITE_CREATION_MARKER_KEY] === creationMarker) {
        Reflect.deleteProperty(metadata, SITE_CREATION_MARKER_KEY)
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
      if (metadata[SITE_CREATION_MARKER_KEY] === creationMarker
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
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

async function performSeeding(
  env: SetupEnv,
  db: D1Database,
  siteId: string,
  organizationId: string,
  name: string,
  vertical: SiteVertical,
  subdomain: string,
  // Onboarding creates the site before the owner has finished answering, so it
  // stays pending: the address is reserved and the site is previewable with its
  // preview token, but it is not public until activateSite() is called.
  activate: boolean,
): Promise<SiteCreationResult> {
  const locationId = await seedNewSite(db, { organizationId, siteId, name, vertical })

  await createSystemSubdomain(env, db, siteId, organizationId, subdomain)

  if (activate) await activateSite(db, siteId)

  return {
    status: 200,
    data: {
      siteId,
      organizationId,
      subdomain,
      locationId,
      message: 'Site created successfully',
    }
  }
}
