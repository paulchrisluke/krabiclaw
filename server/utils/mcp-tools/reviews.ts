import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, reviewObject, organizationTool } from './shared'

export const REVIEWS_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'list_organization_reviews',
    description: "Read site-wide reviews that have no location, including existing replies, provenance and verification status. This tool makes no changes.",
    domain: 'reviews',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { ...paginationInputSchema },
    outputSchema: { type: 'object', properties: { reviews: { type: 'array', items: reviewObject }, page_info: pageInfoObject }, required: ['reviews', 'page_info'] },
  }),
  organizationTool({
      name: 'list_location_reviews',
      description: "Read reviews and existing replies for the selected location. Includes review provenance and verification status. Replies to imported Google reviews are managed in Google; this tool makes no changes.",
      domain: 'reviews',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { location_id: { type: 'string' }, ...paginationInputSchema },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: { reviews: { type: 'array', items: reviewObject }, page_info: pageInfoObject },
        required: ['reviews', 'page_info'],
      },
    }),
]
