import type { AiTool } from '~/server/utils/ai-gateway'

export const EXPERIENCES_CHOWBOT_TOOLS: AiTool[] = [
  // ── Experiences ───────────────────────────────────────────────────────────
    {
      name: "list_experiences",
      description: "List all experiences for this site.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "create_experience",
      description:
        "Create a new bookable dining experience for this site. Every experience belongs to a location. If location_id is omitted, use the site primary location when available; if the site has multiple locations and it is not obvious, call list_locations first and ask.",
      input_schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: 'Experience name, e.g. "Teppanyaki Night".',
          },
          tagline: {
            type: "string",
            description: "One-line hook shown on the listing card.",
          },
          body: {
            type: "string",
            description:
              "Rich HTML body — full description, what's included, atmosphere, etc.",
          },
          price_amount: {
            type: ["number", "null"],
            description: "Numeric price amount, e.g. 1500. Uses site default currency. Preferred over price string. Pass null to clear.",
          },
          price: {
            type: ["string", "null"],
            description: 'Display override for non-numeric prices, e.g. "Ask us". Leave null when price_amount is set. Pass null to clear.',
          },
          compare_at_price_amount: {
            type: ["number", "null"],
            description: "Regular/pre-sale price. Set alongside price_amount only when the user asks to run a discount/sale. Pass null to clear.",
          },
          sale_starts_at: {
            type: ["string", "null"],
            description: "ISO 8601 date/time the sale becomes active. Optional.",
          },
          sale_ends_at: {
            type: ["string", "null"],
            description: "ISO 8601 date/time the sale ends. Optional.",
          },
          featured: {
            type: "boolean",
            description:
              "Whether to feature this experience on the homepage/location pages (when no menu exists).",
          },
          featured_sort_order: {
            type: "number",
            description:
              "Sort order for featured experiences (lower numbers appear first).",
          },
          duration_minutes: {
            type: "number",
            description: "Duration in minutes, e.g. 90.",
          },
          max_capacity: {
            type: "number",
            description: "Maximum guests per booking.",
          },
          time_slots: {
            type: "array",
            items: { type: "string" },
            description: 'Available time slots, applied every day. e.g. ["17:00","19:00","21:00"]. Ignored if recurring_slots is set.',
          },
          recurring_slots: {
            type: ["object", "null"],
            description: 'Per-weekday time slots, e.g. {"Friday":["19:00","21:00"],"Saturday":["19:00","21:00"]}. Keys must be Monday..Sunday. When set, this takes priority over time_slots and a missing weekday means no slots that day. Omit or null to use time_slots every day instead.',
          },
          slot_start: {
            type: "string",
            description: 'Convenience: auto-generate slots from this "HH:MM" start time. Used with slot_end and slot_interval_minutes instead of typing time_slots by hand.',
          },
          slot_end: {
            type: "string",
            description: 'Convenience: auto-generate slots up to and including this "HH:MM" end time.',
          },
          slot_interval_minutes: {
            type: "number",
            description: "Convenience: interval in minutes between generated slots, e.g. 30.",
          },
          slot_weekday: {
            type: "string",
            enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            description: "If set alongside slot_start/slot_end/slot_interval_minutes, the generated slots are assigned to recurring_slots for this weekday instead of the flat time_slots list.",
          },
          available_note: {
            type: "string",
            description:
              'Human-readable availability, e.g. "Every Friday & Saturday".',
          },
          image_asset_id: {
            type: "string",
            description: "Media asset ID for hero image.",
          },
          location_id: {
            type: "string",
            description: "Optional ID from list_locations. If omitted, the site primary location is used when available.",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "sold_out"],
            description: "Default: active.",
          },
          seo_title: { type: "string", description: "SEO page title override." },
          seo_description: {
            type: "string",
            description: "SEO meta description (150–160 chars).",
          },
        },
        required: ["title"],
      },
    },
  {
      name: "update_experience",
      description: "Update an existing experience — any combination of fields.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: {
            type: "string",
            description: "ID of the experience to update.",
          },
          title: { type: "string" },
          tagline: { type: "string" },
          body: { type: "string" },
          featured: {
            type: "boolean",
            description:
              "Whether to feature this experience on the homepage/location pages (when no menu exists).",
          },
          featured_sort_order: {
            type: "number",
            description:
              "Sort order for featured experiences (lower numbers appear first).",
          },
          price_amount: { type: ["number", "null"], description: "Numeric price amount. Preferred over price string. Pass null to clear." },
          price: { type: ["string", "null"], description: 'Display override for non-numeric prices, e.g. "Ask us". Pass null to clear.' },
          compare_at_price_amount: { type: ["number", "null"], description: "Regular/pre-sale price. Set alongside price_amount only when the user asks to run a discount/sale. Pass null to clear." },
          sale_starts_at: { type: ["string", "null"], description: "ISO 8601 date/time the sale becomes active. Pass null to clear." },
          sale_ends_at: { type: ["string", "null"], description: "ISO 8601 date/time the sale ends. Pass null to clear." },
          duration_minutes: { type: "number" },
          max_capacity: { type: "number" },
          time_slots: { type: "array", items: { type: "string" } },
          recurring_slots: {
            type: ["object", "null"],
            description: 'Per-weekday time slots, e.g. {"Friday":["19:00","21:00"]}. Takes priority over time_slots. Pass null to revert to the flat time_slots list every day.',
          },
          slot_start: { type: "string", description: 'Convenience: auto-generate slots from this "HH:MM" start time.' },
          slot_end: { type: "string", description: 'Convenience: auto-generate slots up to this "HH:MM" end time.' },
          slot_interval_minutes: { type: "number", description: "Convenience: interval in minutes between generated slots." },
          slot_weekday: {
            type: "string",
            enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            description: "If set alongside slot_start/slot_end/slot_interval_minutes, assigns generated slots to recurring_slots for this weekday.",
          },
          available_note: { type: "string" },
          image_asset_id: { type: "string" },
          location_id: {
            type: "string",
            description: "ID from list_locations. Moves the experience to a different location — cannot be cleared (an experience always belongs to exactly one location).",
          },
          status: { type: "string", enum: ["active", "inactive", "sold_out"] },
          sort_order: { type: "number" },
          seo_title: { type: "string" },
          seo_description: { type: "string" },
        },
        required: ["experience_id"],
      },
    },
  {
      name: "delete_experience",
      description:
        "Permanently delete an experience and all its bookings. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: {
            type: "string",
            description: "ID of the experience to delete.",
          },
        },
        required: ["experience_id"],
      },
    },
  {
      name: "list_experience_bookings",
      description: "List booking requests for an experience.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string", description: "Experience ID." },
          location_id: { type: "string", description: "Optional location id to verify/filter the experience bookings." },
        },
        required: ["experience_id"],
      },
    },
  {
      name: "update_experience_booking",
      description: "Confirm or cancel a guest booking for an experience.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          booking_id: { type: "string" },
          status: { type: "string", enum: ["confirmed", "cancelled"] },
        },
        required: ["experience_id", "booking_id", "status"],
      },
    },
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
  // ── Experiences (single fetch + image/video setters) ──────────────────────
    {
      name: "get_experience",
      description: "Get a single experience by ID with full details.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
        },
        required: ["experience_id"],
      },
    },
  {
      name: "set_experience_image",
      description: "Set the hero image for an experience.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          asset_id: { type: "string", description: "Media asset ID." },
        },
        required: ["experience_id", "asset_id"],
      },
    },
  {
      name: "set_experience_video",
      description: "Set the hero video for an experience.",
      input_schema: {
        type: "object",
        properties: {
          experience_id: { type: "string" },
          asset_id: { type: "string", description: "Media asset ID." },
        },
        required: ["experience_id", "asset_id"],
      },
    },
]
