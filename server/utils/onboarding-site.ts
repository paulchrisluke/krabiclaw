// Writing an onboarding draft's answers onto its real site.
//
// The wizard's answers live in onboarding_drafts while the owner is answering,
// but the site they describe is real from the first save: a pending site on its
// own subdomain, previewable with the site's preview token and invisible to the
// public until it is activated. Every save re-applies the whole draft, so this
// is a full rebuild and idempotent by construction — the same code path that
// used to run once at commit now runs on each save, which is why there is no
// second "draft renderer" to keep in step with the real one.

import { prepareContentDocumentDeletion, prepareContentDocumentWithBlocks } from '~/server/utils/content/documents'
import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { googleReviewUpserts } from '~/server/utils/google-places'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { resourceLocalizationDeletionQueries } from '~/server/utils/localization'
import { planProductCategories } from '~/server/utils/product-management'
import { updateLocation } from '~/server/utils/location-management'
import { getDraftMedia, onboardingPageBlocks, onboardingPagePath, onboardingPageType, type OnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { createMediaAsset, insertInitialMediaPlacements, type CreateInput } from '~/server/utils/media-asset-manager'
import { applyOnboardingTenantPages } from '~/server/utils/content/pages'
import { createOrganizationForSite, runSiteCreation } from '~/server/utils/site-creation'
import type { CloudflareEnv } from '~/server/utils/auth'
import type { SiteVertical } from '~/utils/vertical-copy'
import type { CurrencyCode } from '~/shared/currencies'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

export interface OnboardingSiteTarget {
  organizationId: string
  siteId: string
  subdomain: string
  locationId: string
  locationSlug: string | null
}

/** A draft's answers, as they are stored while the owner is still answering. */
export interface OnboardingDraftRow {
  id: string
  organization_id: string | null
  name: string
  vertical: SiteVertical
  subdomain_candidate: string
}

function summarizeBatchQueries(batchQueries: BatchQuery[]) {
  return batchQueries.map((entry, index) => ({
    index, statement: entry.query.trim().split(/\s+/).slice(0, 12).join(' '), params: Array.isArray(entry.params) ? entry.params.length : 0, }))
}

/**
 * Media assets carry the draft's own asset id, so re-applying a draft must not
 * insert the same asset twice.
 */
async function ensureMediaAsset(db: D1Database, data: CreateInput & { category?: string; status?: string; created_by_user_id?: string }) {
  const existing = await queryFirst<{ id: string }>(db, 'SELECT id FROM media_assets WHERE id = ? LIMIT 1', [data.id])
  if (existing) return
  await createMediaAsset(db, data)
}

/**
 * The organization and the pending site this draft writes to, created on the
 * first save. The site keeps the address claimed by the first save even if the
 * brand name changes later, so every following save reaches the same site.
 */
export async function ensureOnboardingSite(
  env: CloudflareEnv,
  db: D1Database,
  userId: string,
  draft: OnboardingDraftRow,
): Promise<{ target: OnboardingSiteTarget } | { error: string; status: number }> {
  let organizationId = draft.organization_id
  if (!organizationId) {
    const created = await createOrganizationForSite(env, userId, draft.name)
    // Two saves can race here. The claim only lands while the draft still has
    // no organization, and the re-read decides which one won, so overlapping
    // saves converge on one organization instead of the later one silently
    // replacing the earlier.
    await execute(db, `
      UPDATE onboarding_drafts SET organization_id = ?, updated_at = ?
      WHERE id = ? AND organization_id IS NULL
    `, [created.organizationId, new Date().toISOString(), draft.id])
    const claimed = await queryFirst<{ organization_id: string | null }>(db, `
      SELECT organization_id FROM onboarding_drafts WHERE id = ? LIMIT 1
    `, [draft.id])
    if (!claimed?.organization_id) return { status: 500, error: 'Could not record the new organization.' }
    organizationId = claimed.organization_id
  }

  // Created once, on the first save. Site creation seeds a location and the
  // system pages; running it again after this draft has renamed that location
  // would seed a second one, so a later save resolves the existing site
  // instead.
  const existing = await queryFirst<{ id: string; subdomain: string | null }>(db, `
    SELECT id, subdomain FROM sites
    WHERE organization_id = ? AND subdomain = ? AND onboarding_status = 'pending'
    LIMIT 1
  `, [organizationId, draft.subdomain_candidate])

  let siteId: string
  let subdomain: string
  if (existing?.subdomain) {
    siteId = existing.id
    subdomain = existing.subdomain
  } else {
    const result = await runSiteCreation(env as SiteEnv, db, userId, {
      organizationId,
      name: draft.name,
      subdomain: draft.subdomain_candidate,
      vertical: draft.vertical,
      activate: false,
    })
    if (result.status !== 200) {
      return {
        status: result.status || 500,
        error: typeof result.data.error === 'string' ? result.data.error : 'Could not create site. Please try again.',
      }
    }
    siteId = result.data.siteId as string
    subdomain = result.data.subdomain as string
  }

  // An onboarding site has exactly one location. More than one means something
  // seeded a second one, which would make every later save ambiguous, so this
  // refuses rather than picking.
  const locations = await queryAll<{ id: string; slug: string | null }>(db, `
    SELECT id, slug FROM business_locations
    WHERE site_id = ? AND organization_id = ? AND status = 'active'
    ORDER BY created_at, id
  `, [siteId, organizationId])
  if (locations.length !== 1) {
    return {
      status: 500,
      error: locations.length === 0
        ? 'No active location found for this site.'
        : `This site has ${locations.length} locations; onboarding expects one.`,
    }
  }

  return {
    target: {
      organizationId,
      siteId,
      subdomain,
      locationId: locations[0]!.id,
      locationSlug: locations[0]!.slug,
    },
  }
}

/** Applies every answer in the draft to its site. Safe to call on every save. */
export async function applyOnboardingDraftToSite(
  env: CloudflareEnv,
  db: D1Database,
  input: {
    userId: string
    target: OnboardingSiteTarget
    payload: OnboardingDraftPayload
    // Both are the owner's answers and arrive part-way through the wizard.
    // Until they do the site keeps what site creation gave it, rather than
    // being written with a currency or a zone nobody chose.
    defaultCurrency: CurrencyCode | null
    timezone: string | null
  },
): Promise<{ locationSlug: string | null }> {
  const { userId, payload, defaultCurrency, timezone } = input
  const { organizationId, siteId } = input.target
  const locationRow = { id: input.target.locationId }

  if (defaultCurrency) {
    await execute(db, `
      UPDATE sites
      SET default_currency = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [defaultCurrency, new Date().toISOString(), siteId, organizationId])
  }

  if (timezone) {
    await execute(db, `
      UPDATE sites SET settings_json = json_set(settings_json, '$.config.default_timezone', ?)
      WHERE organization_id = ? AND id = ?
    `, [timezone, organizationId, siteId])
  }

  const logoDraftImage = getDraftMedia(payload, 'logo')
  const heroDraftImage = getDraftMedia(payload, 'hero')
  const heroAssetId = heroDraftImage?.draftAssetId ?? null

  if (logoDraftImage) {
    await ensureMediaAsset(db, {
      id: logoDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: logoDraftImage.cloudflareImageId, public_url: logoDraftImage.publicUrl, thumbnail_url: logoDraftImage.thumbnailUrl, mime_type: logoDraftImage.mimeType, file_name: logoDraftImage.fileName, file_size: logoDraftImage.fileSize, status: 'active', created_by_user_id: userId, })
    await executeBatch(db, insertInitialMediaPlacements({ organizationId, siteId, placement: { owner_type: 'site', owner_id: siteId, slot: 'logo' }, media: [{ asset_id: logoDraftImage.draftAssetId }] }))
  }

  if (heroDraftImage) {
    await ensureMediaAsset(db, {
      id: heroDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: heroDraftImage.cloudflareImageId, public_url: heroDraftImage.publicUrl, thumbnail_url: heroDraftImage.thumbnailUrl, mime_type: heroDraftImage.mimeType, file_name: heroDraftImage.fileName, file_size: heroDraftImage.fileSize, category: 'other', status: 'active', created_by_user_id: userId, })
    await executeBatch(db, insertInitialMediaPlacements({ organizationId, siteId, placement: { owner_type: 'business_location', owner_id: locationRow.id, slot: 'hero' }, media: [{ asset_id: heroDraftImage.draftAssetId }] }))
  }

  const draftLocation = payload.preview.locations.find(location => location.id === 'draft-location-main')
  let updatedSlug: string | null = input.target.locationSlug
  if (draftLocation) {
    // buildOnboardingDraftPayload always derives the location slug from the brand name.
    updatedSlug = draftLocation.slug
    const updateResult = await updateLocation(db, organizationId, siteId, locationRow.id, {
      title: draftLocation.title, slug: updatedSlug, city: draftLocation.city, address: draftLocation.address, description: draftLocation.description, phone: draftLocation.phone, website_url: draftLocation.website_url, opening_hours: parseOpeningHours(draftLocation.opening_hours), special_hours: parseSpecialHours(draftLocation.special_hours), rating: draftLocation.rating, review_count: draftLocation.review_count, notification_phone: payload.source.details.notificationPhone, timezone: payload.source.details.timezone, status: 'active', maps_url: payload.source.place?.mapsUrl, google_place_id: payload.source.place?.placeId, }, userId, env)

    if (updateResult.status !== 200) {
      throw new Error(
        typeof updateResult.data?.error === 'string'
          ? updateResult.data.error
          : 'Location update failed.', )
    }
  }

  const contentByPage = new Map<string, typeof payload.preview.content>()
  for (const row of payload.preview.content) {
    const rows = contentByPage.get(row.page) ?? []
    rows.push(row)
    contentByPage.set(row.page, rows)
  }
  await applyOnboardingTenantPages(db, {
    organizationId, siteId, userId: userId, pages: [...contentByPage].map(([pageName, rows]) => {
      const pageType = onboardingPageType(pageName)
      return {
        path: onboardingPagePath(pageName), title: rows.find(row => row.field === 'hero')?.hero_title ?? pageName, pageType, recipe: pageName, blocks: onboardingPageBlocks(rows), trustedSystemPage: pageType === 'system', }
    }), })

  for (const [pageName, rows] of contentByPage) {
    for (const row of rows) {
      const assetId = pageName === 'home' && row.field === 'hero' ? heroAssetId : row.asset_id
      if (!assetId) continue
      const block = await queryFirst<{ id: string }>(db, `
        SELECT cb.id FROM content_blocks cb
        JOIN content_documents d ON d.id = cb.document_id AND d.kind = 'page' AND d.row_role = 'root'
        WHERE d.site_id = ? AND d.path = ?
          AND (cb.type = 'hero' AND ? = 'hero' OR json_extract(cb.data_json, '$.field') = ?)
        ORDER BY cb.position LIMIT 1
      `, [siteId, onboardingPagePath(pageName), row.field, row.field])
      if (block) {
        const slot = row.field === 'hero' ? 'media' : row.field.endsWith('.image') ? row.field : 'gallery'
        await executeBatch(db, insertInitialMediaPlacements({ organizationId, siteId, placement: { owner_type: 'content_block', owner_id: block.id, slot }, media: [{ asset_id: assetId }] }))
      }
    }
  }

  // The full rebuild (Products/qa/posts/reviews delete+insert) plus the final
  // draft status flip runs as a single atomic D1 batch, so a failure partway through
  // never leaves the site with half-cleared content — see incident notes for why
  // sequential execute() calls here are unsafe.
  const now = new Date().toISOString()
  const orderedProducts = [...payload.preview.products].sort((a, b) => a.sort_order - b.sort_order)
  const categoryPlan = await planProductCategories({
    db, organizationId, siteId, locationId: locationRow.id, actor: userId,
    names: [...orderedProducts.filter(product => product.is_visible), ...orderedProducts.filter(product => !product.is_visible)].map(product => product.category),
  })
  const standardProducts = { query: "SELECT id FROM products WHERE organization_id = ? AND site_id = ? AND product_type = 'standard'", params: [organizationId, siteId] }
  const batchQueries: BatchQuery[] = [
    ...categoryPlan.inserts,
    ...resourceLocalizationDeletionQueries('product', standardProducts),
    { query: `DELETE FROM media_placements WHERE owner_type = 'review' AND owner_id IN (SELECT id FROM reviews WHERE product_id IN (${standardProducts.query}))`, params: standardProducts.params },
  ]

  batchQueries.push({
    query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id IN (${standardProducts.query})`,
    params: standardProducts.params,
  })
  batchQueries.push({ query: `DELETE FROM reviews WHERE product_id IN (SELECT id FROM products WHERE site_id = ? AND product_type = 'standard')`, params: [siteId] })
  batchQueries.push({ query: `DELETE FROM products WHERE organization_id = ? AND site_id = ? AND product_type = 'standard'`, params: [organizationId, siteId] })
  for (const product of orderedProducts) {
    const category = categoryPlan.resolved.get(product.category)!
    batchQueries.push({
      query: `
        INSERT INTO products
          (id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url,
           is_visible, available, featured, featured_sort_order, sort_order, tags_json,
           details_json, source, created_at, updated_at, created_by, updated_by)
        VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?,
          (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM products WHERE category_id = ?), ?, ?, ?, ?, ?, ?, ?)
      `, params: [
        product.id, organizationId, siteId, locationRow.id, category.id, product.name,
        product.slug, product.description, product.order_url,
        product.is_visible ? 1 : 0, product.available ? 1 : 0, product.featured ? 1 : 0,
        product.featured_sort_order, category.id, JSON.stringify(product.tags),
        JSON.stringify(product.details), product.source, now, now, userId, userId,
      ],
    })
    // A product the owner did not price gets no `prices` row at all. The public
    // surfaces read `Product.price` as nullable and omit the price element, so
    // an invented zero would be a price they never set.
    const price = product.price
    if (price) {
      const currency = price.currency ?? defaultCurrency
      batchQueries.push({
        query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at) VALUES (?,?,?,?,?,?,?,'item','unspecified',?,?,?,'import',?,?)`,
        params: [crypto.randomUUID(), organizationId, siteId, locationRow.id, product.id,
          price.amount_minor, currency,
          price.compare_at_amount_minor ?? null,
          price.valid_from ?? now,
          price.valid_until ?? null,
          userId, now],
      })
    }
  }

  const replaced = await queryAll<{ id: string }>(db, "SELECT id FROM content_documents WHERE organization_id = ? AND site_id = ? AND row_role = 'root' AND kind IN ('qa','social_post')", [organizationId, siteId])
  for (const document of replaced) batchQueries.push(...prepareContentDocumentDeletion({ documentId: document.id, organizationId, siteId }))
  for (const item of payload.preview.qa) batchQueries.push(...prepareContentDocumentWithBlocks({
    id: item.id, organizationId, siteId, kind: 'qa', rowRole: 'root', locale: 'en', locationId: locationRow.id,
    title: item.question, summary: item.answer, source: 'template', status: 'published', sortOrder: item.sort_order,
    metadata: { answer_author: item.answer_author, is_owner_answer: 1, upvote_count: 0 },
  }, []).queries)
  for (const post of payload.preview.posts) batchQueries.push(...prepareContentDocumentWithBlocks({
    id: post.id, organizationId, siteId, kind: 'social_post', rowRole: 'root', locale: 'en', locationId: locationRow.id,
    title: post.title, summary: post.body, status: post.status, visibility: 'public', publishedAt: post.published_at, source: 'template',
    createdBy: userId, metadata: { post_type: 'standard', channels: {} },
  }, []).queries)

  batchQueries.push(...googleReviewUpserts({ organizationId, siteId, locationId: locationRow.id }, payload.preview.reviews, now))

  try {
    await executeBatch(db, batchQueries)
  } catch (batchError) {
    console.error('onboarding_site_apply_batch_failed', {
      siteId, organizationId, batchSize: batchQueries.length, contentRows: payload.preview.content.length, products: payload.preview.products.length, qaRows: payload.preview.qa.length, posts: payload.preview.posts.length, reviews: payload.preview.reviews.length, queries: summarizeBatchQueries(batchQueries), error: batchError instanceof Error ? {
        name: batchError.name, message: batchError.message, stack: batchError.stack, } : String(batchError), })
    throw batchError
  }
  return { locationSlug: updatedSlug }
}
