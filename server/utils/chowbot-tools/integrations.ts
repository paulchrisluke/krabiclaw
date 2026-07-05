import type { AiTool } from '~/server/utils/ai-gateway'

export const INTEGRATIONS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Maps lookup ────────────────────────────────────────────────────────────
    {
      name: "import_from_maps",
      description:
        "Look up a Google Maps URL or share link to get location details — address, phone, coordinates, hours. Use when someone pastes a Google Maps link and wants to update their location details. After getting results, call update_location with the relevant fields.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Google Maps URL or share link (e.g. https://maps.app.goo.gl/... or https://www.google.com/maps/place/...)",
          },
        },
        required: ["url"],
      },
    },
]
