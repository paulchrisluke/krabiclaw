import { createError, type H3Event } from 'h3'
import { hasEntitlement } from '~/server/utils/billing'
import { requestImageUpload, buildImageUrl } from '~/server/utils/cloudflare-images'
import { createMediaAsset, activateMediaAsset, deleteMediaAsset, getMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { createLocation, deleteLocation, updateLocation } from '~/server/utils/location-management'
import { createMenu, createMenuItem, deleteMenu, deleteMenuItem, deleteMenuSection, getMenuWithItems, getMenus, renameMenuSection, reorderMenuItems, updateMenu, updateMenuItem } from '~/server/utils/menu-management'
import { createPost, deletePost, getPost, listPosts, publishPost, updatePost } from '~/server/utils/post-management'
import { createExperience, deleteExperience, getExperienceById, listExperienceBookings, listExperiences, updateBookingStatus, updateExperience } from '~/server/utils/experiences'
import { buildTranslationInventory, createTranslationJob, publishTranslationDrafts } from '~/server/utils/translation-inventory'
import { listTranslationReviewItems, saveTranslationReviewItem } from '~/server/utils/translation-review'
import { processTranslationJobBatch } from '~/server/utils/translation-processor'
import { parseScope } from '~/server/utils/translation-helpers'
import { createLocationQa, deleteLocationQa, listLocationQa } from '~/server/utils/location-qa'
import { listSiteLocales, upsertSiteLocale, deleteSiteLocale } from '~/server/utils/site-locales'
import { replyToReview } from '~/server/utils/review-management'
import { createWorkRequest } from '~/server/utils/work-request-management'
import { runSiteCreation } from '~/server/utils/site-creation'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import { getMcpTool } from '~/server/utils/mcp-tools'
import { requireMcpSite, requireMcpUser } from '~/server/utils/mcp-auth'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import {
  deleteContentField,
  discardContentDrafts,
  getContentDraftStatus,
  getGoogleBusinessLocationAuthUrlForMcp,
  getGoogleBusinessLocationConnectionForMcp,
  getMergedEditorContent,
  getLocationForMcp,
  getNotificationsSettings,
  getSiteForMcp,
  listContactSubmissions,
  listGoogleBusinessAccountsForMcp,
  listLocationReviews,
  listReservationSubmissions,
  listSitesForUser,
  listWorkRequestsForOrganization,
  publishContentDrafts,
  reorderLocationQa,
  saveContentDraft,
  syncGoogleBusinessLocationsForMcp,
  updateContactSubmissionStatus,
  updateLocationQa,
  updateNotificationsSettings,
  updateReservationSubmissionStatus,
} from '~/server/utils/mcp-workflows'

const TRANSLATION_TOOLS = new Set([
  'get_translation_inventory',
  'start_translation_job',
  'list_translation_jobs',
  'get_translation_job',
  'run_translation_job_batch',
  'get_translation_review_items',
  'save_translation_review_item',
  'publish_translations',
])

export async function executeMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
) {
  const tool = getMcpTool(toolName)
  if (!tool) {
    throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unknown tool: ${toolName}`)
  }

  validateRequiredArguments(tool.inputSchema, rawArguments)

  if (toolName === 'list_sites') {
    const user = await requireMcpUser(event)
    return { sites: await listSitesForUser(user.db, user.userId, user.isPlatformAdmin) }
  }

  if (toolName === 'create_site') {
    const user = await requireMcpUser(event)
    const result = await runSiteCreation(
      user.env,
      user.db,
      user.userId,
      {
        name: requiredString(rawArguments, 'name'),
        subdomain: requiredString(rawArguments, 'subdomain'),
        vertical: requiredString(rawArguments, 'vertical') as 'restaurant' | 'experience' | 'retail' | 'wellness' | 'service',
      },
    )
    assertDomainSuccess(result)
    return result.data
  }

  const siteId = requiredString(rawArguments, 'site_id')
  const site = await requireMcpSite(event, siteId, tool.minimumRole)
  const args = omit(rawArguments, ['site_id'])

  if (TRANSLATION_TOOLS.has(toolName) && !(await hasEntitlement(site.env, site.db, site.organizationId, 'translation'))) {
    throw createError({ statusCode: 403, statusMessage: 'Translation requires a Growth plan or above.' })
  }

  switch (toolName) {
    case 'get_site':
      return { site: await getSiteForMcp(site.db, site.siteId, site.userId) }
    case 'get_site_settings':
      return { settings: await loadSiteSettings(site.db, site.organizationId, site.siteId) }
    case 'update_site_settings': {
      const result = await updateSiteSettingsFields(site.db, site.env, site.siteId, site.organizationId, args as Record<string, unknown>, site.userId)
      assertDomainSuccess(result)
      return result.data
    }
    case 'list_locations': {
      const rows = await site.db.prepare(`
        SELECT id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_place_id,
               rating, review_count, description, short_description, status, is_primary,
               address, opening_hours, hero_image_asset_id, hero_video_asset_id, price_level,
               facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
               created_at, updated_at
        FROM business_locations
        WHERE organization_id = ? AND site_id = ?
        ORDER BY is_primary DESC, title ASC
      `).bind(site.organizationId, site.siteId).all()
      return { locations: rows.results ?? [] }
    }
    case 'get_location':
      return { location: await getLocationForMcp(site.db, site.organizationId, site.siteId, requiredString(args, 'location_id')) }
    case 'create_location': {
      const result = await createLocation(site.env, site.db, site.organizationId, site.siteId, args as never, site.userId)
      assertDomainSuccess(result)
      return result.data
    }
    case 'update_location': {
      const result = await updateLocation(site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), omit(args, ['location_id']) as never, site.userId)
      assertDomainSuccess(result)
      return result.data
    }
    case 'delete_location': {
      const result = await deleteLocation(site.env, site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), site.userId)
      assertDomainSuccess(result)
      return result.data
    }
    case 'list_menus':
      return { menus: await getMenus(site.db, site.organizationId, site.siteId, optionalString(args, 'location_id') ?? undefined) }
    case 'get_menu':
      return { menu: await getMenuWithItems(site.db, site.organizationId, site.siteId, requiredString(args, 'menu_id')) }
    case 'create_menu':
      return { menu: await createMenu(site.db, site.organizationId, site.siteId, args as never, site.userId) }
    case 'update_menu':
      return { menu: await updateMenu(site.db, site.organizationId, site.siteId, requiredString(args, 'menu_id'), omit(args, ['menu_id']) as never, site.userId) }
    case 'delete_menu':
      return { deleted: await deleteMenu(site.db, site.organizationId, site.siteId, requiredString(args, 'menu_id')) }
    case 'create_menu_item':
      return { item: await createMenuItem(site.db, requiredString(args, 'menu_id'), omit(args, ['menu_id']) as never, site.userId) }
    case 'update_menu_item':
      return { item: await updateMenuItem(site.db, requiredString(args, 'menu_item_id'), omit(args, ['menu_item_id']) as never, site.userId) }
    case 'delete_menu_item':
      return { deleted: await deleteMenuItem(site.db, requiredString(args, 'menu_item_id')) }
    case 'rename_menu_section':
      return { updated: await renameMenuSection(site.db, requiredString(args, 'menu_id'), requiredString(args, 'old_name'), requiredString(args, 'new_name'), site.userId) }
    case 'delete_menu_section':
      return { deleted: await deleteMenuSection(site.db, requiredString(args, 'menu_id'), requiredString(args, 'section_name')) }
    case 'reorder_menu_items':
      await reorderMenuItems(site.db, requiredString(args, 'menu_id'), objectArray(args.updates, 'updates').map((item) => ({ id: requiredString(item, 'id'), sort_order: Number(item.sort_order) })))
      return { updated: true }
    case 'list_posts':
      return { posts: await listPosts(site.db, site.organizationId, site.siteId, optionalString(args, 'status') ?? undefined) }
    case 'get_post':
      return { post: await getPost(site.db, site.organizationId, site.siteId, requiredString(args, 'post_id')) }
    case 'create_post':
      return { post: await createPost(site.db, site.organizationId, site.siteId, args as never, site.userId) }
    case 'update_post':
      return { post: await updatePost(site.db, site.organizationId, site.siteId, requiredString(args, 'post_id'), omit(args, ['post_id']) as never, site.userId) }
    case 'publish_post':
      return { post: await publishPost(site.db, site.organizationId, site.siteId, requiredString(args, 'post_id'), normalizeChannels(args.channels)) }
    case 'delete_post':
      return { deleted: await deletePost(site.db, site.organizationId, site.siteId, requiredString(args, 'post_id')) }
    case 'list_media_assets':
      return { assets: await listMediaAssets(site.db, site.siteId, { kind: optionalString(args, 'kind') ?? undefined, locationId: optionalString(args, 'location_id') ?? undefined }) }
    case 'request_media_upload': {
      if (!site.env.CLOUDFLARE_IMAGES_API_TOKEN || !site.env.CF_ACCOUNT_ID) throw new Error('Cloudflare Images not configured')
      const assetId = crypto.randomUUID()
      const upload = await requestImageUpload(site.env)
      await createMediaAsset(site.db, {
        id: assetId,
        organization_id: site.organizationId,
        site_id: site.siteId,
        location_id: optionalString(args, 'location_id') ?? null,
        kind: 'image',
        provider: 'cloudflare_images',
        source: 'uploaded',
        cloudflare_image_id: upload.imageId,
        status: 'pending',
        file_name: optionalString(args, 'filename') ?? 'image',
        category: (optionalString(args, 'category') as never) ?? null,
        created_by_user_id: site.userId,
      })
      return { asset_id: assetId, upload_url: upload.uploadUrl, image_id: upload.imageId }
    }
    case 'confirm_media_upload': {
      const assetId = requiredString(args, 'asset_id')
      const asset = await getMediaAsset(site.db, assetId, site.siteId)
      if (!asset?.cloudflare_image_id) throw new Error('Asset not found')
      const publicUrl = buildImageUrl(site.env, asset.cloudflare_image_id, 'public')
      const thumbnailUrl = buildImageUrl(site.env, asset.cloudflare_image_id, 'thumbnail')
      await activateMediaAsset(site.db, assetId, site.siteId, { public_url: publicUrl, thumbnail_url: thumbnailUrl })
      return { asset_id: assetId, public_url: publicUrl, thumbnail_url: thumbnailUrl, status: 'active' }
    }
    case 'update_media_asset': {
      const updated = await updateMediaAssetMetadata(site.db, requiredString(args, 'asset_id'), site.siteId, {
        alt_text: optionalString(args, 'alt_text') ?? undefined,
        location_id: optionalString(args, 'location_id') ?? undefined,
        category: (optionalString(args, 'category') as never) ?? undefined,
      })
      return { updated }
    }
    case 'delete_media_asset':
      await deleteMediaAsset(site.db, site.env, requiredString(args, 'asset_id'), site.siteId)
      return { deleted: true }
    case 'import_menu_from_media': {
      const { extractMenuFromMediaAsset } = await import('~/server/utils/chowbot-media')
      return await extractMenuFromMediaAsset(site.db, site.env as never, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        userId: site.userId,
        assetId: requiredString(args, 'asset_id'),
        menuName: optionalString(args, 'menu_name') ?? undefined,
      })
    }
    case 'get_page_content':
      return await getMergedEditorContent(site.db, site.organizationId, site.siteId, requiredString(args, 'page'), optionalString(args, 'location_id') ?? undefined)
    case 'save_content_draft':
      return await saveContentDraft(site.db, site.organizationId, site.siteId, site.userId, {
        page: requiredString(args, 'page'),
        changes: objectRecord(args.changes, 'changes'),
        location_id: optionalString(args, 'location_id'),
      })
    case 'get_content_draft_status':
      return await getContentDraftStatus(site.db, site.organizationId, site.siteId, optionalString(args, 'page') ?? undefined, optionalString(args, 'location_id') ?? undefined)
    case 'publish_content_drafts':
      return await publishContentDrafts(site.db, site.organizationId, site.siteId, { page: optionalString(args, 'page') ?? undefined, location_id: optionalString(args, 'location_id'), all: args.all === true })
    case 'discard_content_drafts':
      return await discardContentDrafts(site.db, site.organizationId, site.siteId, { page: optionalString(args, 'page') ?? undefined, location_id: optionalString(args, 'location_id'), all: args.all === true })
    case 'delete_content_field':
      return await deleteContentField(site.db, site.organizationId, site.siteId, { page: requiredString(args, 'page'), field: requiredString(args, 'field'), location_id: optionalString(args, 'location_id') })
    case 'list_location_qa':
      return { items: await listLocationQa(site.db, site.siteId, requiredString(args, 'location_id')) }
    case 'create_location_qa': {
      const result = await createLocationQa(site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), omit(args, ['location_id']) as never)
      assertDomainSuccess(result)
      return result.data
    }
    case 'update_location_qa':
      return await updateLocationQa(site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), requiredString(args, 'qa_id'), omit(args, ['location_id', 'qa_id']))
    case 'delete_location_qa': {
      const result = await deleteLocationQa(site.db, site.siteId, requiredString(args, 'location_id'), requiredString(args, 'qa_id'))
      assertDomainSuccess(result)
      return result.data
    }
    case 'reorder_location_qa':
      return await reorderLocationQa(site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), objectArray(args.updates, 'updates').map((item) => ({ id: requiredString(item, 'id'), sort_order: Number(item.sort_order) })))
    case 'list_location_reviews':
      return { reviews: await listLocationReviews(site.db, site.siteId, requiredString(args, 'location_id')) }
    case 'reply_to_review': {
      const result = await replyToReview(site.db, site.organizationId, site.siteId, requiredString(args, 'review_id'), requiredString(args, 'reply'))
      assertDomainSuccess(result)
      return result.data
    }
    case 'list_experiences':
      return { experiences: await listExperiences(site.db, site.siteId, { locationId: optionalString(args, 'location_id') ?? undefined }) }
    case 'get_experience':
      return { experience: await getExperienceById(site.db, site.siteId, requiredString(args, 'experience_id')) }
    case 'create_experience':
      return { experience: await createExperience(site.db, site.organizationId, site.siteId, args as never, site.userId) }
    case 'update_experience':
      return { experience: await updateExperience(site.db, site.siteId, requiredString(args, 'experience_id'), omit(args, ['experience_id']) as never) }
    case 'delete_experience':
      return { deleted: await deleteExperience(site.db, site.siteId, requiredString(args, 'experience_id')) }
    case 'list_experience_bookings':
      return { bookings: await listExperienceBookings(site.db, site.siteId, requiredString(args, 'experience_id')) }
    case 'update_experience_booking':
      return { booking: await updateBookingStatus(site.db, site.siteId, requiredString(args, 'experience_id'), requiredString(args, 'booking_id'), requiredString(args, 'status') as 'pending' | 'confirmed' | 'cancelled') }
    case 'list_locales':
      return await listSiteLocales(site.db, site.organizationId, site.siteId)
    case 'upsert_locale':
      return { locale: await upsertSiteLocale(site.db, site.organizationId, site.siteId, args as never) }
    case 'delete_locale':
      return await deleteSiteLocale(site.db, site.organizationId, site.siteId, requiredString(args, 'locale'))
    case 'get_translation_inventory':
      return await buildTranslationInventory(site.db, site.organizationId, site.siteId, { targetLocale: requiredString(args, 'locale'), scope: parseScope(optionalString(args, 'scope') ?? undefined), includePublished: true })
    case 'start_translation_job': {
      const job = await createTranslationJob(site.db, site.organizationId, site.siteId, site.userId, { targetLocale: requiredString(args, 'locale'), scope: parseScope(optionalString(args, 'scope') ?? undefined), includePublished: args.includePublished === true })
      const result = await processTranslationJobBatch(site.db, site.env, site.organizationId, site.siteId, job.id)
      return { job, first_batch: result }
    }
    case 'list_translation_jobs': {
      const rows = await site.db.prepare(`
        SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
               estimated_input_tokens, estimated_output_tokens, estimated_credits,
               actual_input_tokens, actual_output_tokens, actual_credits,
               processed_items, failed_items, error, created_at, updated_at, started_at, finished_at
        FROM translation_jobs
        WHERE organization_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).bind(site.organizationId, site.siteId).all()
      return { jobs: rows.results ?? [] }
    }
    case 'get_translation_job': {
      const jobId = requiredString(args, 'job_id')
      const job = await site.db.prepare(`
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `).bind(jobId, site.organizationId, site.siteId).first()
      const items = await site.db.prepare(`
        SELECT id, entity_type, entity_id, location_id, page, field, source_hash, source_chars, status, error, created_at, updated_at
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 500
      `).bind(jobId, site.organizationId, site.siteId).all()
      return { job, items: items.results ?? [] }
    }
    case 'run_translation_job_batch':
      return await processTranslationJobBatch(site.db, site.env, site.organizationId, site.siteId, requiredString(args, 'job_id'))
    case 'get_translation_review_items':
      return await listTranslationReviewItems(site.db, site.organizationId, site.siteId, { targetLocale: requiredString(args, 'locale'), scope: parseScope(optionalString(args, 'scope') ?? undefined), status: (optionalString(args, 'status') as never) ?? 'all' })
    case 'save_translation_review_item':
      return await saveTranslationReviewItem(site.db, site.organizationId, site.siteId, {
        targetLocale: requiredString(args, 'locale'),
        scope: parseScope(optionalString(args, 'scope') ?? undefined),
        entityType: requiredString(args, 'entity_type') as never,
        entityId: requiredString(args, 'entity_id'),
        field: requiredString(args, 'field'),
        fields: objectRecord(args.fields, 'fields'),
      })
    case 'publish_translations':
      return await publishTranslationDrafts(site.db, site.organizationId, site.siteId, requiredString(args, 'locale'), parseScope(optionalString(args, 'scope') ?? undefined), site.userId)
    case 'list_contact_submissions':
      return { submissions: await listContactSubmissions(site.db, site.siteId) }
    case 'update_contact_submission':
      return await updateContactSubmissionStatus(site.db, site.siteId, requiredString(args, 'submission_id'), requiredString(args, 'status'))
    case 'list_reservation_submissions':
      return { submissions: await listReservationSubmissions(site.db, site.siteId) }
    case 'update_reservation_submission':
      return await updateReservationSubmissionStatus(site.db, site.siteId, requiredString(args, 'submission_id'), requiredString(args, 'status'))
    case 'get_notification_settings':
      return { notifications: await getNotificationsSettings(site.db, site.organizationId, site.siteId) }
    case 'update_notification_settings':
      return { notifications: await updateNotificationsSettings(site.db, site.organizationId, site.siteId, requiredString(args, 'whatsapp_phone')) }
    case 'get_google_business_connection':
      return { connection: await getGoogleBusinessLocationConnectionForMcp(site.env, site.db, site.organizationId, site.siteId, requiredString(args, 'location_id')) }
    case 'get_google_business_auth_url':
      return await getGoogleBusinessLocationAuthUrlForMcp(site.env, site.db, site.organizationId, site.siteId, requiredString(args, 'location_id'), site.userId)
    case 'list_google_business_accounts':
      return await listGoogleBusinessAccountsForMcp(site.env, site.db, site.organizationId, site.siteId)
    case 'sync_google_business_locations':
      return await syncGoogleBusinessLocationsForMcp(site.env, site.db, site.organizationId, site.siteId, requiredString(args, 'account_id'), requiredStringArray(args, 'location_ids'))
    case 'list_work_requests':
      return { requests: await listWorkRequestsForOrganization(site.db, site.organizationId) }
    case 'create_work_request': {
      const result = await createWorkRequest(site.env, site.db, site.organizationId, site.siteId, { type: requiredString(args, 'type'), title: requiredString(args, 'title'), description: optionalString(args, 'description'), priority: optionalString(args, 'priority') }, )
      assertDomainSuccess(result)
      return result.data
    }
    default:
      throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unhandled tool: ${toolName}`)
  }
}

function validateRequiredArguments(schema: Record<string, unknown>, args: Record<string, unknown>) {
  const required = Array.isArray(schema.required) ? schema.required : []
  for (const key of required) {
    if (!(key in args) || args[key] === undefined || args[key] === null || args[key] === '') {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Missing required argument: ${key}`)
    }
  }
}

function requiredString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`)
  }
  return value.trim()
}

function optionalString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredStringArray(value: unknown, key: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`)
  }
  return value.map((item) => item.trim())
}

function objectRecord(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`)
  }
  return value as Record<string, string>
}

function objectArray(value: unknown, key: string) {
  if (!Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`)
  }
  return value as Record<string, unknown>[]
}

function omit(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)))
}

function normalizeChannels(value: unknown): Array<'site' | 'gmb' | 'instagram' | 'facebook'> {
  if (!Array.isArray(value) || !value.length) return ['site']
  return value.filter((item): item is 'site' | 'gmb' | 'instagram' | 'facebook' => item === 'site' || item === 'gmb' || item === 'instagram' || item === 'facebook')
}

async function loadSiteSettings(db: D1Database, organizationId: string, siteId: string) {
  const site = await db.prepare(`
    SELECT s.id, s.organization_id, s.subdomain, s.theme, s.status,
           s.primary_location_id, s.public_url, s.custom_domain_status, s.default_currency,
           s.brand_name, s.brand_description, s.logo_url, s.logo_asset_id, s.contact_email,
           s.settings, s.last_published_at, s.created_at, s.updated_at
    FROM sites s
    WHERE s.id = ? AND s.organization_id = ?
    LIMIT 1
  `).bind(siteId, organizationId).first<Record<string, unknown>>()

  if (!site) throw new Error('Site not found')

  const settings = site.settings && typeof site.settings === 'string'
    ? safeParseObject(site.settings)
    : {}

  return {
    ...site,
    url_structure: settings.url_structure ?? 'location_subdirectories',
  }
}

function safeParseObject(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function assertDomainSuccess(result: { status: number; data: Record<string, unknown> }) {
  if (result.status < 400) return
  throw createError({
    statusCode: result.status,
    statusMessage: String(result.data.error ?? 'Request failed'),
    data: result.data,
  })
}
