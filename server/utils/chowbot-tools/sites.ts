import type { AiTool } from '~/server/utils/ai-gateway'
import { SITES_TOOLS } from '~/server/utils/mcp-tools/sites'
import { chowbotToolFromMcp } from './from-mcp'

// get_site, update_site_settings, and set_brand_color exist on MCP's sites
// domain but were never exposed to ChowBot — narrower granularity/dashboard
// utility not currently offered there. Media placement now lives in the media domain
// through set_media rather than site-specific wrappers.
const SITES_DOMAIN_TOOL_NAMES = new Set(['get_site_settings', 'set_default_currency'])

export const SITES_CHOWBOT_TOOLS: AiTool[] = [
  ...SITES_TOOLS.filter((tool) => SITES_DOMAIN_TOOL_NAMES.has(tool.name)).map(chowbotToolFromMcp),
  // ── Site (ChowBot-only aliases — no MCP equivalent, use update_site_settings) ──
    {
      name: "get_site_stats",
      description:
        "Summary of site content: posts, Products, locations, and reviews.",
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
        "Set site-wide brand contact emails. Social profiles are managed through the Links page. Pass only the fields to change; omit the rest.",
      input_schema: {
        type: "object",
        properties: {
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
]
