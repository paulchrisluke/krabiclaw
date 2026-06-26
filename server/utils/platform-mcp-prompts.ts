import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'

export interface PlatformMcpPromptArgument {
  name: string
  description: string
  required: boolean
}

export interface PlatformMcpPromptDefinition {
  name: string
  description: string
  arguments: PlatformMcpPromptArgument[]
}

export const PLATFORM_MCP_PROMPTS: PlatformMcpPromptDefinition[] = [
  {
    name: 'audit_content_for_growth',
    description: 'Review platform traffic, sign-ups, and existing blog/docs content to produce a prioritized list of what to write or update next for growth and SEO.',
    arguments: [
      { name: 'start_date', description: 'YYYY-MM-DD, defaults to 30 days ago.', required: false },
      { name: 'end_date', description: 'YYYY-MM-DD, defaults to today.', required: false },
    ],
  },
  {
    name: 'draft_blog_post',
    description: 'Research existing content and draft a new platform blog post for human review — does not publish.',
    arguments: [
      { name: 'topic', description: 'What the post should be about.', required: true },
      { name: 'target_keyword', description: 'Primary SEO keyword/phrase to target, if any.', required: false },
      { name: 'reference_post_id', description: 'An existing post id whose voice/structure to follow most closely.', required: false },
    ],
  },
  {
    name: 'update_and_publish_post',
    description: 'Apply writer-approved final content to an existing platform blog post and publish it.',
    arguments: [
      { name: 'identifier', description: 'The post slug (from its public URL) or post_id.', required: true },
      { name: 'body', description: 'The final, writer-approved post body to save.', required: true },
      { name: 'notes', description: 'Any additional instructions, e.g. what changed and why.', required: false },
    ],
  },
]

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name]
  if (!value || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Argument "${name}" is required for this prompt.`)
  }
  return value.trim()
}

export function renderPlatformMcpPrompt(name: string, args: Record<string, string>): { description: string; text: string } {
  switch (name) {
    case 'audit_content_for_growth': {
      const startDate = args.start_date?.trim()
      const endDate = args.end_date?.trim()
      const range = startDate || endDate
        ? ` for the range ${startDate ?? '(default start)'} to ${endDate ?? '(default end)'}`
        : ' for the default 30-day window'
      return {
        description: 'Audit platform content against analytics and propose growth/SEO priorities.',
        text: [
          `Call get_platform_analytics${range} to see traffic and new sign-ups.`,
          'Call list_platform_blog_posts and list_platform_docs to see what already exists, including draft status.',
          'Cross-reference: which top_pages are blog/docs content already performing well (study what makes them work), which topics implied by search/traffic patterns have no corresponding post or doc, and which existing posts are stale or thin relative to their traffic.',
          'Produce a prioritized list of concrete next actions (new post topics, posts to update, docs to add) ranked by likely impact on traffic and sign-ups, with a one-line rationale for each tied to the analytics you pulled.',
          'Do not create, update, or publish anything yet — this is a strategy review for the human writer to approve before any writing happens.',
        ].join(' '),
      }
    }
    case 'draft_blog_post': {
      const topic = requireArg(args, 'topic')
      const targetKeyword = args.target_keyword?.trim()
      const referencePostId = args.reference_post_id?.trim()
      return {
        description: `Draft a new blog post about: ${topic}`,
        text: [
          `Read the kc://docs/product-context resource first for product and brand facts about KrabiClaw.`,
          referencePostId
            ? `Call get_platform_blog_post with post_id "${referencePostId}" and study its voice, structure, and SEO field usage as the primary reference.`
            : 'Call list_platform_blog_posts (status "published"), pick 1-2 of the most relevant existing posts, and call get_platform_blog_post on them to study voice, structure, and SEO field usage — do not invent a new voice.',
          `Draft a full post body about "${topic}"${targetKeyword ? ` targeting the keyword "${targetKeyword}"` : ''}, matching the established voice, plus the appropriate SEO fields (seo_description, seo_keywords, robots, featured_image_asset_id) and structured-content fields (FAQ/How-To) if the content genuinely supports them.`,
          'Present the full draft — body and all computed fields — to the user for approval. Do NOT call create_platform_blog_post or publish_platform_blog_post until the user explicitly approves the draft.',
        ].join(' '),
      }
    }
    case 'update_and_publish_post': {
      const identifier = requireArg(args, 'identifier')
      const body = requireArg(args, 'body')
      const notes = args.notes?.trim()
      return {
        description: `Update and publish post: ${identifier}`,
        text: [
          `Call update_platform_blog_post with post_id "${identifier}" (it accepts either the post's id or its slug) and this body: ${body}`,
          'Compute the SEO fields (seo_description, canonical_url, robots, featured_image_asset_id) and any structured-content fields per the field-usage rules in the tool description, based on the body above.',
          notes ? `Additional instructions: ${notes}` : '',
          `Immediately after the update succeeds, call publish_platform_blog_post with post_id "${identifier}" — do not stop to describe the publish step instead of executing it.`,
          'Report back what changed (fields updated, publish status) once both calls complete.',
        ].filter(Boolean).join(' '),
      }
    }
    default:
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown prompt: ${name}`)
  }
}
