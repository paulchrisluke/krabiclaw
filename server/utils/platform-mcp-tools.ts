import { CHANGE_TYPES } from '~/server/utils/changelog'

export interface PlatformMcpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  fileParams?: string[]
  annotations: {
    readOnlyHint: boolean
    openWorldHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
  }
  securitySchemes: Array<{ type: 'oauth2'; scopes: string[] }>
}

const NULLABLE_STRING = { type: ['string', 'null'] }
const NULLABLE_NUMBER = { type: ['number', 'null'] }
const NULLABLE_BOOLEAN = { type: ['boolean', 'null'] }
const COMPONENT_STATUS_ENUM = ['active', 'inactive']
const ROBOTS_ENUM = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']
const DOC_CATEGORY_ENUM = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced']
const DOC_DIFFICULTY_ENUM = ['Beginner', 'Intermediate', 'Advanced']
const CONTENT_DOCUMENT_OWNER_TYPE_ENUM = ['platform_blog', 'platform_doc', 'tenant_blog']
const CONTENT_BLOCK_TYPE_ENUM = ['heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'ai_assistance', 'cta', 'callout']

const SEO_FIELDS_SCHEMA = {
  seo_description: NULLABLE_STRING,
  seo_keywords: NULLABLE_STRING,
  canonical_url: NULLABLE_STRING,
  robots: { type: ['string', 'null'], enum: [...ROBOTS_ENUM, null] },
  featured_image_asset_id: NULLABLE_STRING,
}

const NAV_FIELDS_SCHEMA = {
  nav_section: { type: ['string', 'null'], description: 'Top-level sidebar section label. Falls back to a category→section mapping, then to category itself, if unset. Does not affect the public URL.' },
  nav_title: { type: ['string', 'null'], description: 'Sidebar label override. Falls back to the title if unset. Does not affect the public URL.' },
  nav_order: { type: ['number', 'null'], description: 'Sort position within its group (or section if no group). Lower sorts first. Falls back to legacy sort_order, then published_at/created_at, if unset.' },
  nav_section_order: { type: ['number', 'null'], description: 'Sort position of the section itself among all sections. Falls back to a fixed legacy order if unset.' },
  hide_from_nav: { type: ['boolean', 'null'], description: 'Excludes this item from sidebar/nav rendering only. Does NOT deindex it or remove it from the sitemap — use robots="noindex,..." for that.' },
  featured_order: { type: ['number', 'null'], description: 'Sort position in featured/homepage placements, independent of nav ordering.' },
}

// Docs-only: gives docs a curated Section → Group → Page hierarchy (max 3 levels).
// Blog posts do not get this — blog nav stays flat/category-grouped.
const DOC_NAV_GROUP_FIELDS_SCHEMA = {
  nav_group: { type: ['string', 'null'], description: 'Optional collapsible subgroup within nav_section (e.g. section "Manage your site" → group "Branding"). Omit for a doc that sits directly under its section with no subgroup. Docs support Section → Group → Page (max 3 levels) — do not attempt deeper nesting via parent_doc_id, which is unused by nav rendering.' },
  nav_group_order: { type: ['number', 'null'], description: 'Sort position of this subgroup among other groups in the same nav_section. Only meaningful if nav_group is set.' },
}

const FEATURED_IMAGE_SCHEMA = {
  type: 'object',
  properties: {
    asset_id: NULLABLE_STRING,
    public_url: NULLABLE_STRING,
    kind: NULLABLE_STRING,
    width: NULLABLE_NUMBER,
    height: NULLABLE_NUMBER,
  },
  required: ['asset_id', 'public_url', 'kind', 'width', 'height'],
  additionalProperties: false,
}

const CHATGPT_FILE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    download_url: { type: 'string' },
    file_id: { type: 'string' },
    mime_type: NULLABLE_STRING,
    file_name: NULLABLE_STRING,
  },
  required: ['download_url', 'file_id'],
  additionalProperties: false,
}

const PLATFORM_MEDIA_ASSET_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    public_url: NULLABLE_STRING,
    thumbnail_url: NULLABLE_STRING,
    alt_text: NULLABLE_STRING,
    kind: { type: 'string', enum: ['image', 'video', 'file'] },
    provider: { type: 'string' },
    source: { type: 'string' },
    mime_type: NULLABLE_STRING,
    file_name: NULLABLE_STRING,
    width: NULLABLE_NUMBER,
    height: NULLABLE_NUMBER,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'public_url', 'thumbnail_url', 'alt_text', 'kind', 'provider', 'source', 'mime_type', 'file_name', 'width', 'height', 'created_at', 'updated_at'],
  additionalProperties: false,
}

const COMPONENT_METADATA_SCHEMA = {
  label: NULLABLE_STRING,
  status: { type: ['string', 'null'], enum: [...COMPONENT_STATUS_ENUM, null] },
  render_enabled: NULLABLE_BOOLEAN,
  schema_enabled: NULLABLE_BOOLEAN,
  position: NULLABLE_NUMBER,
}

const FAQ_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    answer: { type: 'string' },
    position: { type: 'number' },
  },
  required: ['question', 'answer'],
  additionalProperties: false,
}

const HOW_TO_STEP_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    text: { type: 'string' },
    image_asset_id: NULLABLE_STRING,
    url: NULLABLE_STRING,
    position: { type: 'number' },
    image_public_url: NULLABLE_STRING,
    image_kind: NULLABLE_STRING,
    image_width: NULLABLE_NUMBER,
    image_height: NULLABLE_NUMBER,
  },
  required: ['name', 'text', 'position', 'image_asset_id', 'url', 'image_public_url', 'image_kind', 'image_width', 'image_height'],
  additionalProperties: false,
}

const AI_ASSISTANCE_PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    title: NULLABLE_STRING,
    prompt: { type: 'string' },
    description: NULLABLE_STRING,
    copy_label: NULLABLE_STRING,
    position: { type: 'number' },
  },
  required: ['prompt'],
  additionalProperties: false,
}

const FAQ_COMPONENT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    content_type: { type: 'string', enum: ['blog_post', 'doc'] },
    content_id: { type: 'string' },
    type: { type: 'string', enum: ['faq'] },
    ...COMPONENT_METADATA_SCHEMA,
    data: {
      type: 'object',
      properties: {
        items: { type: 'array', items: FAQ_ITEM_SCHEMA },
      },
      required: ['items'],
      additionalProperties: false,
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'content_type', 'content_id', 'type', 'position', 'label', 'status', 'render_enabled', 'schema_enabled', 'data', 'created_at', 'updated_at'],
  additionalProperties: false,
}

const HOW_TO_COMPONENT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    content_type: { type: 'string', enum: ['blog_post', 'doc'] },
    content_id: { type: 'string' },
    type: { type: 'string', enum: ['how_to'] },
    ...COMPONENT_METADATA_SCHEMA,
    data: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: HOW_TO_STEP_OUTPUT_SCHEMA },
        estimated_time: NULLABLE_STRING,
        tool_items: { type: 'array', items: { type: 'string' } },
        supply_items: { type: 'array', items: { type: 'string' } },
      },
      required: ['steps'],
      additionalProperties: false,
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'content_type', 'content_id', 'type', 'position', 'label', 'status', 'render_enabled', 'schema_enabled', 'data', 'created_at', 'updated_at'],
  additionalProperties: false,
}

const AI_ASSISTANCE_COMPONENT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    content_type: { type: 'string', enum: ['blog_post', 'doc'] },
    content_id: { type: 'string' },
    type: { type: 'string', enum: ['ai_assistance'] },
    ...COMPONENT_METADATA_SCHEMA,
    data: {
      type: 'object',
      properties: {
        intro: NULLABLE_STRING,
        collapsed: NULLABLE_BOOLEAN,
        max_visible_lines: NULLABLE_NUMBER,
        prompts: { type: 'array', items: AI_ASSISTANCE_PROMPT_SCHEMA },
      },
      required: ['prompts'],
      additionalProperties: false,
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'content_type', 'content_id', 'type', 'position', 'label', 'status', 'render_enabled', 'schema_enabled', 'data', 'created_at', 'updated_at'],
  additionalProperties: false,
}

const HOW_TO_STEP_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    text: { type: 'string' },
    image_asset_id: NULLABLE_STRING,
    url: NULLABLE_STRING,
    position: { type: 'number' },
  },
  required: ['name', 'text'],
  additionalProperties: false,
}

const FAQ_COMPONENT_INPUT_DATA_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: FAQ_ITEM_SCHEMA },
  },
  required: ['items'],
  additionalProperties: false,
}

const HOW_TO_COMPONENT_INPUT_DATA_SCHEMA = {
  type: 'object',
  properties: {
    steps: { type: 'array', items: HOW_TO_STEP_INPUT_SCHEMA },
    estimated_time: NULLABLE_STRING,
    tool_items: { type: 'array', items: { type: 'string' } },
    supply_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['steps'],
  additionalProperties: false,
}

const AI_ASSISTANCE_COMPONENT_INPUT_DATA_SCHEMA = {
  type: 'object',
  properties: {
    intro: NULLABLE_STRING,
    collapsed: NULLABLE_BOOLEAN,
    max_visible_lines: NULLABLE_NUMBER,
    prompts: { type: 'array', items: AI_ASSISTANCE_PROMPT_SCHEMA },
  },
  required: ['prompts'],
  additionalProperties: false,
}

const COMPONENT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['faq', 'how_to', 'ai_assistance'] },
    ...COMPONENT_METADATA_SCHEMA,
    data: { type: 'object' },
  },
  required: ['type', 'data'],
  additionalProperties: false,
  // `data`'s shape depends on the sibling `type` field, so it's spelled out per-type here
  // instead of on the shared `properties.data` above — that's what gives the model the
  // actual step/item field names (e.g. how_to steps need `name`+`text`) instead of an
  // opaque object it has to guess the shape of.
  allOf: [
    {
      if: { properties: { type: { const: 'faq' } } },
      then: { properties: { data: FAQ_COMPONENT_INPUT_DATA_SCHEMA } },
    },
    {
      if: { properties: { type: { const: 'how_to' } } },
      then: { properties: { data: HOW_TO_COMPONENT_INPUT_DATA_SCHEMA } },
    },
    {
      if: { properties: { type: { const: 'ai_assistance' } } },
      then: { properties: { data: AI_ASSISTANCE_COMPONENT_INPUT_DATA_SCHEMA } },
    },
  ],
}

const CONTENT_BLOCK_DATA_SCHEMA = { type: 'object' }

const CONTENT_BLOCK_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    parent_block_id: NULLABLE_STRING,
    type: { type: 'string', enum: CONTENT_BLOCK_TYPE_ENUM },
    position: { type: 'number' },
    level: NULLABLE_NUMBER,
    updated_at: { type: 'string' },
    data: CONTENT_BLOCK_DATA_SCHEMA,
  },
  required: ['id', 'parent_block_id', 'type', 'position', 'level', 'updated_at', 'data'],
  additionalProperties: false,
}

const CONTENT_BLOCK_WRITE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    revision_id: { type: 'string' },
    body_markdown: { type: 'string' },
    blocks: { type: 'array', items: CONTENT_BLOCK_SCHEMA },
  },
  required: ['revision_id', 'body_markdown', 'blocks'],
  additionalProperties: false,
}

const CONTENT_DOCUMENT_LOOKUP_SCHEMA = {
  document_id: { type: 'string' },
  owner_type: { type: 'string', enum: CONTENT_DOCUMENT_OWNER_TYPE_ENUM },
  owner_id: { type: 'string' },
}

const CONTENT_DOCUMENT_LOOKUP_REQUIREMENT = {
  oneOf: [
    {
      required: ['document_id'],
      not: {
        anyOf: [
          { required: ['owner_type'] },
          { required: ['owner_id'] },
        ],
      },
    },
    {
      required: ['owner_type', 'owner_id'],
      not: { required: ['document_id'] },
    },
  ],
}

const CONTENT_BLOCK_INPUT_PROPERTIES = {
  id: { type: 'string' },
  type: { type: 'string', enum: CONTENT_BLOCK_TYPE_ENUM },
  data: CONTENT_BLOCK_DATA_SCHEMA,
  parent_block_id: NULLABLE_STRING,
  level: NULLABLE_NUMBER,
}

const BLOG_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: NULLABLE_STRING,
    body: NULLABLE_STRING,
    category: NULLABLE_STRING,
    ...NAV_FIELDS_SCHEMA,
    published: { type: 'boolean' },
    published_at: NULLABLE_STRING,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    seo_title: NULLABLE_STRING,
    ...SEO_FIELDS_SCHEMA,
    featured_image: FEATURED_IMAGE_SCHEMA,
    admin_edit_url: { type: 'string' },
    public_path: NULLABLE_STRING,
    public_url: NULLABLE_STRING,
    preview_url: NULLABLE_STRING,
  },
  required: [
    'id',
    'title',
    'slug',
    'excerpt',
    'category',
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'hide_from_nav',
    'featured_order',
    'published',
    'published_at',
    'created_at',
    'updated_at',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'featured_image_asset_id',
    'featured_image',
    'admin_edit_url',
    'public_path',
    'public_url',
    'preview_url',
  ],
  additionalProperties: false,
}

const BLOG_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    ...BLOG_SUMMARY_SCHEMA.properties,
    components: {
      type: 'array',
      items: {
        oneOf: [FAQ_COMPONENT_SCHEMA, HOW_TO_COMPONENT_SCHEMA, AI_ASSISTANCE_COMPONENT_SCHEMA],
      },
    },
    content_document: {
      type: 'object',
      properties: {
        document: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            updated_at: { type: 'string' },
            draft_revision_id: NULLABLE_STRING,
            published_revision_id: NULLABLE_STRING,
          },
          required: ['id', 'updated_at', 'draft_revision_id', 'published_revision_id'],
        },
        blocks: { type: 'array', items: CONTENT_BLOCK_SCHEMA },
      },
      required: ['document', 'blocks'],
    },
  },
  required: [...BLOG_SUMMARY_SCHEMA.required, 'body', 'components', 'content_document'],
  additionalProperties: false,
}

const DOC_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: NULLABLE_STRING,
    body: NULLABLE_STRING,
    category: NULLABLE_STRING,
    ...NAV_FIELDS_SCHEMA,
    ...DOC_NAV_GROUP_FIELDS_SCHEMA,
    difficulty_level: NULLABLE_STRING,
    sort_order: NULLABLE_NUMBER,
    parent_doc_id: NULLABLE_STRING,
    status: NULLABLE_STRING,
    published: { type: 'boolean' },
    published_at: NULLABLE_STRING,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    ...SEO_FIELDS_SCHEMA,
    featured_image: FEATURED_IMAGE_SCHEMA,
    admin_edit_url: { type: 'string' },
    public_path: NULLABLE_STRING,
    public_url: NULLABLE_STRING,
    preview_url: NULLABLE_STRING,
  },
  required: [
    'id',
    'title',
    'slug',
    'excerpt',
    'category',
    'nav_section',
    'nav_title',
    'nav_order',
    'nav_section_order',
    'nav_group',
    'nav_group_order',
    'hide_from_nav',
    'featured_order',
    'difficulty_level',
    'sort_order',
    'parent_doc_id',
    'status',
    'published',
    'published_at',
    'created_at',
    'updated_at',
    'seo_description',
    'seo_keywords',
    'canonical_url',
    'robots',
    'featured_image_asset_id',
    'featured_image',
    'admin_edit_url',
    'public_path',
    'public_url',
    'preview_url',
  ],
  additionalProperties: false,
}

const DOC_RECORD_SCHEMA = {
  type: 'object',
  properties: {
    ...DOC_SUMMARY_SCHEMA.properties,
    components: {
      type: 'array',
      items: {
        oneOf: [FAQ_COMPONENT_SCHEMA, HOW_TO_COMPONENT_SCHEMA, AI_ASSISTANCE_COMPONENT_SCHEMA],
      },
    },
  },
  required: [...DOC_SUMMARY_SCHEMA.required, 'body', 'components'],
  additionalProperties: false,
}

const BLOG_WRITE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    id: { type: 'string' },
    slug: { type: 'string' },
    published_at: NULLABLE_STRING,
    admin_edit_url: { type: 'string' },
    public_path: NULLABLE_STRING,
    public_url: NULLABLE_STRING,
    preview_url: NULLABLE_STRING,
    post: BLOG_RECORD_SCHEMA,
  },
  required: ['success', 'id', 'slug', 'published_at', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'post'],
  additionalProperties: false,
}

const DOC_WRITE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    id: { type: 'string' },
    slug: { type: 'string' },
    status: { type: 'string' },
    published_at: NULLABLE_STRING,
    admin_edit_url: { type: 'string' },
    public_path: NULLABLE_STRING,
    public_url: NULLABLE_STRING,
    preview_url: NULLABLE_STRING,
    doc: DOC_RECORD_SCHEMA,
  },
  required: ['success', 'id', 'slug', 'status', 'published_at', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'doc'],
  additionalProperties: false,
}

const DELETE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
  },
  required: ['success'],
  additionalProperties: false,
}

const SHARED_TOOL_DESCRIPTION_LINES = [
  'Set seo_description explicitly for the intended search snippet. Use canonical_url only for deliberate canonical consolidation. Use robots only for non-default index behavior. Set featured_image_asset_id only when the user has selected or uploaded a real platform media asset; otherwise leave it null.',
  'Use content_blocks[] as the only structured-content authoring shape — there is no separate body field and no separate structured-component array. Each block is { type, data, id?, level?, parent_block_id? } and blocks render in array order, so place a block at the exact index where it should appear on the page instead of embedding a placeholder tag in prose. Block types: heading, markdown, image, gallery, faq, how_to, ai_assistance, cta, callout.',
  'FAQ blocks (type: "faq") contain data.items[], each item { question: string, answer: string, position?: number }. How-To blocks (type: "how_to") contain data.steps[], each step { name: string, text: string, image_asset_id?: string|null, url?: string|null, position?: number } (name and text are both required strings; a missing name or text is the most common cause of a rejected update), and data may also include estimated_time, tool_items, and supply_items. AI Assistance blocks (type: "ai_assistance") contain data.prompts[], each prompt { prompt: string, title?: string|null, description?: string|null, copy_label?: string|null, position?: number }; each prompt is a writer-authored suggested prompt, not a generated answer. Keep AI Assistance prompts specific, actionable, page-aware, and rare enough to help the reader act.',
  'On update: omitting content_blocks preserves the existing draft content exactly as-is; sending a non-empty content_blocks array replaces the complete draft block set (this is a full replace, not a merge — include every block that should remain, not just the ones changing). content_blocks: [] is rejected, not treated as "clear the document." expected_document_updated_at is required whenever content_blocks is sent — call get_platform_blog_post first to get the current token; a stale token is rejected with a conflict so two writers can\'t silently overwrite each other.',
  'Default writer workflow is draft first: create or update the draft, then report admin_edit_url so the writer can review it. If published, also report public_url or public_path. preview_url is null until draft previews are supported.',
  'Once the user has supplied or approved final content and you have computed the SEO fields, call this tool directly with those values — do not respond with a description of the call you would make instead of making it. If the user also asked to publish, follow this call with the corresponding publish tool in the same turn rather than waiting for a second request.',
]

const PLATFORM_BLOG_TOOL_DESCRIPTION = [
  'Create or update a KrabiClaw platform blog post with full SEO and structured-content parity.',
  ...SHARED_TOOL_DESCRIPTION_LINES,
].join(' ')

const PLATFORM_DOC_TOOL_DESCRIPTION = [
  'Create or update a KrabiClaw platform documentation page with full SEO and structured-content parity.',
  ...SHARED_TOOL_DESCRIPTION_LINES,
].join(' ')

const PLATFORM_SECURITY_SCHEMES: Array<{ type: 'oauth2'; scopes: string[] }> = [
  { type: 'oauth2', scopes: ['platform_admin'] },
]

function readTool(
  definition: Omit<PlatformMcpToolDefinition, 'annotations' | 'securitySchemes'> & { openWorld?: boolean },
): PlatformMcpToolDefinition {
  const { openWorld, ...rest } = definition
  return {
    ...rest,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      ...(openWorld ? { openWorldHint: true } : {}),
    },
    securitySchemes: [...PLATFORM_SECURITY_SCHEMES],
  }
}

function writeTool(
  definition: Omit<PlatformMcpToolDefinition, 'annotations' | 'securitySchemes'> & { destructive?: boolean; openWorld?: boolean },
): PlatformMcpToolDefinition {
  const { destructive, openWorld, ...rest } = definition
  return {
    ...rest,
    annotations: { readOnlyHint: false, openWorldHint: openWorld ?? false, destructiveHint: Boolean(destructive) },
    securitySchemes: [...PLATFORM_SECURITY_SCHEMES],
  }
}

export const PLATFORM_MCP_TOOLS: PlatformMcpToolDefinition[] = [
  readTool({
    name: 'get_platform_context',
    description: 'Get the current connected platform admin account context for internal KrabiClaw operations.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        currentUser: {
          type: 'object',
          properties: {
            role: NULLABLE_STRING,
            isPlatformAdmin: { type: 'boolean' },
          },
          required: ['role', 'isPlatformAdmin'],
        },
      },
      required: ['currentUser'],
    },
  }),
  readTool({
    name: 'get_recent_changes',
    description: 'Fetch recently merged KrabiClaw GitHub pull requests, newest first, categorized by conventional-commit title type. Use this source data to draft release notes, social posts, and product updates for human review; this tool does not draft or publish anything.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Maximum merged pull requests to return.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        commits: {
          type: 'object',
          properties: Object.fromEntries(
            CHANGE_TYPES.map(type => [
              type,
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'integer' },
                    title: { type: 'string' },
                    body: NULLABLE_STRING,
                    author: { type: 'string' },
                    mergedAt: { type: 'string' },
                    url: { type: 'string' },
                    type: { type: 'string', enum: [type] },
                    scope: NULLABLE_STRING,
                    description: { type: 'string' },
                  },
                  required: ['number', 'title', 'body', 'author', 'mergedAt', 'url', 'type', 'scope', 'description'],
                  additionalProperties: false,
                },
              },
            ])),
          required: [...CHANGE_TYPES],
          additionalProperties: false,
        },
        total: { type: 'integer' },
        lastUpdated: NULLABLE_STRING,
        limit: { type: 'integer' },
      },
      required: ['commits', 'total', 'lastUpdated', 'limit'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'get_platform_analytics',
    description: 'Get krabiclaw.com platform traffic and sign-up analytics (page views, sessions, visitors, top pages, new account sign-ups) for a date range. Covers all platform pages — home, blog, docs, and marketing pages — not just tenant sites. Use this to ground content strategy in what is actually driving traffic and sign-ups: which pages are working, which are stalling, and where a new or updated post/doc would help most.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD, defaults to 30 days ago' },
        end_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        page_views: { type: 'number' },
        unique_sessions: { type: 'number' },
        unique_visitors: { type: 'number' },
        new_signups: { type: 'number', description: 'New platform accounts created in this date range.' },
        top_pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              views: { type: 'number' },
              percent_of_total: { type: 'number' },
            },
            required: ['path', 'views', 'percent_of_total'],
            additionalProperties: false,
          },
        },
        daily_data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              page_views: { type: 'number' },
              sessions: { type: 'number' },
              new_signups: { type: 'number' },
            },
            required: ['date', 'page_views', 'sessions', 'new_signups'],
            additionalProperties: false,
          },
        },
        period: {
          type: 'object',
          properties: {
            start_date: { type: 'string' },
            end_date: { type: 'string' },
          },
          required: ['start_date', 'end_date'],
          additionalProperties: false,
        },
      },
      required: ['page_views', 'unique_sessions', 'unique_visitors', 'new_signups', 'top_pages', 'daily_data', 'period'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'list_platform_media_assets',
    description: 'List active platform media assets for krabiclaw.com blog/docs authoring. Use this before assigning featured_image_asset_id so you can choose a real uploaded asset instead of inventing one.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional asset id to fetch a single media item.' },
        kind: { type: 'string', enum: ['image', 'video', 'file'], description: 'Optional kind filter. Blog/docs featured images should use kind="image".' },
        limit: { type: 'number', description: 'Maximum number of media assets to return. Defaults to 50 and caps at 100.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        media: { type: 'array', items: PLATFORM_MEDIA_ASSET_SCHEMA },
      },
      required: ['media'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'upload_platform_image',
    description: 'Upload a user-supplied image attachment into the platform media library for krabiclaw.com blog/docs use. Prefer the top-level file argument from a ChatGPT attachment. After upload succeeds, use the returned asset id as featured_image_asset_id or how_to_steps[].image_asset_id.',
    openWorld: true,
    fileParams: ['file'],
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          ...CHATGPT_FILE_INPUT_SCHEMA,
          description: 'Authorized file reference supplied by ChatGPT after rewriting the declared top-level file argument.',
        },
        file_id: { type: 'string', description: 'Resolved uploaded file identifier when the host can supply it directly.' },
        alt_text: { type: 'string', description: 'Optional alt text or image description.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        asset: PLATFORM_MEDIA_ASSET_SCHEMA,
      },
      required: ['asset'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'update_platform_media_asset',
    description: 'Update metadata on an existing platform media asset. Use this to set or refine alt text before referencing the asset in a blog post or doc.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
        alt_text: NULLABLE_STRING,
      },
      required: ['asset_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        asset: PLATFORM_MEDIA_ASSET_SCHEMA,
      },
      required: ['success', 'asset'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'delete_platform_media_asset',
    description: 'Delete a platform media asset from the shared krabiclaw.com media library.',
    destructive: true,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
      },
      required: ['asset_id'],
      additionalProperties: false,
    },
    outputSchema: DELETE_RESPONSE_SCHEMA,
  }),
  readTool({
    name: 'get_content_document_outline',
    description: 'Get the block outline for a platform blog, platform doc, or tenant blog content document. Provide either document_id, or owner_type plus owner_id.',
    inputSchema: {
      type: 'object',
      properties: CONTENT_DOCUMENT_LOOKUP_SCHEMA,
      ...CONTENT_DOCUMENT_LOOKUP_REQUIREMENT,
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        document: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            owner_type: { type: 'string', enum: CONTENT_DOCUMENT_OWNER_TYPE_ENUM },
            owner_id: { type: 'string' },
            draft_revision_id: NULLABLE_STRING,
            published_revision_id: NULLABLE_STRING,
            updated_at: { type: 'string' },
          },
          required: ['id', 'owner_type', 'owner_id', 'draft_revision_id', 'published_revision_id', 'updated_at'],
          additionalProperties: false,
        },
        blocks: { type: 'array', items: CONTENT_BLOCK_SCHEMA },
      },
      required: ['document', 'blocks'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'get_content_block',
    description: 'Fetch a single content block, including its data payload and updated_at value for optimistic replacement.',
    inputSchema: {
      type: 'object',
      properties: { block_id: { type: 'string' } },
      required: ['block_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        block: {
          type: 'object',
          properties: {
            document_id: { type: 'string' },
            ...CONTENT_BLOCK_SCHEMA.properties,
          },
          required: ['document_id', 'id', 'parent_block_id', 'type', 'position', 'level', 'updated_at', 'data'],
          additionalProperties: false,
        },
      },
      required: ['block'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'append_content_block',
    description: 'Append a block to a content document. Provide either document_id, or owner_type plus owner_id; after_block_id inserts after a specific block.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        ...CONTENT_DOCUMENT_LOOKUP_SCHEMA,
        after_block_id: NULLABLE_STRING,
        ...CONTENT_BLOCK_INPUT_PROPERTIES,
      },
      required: ['type', 'data'],
      ...CONTENT_DOCUMENT_LOOKUP_REQUIREMENT,
      additionalProperties: false,
    },
    outputSchema: CONTENT_BLOCK_WRITE_RESULT_SCHEMA,
  }),
  writeTool({
    name: 'replace_content_block',
    description: 'Replace one block data payload using optimistic concurrency. expected_updated_at must match the block returned by get_content_block or get_content_document_outline.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        expected_updated_at: { type: 'string' },
        data: CONTENT_BLOCK_DATA_SCHEMA,
      },
      required: ['block_id', 'expected_updated_at', 'data'],
      additionalProperties: false,
    },
    outputSchema: CONTENT_BLOCK_WRITE_RESULT_SCHEMA,
  }),
  writeTool({
    name: 'delete_content_block',
    description: 'Delete one block using optimistic concurrency. expected_updated_at must match the block returned by get_content_block or get_content_document_outline.',
    destructive: true,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        expected_updated_at: { type: 'string' },
      },
      required: ['block_id', 'expected_updated_at'],
      additionalProperties: false,
    },
    outputSchema: CONTENT_BLOCK_WRITE_RESULT_SCHEMA,
  }),
  readTool({
    name: 'render_content_preview',
    description: 'Render the current content blocks back to a compatibility Markdown body without publishing.',
    inputSchema: {
      type: 'object',
      properties: CONTENT_DOCUMENT_LOOKUP_SCHEMA,
      ...CONTENT_DOCUMENT_LOOKUP_REQUIREMENT,
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        body_markdown: { type: 'string' },
        blocks: { type: 'array', items: CONTENT_BLOCK_SCHEMA },
      },
      required: ['body_markdown', 'blocks'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'publish_content_revision',
    description: 'Publish the current draft revision for a platform blog, platform doc, or tenant blog content document. Provide either document_id, or owner_type plus owner_id.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: CONTENT_DOCUMENT_LOOKUP_SCHEMA,
      ...CONTENT_DOCUMENT_LOOKUP_REQUIREMENT,
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { success: { type: 'boolean' } },
      required: ['success'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'list_platform_blog_posts',
    description: 'List KrabiClaw platform blog posts. Optionally filter by published or draft status. For tenant sites, provide site_id to list site-scoped blog posts.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['published', 'draft'] },
        site_id: { type: 'string', description: 'Optional site id to list tenant blog posts instead of platform posts.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { posts: { type: 'array', items: BLOG_SUMMARY_SCHEMA } },
      required: ['posts'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'get_platform_blog_post',
    description: 'Fetch one platform blog post in the canonical component model with resolved media fields. For tenant sites, provide site_id to fetch site-scoped blog posts.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: "Post id, or its slug from the public URL (krabiclaw.com/blog/<category>/<slug>)." },
        site_id: { type: 'string', description: 'Optional site id to fetch tenant blog posts instead of platform posts.' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { post: BLOG_RECORD_SCHEMA },
      required: ['post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'create_platform_blog_post',
    description: PLATFORM_BLOG_TOOL_DESCRIPTION,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content_blocks: { type: 'array', items: { type: 'object', properties: CONTENT_BLOCK_INPUT_PROPERTIES, required: ['type', 'data'], additionalProperties: false } },
        excerpt: { type: 'string' },
        category: { type: 'string', description: 'Platform posts use the documented platform categories; tenant categories are free text when site_id is provided.' },
        ...NAV_FIELDS_SCHEMA,
        seo_title: { type: ['string', 'null'], description: 'Optional SEO/browser-tab title override. Falls back to the post title if unset.' },
        ...SEO_FIELDS_SCHEMA,
        publish: { type: 'boolean' },
        site_id: { type: 'string', description: 'Optional site id to create tenant blog posts instead of platform posts.' },
      },
      required: ['title', 'content_blocks'],
      additionalProperties: false,
    },
    outputSchema: BLOG_WRITE_RESPONSE_SCHEMA,
  }),
  writeTool({
    name: 'update_platform_blog_post',
    description: PLATFORM_BLOG_TOOL_DESCRIPTION,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        title: { type: 'string' },
        content_blocks: { type: 'array', items: { type: 'object', properties: CONTENT_BLOCK_INPUT_PROPERTIES, required: ['type', 'data'], additionalProperties: false } },
        expected_document_updated_at: { type: 'string', description: 'Required when replacing content_blocks.' },
        excerpt: { type: 'string' },
        category: { type: 'string', description: 'Platform posts use the documented platform categories; tenant categories are free text when site_id is provided.' },
        ...NAV_FIELDS_SCHEMA,
        seo_title: { type: ['string', 'null'], description: 'Optional SEO/browser-tab title override. Falls back to the post title if unset.' },
        ...SEO_FIELDS_SCHEMA,
        publish: { type: 'boolean' },
        unpublish: { type: 'boolean' },
        site_id: { type: 'string', description: 'Optional site id to update tenant blog posts instead of platform posts.' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'publish_platform_blog_post',
    description: 'Publish a platform blog post immediately. If update and publish were both requested, call update_platform_blog_post then this tool, back to back.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        site_id: { type: 'string', description: 'Optional site id for a tenant blog post.' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'unpublish_platform_blog_post',
    description: 'Move a published platform blog post back to draft.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        site_id: { type: 'string', description: 'Optional site id for a tenant blog post.' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'reorder_platform_blog_posts',
    description: 'Set editorial navigation (section, title, order, visibility) for platform blog posts without changing their taxonomy category or public URL. Blog posts do not support nav_group subgrouping (docs-only feature) — only nav_section.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Optional site id for tenant blog posts.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              post_id: { type: 'string', description: 'Post id or slug.' },
              nav_section: NAV_FIELDS_SCHEMA.nav_section,
              nav_title: NAV_FIELDS_SCHEMA.nav_title,
              nav_order: { type: 'number' },
              nav_section_order: NAV_FIELDS_SCHEMA.nav_section_order,
              hide_from_nav: NAV_FIELDS_SCHEMA.hide_from_nav,
            },
            required: ['post_id', 'nav_order'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        posts: { type: 'array', items: BLOG_SUMMARY_SCHEMA },
      },
      required: ['success', 'posts'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'delete_platform_blog_post',
    description: 'Delete a platform blog post permanently.',
    destructive: true,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        site_id: { type: 'string', description: 'Optional site id for a tenant blog post.' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: DELETE_RESPONSE_SCHEMA,
  }),
  readTool({
    name: 'list_platform_docs',
    description: 'List KrabiClaw platform docs. Optionally filter by published or draft status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['published', 'draft'] },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { docs: { type: 'array', items: DOC_SUMMARY_SCHEMA } },
      required: ['docs'],
      additionalProperties: false,
    },
  }),
  readTool({
    name: 'get_platform_doc',
    description: 'Fetch one platform doc in the canonical component model with resolved media fields.',
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string', description: 'Doc id, or its slug from the public URL (krabiclaw.com/docs/<slug>).' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { doc: DOC_RECORD_SCHEMA },
      required: ['doc'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'create_platform_doc',
    description: PLATFORM_DOC_TOOL_DESCRIPTION,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown body. To embed a structured visual block inline, add tags like {{component type="faq"}} or {{component type="how_to"}} on their own line where you want the component to render.' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: DOC_CATEGORY_ENUM },
        ...NAV_FIELDS_SCHEMA,
        ...DOC_NAV_GROUP_FIELDS_SCHEMA,
        difficulty_level: { type: 'string', enum: DOC_DIFFICULTY_ENUM },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        components: { type: 'array', items: COMPONENT_INPUT_SCHEMA },
        publish: { type: 'boolean' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    outputSchema: DOC_WRITE_RESPONSE_SCHEMA,
  }),
  writeTool({
    name: 'update_platform_doc',
    description: PLATFORM_DOC_TOOL_DESCRIPTION,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string', description: 'Doc id or slug.' },
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown body. To embed a structured visual block inline, add tags like {{component type="faq"}} or {{component type="how_to"}} on their own line where you want the component to render.' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: DOC_CATEGORY_ENUM },
        ...NAV_FIELDS_SCHEMA,
        ...DOC_NAV_GROUP_FIELDS_SCHEMA,
        difficulty_level: { type: 'string', enum: DOC_DIFFICULTY_ENUM },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        components: { type: 'array', items: COMPONENT_INPUT_SCHEMA },
        publish: { type: 'boolean' },
        unpublish: { type: 'boolean' },
      },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'doc'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'publish_platform_doc',
    description: 'Publish a platform doc immediately.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string', description: 'Doc id or slug.' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'doc'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'unpublish_platform_doc',
    description: 'Move a published platform doc back to draft.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string', description: 'Doc id or slug.' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        admin_edit_url: { type: 'string' },
        public_path: NULLABLE_STRING,
        public_url: NULLABLE_STRING,
        preview_url: NULLABLE_STRING,
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'admin_edit_url', 'public_path', 'public_url', 'preview_url', 'doc'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'reorder_platform_docs',
    description: 'Set editorial navigation (section, group, title, order, visibility) for platform docs without changing their taxonomy category, parent_doc_id (unused by nav rendering), or public URL. nav_group nests under nav_section; leave unset for docs with no subgroup.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              doc_id: { type: 'string', description: 'Doc id or slug.' },
              nav_section: NAV_FIELDS_SCHEMA.nav_section,
              nav_title: NAV_FIELDS_SCHEMA.nav_title,
              nav_order: { type: 'number' },
              nav_section_order: NAV_FIELDS_SCHEMA.nav_section_order,
              nav_group: DOC_NAV_GROUP_FIELDS_SCHEMA.nav_group,
              nav_group_order: DOC_NAV_GROUP_FIELDS_SCHEMA.nav_group_order,
              hide_from_nav: NAV_FIELDS_SCHEMA.hide_from_nav,
            },
            required: ['doc_id', 'nav_order'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        docs: { type: 'array', items: DOC_SUMMARY_SCHEMA },
      },
      required: ['success', 'docs'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'delete_platform_doc',
    description: 'Delete a platform doc permanently.',
    destructive: true,
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string', description: 'Doc id or slug.' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: DELETE_RESPONSE_SCHEMA,
  }),
]

export function getPlatformMcpTool(name: string) {
  return PLATFORM_MCP_TOOLS.find(tool => tool.name === name) ?? null
}
