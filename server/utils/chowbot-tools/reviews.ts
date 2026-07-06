import type { AiTool } from '~/server/utils/ai-gateway'

export const REVIEWS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Reviews ────────────────────────────────────────────────────────────────
    {
      name: "list_location_reviews",
      description:
        "Get reviews for a location, including aggregate score and star distribution.",
      input_schema: {
        type: "object",
        properties: {
          location_id: {
            type: "string",
            description: "Location ID from get_locations.",
          },
        },
        required: ["location_id"],
      },
    },
  {
      name: "reply_to_review",
      description: "Add or update the owner reply on a review.",
      input_schema: {
        type: "object",
        properties: {
          review_id: {
            type: "string",
            description: "Review ID from get_reviews.",
          },
          reply: { type: "string", description: "Owner reply text." },
        },
        required: ["review_id", "reply"],
      },
    },
]
