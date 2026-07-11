import type { AiTool } from '~/server/utils/ai-gateway'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'

export const SITES_CHOWBOT_TOOLS: AiTool[] = [
  // ── Site ───────────────────────────────────────────────────────────────────
    {
      name: "get_site_stats",
      description:
        "Summary of site content: posts, menus, menu items, locations, reviews.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "rename_site",
      description: "Update the brand name and subdomain/URL slug of the site.",
      input_schema: {
        type: "object",
        properties: {
          brand_name: { type: "string", description: "New brand name." },
        },
        required: ["brand_name"],
      },
    },
  {
      name: "set_default_currency",
      description: "Set the default menu currency for this site.",
      input_schema: {
        type: "object",
        properties: {
          currency: { type: "string", enum: [...SUPPORTED_CURRENCIES] },
        },
        required: ["currency"],
      },
    },
  {
      name: "save_brand_description",
      description:
        "Save a one-line brand description for the site homepage and SEO.",
      input_schema: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "One-line brand description.",
          },
        },
        required: ["description"],
      },
    },
  {
      name: "update_site_social",
      description:
        "Set site-wide social media links, footer tagline, and brand contact emails. Pass only the fields to change; omit the rest.",
      input_schema: {
        type: "object",
        properties: {
          facebook_url: {
            type: "string",
            description: "Full Facebook page URL. Empty string to clear.",
          },
          instagram_url: {
            type: "string",
            description: "Full Instagram profile URL. Empty string to clear.",
          },
          tiktok_url: {
            type: "string",
            description: "Full TikTok profile URL. Empty string to clear.",
          },
          footer_tagline: {
            type: "string",
            description:
              "Short tagline shown in the site footer. Empty string to clear.",
          },
          press_email: {
            type: "string",
            description:
              "Email for press inquiries. Shown on brand contact page. Empty string to clear.",
          },
          partnerships_email: {
            type: "string",
            description:
              "Email for partnership inquiries. Empty string to clear.",
          },
          catering_email: {
            type: "string",
            description:
              "Email for catering and events inquiries. Empty string to clear.",
          },
          careers_email: {
            type: "string",
            description:
              "Email for careers/job inquiries. Empty string to clear.",
          },
        },
      },
    },
  {
      name: "list_locales",
      description:
        "List the source language and enabled translation languages for this site.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "upsert_locale",
      description:
        "Create or update a site language. Use this for source language, draft/published/disabled status, display label, and source fallback.",
      input_schema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "BCP-47 locale code, such as en, th, fr, ja, or zh-CN.",
          },
          label: {
            type: "string",
            description: "Optional display label shown in dashboard controls.",
          },
          status: {
            type: "string",
            enum: ["draft", "published", "disabled"],
            description: "Public availability for this locale.",
          },
          fallback_enabled: {
            type: "boolean",
            description:
              "Whether missing translated content falls back to the source language.",
          },
          is_source: {
            type: "boolean",
            description: "Set true to make this locale the source language.",
          },
        },
        required: ["locale"],
      },
    },
  {
      name: "delete_locale",
      description:
        "Remove a non-source site language. Confirm with the user first.",
      input_schema: {
        type: "object",
        properties: {
          locale: { type: "string", description: "Locale code to remove." },
        },
        required: ["locale"],
      },
    },
  {
      name: "get_translation_inventory",
      description:
        "Estimate translation scope and AI credits before translating a site language. Use before starting translation work.",
      input_schema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "Target locale code, such as th or fr.",
          },
          scope: {
            type: "string",
            enum: ["site", "content", "menus", "locations", "posts"],
            description: "Which part of the site to estimate.",
          },
          include_published: {
            type: "boolean",
            description:
              "Include already published translations in the estimate.",
          },
        },
        required: ["locale"],
      },
    },
  {
      name: "start_translation_job",
      description:
        "Create a queued translation job after the user approves the estimate. This queues work but does not translate immediately.",
      input_schema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "Target locale code, such as th or fr.",
          },
          scope: {
            type: "string",
            enum: ["site", "content", "menus", "locations", "posts"],
            description: "Which part of the site to translate.",
          },
          include_published: {
            type: "boolean",
            description: "Include already published translations.",
          },
        },
        required: ["locale"],
      },
    },
  {
      name: "list_translation_jobs",
      description: "List recent translation jobs for this site.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "get_translation_job",
      description: "Inspect a translation job and its queued items.",
      input_schema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
        },
        required: ["job_id"],
      },
    },
  {
      name: "run_translation_job_batch",
      description:
        "Run one batch of an approved queued translation job. This calls AI, charges credits, and saves draft translations. Confirm before using.",
      input_schema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
        },
        required: ["job_id"],
      },
    },
  {
      name: "publish_translations",
      description:
        "Publish matching draft translations for a locale and scope so they become visible on the public site. Confirm before using.",
      input_schema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "Target locale code, such as th or fr.",
          },
          scope: {
            type: "string",
            enum: ["site", "content", "menus", "locations", "posts"],
            description: "Which translated drafts to publish.",
          },
        },
        required: ["locale"],
      },
    },
]
