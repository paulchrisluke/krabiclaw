import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, executeBatch, queryFirst, type BatchQuery } from '~/server/db'
import { updateLocation } from '~/server/utils/location-management'
import { getDraftMedia, parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { runSiteCreation } from '~/server/utils/site-creation'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { createMediaAsset } from '~/server/utils/media-asset-manager'
import { setMediaPlacement } from '~/server/utils/media-placement'
import { resolveUserOrganization } from '~/server/utils/member-access'
import { applyOnboardingTenantPages } from '~/server/utils/tenant-pages'
import type { SiteVertical } from '~/utils/vertical-copy'

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

function onboardingPageBlocks(rows: Array<{ id?: string; field: string; content: string | null; hero_title: string | null; hero_subtitle: string | null; type: string }>) {
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
  if (!blocks.length) blocks.push({ id: crypto.randomUUID(), type: 'hero', position: 0, data: { title: 'Welcome', subtitle: null } })
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

  // Atomic draft status transition: claim draft before site creation to prevent duplicates
  const claimResult = await execute(db, `
    UPDATE onboarding_drafts
    SET status = 'committing', updated_at = ?
    WHERE id = ? AND status = 'active'
  `, [new Date().toISOString(), draftId])

  if (claimResult.meta.changes === 0) {
    return jsonResponse({ error: 'Draft is no longer active (concurrent commit)' }, { status: 409 })
  }

  const payload = parseOnboardingDraftPayload(draft.payload_json)
  let organizationId: string | null = null
  let siteId: string | null = null
  let siteSlug: string | null = null
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

    organizationId = result.data.organizationId as string
    siteId = result.data.siteId as string
    siteSlug = result.data.subdomain as string | null
    await execute(db, `
      UPDATE sites
      SET default_currency = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [payload.source.details.currency, new Date().toISOString(), siteId, organizationId])

    const locationRow = await queryFirst<{ id: string; slug: string | null }>(db, `
      SELECT id, slug FROM business_locations
      WHERE site_id = ? AND organization_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `, [siteId, organizationId])

    if (!locationRow?.id) {
      throw new Error('No active location found for this site. Site creation may have failed.')
    }

    const logoDraftImage = getDraftMedia(payload, 'logo')
    const heroDraftImage = getDraftMedia(payload, 'hero')
    const heroAssetId = heroDraftImage?.draftAssetId ?? null

    if (logoDraftImage) {
      await createMediaAsset(db, {
        id: logoDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: logoDraftImage.cloudflareImageId, public_url: logoDraftImage.publicUrl, thumbnail_url: logoDraftImage.thumbnailUrl, mime_type: logoDraftImage.mimeType, file_name: logoDraftImage.fileName, file_size: logoDraftImage.fileSize, status: 'active', created_by_user_id: session.user.id, })
      await setMediaPlacement(db, { organizationId, siteId, placement: { owner_type: 'site', owner_id: siteId, slot: 'logo' }, assetIds: [logoDraftImage.draftAssetId] })
    }

    if (heroDraftImage) {
      await createMediaAsset(db, {
        id: heroDraftImage.draftAssetId, organization_id: organizationId, site_id: siteId, kind: 'image', provider: 'cloudflare_images', source: 'uploaded', cloudflare_image_id: heroDraftImage.cloudflareImageId, public_url: heroDraftImage.publicUrl, thumbnail_url: heroDraftImage.thumbnailUrl, mime_type: heroDraftImage.mimeType, file_name: heroDraftImage.fileName, file_size: heroDraftImage.fileSize, category: 'other', status: 'active', created_by_user_id: session.user.id, })
      await setMediaPlacement(db, { organizationId, siteId, placement: { owner_type: 'business_location', owner_id: locationRow.id, slot: 'hero' }, assetIds: [heroDraftImage.draftAssetId] })
    }

    const primaryLocation = payload.preview.locations[0]
    let updatedSlug: string | null = locationRow.slug ?? null
    if (primaryLocation) {
      updatedSlug = primaryLocation.slug || locationRow.slug || slugify(primaryLocation.title)
      const updateResult = await updateLocation(db, organizationId, siteId, locationRow.id, {
        title: primaryLocation.title, slug: updatedSlug, city: primaryLocation.city, address: primaryLocation.address, description: primaryLocation.description, phone: primaryLocation.phone, website_url: primaryLocation.website_url, opening_hours: primaryLocation.opening_hours, rating: primaryLocation.rating, review_count: primaryLocation.review_count, notification_phone: payload.source.details.notificationPhone, timezone: payload.source.details.timezone, is_primary: true, status: 'active', maps_url: payload.source.place?.mapsUrl, google_place_id: payload.source.place?.placeId, }, session.user.id)

      if (updateResult.status !== 200) {
        throw new Error(
          typeof updateResult.data?.error === 'string'
            ? updateResult.data.error
            : 'Primary location update failed.', )
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
          JOIN content_documents d ON d.id = cb.document_id AND d.owner_type = 'tenant_page'
          JOIN tenant_page_variants v ON v.id = d.owner_id
          WHERE v.site_id = ? AND v.path = ?
            AND (cb.type = 'hero' AND ? = 'hero' OR json_extract(cb.data, '$.field') = ?)
          ORDER BY cb.position LIMIT 1
        `, [siteId, onboardingPagePath(pageName), row.field, row.field])
        if (block) {
          const slot = row.field === 'hero' ? 'media' : row.field.endsWith('.image') ? row.field : 'gallery'
          await setMediaPlacement(db, { organizationId, siteId, placement: { owner_type: 'content_block', owner_id: block.id, slot }, assetIds: [assetId] })
        }
      }
    }

    // The full rebuild (menu/qa/posts/reviews delete+insert) plus the final
    // draft status flip runs as a single atomic D1 batch, so a failure partway through
    // never leaves the site with half-cleared content — see incident notes for why
    // sequential execute() calls here are unsafe.
    const now = new Date().toISOString()
    const batchQueries: BatchQuery[] = []

    batchQueries.push({ query: `DELETE FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE site_id = ?)`, params: [siteId] })
    batchQueries.push({ query: `DELETE FROM menus WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    if (payload.preview.menu) {
      batchQueries.push({
        query: `
          INSERT INTO menus
            (id, organization_id, site_id, location_id, name, is_visible, created_at, updated_at, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, params: [
          payload.preview.menu.id, organizationId, siteId, locationRow.id, payload.preview.menu.name, payload.preview.menu.status === 'published' ? 1 : 0, now, now, session.user.id, session.user.id, ], })

      for (const item of payload.preview.menu.items) {
        // Draft menu items are template boilerplate (e.g. "Sample Starter") the owner
        // hasn't edited — mark 'template' so the checklist doesn't treat them as real.
        batchQueries.push({
          query: `
            INSERT INTO menu_items
              (id, menu_id, section, name, slug, description, price_amount, available, sort_order, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', ?, ?)
          `, params: [
            item.id, payload.preview.menu.id, item.section, item.name, item.slug, item.description, item.price_amount, item.available ? 1 : 0, item.sort_order, now, now, ], })
      }
    }

    batchQueries.push({ query: `DELETE FROM location_qa WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    for (const item of payload.preview.qa) {
      // Draft Q&A is template boilerplate, not owner-authored — mark 'template'.
      batchQueries.push({
        query: `
          INSERT INTO location_qa
            (id, organization_id, site_id, location_id, question, answer, answer_author, is_owner_answer, source, status, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'template', 'published', ?, ?, ?)
        `, params: [
          item.id, organizationId, siteId, locationRow.id, item.question, item.answer, item.answer_author, item.sort_order, now, now, ], })
    }

    batchQueries.push({ query: `DELETE FROM posts WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    for (const post of payload.preview.posts) {
      // Draft "welcome" posts are auto-generated, not owner-authored — mark 'template'.
      batchQueries.push({
        query: `
          INSERT INTO posts
            (id, organization_id, site_id, location_id, post_type, title, body, status, published_at, created_by, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, 'template', ?, ?)
        `, params: [
          post.id, organizationId, siteId, locationRow.id, post.title, post.body, post.status, post.published_at, session.user.id, now, now, ], })
    }

    for (const review of payload.preview.reviews) {
      if (!review.rating) continue
      batchQueries.push({
        query: `
          INSERT OR IGNORE INTO reviews
            (id, organization_id, site_id, location_id, google_review_id, author_name, rating, title, content, owner_reply, owner_reply_at, status, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
        `, params: [
          review.id, organizationId, siteId, locationRow.id, null, review.author_name, review.rating, review.title, review.content, review.owner_reply, review.owner_reply_at, review.source ?? 'direct', review.created_at ?? now, now, ], })
    }

    // Finalize draft status to committed in the same batch as the rebuild
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
        draftId, siteId, organizationId, batchSize: batchQueries.length, contentRows: payload.preview.content.length, menuItems: payload.preview.menu?.items.length ?? 0, qaRows: payload.preview.qa.length, posts: payload.preview.posts.length, reviews: payload.preview.reviews.length, queries: summarizeBatchQueries(batchQueries), error: batchError instanceof Error ? {
          name: batchError.name, message: batchError.message, stack: batchError.stack, } : String(batchError), })
      throw batchError
    }
    draftCommitted = true
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
