import type { AiTool } from '~/server/utils/ai-gateway'

export const QA_CHOWBOT_TOOLS: AiTool[] = [
  {
    name: "list_site_qa",
    description: "Get general tenant Q&A, or page-specific Q&A with general fallback when page_path is provided.",
    input_schema: { type: "object", properties: { page_path: { type: "string" } } },
  },
  {
    name: "create_site_qa",
    description: "Add a tenant-wide Q&A pair.",
    input_schema: {
      type: "object",
      properties: { page_path: { type: "string" }, question: { type: "string" }, answer: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: "update_site_qa",
    description: "Edit a tenant-wide Q&A entry.",
    input_schema: {
      type: "object",
      properties: {
        page_path: { type: "string" }, qa_id: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
        status: { type: "string", enum: ["published", "hidden"] }, sort_order: { type: "integer" },
      },
      required: ["qa_id"],
    },
  },
  {
    name: "reorder_site_qa",
    description: "Update sort orders for tenant-wide Q&A.",
    input_schema: {
      type: "object",
      properties: { page_path: { type: "string" }, updates: { type: "array", items: { type: "object", properties: { id: { type: "string" }, sort_order: { type: "integer" } }, required: ["id", "sort_order"] } } },
      required: ["updates"],
    },
  },
  {
    name: "delete_site_qa",
    description: "Delete a tenant-wide Q&A entry. Confirm with the user first.",
    input_schema: { type: "object", properties: { page_path: { type: "string" }, qa_id: { type: "string" } }, required: ["qa_id"] },
  },
  // ── Q&A ────────────────────────────────────────────────────────────────────
    {
      name: "list_location_qa",
      description: "Get Q&A pairs for a location.",
      input_schema: {
        type: "object",
        properties: {
          location_id: { type: "string" },
        },
        required: ["location_id"],
      },
    },
  {
      name: "create_location_qa",
      description: "Add a Q&A pair to a location.",
      input_schema: {
        type: "object",
        properties: {
          location_id: { type: "string" },
          question: { type: "string" },
          answer: {
            type: "string",
            description: "Owner answer. Optional — can be added later.",
          },
        },
        required: ["location_id", "question"],
      },
    },
  {
      name: "delete_location_qa",
      description: "Delete a Q&A entry. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: {
          qa_id: { type: "string" },
          location_id: { type: "string" },
        },
        required: ["qa_id", "location_id"],
      },
    },
  // ── Q&A ───────────────────────────────────────────────────────────────────
    {
      name: "update_location_qa",
      description: "Edit an existing Q&A entry — question, answer, status, or sort order.",
      input_schema: {
        type: "object",
        properties: {
          qa_id: { type: "string" },
          location_id: { type: "string" },
          question: { type: "string" },
          answer: { type: "string" },
          status: { type: "string", enum: ["published", "hidden"] },
          sort_order: { type: "integer" },
        },
        required: ["qa_id", "location_id"],
      },
    },
  {
      name: "reorder_location_qa",
      description: "Update the sort order of Q&A entries for a location.",
      input_schema: {
        type: "object",
        properties: {
          location_id: { type: "string" },
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                sort_order: { type: "integer" },
              },
              required: ["id", "sort_order"],
            },
          },
        },
        required: ["location_id", "updates"],
      },
    },
]
