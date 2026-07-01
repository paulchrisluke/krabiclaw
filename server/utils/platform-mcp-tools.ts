import { BLOG_CATEGORY_LABELS } from '~/utils/blog-categories'

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
const BLOG_CATEGORY_ENUM = BLOG_CATEGORY_LABELS
const DOC_CATEGORY_ENUM = ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced']
const DOC_DIFFICULTY_ENUM = ['Beginner', 'Intermediate', 'Advanced']

const SEO_FIELDS_SCHEMA = {
  seo_description: NULLABLE_STRING,
  seo_keywords: NULLABLE_STRING,
  canonical_url: NULLABLE_STRING,
  robots: { type: ['string', 'null'], enum: [...ROBOTS_ENUM, null] },
  featured_image_asset_id: NULLABLE_STRING,
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

const COMPONENT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['faq', 'how_to'] },
    ...COMPONENT_METADATA_SCHEMA,
    data: { type: 'object' },
  },
  required: ['type', 'data'],
  additionalProperties: false,
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
    published: { type: 'boolean' },
    published_at: NULLABLE_STRING,
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    ...SEO_FIELDS_SCHEMA,
    featured_image: FEATURED_IMAGE_SCHEMA,
  },
  required: [
    'id',
    'title',
    'slug',
    'excerpt',
    'category',
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
        oneOf: [FAQ_COMPONENT_SCHEMA, HOW_TO_COMPONENT_SCHEMA],
      },
    },
  },
  required: [...BLOG_SUMMARY_SCHEMA.required, 'body', 'components'],
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
  },
  required: [
    'id',
    'title',
    'slug',
    'excerpt',
    'category',
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
        oneOf: [FAQ_COMPONENT_SCHEMA, HOW_TO_COMPONENT_SCHEMA],
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
    post: BLOG_RECORD_SCHEMA,
  },
  required: ['success', 'id', 'slug', 'published_at', 'post'],
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
    doc: DOC_RECORD_SCHEMA,
  },
  required: ['success', 'id', 'slug', 'status', 'published_at', 'doc'],
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
  'Use components[] as the only structured-content authoring shape. FAQ components contain data.items[]. How-To components contain data.steps[] and may also include data.estimated_time, data.tool_items, and data.supply_items.',
  'To place a visual component inside the article body, insert a component embed tag directly into body markdown, for example {{component type="faq"}} or {{component type="how_to"}}. A component only renders where its matching embed appears; there is no auto-append fallback.',
  'Use render_enabled to control whether a component appears on the page. Use schema_enabled to control whether it emits structured data. Use status to disable a component without deleting it.',
  'On update: omitting components preserves existing components; sending components: [] deletes them; sending a non-empty components[] array replaces the full component set for that page.',
  'Once the user has supplied or approved final body text and you have computed the SEO fields, call this tool directly with those values — do not respond with a description of the call you would make instead of making it. If the user also asked to publish, follow this call with the corresponding publish tool in the same turn rather than waiting for a second request.',
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

function readTool(definition: Omit<PlatformMcpToolDefinition, 'annotations' | 'securitySchemes'>): PlatformMcpToolDefinition {
  return {
    ...definition,
    annotations: { readOnlyHint: true, idempotentHint: true },
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
    name: 'list_platform_blog_posts',
    description: 'List KrabiClaw platform blog posts. Optionally filter by published or draft status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['published', 'draft'] },
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
    description: 'Fetch one platform blog post in the canonical component model with resolved media fields.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string', description: "Post id, or its slug from the public URL (krabiclaw.com/blog/<category>/<slug>)." } },
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
        body: { type: 'string', description: 'Markdown body. To embed a structured visual block inline, add tags like {{component type="faq"}} or {{component type="how_to"}} on their own line where you want the component to render.' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: BLOG_CATEGORY_ENUM },
        ...SEO_FIELDS_SCHEMA,
        components: { type: 'array', items: COMPONENT_INPUT_SCHEMA },
        publish: { type: 'boolean' },
      },
      required: ['title', 'body'],
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
        body: { type: 'string', description: 'Markdown body. To embed a structured visual block inline, add tags like {{component type="faq"}} or {{component type="how_to"}} on their own line where you want the component to render.' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: BLOG_CATEGORY_ENUM },
        ...SEO_FIELDS_SCHEMA,
        components: { type: 'array', items: COMPONENT_INPUT_SCHEMA },
        publish: { type: 'boolean' },
        unpublish: { type: 'boolean' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'publish_platform_blog_post',
    description: 'Publish a platform blog post immediately. If update and publish were both requested, call update_platform_blog_post then this tool, back to back.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string', description: 'Post id or slug.' } },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'post'],
      additionalProperties: false,
    },
  }),
  writeTool({
    name: 'unpublish_platform_blog_post',
    description: 'Move a published platform blog post back to draft.',
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string', description: 'Post id or slug.' } },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        post: BLOG_RECORD_SCHEMA,
      },
      required: ['success', 'post'],
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
      properties: { post_id: { type: 'string', description: 'Post id or slug.' } },
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
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'doc'],
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
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'doc'],
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
        doc: DOC_RECORD_SCHEMA,
      },
      required: ['success', 'doc'],
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
