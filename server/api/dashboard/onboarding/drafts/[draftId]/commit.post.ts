import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, executeBatch, queryFirst, type BatchQuery } from '~/server/db'
import { updateLocation } from '~/server/utils/location-management'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { runSiteCreation } from '~/server/utils/site-creation'
import { setConfig } from '~/server/utils/site-config'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import type { SiteVertical } from '~/utils/vertical-copy'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

function summarizeBatchQueries(batchQueries: BatchQuery[]) {
  return batchQueries.map((entry, index) => ({
    index,
    statement: entry.query.trim().split(/\s+/).slice(0, 12).join(' '),
    params: Array.isArray(entry.params) ? entry.params.length : 0,
  }))
}

export default defineEventHandler(async (event) => {
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
      name: draft.name,
      subdomain: draft.subdomain_candidate || slugify(draft.name).slice(0, 40),
      vertical: draft.vertical,
    })

    if (result.status !== 200) {
      // Reset draft status to active on failure so it can be retried
      await execute(db, `
        UPDATE onboarding_drafts
        SET status = 'active', updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), draftId])
      return jsonResponse({
        error: typeof result.data.error === 'string' ? result.data.error : 'Could not create site. Please try again.',
      }, { status: result.status || 500 })
    }

    organizationId = result.data.organizationId as string
    siteId = result.data.siteId as string
    siteSlug = result.data.subdomain as string | null

    const locationRow = await queryFirst<{ id: string; slug: string | null }>(db, `
      SELECT id, slug FROM business_locations
      WHERE site_id = ? AND organization_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `, [siteId, organizationId])

    if (!locationRow?.id) {
      throw new Error('No active location found for this site. Site creation may have failed.')
    }

    const primaryLocation = payload.preview.locations[0]
    let updatedSlug: string | null = locationRow.slug ?? null
    if (primaryLocation) {
      updatedSlug = primaryLocation.slug || locationRow.slug || slugify(primaryLocation.title)
      const updateResult = await updateLocation(db, organizationId, siteId, locationRow.id, {
        title: primaryLocation.title,
        slug: updatedSlug,
        city: primaryLocation.city ?? undefined,
        address: primaryLocation.address ?? undefined,
        description: primaryLocation.description ?? undefined,
        phone: primaryLocation.phone ?? undefined,
        website_url: primaryLocation.website_url ?? undefined,
        opening_hours: primaryLocation.opening_hours ?? undefined,
        rating: primaryLocation.rating ?? undefined,
        review_count: primaryLocation.review_count ?? undefined,
        notification_phone: payload.source.details.notificationPhone ?? undefined,
        timezone: payload.source.details.timezone ?? undefined,
        is_primary: true,
        status: 'active',
        maps_url: payload.source.place?.mapsUrl ?? undefined,
        google_place_id: payload.source.place?.placeId ?? undefined,
      }, session.user.id)

      if (updateResult.status !== 200) {
        throw new Error(
          typeof updateResult.data?.error === 'string'
            ? updateResult.data.error
            : 'Primary location update failed.',
        )
      }
    }

    const heroImageUrl = payload.preview.config.hero_image_url
    const locationHeroImageUrl = payload.preview.config.location_hero_image_url
    if (heroImageUrl) await setConfig(db, organizationId, siteId, 'hero_image_url', heroImageUrl)
    if (locationHeroImageUrl) await setConfig(db, organizationId, siteId, 'location_hero_image_url', locationHeroImageUrl)
    // No real Maps photo was available, so the hero is still the generic stock fallback —
    // record this so the onboarding checklist can tell a placeholder hero from a real one.
    const heroIsPlaceholder = !payload.source.place?.photos?.[0]?.photoUri
    await setConfig(db, organizationId, siteId, 'hero_image_is_placeholder', heroIsPlaceholder ? 'true' : 'false')

    // The full rebuild (content/menu/qa/posts/reviews delete+insert) plus the final
    // draft status flip runs as a single atomic D1 batch, so a failure partway through
    // never leaves the site with half-cleared content — see incident notes for why
    // sequential execute() calls here are unsafe.
    const now = new Date().toISOString()
    const batchQueries: BatchQuery[] = []

    batchQueries.push({ query: `DELETE FROM site_content WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    for (const row of payload.preview.content) {
      // These rows are auto-generated draft copy the owner has not individually edited yet
      // (the wizard only supports re-running the whole details form, not per-field edits) —
      // mark them 'template' so the checklist and dashboard hints can prompt for real content.
      batchQueries.push({
        query: `
          INSERT INTO site_content
            (id, organization_id, site_id, location_id, page, field, content,
             hero_title, hero_subtitle, value, type, source, updated_at, updated_by, component)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'template', ?, ?, ?)
          ON CONFLICT (organization_id, site_id, page, field) WHERE location_id IS NULL DO NOTHING
        `,
        params: [
          crypto.randomUUID(),
          organizationId,
          siteId,
          row.page,
          row.field,
          row.content,
          row.hero_title,
          row.hero_subtitle,
          row.value,
          row.type,
          row.updated_at || now,
          session.user.id,
          row.component,
        ],
      })
    }

    batchQueries.push({ query: `DELETE FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE site_id = ?)`, params: [siteId] })
    batchQueries.push({ query: `DELETE FROM menus WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    if (payload.preview.menu) {
      batchQueries.push({
        query: `
          INSERT INTO menus
            (id, organization_id, site_id, location_id, name, status, created_at, updated_at, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          payload.preview.menu.id,
          organizationId,
          siteId,
          locationRow.id,
          payload.preview.menu.name,
          payload.preview.menu.status,
          now,
          now,
          session.user.id,
          session.user.id,
        ],
      })

      for (const item of payload.preview.menu.items) {
        // Draft menu items are template boilerplate (e.g. "Sample Starter") the owner
        // hasn't edited — mark 'template' so the checklist doesn't treat them as real.
        batchQueries.push({
          query: `
            INSERT INTO menu_items
              (id, menu_id, section, name, slug, description, price_amount, available, sort_order, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', ?, ?)
          `,
          params: [
            item.id,
            payload.preview.menu.id,
            item.section,
            item.name,
            item.slug,
            item.description,
            item.price_amount,
            item.available ? 1 : 0,
            item.sort_order,
            now,
            now,
          ],
        })
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
        `,
        params: [
          item.id,
          organizationId,
          siteId,
          locationRow.id,
          item.question,
          item.answer,
          item.answer_author,
          item.sort_order,
          now,
          now,
        ],
      })
    }

    batchQueries.push({ query: `DELETE FROM posts WHERE organization_id = ? AND site_id = ?`, params: [organizationId, siteId] })
    for (const post of payload.preview.posts) {
      // Draft "welcome" posts are auto-generated, not owner-authored — mark 'template'.
      batchQueries.push({
        query: `
          INSERT INTO posts
            (id, organization_id, site_id, location_id, post_type, title, body, status, published_at, created_by, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, 'template', ?, ?)
        `,
        params: [
          post.id,
          organizationId,
          siteId,
          locationRow.id,
          post.title,
          post.body,
          post.status,
          post.published_at,
          session.user.id,
          now,
          now,
        ],
      })
    }

    for (const review of payload.preview.reviews) {
      if (!review.rating) continue
      batchQueries.push({
        query: `
          INSERT OR IGNORE INTO reviews
            (id, organization_id, site_id, location_id, google_review_id,
             author_name, reviewer_photo_url, rating, title, content,
             owner_reply, owner_reply_at, photo_urls, status, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
        `,
        params: [
          review.id,
          organizationId,
          siteId,
          locationRow.id,
          null,
          review.author_name,
          review.reviewer_photo_url,
          review.rating,
          review.title,
          review.content,
          review.owner_reply,
          review.owner_reply_at,
          review.photo_urls,
          review.source ?? 'direct',
          review.created_at ?? now,
          now,
        ],
      })
    }

    // Finalize draft status to committed in the same batch as the rebuild
    batchQueries.push({
      query: `
        UPDATE onboarding_drafts
        SET status = 'committed', committed_site_id = ?, committed_at = ?, updated_at = ?
        WHERE id = ?
      `,
      params: [siteId, now, now, draftId],
    })

    try {
      await executeBatch(db, batchQueries)
    } catch (batchError) {
      console.error('commit_post_batch_failed', {
        draftId,
        siteId,
        organizationId,
        batchSize: batchQueries.length,
        contentRows: payload.preview.content.length,
        menuItems: payload.preview.menu?.items.length ?? 0,
        qaRows: payload.preview.qa.length,
        posts: payload.preview.posts.length,
        reviews: payload.preview.reviews.length,
        queries: summarizeBatchQueries(batchQueries),
        error: batchError instanceof Error ? {
          name: batchError.name,
          message: batchError.message,
          stack: batchError.stack,
        } : String(batchError),
      })
      throw batchError
    }
    draftCommitted = true
    if (siteId) {
      const waitUntil = event.context.cloudflare?.context?.waitUntil
      if (typeof waitUntil === 'function') {
        waitUntil.call(event.context.cloudflare.context, purgeBootstrapCacheSafe(env, siteId))
      } else {
        await purgeBootstrapCacheSafe(env, siteId)
      }
    }

    // If anything fails after this point, the draft is already committed - we don't reset it
    // since the site was successfully created. The user can continue from the dashboard.

    let orgRow: { slug: string } | null = null
    try {
      orgRow = await queryFirst<{ slug: string }>(db, `
        SELECT slug FROM organization WHERE id = ? LIMIT 1
      `, [organizationId])
    } catch (lookupError) {
      console.warn('commit_post_org_lookup_failed', lookupError)
    }

    return jsonResponse({
      success: true,
      siteId,
      orgSlug: orgRow?.slug ?? null,
      siteSlug: siteSlug ?? null,
      locationSlug: updatedSlug ?? locationRow.slug ?? null,
    })
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
        error: 'Site was created but some data import failed. Please check your dashboard and try importing missing data manually.',
        siteId,
      }, { status: 500 })
    }
    if (siteId && draftCommitted) {
      console.error('commit_post_error_after_finalization', error)
      return jsonResponse({
        error: 'Site was created, but finalization failed. Please check your dashboard.',
        siteId,
      }, { status: 500 })
    }
    // If site was not created, reset to active for retry
    await execute(db, `
      UPDATE onboarding_drafts
      SET status = 'active', updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), draftId])
    console.error('commit_post_error_before_site_creation', error)
    return jsonResponse({
      error: 'Failed to commit draft. Please try again.',
    }, { status: 500 })
  }
})
