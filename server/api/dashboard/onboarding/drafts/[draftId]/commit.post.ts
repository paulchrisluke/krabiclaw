import { prepareContentDocumentDeletion, prepareContentDocumentWithBlocks } from '~/server/utils/content/documents'
import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { googleReviewUpserts } from '~/server/utils/google-places'
import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, executeBatch, queryFirst, queryAll, type BatchQuery } from '~/server/db'
import { updateLocation } from '~/server/utils/location-management'
import { getDraftMedia, parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { runSiteCreation } from '~/server/utils/site-creation'
import { refreshSocialCard } from '~/server/utils/social-card'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { createMediaAsset, insertInitialMediaPlacements } from '~/server/utils/media-asset-manager'
import { resolveUserOrganization } from '~/server/utils/member-access'
import { applyOnboardingTenantPages } from '~/server/utils/content/pages'
import type { SiteVertical } from '~/utils/vertical-copy'
import { isValidTimezone } from '~/utils/timezone'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

function summarizeBatchQueries(batchQueries: BatchQuery[]) {
  return batchQueries.map((entry, index) => ({
    index, statement: entry.query.trim().split(/\s+/).slice(0, 12).join(' '), params: Array.isArray(entry.params) ? entry.params.length : 0, }))
}

function onboardingPagePath(page: string): string {
  if (page === 'home') return '/'
  if (page === 'privacy') return '/policies/privacy'
  if (page === 'terms') return '/policies/terms'
  return `/${page}`
}

function onboardingPageBlocks(rows: Array<{ id?: string; field: string; content: string | null; hero_title: string | null; hero_subtitle: string | null; type: string; asset_id?: string | null }>) {
  const blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }> = []
  for (const row of rows) {
    if (row.field === 'hero') {
      blocks.push({ id: row.id ?? crypto.randomUUID(), type: 'hero', position: blocks.length, data: { title: row.hero_title ?? row.content, subtitle: row.hero_subtitle } })
    } else if (row.type === 'media' || row.field.endsWith('.image')) {
      if (row.asset_id) {
        const type = row.field.endsWith('.image') ? 'image' : 'gallery'
        blocks.push({ id: row.id ?? crypto.randomUUID(), type, position: blocks.length, data: { field: row.field } })
      }
    } else if (row.content?.trim()) {
      const type = row.field.endsWith('.title') || row.field.endsWith('.headline') ? 'heading' : 'markdown'
      blocks.push({ id: row.id ?? crypto.randomUUID(), type, position: blocks.length, data: type === 'heading' ? { field: row.field, text: row.content, level: 2 } : { field: row.field, markdown: row.content } })
    }
  }
  return blocks
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const draftId = getRouterParam(event, 'draftId')
  if (!draftId) return jsonResponse({ error: 'Draft id is required' }, { status: 400 })

  const draft = await queryFirst<{
    id: string
    user_id: string
    name: string
    vertical: SiteVertical
    subdomain_candidate: string
    status: string
    payload_json: string
  }>(db, `
    SELECT id, user_id, name, vertical, subdomain_candidate, status, payload_json
    FROM onboarding_drafts
    WHERE id = ?
    LIMIT 1
  `, [draftId])

  if (!draft || draft.user_id !== session.user.id) {
    return jsonResponse({ error: 'Draft not found' }, { status: 404 })
  }

  const payload = parseOnboardingDraftPayload(draft.payload_json)

  // The currency is the owner's answer, never a default. Refuse the commit
  // rather than creating a site whose prices are quoted in an invented currency.
  const defaultCurrency = payload.source.details.currency
  if (!defaultCurrency) {
    return jsonResponse({ error: 'Choose a currency before creating your site.' }, { status: 400 })
  }
  const timezone = payload.source.details.timezone
  if (!isValidTimezone(timezone)) {
    return jsonResponse({ error: 'Choose a valid location timezone before creating your site.' }, { status: 400 })
  }

  // Atomic draft status transition: claim draft before site creation to prevent duplicates
  const claimResult = await execute(db, `
    UPDATE onboarding_drafts
    SET status = 'committing', updated_at = ?
    WHERE id = ? AND status = 'active'
  `, [new Date().toISOString(), draftId])

  if (claimResult.meta.changes === 0) {
    return jsonResponse({ error: 'Draft is no longer active (concurrent commit)' }, { status: 409 })
  }

  let siteId: string | null = null
  let draftCommitted = false

  try {
    const result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
      name: draft.name, subdomain: draft.subdomain_candidate || slugify(draft.name).slice(0, 40), vertical: draft.vertical, })

    if (result.status !== 200) {
      // Reset draft status to active on failure so it can be retried
      await execute(db, `
        UPDATE onboarding_drafts
        SET status = 'active', updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), draftId])
      return jsonResponse({
        error: typeof result.data.error === 'string' ? result.data.error : 'Could not create site. Please try again.', }, { status: result.status || 500 })
    }

    const organizationId = result.data.organizationId as string
    siteId = result.data.siteId as string
    const siteSlug = result.data.subdomain as string | null
    await execute(db, `
      UPDATE sites
      SET default_currency = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [defaultCurrency, new Date().toISOString(), siteId, organizationId])

    await execute(db, `
      UPDATE sites SET settings_json = json_set(settings_json, '$.config.default_timezone', ?)
      WHERE organization_id = ? AND id = ?
    `, [timezone, organizationId, siteId])

    const locationRow = await queryFirst<{ id: string; slug: string | null }>(db, `
      SELECT id, slug FROM business_locations
      WHERE id = ? AND site_id = ? AND organization_id = ? AND status = 'active'
      LIMIT 1
    `, [result.data.locationId, siteId, organizationId])

    if (!locationRow?.id) {
      throw new Error('No active location found for this site. Site creation may have failed.')
    }

    const logoDraftImage = getDraftMedia(payload, 'logo')
    const heroDraftImage = getDraftMedia(payload, 'hero')
    const heroAssetId = heroDraftImage?.draftAssetId ?? null

    if (logoDraftImage) {
      await createMediaAsset(db, {
        id: logoDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: logoDraftImage.cloudflareImageId, public_url: logoDraftImage.publicUrl, thumbnail_url: logoDraftImage.thumbnailUrl, mime_type: logoDraftImage.mimeType, file_name: logoDraftImage.fileName, file_size: logoDraftImage.fileSize, status: 'active', created_by_user_id: session.user.id, })
      await executeBatch(db, insertInitialMediaPlacements({ organizationId, siteId, placement: { owner_type: 'site', owner_id: siteId, slot: 'logo' }, media: [{ asset_id: logoDraftImage.draftAssetId }] }))
    }

    if (heroDraftImage) {
      await createMediaAsset(db, {
        id: heroDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: heroDraftImage.cloudflareImageId, public_url: heroDraftImage.publicUrl, thumbnail_url: heroDraftImage.thumbnailUrl, mime_type: heroDraftImage.mimeType, file_name: heroDraftImage.fileName, file_size: heroDraftImage.fileSize, category: 'other', status: 'active', created_by_user_id: session.user.id, })
      await executeBatch(db, insertInitialMediaPlacements({ organizationId, siteId, placement: { owner_type: 'business_location', owner_id: locationRow.id, slot: 'hero' }, media: [{ asset_id: heroDraftImage.draftAssetId }] }))
    }

    const draftLocation = payload.preview.locations.find(location => location.id === 'draft-location-main')
    let updatedSlug: string | null = locationRow.slug ?? null
    if (draftLocation) {
      updatedSlug = draftLocation.slug || locationRow.slug || slugify(draftLocation.title)
      const updateResult = await updateLocation(db, organizationId, siteId, locationRow.id, {
        title: draftLocation.title, slug: updatedSlug, city: draftLocation.city, address: draftLocation.address, description: draftLocation.description, phone: draftLocation.phone, website_url: draftLocation.website_url, opening_hours: parseOpeningHours(draftLocation.opening_hours), special_hours: parseSpecialHours(draftLocation.special_hours), rating: draftLocation.rating, review_count: draftLocation.review_count, notification_phone: payload.source.details.notificationPhone, timezone: payload.source.details.timezone, status: 'active', maps_url: payload.source.place?.mapsUrl, google_place_id: payload.source.place?.placeId, }, session.user.id, env)

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
      organizationId, siteId, userId: session.user.id, pages: [...contentByPage].map(([pageName, rows]) => {
        const pageType = pageName === 'privacy' || pageName === 'terms' ? 'legal' : pageName === 'home' || pageName === 'about' || pageName === 'contact' ? 'system' : 'recipe'
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
    // A committed draft carries no catalogue: products, their variants and
    // their prices are created in the dashboard through the canonical writer,
    // so there is nothing here to replace and nothing to plan. The reviews
    // this draft does carry belong to the location, not to a product.
    const batchQueries: BatchQuery[] = []

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
      createdBy: session.user.id, metadata: { post_type: 'standard', channels: {} },
    }, []).queries)

    batchQueries.push(...googleReviewUpserts({ organizationId, siteId, locationId: locationRow.id }, payload.preview.reviews, now))

    batchQueries.push({
      query: `
        UPDATE onboarding_drafts
        SET status = 'committed', committed_site_id = ?, committed_at = ?, updated_at = ?
        WHERE id = ?
      `, params: [siteId, now, now, draftId], })

    try {
      await executeBatch(db, batchQueries)
    } catch (batchError) {
      console.error('commit_post_batch_failed', {
        draftId, siteId, organizationId, batchSize: batchQueries.length, contentRows: payload.preview.content.length, products: payload.preview.products.length, qaRows: payload.preview.qa.length, posts: payload.preview.posts.length, reviews: payload.preview.reviews.length, queries: summarizeBatchQueries(batchQueries), error: batchError instanceof Error ? {
          name: batchError.name, message: batchError.message, stack: batchError.stack, } : String(batchError), })
      throw batchError
    }
    draftCommitted = true

    // The homepage and its media are now committed: generate the site card once
    // so its first real card uses the homepage hero when available. Deliberately
    // one owner, not the whole site — rendering and uploading a card per product
    // would run for minutes inside this request. Everything else is picked up by
    // the social-card-backfill task.
    try {
      await refreshSocialCard({ db, env, owner: { owner_type: 'site', owner_id: siteId }, actorId: session.user.id })
    } catch (cardError) {
      console.error('commit_post_site_card_failed', { siteId, error: cardError instanceof Error ? { name: cardError.name, message: cardError.message } : String(cardError) })
    }

    if (siteId) {
      const waitUntil = event.req.runtime?.cloudflare?.context?.waitUntil
      if (typeof waitUntil === 'function') {
        waitUntil.call(event.req.runtime?.cloudflare?.context, purgePublicResourceCacheSafe(env, siteId))
      } else {
        await purgePublicResourceCacheSafe(env, siteId)
      }
    }

    // If anything fails after this point, the draft is already committed - we don't reset it
    // since the site was successfully created. The user can continue from the dashboard.

    const orgRow = await resolveUserOrganization(env, {
      userId: session.user.id,
      organizationId,
    })
    if (!orgRow) throw new HTTPError({ statusCode: 500, statusMessage: 'Committed organization not found' })

    return jsonResponse({
      success: true, siteId, orgSlug: orgRow.slug, siteSlug: siteSlug ?? null, locationSlug: updatedSlug ?? locationRow.slug ?? null, })
  } catch (error) {
    // If site was created but something else failed, mark draft as failed but don't reset to active
    // The site exists and the user can continue from the dashboard
    if (siteId && !draftCommitted) {
      await execute(db, `
        UPDATE onboarding_drafts
        SET status = 'failed', updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), draftId])
      console.error('commit_post_error_after_site_creation', error)
      return jsonResponse({
        error: 'Site was created but some data import failed. Please check your dashboard and try importing missing data manually.', siteId, }, { status: 500 })
    }
    if (siteId && draftCommitted) {
      console.error('commit_post_error_after_finalization', error)
      return jsonResponse({
        error: 'Site was created, but finalization failed. Please check your dashboard.', siteId, }, { status: 500 })
    }
    // If site was not created, reset to active for retry
    await execute(db, `
      UPDATE onboarding_drafts
      SET status = 'active', updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), draftId])
    console.error('commit_post_error_before_site_creation', error)
    return jsonResponse({
      error: 'Failed to commit draft. Please try again.', }, { status: 500 })
  }
})
import { getRouterParam } from 'nitro/h3';
