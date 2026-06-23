export interface PlatformMcpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  annotations: {
    readOnlyHint: boolean
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

const HOW_TO_STEP_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    text: { type: 'string' },
    image_asset_id: { type: 'string' },
    url: { type: 'string' },
    position: { type: 'number' },
  },
  required: ['name', 'text'],
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
  required: BLOG_SUMMARY_SCHEMA.required,
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
  required: DOC_SUMMARY_SCHEMA.required,
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

const STRUCTURED_CONVENIENCE_INPUT = {
  faq_items: { type: 'array', items: FAQ_ITEM_SCHEMA },
  faq_label: { type: 'string' },
  faq_status: { type: 'string', enum: COMPONENT_STATUS_ENUM },
  faq_render_enabled: { type: 'boolean' },
  faq_schema_enabled: { type: 'boolean' },
  how_to_steps: { type: 'array', items: HOW_TO_STEP_INPUT_SCHEMA },
  how_to_estimated_time: { type: 'string' },
  how_to_tool_items: { type: 'array', items: { type: 'string' } },
  how_to_supply_items: { type: 'array', items: { type: 'string' } },
  how_to_label: { type: 'string' },
  how_to_status: { type: 'string', enum: COMPONENT_STATUS_ENUM },
  how_to_render_enabled: { type: 'boolean' },
  how_to_schema_enabled: { type: 'boolean' },
  components: { type: 'array', items: COMPONENT_INPUT_SCHEMA },
}

const SHARED_TOOL_DESCRIPTION_LINES = [
  'Set seo_description explicitly for the intended search snippet. Use canonical_url only for deliberate canonical consolidation. Use robots only for non-default index behavior. Set featured_image_asset_id whenever a social preview image is available.',
  'Use faq_items only for real visible Q&A content. Use how_to_steps only for genuinely procedural content. Use how_to_estimated_time, how_to_tool_items, and how_to_supply_items to round out How-To data when the content visibly supports it.',
  'Use faq_render_enabled/how_to_render_enabled to control whether a component appears on the page. Use faq_schema_enabled/how_to_schema_enabled to control whether a component emits structured data. Use faq_status/how_to_status to disable a component without deleting it.',
  'For normal authoring, prefer the convenience fields. For full parity and explicit metadata control, use components[]. Do not send components[] together with convenience structured-content fields.',
  'On update: omitted structured-content fields preserve existing content; empty arrays delete the corresponding component; non-empty arrays replace component data; explicit metadata fields update metadata.',
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
  definition: Omit<PlatformMcpToolDefinition, 'annotations' | 'securitySchemes'> & { destructive?: boolean },
): PlatformMcpToolDefinition {
  const { destructive, ...rest } = definition
  return {
    ...rest,
    annotations: { readOnlyHint: false, destructiveHint: Boolean(destructive) },
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
            id: { type: 'string' },
            email: NULLABLE_STRING,
            name: NULLABLE_STRING,
            role: NULLABLE_STRING,
            isPlatformAdmin: { type: 'boolean' },
          },
          required: ['id', 'email', 'name', 'role', 'isPlatformAdmin'],
        },
      },
      required: ['currentUser'],
    },
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
      properties: { post_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        ...STRUCTURED_CONVENIENCE_INPUT,
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
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        ...STRUCTURED_CONVENIENCE_INPUT,
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
    description: 'Publish a platform blog post immediately.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
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
      properties: { doc_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: DOC_CATEGORY_ENUM },
        difficulty_level: { type: 'string', enum: DOC_DIFFICULTY_ENUM },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        ...STRUCTURED_CONVENIENCE_INPUT,
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
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: DOC_CATEGORY_ENUM },
        difficulty_level: { type: 'string', enum: DOC_DIFFICULTY_ENUM },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        ...SEO_FIELDS_SCHEMA,
        ...STRUCTURED_CONVENIENCE_INPUT,
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
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: DELETE_RESPONSE_SCHEMA,
  }),
]

export function getPlatformMcpTool(name: string) {
  return PLATFORM_MCP_TOOLS.find(tool => tool.name === name) ?? null
}
