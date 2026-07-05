import type { McpToolDefinition } from './shared'
import { reviewObject, siteTool } from './shared'

export const REVIEWS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_location_reviews',
      description: 'List reviews for a location.',
      domain: 'reviews',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { location_id: { type: 'string' } },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: { reviews: { type: 'array', items: reviewObject } },
        required: ['reviews'],
      },
    }),
  siteTool({
      name: 'reply_to_review',
      description: 'Add, update, or clear the owner reply for a review. Pass reply: null to clear an existing reply.',
      domain: 'reviews',
      minimumRole: 'owner',
      confirmRequired: false,
      inputSchema: { review_id: { type: 'string' }, reply: { type: ['string', 'null'] } },
      required: ['review_id', 'reply'],
      outputSchema: {
        type: 'object',
        properties: {
          review_id: { type: 'string' },
          reply: { type: ['string', 'null'] },
          replied: { type: 'boolean' },
          cleared: { type: 'boolean' },
          updated_at: { type: 'string' },
        },
        required: ['review_id', 'replied', 'cleared', 'updated_at'],
      },
    }),
]
