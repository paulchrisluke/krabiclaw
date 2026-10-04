import type { McpToolDefinition } from './shared'
import { reservationSubmissionObject, organizationTool, submissionObject } from './shared'
import type { McpExecutorContext } from './execution'
import { countReservationSubmissions, getReservationSubmissionsByStatus, listContactSubmissions, listReservationSubmissions } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, optionalDaysWindow, optionalString } from './execution'

export const SUBMISSIONS_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'list_contact_inquiries',
      description: "Read the selected site’s contact form submissions, including names, contact details and messages. This tool does not send replies or change submission status; those actions use the dashboard inbox.",
      domain: 'submissions',
      minimumRole: 'admin',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: { submissions: { type: 'array', items: submissionObject } },
        required: ['submissions'],
      },
    }),
  organizationTool({
      name: 'list_reservation_inquiries',
      description: "Read table reservations for the selected site, optionally filtered by location and creation window of up to 90 days. Returns guest contact details, reservation details and status counts. Use list_product_bookings to read product session bookings and consultations.",
      domain: 'submissions',
      minimumRole: 'admin',
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

export async function handleSubmissionsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_contact_inquiries":
      return {
        submissions: await listContactSubmissions(organization.db, organization.organizationId),
      };
    case "list_reservation_inquiries": {
      const reservationFilter = {
        locationId: optionalString(args, "location_id") ?? null,
        sinceDays: optionalDaysWindow(args, "days"),
      };
      const [submissions, total, byStatus] = await Promise.all([
        listReservationSubmissions(organization.db, organization.organizationId, reservationFilter),
        countReservationSubmissions(organization.db, organization.organizationId, reservationFilter),
        getReservationSubmissionsByStatus(organization.db, organization.organizationId, reservationFilter),
      ]);
      return {
        submissions,
        summary: { total, by_status: byStatus },
      };
    }
    default:
      return NOT_HANDLED
  }
}
