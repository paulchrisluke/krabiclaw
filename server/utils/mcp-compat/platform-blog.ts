import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import {
  getPlatformBlogPost,
  updatePlatformBlogPost,
  type PlatformContentComponentInput,
  type PlatformBlogUpdateInput,
} from '~/server/utils/platform-content'
import {
  markdownToContentBlocks,
  mergeLegacyBlogComponents,
  type ContentBlockInput,
} from '~/server/utils/content-documents'

const METADATA_FIELDS = [
  'title',
  'excerpt',
  'category',
  'nav_section',
  'nav_title',
  'nav_order',
  'nav_section_order',
  'hide_from_nav',
  'featured_order',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
  'featured_image_asset_id',
  'publish',
  'unpublish',
] as const

function optionalString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

function optionalNullableNumber(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (value === null) return null
  return typeof value === 'number' ? value : undefined
}

function optionalNullableString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function asContentBlocks(value: unknown): Array<ContentBlockInput & { id?: string }> {
  if (!Array.isArray(value) || !value.length) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'content_blocks must be a non-empty array.')
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `content_blocks[${index}] must be an object.`)
    }
    const block = item as Record<string, unknown>
    const data = block.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `content_blocks[${index}].data must be an object.`)
    }
    if (typeof block.type !== 'string') {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `content_blocks[${index}].type is required.`)
    }
    return {
      id: typeof block.id === 'string' ? block.id : undefined,
      type: block.type as ContentBlockInput['type'],
      data: data as Record<string, unknown>,
      parent_block_id: optionalNullableString(block, 'parent_block_id'),
      level: optionalNullableNumber(block, 'level'),
    }
  })
}

function legacyComponents(value: unknown): PlatformContentComponentInput[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw mcpProtocolError(MCP_ERROR.invalidParams, 'components must be an array.')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `components[${index}] must be an object.`)
    }
    const component = item as Record<string, unknown>
    if (component.type !== 'faq' && component.type !== 'how_to' && component.type !== 'ai_assistance') {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `components[${index}].type must be faq, how_to, or ai_assistance.`)
    }
    if (!component.data || typeof component.data !== 'object' || Array.isArray(component.data)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `components[${index}].data must be an object.`)
    }
    return component as unknown as PlatformContentComponentInput
  })
}

function mergeComponentsIntoBlocks(
  blocks: ContentBlockInput[],
  components: PlatformContentComponentInput[],
) {
  const mergeable = components
    .filter(component => component.type === 'faq' || component.type === 'how_to')
    .map((component, index) => ({
      component_id: `legacy-${component.type}-${index}`,
      type: component.type as 'faq' | 'how_to',
      position: typeof component.position === 'number' ? component.position : blocks.length + index,
      data: component.data as Record<string, unknown>,
    }))
  const merged = mergeLegacyBlogComponents(blocks, mergeable)
  const bad = merged.findings.find(finding => finding.action === 'malformed' || finding.action === 'unmatched_placeholder')
  if (bad) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, bad.detail ?? 'Legacy components could not be converted.')
  }
  const aiBlocks = components
    .filter(component => component.type === 'ai_assistance')
    .map(component => ({
      type: 'ai_assistance' as const,
      data: component.data as Record<string, unknown>,
    }))
  return [...merged.blocks, ...aiBlocks]
}

export async function updatePlatformBlogPostCompatibility(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
) {
  const postId = optionalString(args, 'post_id')
  if (!postId) throw mcpProtocolError(MCP_ERROR.invalidParams, 'post_id is required.')
  const siteId = optionalString(args, 'site_id') ?? null
  const components = legacyComponents(args.components)
  const hasBody = args.body !== undefined
  const hasContentBlocks = args.content_blocks !== undefined
  if (hasContentBlocks && (hasBody || components.length)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'Use either content_blocks or legacy body/components, not both.')
  }
  const hasMetadata = METADATA_FIELDS.some(field => args[field] !== undefined)
  const hasContent = hasContentBlocks || hasBody || components.length > 0
  if (!hasMetadata && !hasContent) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'At least one blog mutation field is required.')
  }

  let contentBlocks: Array<ContentBlockInput & { id?: string }> | undefined
  let expectedDocumentUpdatedAt = optionalString(args, 'expected_document_updated_at')
  if (hasContentBlocks) {
    contentBlocks = asContentBlocks(args.content_blocks)
    if (!expectedDocumentUpdatedAt) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'expected_document_updated_at is required with content_blocks.')
    }
  } else if (hasBody || components.length) {
    const currentPost = await getPlatformBlogPost(db, postId, siteId)
    const currentDocument = currentPost.content_document as { document?: { updated_at?: string }; blocks?: ContentBlockInput[] } | undefined
    const baseBlocks = hasBody
      ? markdownToContentBlocks(String(args.body ?? ''))
      : (currentDocument?.blocks ?? markdownToContentBlocks(String(currentPost.body ?? '')))
    contentBlocks = components.length ? mergeComponentsIntoBlocks(baseBlocks, components) : baseBlocks
    expectedDocumentUpdatedAt = expectedDocumentUpdatedAt ?? currentDocument?.document?.updated_at
  }

  const input: PlatformBlogUpdateInput = {
    expected_updated_at: optionalString(args, 'expected_updated_at'),
    title: optionalString(args, 'title'),
    excerpt: optionalString(args, 'excerpt'),
    category: optionalString(args, 'category'),
    nav_section: optionalNullableString(args, 'nav_section'),
    nav_title: optionalNullableString(args, 'nav_title'),
    nav_order: optionalNullableNumber(args, 'nav_order'),
    nav_section_order: optionalNullableNumber(args, 'nav_section_order'),
    hide_from_nav: args.hide_from_nav === null ? null : optionalBoolean(args, 'hide_from_nav'),
    featured_order: optionalNullableNumber(args, 'featured_order'),
    seo_title: optionalNullableString(args, 'seo_title'),
    seo_description: optionalNullableString(args, 'seo_description'),
    seo_keywords: optionalNullableString(args, 'seo_keywords'),
    canonical_url: optionalNullableString(args, 'canonical_url'),
    robots: optionalNullableString(args, 'robots'),
    featured_image_asset_id: optionalNullableString(args, 'featured_image_asset_id'),
    content_blocks: contentBlocks,
    expected_document_updated_at: expectedDocumentUpdatedAt,
    publish: optionalBoolean(args, 'publish'),
    unpublish: optionalBoolean(args, 'unpublish'),
  }

  console.warn('[MCP_COMPAT]', JSON.stringify({
    surface: 'platform',
    compatibility_tool_name: 'update_platform_blog_post',
    replacement_tool_names: ['update_platform_blog_metadata', 'replace_platform_blog_content'],
    user_id: userId,
  }))
  const result = await updatePlatformBlogPost(db, postId, input, siteId)
  return {
    success: true,
    admin_edit_url: result.admin_edit_url,
    public_path: result.public_path,
    public_url: result.public_url,
    preview_url: result.preview_url,
    post: result.post,
  }
}
