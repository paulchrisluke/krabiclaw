import { getFieldDef } from '~/config/content-registry'
import { hasEntitlement } from '~/server/utils/billing'
import { getGoogleBusinessAccounts, getGoogleBusinessAuthUrl, getGoogleBusinessConnection, getGoogleBusinessLocations, syncGoogleLocations } from '~/server/utils/google-business'
import { normalizePhone, getOrgWhatsAppPhone, setOrgWhatsAppPhone } from '~/server/utils/whatsapp'
import { upsertDraftContent, getDraftStatus, publishAllDrafts, publishDrafts, discardAllDrafts, discardDrafts, deleteSiteAndDraftContentField, getDraftContent, getPageContent } from '~/server/utils/content-management'
import type { SiteContent } from '~/server/utils/content-management'
import type { CloudflareEnv } from '~/server/utils/auth'
import { signOAuthState } from '~/server/utils/encryption'

export async function listSitesForUser(db: D1Database, userId: string, isPlatformAdmin: boolean) {
  const orgRows = await db.prepare(`
    SELECT o.id
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
  `).bind(userId).all<{ id: string }>()

  const orgIds = (orgRows.results ?? []).map((row) => row.id).filter(Boolean)
  if (!orgIds.length) return []

  const placeholders = orgIds.map(() => '?').join(', ')
  const rows = await db.prepare(`
    SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
           s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
    FROM sites s
    WHERE s.organization_id IN (${placeholders})
    ORDER BY s.created_at DESC
  `).bind(...orgIds).all()

  void isPlatformAdmin
  return rows.results ?? []
}

export async function getSiteForMcp(db: D1Database, siteId: string, userId: string) {
  const site = await db.prepare(`
    SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
           s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `).bind(siteId, userId).first()

  if (!site) throw new Error('Site not found or access denied')
  return site
}

export async function getLocationForMcp(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
) {
  const row = await db.prepare(`
    SELECT bl.*, img.public_url AS hero_public_url, img.kind AS hero_kind
    FROM business_locations bl
    LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
    WHERE bl.id = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `).bind(locationId, organizationId, siteId).first()

  if (!row) throw new Error('Location not found')
  return {
    ...row,
    address: safeJson(row.address),
    opening_hours: safeJson(row.opening_hours),
    categories: safeJson(row.categories),
    is_primary: Boolean(row.is_primary),
  }
}

export async function getNotificationsSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  return {
    whatsapp_phone: await getOrgWhatsAppPhone(db, organizationId, siteId),
  }
}

export async function updateNotificationsSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
  whatsappPhone: string,
) {
  await setOrgWhatsAppPhone(db, organizationId, siteId, whatsappPhone.trim())
  return {
    whatsapp_phone: normalizePhone(whatsappPhone.trim()),
  }
}

export async function listContactSubmissions(db: D1Database, siteId: string) {
  const rows = await db.prepare(`
    SELECT * FROM contact_submissions
    WHERE site_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(siteId).all()

  return rows.results ?? []
}

export async function updateContactSubmissionStatus(
  db: D1Database,
  siteId: string,
  submissionId: string,
  status: string,
) {
  if (!['new', 'read', 'replied'].includes(status)) {
    throw new Error('Invalid contact submission status')
  }

  const result = await db.prepare(`
    UPDATE contact_submissions
    SET status = ?
    WHERE id = ? AND site_id = ?
  `).bind(status, submissionId, siteId).run()

  if (!result.meta.changes) throw new Error('Submission not found')
  return { updated: true, submission_id: submissionId, status }
}

export async function listReservationSubmissions(db: D1Database, siteId: string) {
  const rows = await db.prepare(`
    SELECT * FROM reservation_submissions
    WHERE site_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(siteId).all()

  return rows.results ?? []
}

export async function updateReservationSubmissionStatus(
  db: D1Database,
  siteId: string,
  submissionId: string,
  status: string,
) {
  if (!['new', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    throw new Error('Invalid reservation submission status')
  }

  const result = await db.prepare(`
    UPDATE reservation_submissions
    SET status = ?
    WHERE id = ? AND site_id = ?
  `).bind(status, submissionId, siteId).run()

  if (!result.meta.changes) throw new Error('Reservation not found')
  return { updated: true, submission_id: submissionId, status }
}

export async function updateLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  qaId: string,
  updates: Record<string, unknown>,
) {
  const sets: string[] = ['updated_at = ?']
  const params: Array<string | number | null> = [new Date().toISOString()]

  if (updates.question !== undefined) {
    const value = String(updates.question ?? '').trim()
    if (!value) throw new Error('Question is required')
    sets.push('question = ?')
    params.push(value.slice(0, 500))
  }
  if (updates.answer !== undefined) {
    sets.push('answer = ?')
    params.push(stringOrNull(updates.answer, 2000))
  }
  if (updates.question_author !== undefined) {
    sets.push('question_author = ?')
    params.push(stringOrNull(updates.question_author, 120))
  }
  if (updates.is_owner_answer !== undefined) {
    sets.push('is_owner_answer = ?')
    params.push(booleanInt(updates.is_owner_answer))
  }
  if (updates.status !== undefined) {
    const value = String(updates.status)
    if (!['published', 'hidden'].includes(value)) throw new Error('Invalid Q&A status')
    sets.push('status = ?')
    params.push(value)
  }
  if (updates.sort_order !== undefined) {
    const value = Number(updates.sort_order)
    if (!Number.isInteger(value)) throw new Error('sort_order must be an integer')
    sets.push('sort_order = ?')
    params.push(value)
  }

  if (sets.length === 1) throw new Error('No update fields provided')

  params.push(qaId, locationId, siteId, organizationId)
  const result = await db.prepare(`
    UPDATE location_qa
    SET ${sets.join(', ')}
    WHERE id = ? AND location_id = ? AND site_id = ? AND organization_id = ?
  `).bind(...params).run()

  if (!result.meta.changes) throw new Error('Q&A not found')
  return { updated: true, qa_id: qaId }
}

export async function reorderLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  updates: Array<{ id: string; sort_order: number }>,
) {
  if (updates.length !== 2 || updates[0]?.id === updates[1]?.id) {
    throw new Error('Two distinct Q&A reorder updates are required')
  }

  const [first, second] = updates
  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE location_qa
    SET sort_order = CASE id
        WHEN ? THEN ?
        WHEN ? THEN ?
        ELSE sort_order
      END,
      updated_at = ?
    WHERE location_id = ?
      AND site_id = ?
      AND organization_id = ?
      AND id IN (?, ?)
  `).bind(
    first!.id,
    first!.sort_order,
    second!.id,
    second!.sort_order,
    now,
    locationId,
    siteId,
    organizationId,
    first!.id,
    second!.id,
  ).run()

  if (Number(result.meta.changes ?? 0) !== 2) {
    throw new Error('Q&A reorder targets not found')
  }
  return { updated: true }
}

export async function listLocationReviews(db: D1Database, siteId: string, locationId: string) {
  const rows = await db.prepare(`
    SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
           owner_reply_at, photo_urls, source, status, created_at, updated_at
    FROM reviews
    WHERE site_id = ? AND location_id = ?
    ORDER BY created_at DESC
  `).bind(siteId, locationId).all()

  return (rows.results ?? []).map((review) => ({
    ...review,
    photo_urls: safeJsonArray(review.photo_urls),
  }))
}

export async function listWorkRequestsForOrganization(db: D1Database, organizationId: string) {
  const rows = await db.prepare(`
    SELECT id, type, title, description, status, priority, source, notes, created_at, updated_at, completed_at
    FROM work_requests
    WHERE organization_id = ?
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 100
  `).bind(organizationId).all()

  return rows.results ?? []
}

export async function saveContentDraft(
  db: D1Database,
  organizationId: string,
  siteId: string,
  userId: string,
  input: {
    page: string
    changes: Record<string, string>
    location_id?: string | null
  },
) {
  const locationId = input.location_id ?? undefined
  const draftIdPrefix = ['draft', organizationId, siteId, locationId || 'site', input.page].join('::')
  const heroFields = ['hero.title', 'hero.subtitle', 'hero.image', 'hero.video']
  const heroChange: Record<string, string | undefined> = {}
  let hasHeroChange = false

  const isLocationHeroPage = input.page === 'location' && !!locationId
  const locationHeroImageId = isLocationHeroPage && 'hero.image' in input.changes ? (input.changes['hero.image'] || null) : undefined
  const locationHeroVideoId = isLocationHeroPage && 'hero.video' in input.changes ? (input.changes['hero.video'] || null) : undefined

  if (locationHeroImageId !== undefined || locationHeroVideoId !== undefined) {
    const setClauses: string[] = []
    const bindParams: (string | null)[] = []
    if (locationHeroImageId !== undefined) {
      setClauses.push('hero_image_asset_id = ?')
      bindParams.push(locationHeroImageId)
    }
    if (locationHeroVideoId !== undefined) {
      setClauses.push('hero_video_asset_id = ?')
      bindParams.push(locationHeroVideoId)
    }
    setClauses.push('updated_at = ?')
    bindParams.push(new Date().toISOString(), locationId!, siteId)
    await db.prepare(`UPDATE business_locations SET ${setClauses.join(', ')} WHERE id = ? AND site_id = ?`).bind(...bindParams).run()
  }

  for (const [field, value] of Object.entries(input.changes)) {
    if (isLocationHeroPage && (field === 'hero.image' || field === 'hero.video')) continue

    if (heroFields.includes(field)) {
      hasHeroChange = true
      if (field === 'hero.title') heroChange.hero_title = value || undefined
      if (field === 'hero.subtitle') heroChange.hero_subtitle = value || undefined
      if (field === 'hero.image') heroChange.hero_image_asset_id = value || undefined
      if (field === 'hero.video') heroChange.hero_video_asset_id = value || undefined
      continue
    }

    const fieldDef = getFieldDef(input.page, field)
    await upsertDraftContent(db, {
      id: `${draftIdPrefix}::${field}`,
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
      page: input.page,
      field,
      value,
      type: fieldDef?.type || 'text',
      source: 'manual',
      content: value,
      hero_title: undefined,
      hero_subtitle: undefined,
      hero_image_asset_id: undefined,
      hero_video_asset_id: undefined,
    })
  }

  if (hasHeroChange) {
    await upsertDraftContent(db, {
      id: `${draftIdPrefix}::hero`,
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
      page: input.page,
      field: 'hero',
      type: 'text',
      source: 'manual',
      content: undefined,
      updated_at: undefined as never,
      ...(heroChange as Partial<SiteContent>),
    } as Omit<SiteContent, 'updated_at'>)
  }

  return { success: true, page: input.page, changes_count: Object.keys(input.changes).length }
}

export async function getMergedEditorContent(
  db: D1Database,
  organizationId: string,
  siteId: string,
  page: string,
  locationId?: string,
) {
  const publishedContent = await getPageContent(db, organizationId, siteId, page, locationId)
  const drafts = await getDraftContent(db, organizationId, siteId, page, locationId)

  const mergedContent = [...publishedContent]
  for (const draft of drafts) {
    const index = mergedContent.findIndex((content) => content.field === draft.field)
    if (index !== -1) {
      mergedContent[index] = { ...mergedContent[index], ...draft }
    } else {
      mergedContent.push(draft)
    }
  }

  if (page === 'location' && locationId) {
    const locHero = await db.prepare(`
      SELECT bl.hero_image_asset_id, bl.hero_video_asset_id,
             img.public_url AS hero_public_url, img.kind AS hero_kind,
             vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind
      FROM business_locations bl
      LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
      LEFT JOIN media_assets vid ON bl.hero_video_asset_id = vid.id AND vid.status = 'active'
      WHERE bl.id = ? AND bl.site_id = ?
      LIMIT 1
    `).bind(locationId, siteId).first<{
      hero_image_asset_id: string | null
      hero_video_asset_id: string | null
      hero_public_url: string | null
      hero_kind: string | null
      hero_video_public_url: string | null
      hero_video_kind: string | null
    }>()

    if (locHero) {
      const heroIdx = mergedContent.findIndex((content) => content.field === 'hero')
      const existing = heroIdx !== -1 ? mergedContent[heroIdx]! : null
      const overlaid = {
        id: existing?.id ?? `bl-hero-${locationId}`,
        organization_id: existing?.organization_id ?? organizationId,
        site_id: existing?.site_id ?? siteId,
        location_id: existing?.location_id ?? locationId,
        page: existing?.page ?? page,
        field: 'hero',
        type: existing?.type ?? 'text',
        source: existing?.source ?? 'manual',
        content: existing?.content,
        value: existing?.value,
        hero_title: existing?.hero_title,
        hero_subtitle: existing?.hero_subtitle,
        hero_image_asset_id: locHero.hero_image_asset_id ?? undefined,
        hero_public_url: locHero.hero_public_url ?? null,
        hero_kind: locHero.hero_kind ?? null,
        hero_video_asset_id: locHero.hero_video_asset_id ?? undefined,
        hero_video_public_url: locHero.hero_video_public_url ?? null,
        hero_video_kind: locHero.hero_video_kind ?? null,
        updated_at: existing?.updated_at ?? new Date().toISOString(),
      }
      if (heroIdx !== -1) mergedContent[heroIdx] = overlaid
      else mergedContent.push(overlaid)
    }
  }

  return {
    content: mergedContent,
    hasDrafts: drafts.length > 0,
    siteId,
    locationId,
    page,
  }
}

export async function getContentDraftStatus(
  db: D1Database,
  organizationId: string,
  siteId: string,
  page?: string,
  locationId?: string,
) {
  return getDraftStatus(db, organizationId, siteId, page, locationId)
}

export async function publishContentDrafts(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: { page?: string; location_id?: string | null; all?: boolean },
) {
  if (input.all) {
    await publishAllDrafts(db, organizationId, siteId)
    return { success: true, scope: 'all' }
  }

  if (!input.page) throw new Error('page is required unless all=true')
  await publishDrafts(db, organizationId, siteId, input.page, input.location_id ?? undefined)
  return { success: true, page: input.page, location_id: input.location_id ?? null }
}

export async function discardContentDrafts(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: { page?: string; location_id?: string | null; all?: boolean },
) {
  if (input.all) {
    await discardAllDrafts(db, organizationId, siteId)
    return { success: true, scope: 'all' }
  }
  if (!input.page) throw new Error('page is required unless all=true')
  await discardDrafts(db, organizationId, siteId, input.page, input.location_id ?? undefined)
  return { success: true, page: input.page, location_id: input.location_id ?? null }
}

export async function deleteContentField(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: { page: string; field: string; location_id?: string | null },
) {
  await deleteSiteAndDraftContentField(db, organizationId, siteId, input.page, input.field, input.location_id ?? undefined)
  return { deleted: true, page: input.page, field: input.field }
}

export async function getGoogleBusinessLocationConnectionForMcp(
  env: CloudflareEnv,
  organizationId: string,
  siteId: string,
  locationId: string,
) {
  const connection = await getGoogleBusinessConnection(env, organizationId, siteId, locationId)
  if (!connection) return null
  return {
    id: connection.id,
    provider_account_email: connection.provider_account_email,
    status: connection.status,
    expires_at: connection.expires_at,
    created_at: connection.created_at,
    updated_at: connection.updated_at,
  }
}

export async function getGoogleBusinessLocationAuthUrlForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  userId: string,
) {
  const entitled = await hasEntitlement(env, db, organizationId, 'google_business')
  if (!entitled) {
    throw new Error('Google Business integration requires a paid plan.')
  }
  const secret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('Server misconfiguration: encryption key not set')

  const state = await signOAuthState(secret, {
    siteId,
    organizationId,
    userId,
    locationId,
    timestamp: Date.now(),
  })
  return { auth_url: getGoogleBusinessAuthUrl(env, state) }
}

export async function listGoogleBusinessAccountsForMcp(
  env: CloudflareEnv,
  organizationId: string,
  siteId: string,
) {
  const connection = await getGoogleBusinessConnection(env, organizationId, siteId)
  if (!connection) throw new Error('Google Business not connected')

  const accounts = await getGoogleBusinessAccounts(env, connection.encrypted_access_token)
  const accountsWithLocations = await Promise.all(accounts.map(async (account) => ({
    ...account,
    locations: await getGoogleBusinessLocations(env, connection.encrypted_access_token, account.name),
  })))

  return {
    connection: {
      id: connection.id,
      provider_account_email: connection.provider_account_email,
      status: connection.status,
      connected_at: connection.created_at,
    },
    accounts: accountsWithLocations,
  }
}

export async function syncGoogleBusinessLocationsForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  accountId: string,
  locationIds: string[],
) {
  const entitled = await hasEntitlement(env, db, organizationId, 'google_business')
  if (!entitled) {
    throw new Error('Google Business integration requires a paid plan.')
  }
  const connection = await getGoogleBusinessConnection(env, organizationId, siteId)
  if (!connection) throw new Error('Google Business not connected')

  const allLocations = await getGoogleBusinessLocations(env, connection.encrypted_access_token, accountId)
  const selectedLocations = allLocations.filter((location) => locationIds.includes(location.name))
  if (!selectedLocations.length) throw new Error('No valid locations found')

  const { reviewsUpserted } = await syncGoogleLocations(
    env,
    organizationId,
    siteId,
    selectedLocations,
    connection.encrypted_access_token,
  )

  return {
    success: true,
    synced_locations: selectedLocations.length,
    reviews_upserted: reviewsUpserted,
  }
}

function safeJson(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function safeJsonArray(value: unknown) {
  const parsed = safeJson(value)
  return Array.isArray(parsed) ? parsed : []
}

function stringOrNull(value: unknown, maxLength: number) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function booleanInt(value: unknown) {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  throw new Error('Boolean value required')
}
