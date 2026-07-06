import type { AiTool } from '~/server/utils/ai-gateway'

export const SUBMISSIONS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Submissions ────────────────────────────────────────────────────────────
    {
      name: "get_contact_inquiries",
      description: "List contact form submissions for this site.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "get_reservation_inquiries",
      description: "List reservation requests for this site, optionally scoped to one location.",
      input_schema: {
        type: "object",
        properties: {
          location_id: { type: "string", description: "Optional location id to list only that location's reservations." },
        },
      },
    },
]
