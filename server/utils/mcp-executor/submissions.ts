import type { McpExecutorContext } from './shared'
import { countReservationSubmissions, getReservationSubmissionsByStatus, listContactSubmissions, listReservationSubmissions } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, optionalDaysWindow, optionalString } from './shared'

export async function handleSubmissionsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_contact_inquiries":
      return {
        submissions: await listContactSubmissions(site.db, site.organizationId),
      };
    case "get_reservation_inquiries": {
      const reservationFilter = {
        locationId: optionalString(args, "location_id") ?? null,
        sinceDays: optionalDaysWindow(args, "days"),
      };
      const [submissions, total, byStatus] = await Promise.all([
        listReservationSubmissions(site.db, site.organizationId, reservationFilter),
        countReservationSubmissions(site.db, site.organizationId, reservationFilter),
        getReservationSubmissionsByStatus(site.db, site.organizationId, reservationFilter),
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
