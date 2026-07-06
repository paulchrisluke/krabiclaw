import type { McpToolDefinition } from './shared'
import { reservationSubmissionObject, siteTool, submissionObject } from './shared'

export const SUBMISSIONS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_contact_inquiries',
      description: 'List contact submissions.',
      domain: 'submissions',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: { submissions: { type: 'array', items: submissionObject } },
        required: ['submissions'],
      },
    }),
  siteTool({
      name: 'get_reservation_inquiries',
      description: 'Use this when the user asks about table reservations — this is site-wide across all locations by default, and also answers "bookings from the past N days" for reservations. Filter to one location with location_id, or to a recent window with days (e.g. days=2 for "the past two days"). Returns a status-count summary alongside the raw list. For bookings on a bookable experience/activity instead of a table reservation, use list_all_experience_bookings.',
      domain: 'submissions',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string', description: 'Optional location id to list only that location\'s reservations.' },
        days: { type: 'number', description: 'Optional: only include reservations made in the last N days (max 90).' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          submissions: { type: 'array', items: reservationSubmissionObject },
          summary: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              by_status: { type: 'object', description: 'Count of reservations per status.' },
            },
            required: ['total', 'by_status'],
          },
        },
        required: ['submissions', 'summary'],
      },
    }),
]
