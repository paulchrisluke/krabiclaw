import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { updateLocation } from '~/server/utils/location-management'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { runSiteCreation } from '~/server/utils/site-creation'
import { setConfig } from '~/server/utils/site-config'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
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
    vertical: 'restaurant' | 'experience'
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
  if (draft.status !== 'active') {
    return jsonResponse({ error: 'Draft is no longer active' }, { status: 409 })
  }

  const payload = parseOnboardingDraftPayload(draft.payload_json)
  const result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
    name: draft.name,
    subdomain: draft.subdomain_candidate || slugify(draft.name).slice(0, 40),
    vertical: draft.vertical,
  })

  if (result.status !== 200) {
    return jsonResponse({
      error: typeof result.data.error === 'string' ? result.data.error : 'Could not create site. Please try again.',
    }, { status: result.status || 500 })
  }

  const organizationId = result.data.organizationId as string
  const siteId = result.data.siteId as string
  const siteSlug = result.data.subdomain as string | null

  const locationRow = await queryFirst<{ id: string; slug: string | null }>(db, `
    SELECT id, slug FROM business_locations
    WHERE site_id = ? AND organization_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
  `, [siteId, organizationId])

  if (!locationRow?.id) {
    return jsonResponse({ error: 'No active location found for this site. Site creation may have failed.' }, { status: 500 })
  }

  const primaryLocation = payload.preview.locations[0]
  if (primaryLocation) {
    await updateLocation(db, organizationId, siteId, locationRow.id, {
      title: primaryLocation.title,
      slug: primaryLocation.slug || slugify(primaryLocation.title),
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
  }

  const heroImageUrl = payload.preview.config.hero_image_url
  const locationHeroImageUrl = payload.preview.config.location_hero_image_url
  if (heroImageUrl) await setConfig(db, organizationId, siteId, 'hero_image_url', heroImageUrl)
  if (locationHeroImageUrl) await setConfig(db, organizationId, siteId, 'location_hero_image_url', locationHeroImageUrl)

  const now = new Date().toISOString()
  await execute(db, `DELETE FROM site_content WHERE organization_id = ? AND site_id = ?`, [organizationId, siteId])
  for (const row of payload.preview.content) {
    await execute(db, `
      INSERT INTO site_content
        (id, organization_id, site_id, location_id, page, field, content,
         hero_title, hero_subtitle, value, type, source, updated_at, updated_by, component)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)
    `, [
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
    ])
  }

  await execute(db, `DELETE FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE site_id = ?)`, [siteId])
  await execute(db, `DELETE FROM menus WHERE organization_id = ? AND site_id = ?`, [organizationId, siteId])
  if (payload.preview.menu) {
    await execute(db, `
      INSERT INTO menus
        (id, organization_id, site_id, location_id, name, status, created_at, updated_at, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
    ])

    for (const item of payload.preview.menu.items) {
      await execute(db, `
        INSERT INTO menu_items
          (id, menu_id, section, name, slug, description, price_amount, available, sort_order, created_at, updated_at, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        payload.preview.menu!.id,
        item.section,
        item.name,
        item.slug,
        item.description,
        item.price_amount,
        item.available ? 1 : 0,
        item.sort_order,
        now,
        now,
        session.user.id,
        session.user.id,
      ])
    }
  }

  await execute(db, `DELETE FROM location_qa WHERE organization_id = ? AND site_id = ?`, [organizationId, siteId])
  for (const item of payload.preview.qa) {
    await execute(db, `
      INSERT INTO location_qa
        (id, organization_id, site_id, location_id, question, answer, answer_author, is_owner_answer, source, status, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'manual', 'published', ?, ?, ?)
    `, [
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
    ])
  }

  await execute(db, `DELETE FROM posts WHERE organization_id = ? AND site_id = ?`, [organizationId, siteId])
  for (const post of payload.preview.posts) {
    await execute(db, `
      INSERT INTO posts
        (id, organization_id, site_id, location_id, post_type, title, body, status, published_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?)
    `, [
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
    ])
  }

  for (const review of payload.preview.reviews) {
    if (!review.rating) continue
    await execute(db, `
      INSERT OR IGNORE INTO reviews
        (id, organization_id, site_id, location_id, google_review_id,
         author_name, reviewer_photo_url, rating, title, content,
         owner_reply, owner_reply_at, photo_urls, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
    `, [
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
    ])
  }

  await execute(db, `
    UPDATE onboarding_drafts
    SET status = 'committed', committed_site_id = ?, committed_at = ?, updated_at = ?
    WHERE id = ?
  `, [siteId, now, now, draftId])

  const orgRow = await queryFirst<{ slug: string }>(db, `
    SELECT slug FROM organization WHERE id = ? LIMIT 1
  `, [organizationId])

  return jsonResponse({
    success: true,
    siteId,
    orgSlug: orgRow?.slug ?? null,
    siteSlug: siteSlug ?? null,
    locationSlug: locationRow.slug ?? null,
  })
})
