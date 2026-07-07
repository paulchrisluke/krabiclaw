import type { H3Event } from 'h3'
import { isIP } from 'node:net'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { queryFirst } from '~/server/db'
import { aggregatePlatformAnalyticsForDate, getPlatformAnalyticsSummary } from '~/server/utils/analytics'
import { hasCloudflareImagesConfig, uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { createMediaAsset, deleteMediaAsset, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { getPlatformMcpTool } from '~/server/utils/platform-mcp-tools'
import { ensurePlatformMediaScope, listPlatformMediaAssets, PLATFORM_MEDIA_ORG_ID, PLATFORM_MEDIA_SITE_ID } from '~/server/utils/platform-media'
import {
  appendContentBlock,
  deleteContentBlock,
  getContentBlock,
  getContentDocumentById,
  getContentDocumentByOwner,
  getContentOutline,
  publishContentDocumentRevision,
  renderContentPreview,
  replaceContentBlock,
  type ContentBlockType,
  type ContentDocumentOwnerType,
} from '~/server/utils/content-documents'
import {
  createPlatformBlogPost,
  createPlatformDoc,
  deletePlatformBlogPost,
  deletePlatformDoc,
  getPlatformBlogPost,
  getPlatformDoc,
  listPlatformBlogPosts,
  listPlatformDocs,
  reorderPlatformBlogPosts,
  reorderPlatformDocs,
  updatePlatformBlogPost,
  updatePlatformDoc,
} from '~/server/utils/platform-content'

function requiredString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} is required.`)
  }
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

function optionalNumber(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'number' ? value : undefined
}

function optionalNullableNumber(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (value === null) return null
  return typeof value === 'number' ? value : undefined
}

function optionalArray(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return Array.isArray(value) ? value : undefined
}

const CONTENT_DOCUMENT_OWNER_TYPES: readonly ContentDocumentOwnerType[] = ['platform_blog', 'platform_doc', 'tenant_blog']
const CONTENT_BLOCK_TYPES: readonly ContentBlockType[] = ['heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'ai_assistance', 'cta', 'callout']

function requiredObject(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be an object.`)
  }
  return value as Record<string, unknown>
}

function optionalNullableString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function optionalContentBlockType(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (!CONTENT_BLOCK_TYPES.includes(value as ContentBlockType)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be one of: ${CONTENT_BLOCK_TYPES.join(', ')}.`)
  }
  return value as ContentBlockType
}

function optionalContentDocumentOwnerType(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (!CONTENT_DOCUMENT_OWNER_TYPES.includes(value as ContentDocumentOwnerType)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be one of: ${CONTENT_DOCUMENT_OWNER_TYPES.join(', ')}.`)
  }
  return value as ContentDocumentOwnerType
}

async function resolveContentDocument(db: D1Database, args: Record<string, unknown>) {
  const documentId = optionalString(args, 'document_id')
  if (documentId) {
    const document = await getContentDocumentById(db, documentId)
    if (!document) throw mcpProtocolError(MCP_ERROR.invalidParams, 'content document not found.')
    return document
  }

  const ownerId = optionalString(args, 'owner_id')
  const ownerType = args.owner_type !== undefined ? optionalContentDocumentOwnerType(args, 'owner_type') : undefined
  if (!ownerType || !ownerId) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'Provide either document_id, or owner_type and owner_id.')
  }

  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) throw mcpProtocolError(MCP_ERROR.invalidParams, 'content document not found.')
  return document
}

async function getFormattedContentBlock(db: D1Database, blockId: string) {
  const block = await getContentBlock(db, blockId)
  return {
    document_id: block.document_id,
    id: block.id,
    parent_block_id: block.parent_block_id,
    type: block.type,
    position: block.position,
    level: block.level,
    updated_at: block.updated_at,
    data: block.data,
  }
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function optionalDateParam(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || dateString(parsed) !== value) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be a valid date in YYYY-MM-DD format.`)
  }
  return value
}

function structuredContentInput(args: Record<string, unknown>) {
  return {
    components: optionalArray(args, 'components') as Array<{
      type: 'faq' | 'how_to' | 'ai_assistance'
      position?: number
      label?: string
      status?: 'active' | 'inactive'
      render_enabled?: boolean
      schema_enabled?: boolean
      data: unknown
    }> | undefined,
  }
}

function navMetadataInput(args: Record<string, unknown>) {
  return {
    nav_section: args.nav_section === null ? null : optionalString(args, 'nav_section'),
    nav_title: args.nav_title === null ? null : optionalString(args, 'nav_title'),
    nav_order: optionalNullableNumber(args, 'nav_order'),
    nav_section_order: optionalNullableNumber(args, 'nav_section_order'),
    hide_from_nav: args.hide_from_nav === null ? null : optionalBoolean(args, 'hide_from_nav'),
    featured_order: optionalNullableNumber(args, 'featured_order'),
  }
}

function reorderItems(args: Record<string, unknown>, idKey: 'doc_id' | 'post_id') {
  const items = optionalArray(args, 'items')
  if (!items?.length) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'items must be a non-empty array.')
  }
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'Each reorder item must be an object.')
    }
    const record = item as Record<string, unknown>
    const navOrder = record.nav_order
    if (typeof navOrder !== 'number' || !Number.isInteger(navOrder)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'Each reorder item must have an integer nav_order.')
    }
    const navSectionOrder = record.nav_section_order
    if (navSectionOrder !== undefined && navSectionOrder !== null && (typeof navSectionOrder !== 'number' || !Number.isInteger(navSectionOrder))) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'nav_section_order must be an integer when provided.')
    }
    return {
      [idKey]: requiredString(record, idKey),
      nav_section: record.nav_section === null ? null : optionalString(record, 'nav_section') ?? null,
      nav_order: navOrder,
      nav_section_order: navSectionOrder === null ? null : (typeof navSectionOrder === 'number' ? navSectionOrder : undefined),
    }
  })
}

interface ToolFileReference {
  download_url: string
  file_id: string
  mime_type?: string
  file_name?: string
}

function toolFileReference(value: unknown, key: string): ToolFileReference {
  if (typeof value === 'string' && value.trim()) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `${key} must be sent as a ChatGPT file argument so the host rewrites the local path into an authorized file reference before KrabiClaw receives it.`,
    )
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`)
  }

  const record = value as Record<string, unknown>
  const downloadUrl = record.download_url
  const fileId = record.file_id
  if (typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}.download_url`)
  }
  if (typeof fileId !== 'string' || !fileId.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}.file_id`)
  }

  return {
    download_url: downloadUrl.trim(),
    file_id: fileId.trim(),
    mime_type: typeof record.mime_type === 'string' && record.mime_type.trim() ? record.mime_type.trim() : undefined,
    file_name: typeof record.file_name === 'string' && record.file_name.trim() ? record.file_name.trim() : undefined,
  }
}

function validateImageContentType(contentType: string, label: string) {
  if (!contentType.startsWith('image/')) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} is not an image.`)
  }
}

const MAX_PLATFORM_IMAGE_BYTES = 10 * 1024 * 1024

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b = -1] = parts
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')
}

function normalizeHostnameForIpChecks(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

export function assertSafeDownloadUrl(rawUrl: string, label: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL is invalid.`)
  }

  if (parsed.protocol !== 'https:') {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL must use https.`)
  }

  const hostname = parsed.hostname.trim().toLowerCase()
  const normalizedHostname = normalizeHostnameForIpChecks(hostname)
  if (!hostname) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL must include a hostname.`)
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL cannot target localhost.`)
  }
  if (isIP(normalizedHostname) === 4 && isPrivateIpv4(normalizedHostname)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL cannot target a private IPv4 address.`)
  }
  if (isIP(normalizedHostname) === 6 && isPrivateIpv6(normalizedHostname)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} download URL cannot target a private IPv6 address.`)
  }

  return parsed
}

async function readResponseBufferWithLimit(response: Response, label: string): Promise<ArrayBuffer> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PLATFORM_IMAGE_BYTES) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${MAX_PLATFORM_IMAGE_BYTES} byte limit.`)
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_PLATFORM_IMAGE_BYTES) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${MAX_PLATFORM_IMAGE_BYTES} byte limit.`)
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_PLATFORM_IMAGE_BYTES) {
        await reader.cancel()
        throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${MAX_PLATFORM_IMAGE_BYTES} byte limit.`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer
}

async function resolveAttachmentImageFile(
  file: ToolFileReference,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const safeDownloadUrl = assertSafeDownloadUrl(file.download_url, `Attachment ${file.file_id}`)
  const response = await fetch(safeDownloadUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Failed to download attachment ${file.file_id}: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? file.mime_type ?? 'application/octet-stream'
  validateImageContentType(contentType, `Attachment ${file.file_id}`)
  const buffer = await readResponseBufferWithLimit(response, `Attachment ${file.file_id}`)
  const filename = file.file_name ?? `${file.file_id}.${contentType.split('/')[1] ?? 'png'}`
  return { buffer, contentType, filename }
}

async function resolveUserUploadedImageFile(
  fileId: string,
  env: ApiRecord,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const accountId = env.CF_ACCOUNT_ID as string | undefined
  const gatewayName = env.CF_GATEWAY_NAME as string | undefined
  const aigToken = env.CLOUDFLARE_API_TOKEN as string | undefined

  if (!accountId || !gatewayName || !aigToken) {
    throw new Error('CF AI Gateway env vars not configured (CF_ACCOUNT_ID, CF_GATEWAY_NAME, CLOUDFLARE_API_TOKEN)')
  }

  const normalizedFileId = fileId
    .trim()
    .replace(/^sediment:\/\//i, '')
    .replace(/^file:\/\//i, '')
    .replace(/^\/+/, '')

  if (!normalizedFileId || !/^[a-zA-Z0-9_-]+$/.test(normalizedFileId)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'file_id must be a valid uploaded file identifier.')
  }

  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/openai/v1/files/${normalizedFileId}/content`
  const response = await fetch(url, {
    headers: { 'cf-aig-authorization': `Bearer ${aigToken}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Failed to fetch uploaded file ${normalizedFileId} via AI Gateway: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  validateImageContentType(contentType, `File ${normalizedFileId}`)
  const buffer = await readResponseBufferWithLimit(response, `File ${normalizedFileId}`)
  const filename = `${normalizedFileId}.${contentType.split('/')[1] ?? 'png'}`
  return { buffer, contentType, filename }
}

export async function executePlatformMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
) {
  const tool = getPlatformMcpTool(toolName)
  if (!tool) {
    throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unknown tool: ${toolName}`)
  }

  const user = await requireMcpUser(event, {
    // See scopes comment in server/utils/auth.ts: DCR-registered MCP clients
    // legitimately carry every custom scope by default, so forbiddenScopes
    // isn't used here — audiences (aud claim) + requirePlatformAdmin (DB role)
    // are the real boundary, matching server/api/mcp/platform.post.ts.
    audiences: [
      `${String(event.context.cloudflare?.env?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')}/api/mcp/platform`,
    ],
    requiredScopes: ['platform_admin'],
    requirePlatformAdmin: true,
  })

  switch (toolName) {
    case 'get_platform_context': {
      const currentUser = await queryFirst<{ role: string | null }>(
        user.db,
        'SELECT role FROM user WHERE id = ? LIMIT 1',
        [user.userId],
      )
      if (!currentUser) throw mcpProtocolError(MCP_ERROR.internal, 'Current user not found.')
      return {
        currentUser: {
          role: currentUser.role ?? null,
          isPlatformAdmin: user.isPlatformAdmin,
        },
      }
    }
    case 'get_platform_analytics': {
      const endDate = optionalDateParam(rawArguments, 'end_date') ?? dateString(new Date())
      const startDate = optionalDateParam(rawArguments, 'start_date') ?? dateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      if (startDate > endDate) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'start_date must be before or equal to end_date.')
      }

      const today = dateString(new Date())
      if (endDate >= today) {
        await aggregatePlatformAnalyticsForDate(user.db, today)
      }

      const summary = await getPlatformAnalyticsSummary(user.db, startDate, endDate)
      return {
        page_views: summary.pageViews,
        unique_sessions: summary.uniqueSessions,
        unique_visitors: summary.uniqueVisitors,
        new_signups: summary.newSignups,
        top_pages: summary.topPages.map((page) => ({
          path: page.path,
          views: page.views,
          percent_of_total: page.percentOfTotal,
        })),
        daily_data: summary.dailyData.map((day) => ({
          date: day.date,
          page_views: day.pageViews,
          sessions: day.sessions,
          new_signups: day.newSignups,
        })),
        period: { start_date: startDate, end_date: endDate },
      }
    }
    case 'list_platform_media_assets':
      return {
        media: await listPlatformMediaAssets(user.db, {
          id: optionalString(rawArguments, 'id'),
          kind: optionalString(rawArguments, 'kind') as 'image' | 'video' | 'file' | undefined,
          limit: optionalNumber(rawArguments, 'limit'),
        }),
      }
    case 'upload_platform_image': {
      if (!hasCloudflareImagesConfig(user.env)) {
        throw new Error('Cloudflare Images not configured')
      }

      const fileReferenceValue = rawArguments.file
      const fileReference = fileReferenceValue !== undefined ? toolFileReference(fileReferenceValue, 'file') : null
      const fileId = optionalString(rawArguments, 'file_id') ?? null
      if (!fileReference && !fileId) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'upload_platform_image requires either file or file_id.')
      }

      const upload = fileReference
        ? await resolveAttachmentImageFile(fileReference)
        : await resolveUserUploadedImageFile(fileId!, user.env)
      const uploaded = await uploadImageBuffer(
        user.env as Parameters<typeof uploadImageBuffer>[0],
        upload.buffer,
        upload.filename,
        upload.contentType,
      )

      await ensurePlatformMediaScope(user.db)
      const assetId = crypto.randomUUID()
      await createMediaAsset(user.db, {
        id: assetId,
        organization_id: PLATFORM_MEDIA_ORG_ID,
        site_id: PLATFORM_MEDIA_SITE_ID,
        kind: 'image',
        provider: 'cloudflare_images',
        source: 'uploaded',
        cloudflare_image_id: uploaded.imageId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        alt_text: optionalString(rawArguments, 'alt_text') ?? fileReference?.file_name ?? null,
        mime_type: upload.contentType,
        file_name: upload.filename,
        status: 'active',
        created_by_user_id: user.userId,
      })

      const asset = (await listPlatformMediaAssets(user.db, { id: assetId, limit: 1 }))[0] ?? null
      if (!asset) throw mcpProtocolError(MCP_ERROR.internal, 'Uploaded media asset was not found after creation.')
      return { asset }
    }
    case 'update_platform_media_asset': {
      const assetId = requiredString(rawArguments, 'asset_id')
      const updated = await updateMediaAssetMetadata(user.db, assetId, PLATFORM_MEDIA_SITE_ID, {
        alt_text: rawArguments.alt_text === null ? null : optionalString(rawArguments, 'alt_text'),
      })
      if (!updated) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'No platform media fields were updated.')
      }
      const asset = (await listPlatformMediaAssets(user.db, { id: assetId, limit: 1 }))[0] ?? null
      if (!asset) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Platform media asset not found.')
      return { success: true, asset }
    }
    case 'delete_platform_media_asset': {
      const assetId = requiredString(rawArguments, 'asset_id')
      const asset = (await listPlatformMediaAssets(user.db, { id: assetId, limit: 1 }))[0] ?? null
      if (!asset) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Platform media asset not found.')
      await deleteMediaAsset(user.db, user.env, assetId, PLATFORM_MEDIA_SITE_ID, user.userId)
      return { success: true }
    }
    case 'get_content_document_outline': {
      const document = await resolveContentDocument(user.db, rawArguments)
      return {
        document: {
          id: document.id,
          owner_type: document.owner_type,
          owner_id: document.owner_id,
          draft_revision_id: document.draft_revision_id,
          published_revision_id: document.published_revision_id,
          updated_at: document.updated_at,
        },
        blocks: await getContentOutline(user.db, document.id),
      }
    }
    case 'get_content_block':
      return { block: await getFormattedContentBlock(user.db, requiredString(rawArguments, 'block_id')) }
    case 'append_content_block': {
      const document = await resolveContentDocument(user.db, rawArguments)
      return await appendContentBlock(user.db, document.id, {
        after_block_id: optionalNullableString(rawArguments, 'after_block_id'),
        type: optionalContentBlockType(rawArguments, 'type'),
        data: requiredObject(rawArguments, 'data'),
        parent_block_id: optionalNullableString(rawArguments, 'parent_block_id'),
        level: optionalNullableNumber(rawArguments, 'level'),
        createdBy: user.userId,
        label: 'MCP block append',
      })
    }
    case 'replace_content_block':
      return await replaceContentBlock(user.db, requiredString(rawArguments, 'block_id'), {
        expected_updated_at: requiredString(rawArguments, 'expected_updated_at'),
        data: requiredObject(rawArguments, 'data'),
        createdBy: user.userId,
        label: 'MCP block replace',
      })
    case 'delete_content_block':
      return await deleteContentBlock(user.db, requiredString(rawArguments, 'block_id'), {
        expected_updated_at: requiredString(rawArguments, 'expected_updated_at'),
        createdBy: user.userId,
        label: 'MCP block delete',
      })
    case 'render_content_preview': {
      const document = await resolveContentDocument(user.db, rawArguments)
      return await renderContentPreview(user.db, document.id)
    }
    case 'publish_content_revision': {
      const document = await resolveContentDocument(user.db, rawArguments)
      await publishContentDocumentRevision(user.db, document.id)
      return { success: true }
    }
    case 'list_platform_blog_posts':
      return { posts: await listPlatformBlogPosts(user.db, optionalString(rawArguments, 'status')) }
    case 'get_platform_blog_post':
      return { post: await getPlatformBlogPost(user.db, requiredString(rawArguments, 'post_id')) }
    case 'create_platform_blog_post':
      return await createPlatformBlogPost(user.db, user.userId, {
        title: requiredString(rawArguments, 'title'),
        body: requiredString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt') ?? null,
        category: optionalString(rawArguments, 'category') ?? null,
        ...navMetadataInput(rawArguments),
        seo_description: optionalString(rawArguments, 'seo_description') ?? null,
        seo_keywords: optionalString(rawArguments, 'seo_keywords') ?? null,
        canonical_url: optionalString(rawArguments, 'canonical_url') ?? null,
        robots: optionalString(rawArguments, 'robots') ?? null,
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id') ?? null,
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish') ?? false,
      })
    case 'update_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), {
        title: optionalString(rawArguments, 'title'),
        body: optionalString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt'),
        category: optionalString(rawArguments, 'category'),
        ...navMetadataInput(rawArguments),
        seo_description: optionalString(rawArguments, 'seo_description'),
        seo_keywords: optionalString(rawArguments, 'seo_keywords'),
        canonical_url: optionalString(rawArguments, 'canonical_url'),
        robots: optionalString(rawArguments, 'robots'),
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id'),
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish'),
        unpublish: optionalBoolean(rawArguments, 'unpublish'),
      })
    case 'publish_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), { publish: true })
    case 'unpublish_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), { unpublish: true })
    case 'reorder_platform_blog_posts':
      return await reorderPlatformBlogPosts(user.db, reorderItems(rawArguments, 'post_id') as Array<{ post_id: string; nav_section?: string | null; nav_order: number; nav_section_order?: number | null }>)
    case 'delete_platform_blog_post':
      return await deletePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'))
    case 'list_platform_docs':
      return { docs: await listPlatformDocs(user.db, optionalString(rawArguments, 'status')) }
    case 'get_platform_doc':
      return { doc: await getPlatformDoc(user.db, requiredString(rawArguments, 'doc_id')) }
    case 'create_platform_doc':
      return await createPlatformDoc(user.db, user.userId, {
        title: requiredString(rawArguments, 'title'),
        body: requiredString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt') ?? null,
        category: optionalString(rawArguments, 'category') ?? null,
        ...navMetadataInput(rawArguments),
        seo_description: optionalString(rawArguments, 'seo_description') ?? null,
        seo_keywords: optionalString(rawArguments, 'seo_keywords') ?? null,
        canonical_url: optionalString(rawArguments, 'canonical_url') ?? null,
        robots: optionalString(rawArguments, 'robots') ?? null,
        difficulty_level: optionalString(rawArguments, 'difficulty_level') ?? null,
        sort_order: optionalNumber(rawArguments, 'sort_order') ?? 0,
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id') ?? null,
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id') ?? null,
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish') ?? false,
      })
    case 'update_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), {
        title: optionalString(rawArguments, 'title'),
        body: optionalString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt'),
        category: optionalString(rawArguments, 'category'),
        ...navMetadataInput(rawArguments),
        seo_description: optionalString(rawArguments, 'seo_description'),
        seo_keywords: optionalString(rawArguments, 'seo_keywords'),
        canonical_url: optionalString(rawArguments, 'canonical_url'),
        robots: optionalString(rawArguments, 'robots'),
        difficulty_level: optionalString(rawArguments, 'difficulty_level'),
        sort_order: optionalNumber(rawArguments, 'sort_order'),
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id'),
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id'),
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish'),
        unpublish: optionalBoolean(rawArguments, 'unpublish'),
      })
    case 'publish_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), { publish: true })
    case 'unpublish_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), { unpublish: true })
    case 'reorder_platform_docs':
      return await reorderPlatformDocs(user.db, reorderItems(rawArguments, 'doc_id') as Array<{ doc_id: string; nav_section?: string | null; nav_order: number; nav_section_order?: number | null }>)
    case 'delete_platform_doc':
      return await deletePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'))
    default:
      throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unknown tool: ${toolName}`)
  }
}
