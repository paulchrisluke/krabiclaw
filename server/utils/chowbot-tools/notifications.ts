import type { AiTool } from '~/server/utils/ai-gateway'

export const NOTIFICATIONS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Notification settings ─────────────────────────────────────────────────
    {
      name: "get_notification_settings",
      description: "Read notification settings for this site, including WhatsApp phone and owner alert channels.",
      input_schema: { type: "object", properties: {} },
    },
  {
      name: "update_notification_settings",
      description: "Update notification settings for this site.",
      input_schema: {
        type: "object",
        properties: {
          whatsapp_phone: {
            type: ["string", "null"],
            description: "Site-level WhatsApp phone number in E.164 format. Omit to leave unchanged.",
          },
          channels: {
            type: "array",
            items: { type: "string", enum: ["email", "whatsapp"] },
            description: "Owner alert channels. Use one or both of email and whatsapp.",
          },
        },
      },
    },
]
