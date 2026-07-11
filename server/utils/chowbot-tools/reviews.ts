import type { AiTool } from '~/server/utils/ai-gateway'
import { REVIEWS_TOOLS } from '~/server/utils/mcp-tools/reviews'
import { chowbotToolFromMcp } from './from-mcp'

export const REVIEWS_CHOWBOT_TOOLS: AiTool[] = [
  {
    name: "list_site_reviews",
    description: "Get tenant-wide reviews, including provenance and verification status.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_owner_entered_site_review",
    description: "Add a tenant-wide review collected outside KrabiClaw. Requires explicit publication authorization.",
    input_schema: {
      type: "object",
      properties: {
        author_name: { type: "string" }, rating: { type: "integer" }, title: { type: "string" }, content: { type: "string" },
        collection_method: { type: "string", enum: ["in_person", "email", "phone", "migration", "other"] },
        original_review_date: { type: "string" }, original_reference: { type: "string" },
        publication_authorized: { type: "boolean" }, status: { type: "string", enum: ["pending", "approved", "rejected"] },
      },
      required: ["author_name", "rating", "content", "collection_method", "publication_authorized"],
    },
  },
  {
    name: "update_owner_entered_site_review",
    description: "Update a tenant-wide owner-entered review and its provenance.",
    input_schema: {
      type: "object",
      properties: {
        review_id: { type: "string" }, author_name: { type: "string" }, rating: { type: "integer" }, title: { type: "string" }, content: { type: "string" },
        collection_method: { type: "string", enum: ["in_person", "email", "phone", "migration", "other"] },
        original_review_date: { type: "string" }, original_reference: { type: "string" },
        publication_authorized: { type: "boolean" }, status: { type: "string", enum: ["pending", "approved", "rejected"] },
      },
      required: ["review_id"],
    },
  },
  {
    name: "delete_owner_entered_site_review",
    description: "Delete an owner-entered tenant-wide review. Confirm with the user first.",
    input_schema: { type: "object", properties: { review_id: { type: "string" } }, required: ["review_id"] },
  },
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
