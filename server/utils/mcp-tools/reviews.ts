import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, reviewObject, siteTool } from './shared'

export const REVIEWS_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'list_organization_reviews',
    description: 'List tenant-wide reviews that are not associated with a location, including provenance and verification status.',
    domain: 'reviews',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { ...paginationInputSchema },
    outputSchema: { type: 'object', properties: { reviews: { type: 'array', items: reviewObject }, page_info: pageInfoObject }, required: ['reviews', 'page_info'] },
  }),
  siteTool({
      name: 'list_location_reviews',
      description: 'List reviews for a location.',
      domain: 'reviews',
      minimumRole: 'editor',
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
