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
            email: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
            role: { type: ['string', 'null'] },
            isPlatformAdmin: { type: 'boolean' },
          },
          required: ['id', 'isPlatformAdmin'],
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
      properties: { posts: { type: 'array', items: { type: 'object' } } },
      required: ['posts'],
    },
  }),
  readTool({
    name: 'get_platform_blog_post',
    description: 'Fetch one platform blog post, including drafts.',
    inputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { post: { type: 'object' } },
      required: ['post'],
    },
  }),
  writeTool({
    name: 'create_platform_blog_post',
    description: 'Create a KrabiClaw platform blog post draft or publish it immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string' },
        publish: { type: 'boolean' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
  }),
  writeTool({
    name: 'update_platform_blog_post',
    description: 'Update a platform blog post draft or published post.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string' },
      },
      required: ['post_id'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
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
      properties: { docs: { type: 'array', items: { type: 'object' } } },
      required: ['docs'],
    },
  }),
  readTool({
    name: 'get_platform_doc',
    description: 'Fetch one platform doc, including drafts.',
    inputSchema: {
      type: 'object',
      properties: { doc_id: { type: 'string' } },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { doc: { type: 'object' } },
      required: ['doc'],
    },
  }),
  writeTool({
    name: 'create_platform_doc',
    description: 'Create a KrabiClaw platform documentation draft or publish it immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] },
        seo_description: { type: 'string' },
        seo_keywords: { type: 'string' },
        difficulty_level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        featured_image_asset_id: { type: 'string' },
        publish: { type: 'boolean' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
  }),
  writeTool({
    name: 'update_platform_doc',
    description: 'Update a platform documentation draft or published page.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: ['Getting Started', 'Menu Management', 'Theme Customization', 'SEO & Marketing', 'Integrations', 'Advanced'] },
        seo_description: { type: 'string' },
        seo_keywords: { type: 'string' },
        difficulty_level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] },
        sort_order: { type: 'number' },
        parent_doc_id: { type: 'string' },
        featured_image_asset_id: { type: 'string' },
      },
      required: ['doc_id'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
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
    outputSchema: { type: 'object' },
  }),
]

export function getPlatformMcpTool(name: string) {
  return PLATFORM_MCP_TOOLS.find(tool => tool.name === name) ?? null
}
