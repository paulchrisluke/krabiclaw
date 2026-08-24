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
]

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
          'Call list_platform_blog_posts and list_platform_docs to see what already exists.',
          'Cross-reference: which top_pages are blog/docs content already performing well (study what makes them work), which topics implied by search/traffic patterns have no corresponding post or doc, and which existing posts are stale or thin relative to their traffic.',
          'Produce a prioritized list of concrete next actions (new post topics, posts to update, docs to add) ranked by likely impact on traffic and sign-ups, with a one-line rationale for each tied to the analytics you pulled.',
          'Do not create, update, or publish anything yet — this is a strategy review for the human writer to approve before any writing happens.',
        ].join(' '),
      }
    }
    default:
      throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown prompt: ${name}`)
  }
}
