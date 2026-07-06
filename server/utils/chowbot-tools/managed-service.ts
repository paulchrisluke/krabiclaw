import type { AiTool } from '~/server/utils/ai-gateway'

export const MANAGED_SERVICE_CHOWBOT_TOOLS: AiTool[] = [
  // ── Managed service work requests ─────────────────────────────────────────
    {
      name: "create_work_request",
      description:
        "Submit a work request to the Paul & Julia managed service queue. Use this when the owner needs something done that requires human attention — content updates, translations, photo work, SEO, Google Business management, seasonal campaigns, or anything beyond automated tools. Always confirm the details with the owner before submitting.",
      input_schema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "content_update",
              "menu_update",
              "translation",
              "seo",
              "google_business",
              "seasonal",
              "photo_update",
              "social_media",
              "technical",
              "other",
            ],
            description: "Category of work needed.",
          },
          title: {
            type: "string",
            description:
              "Short summary of what needs to be done (max 120 chars).",
          },
          description: {
            type: "string",
            description:
              "Full details — what, where, any specific requirements or context.",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description:
              "How urgent. Default: normal. Only use high/urgent if the owner specifically says so.",
          },
        },
        required: ["type", "title"],
      },
    },
  // ── Work requests ─────────────────────────────────────────────────────────
    {
      name: "list_work_requests",
      description: "List submitted work requests for this organisation, ordered by status and priority.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "search_public_resources",
      description: "Search the unified KrabiClaw AI Search knowledge index across docs, blog posts, support answers, platform pages, and route guidance.",
      input_schema: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "The search query to run against the KrabiClaw platform knowledge index.",
          },
          type: {
            type: "string",
            enum: ["all", "doc", "blog", "faq", "route", "platform_page", "dashboard_route"],
            description: "Optional result type filter. Omit for all indexed platform knowledge resources.",
          },
        },
        required: ["q"],
      },
    },
]
