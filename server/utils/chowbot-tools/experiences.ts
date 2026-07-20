import type { AiTool } from '~/server/utils/ai-gateway'
import { EXPERIENCES_TOOLS } from '~/server/utils/mcp-tools/experiences'
import { chowbotToolFromMcp } from './from-mcp'

// Video widget launchers are tenant-MCP-only and live in mcp-tools/media.ts.
// reorder_experience_gallery and list_all_experience_bookings (site-wide
// summary, distinct from the per-experience list_experience_bookings) were
// never offered to ChowBot — not added here to stay within migrating
// existing overlap.
const EXPERIENCES_DOMAIN_TOOL_NAMES = new Set([
  'list_experiences',
  'get_experience',
  'create_experience',
  'update_experience',
  'set_experience_image',
  'set_experience_video',
  'delete_experience',
  'list_experience_bookings',
  'update_experience_booking',
])

export const EXPERIENCES_CHOWBOT_TOOLS: AiTool[] = [
  ...EXPERIENCES_TOOLS.filter((tool) => EXPERIENCES_DOMAIN_TOOL_NAMES.has(tool.name)).map(chowbotToolFromMcp),
  // get_experience_availability, set_experience_slot_override, and
  // list_experience_slot_overrides have no MCP_TOOLS definition — they're
  // executor-only (see mcp-executor/experiences.ts and
  // scripts/lint-tool-parity.mjs's MCP_EXECUTOR_ONLY_ALLOWLIST /
  // docs/tool-parity.md's "ChowBot-only" table). runMcpExecutorToolForChowbot
  // requires a real MCP_TOOLS entry to read minimumRole/requiredEntitlement
  // from, so these three stay as their own chowbot-agent.ts case bodies
  // calling the shared experiences.ts functions directly, not through the
  // adapter.
    {
      name: "get_experience_availability",
      description: "Get remaining capacity per time slot for an experience on a given date (or a run of consecutive dates).",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD start date." },
          days: { type: "number", description: "Number of consecutive days to check, default 1, max 31." },
        },
        required: ["experience_id", "date"],
      },
    },
  {
      name: "set_experience_slot_override",
      description: "Close or reopen a specific date+time-slot for an experience (e.g. mark Friday 7pm sold out without affecting other slots), or override its capacity for that date.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD." },
          time_slot: { type: "string", description: 'HH:MM — must be one of the experience\'s effective slots for that date.' },
          status: { type: "string", enum: ["closed", "open"] },
          capacity_override: { type: ["number", "null"], description: "Optional capacity just for this date+slot, overriding max_capacity. Pass null to clear." },
          note: { type: "string", description: "Optional internal note, e.g. reason for closing." },
        },
        required: ["experience_id", "date", "time_slot", "status"],
      },
    },
  {
      name: "list_experience_slot_overrides",
      description: "List manually closed/overridden date+time-slot combinations for an experience.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          from: { type: "string", description: "YYYY-MM-DD, defaults to today." },
          to: { type: "string", description: "YYYY-MM-DD, defaults to 90 days out." },
        },
        required: ["experience_id"],
      },
    },
]
