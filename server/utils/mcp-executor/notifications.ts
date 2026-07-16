import { getHeaders } from 'h3'
import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getNotificationsSettings, updateNotificationsSettings } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, mutationContextPayload, requiredStringArray } from './shared'

export async function handleNotificationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_notification_settings":
      return {
        notifications: await getNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_notification_settings":
      {
        const rawPhone = args.whatsapp_phone;
        const whatsappPhone = typeof rawPhone === "string"
          ? rawPhone.trim()
          : undefined;
        const channels = args.channels === undefined
          ? undefined
          : requiredStringArray(args.channels, "channels");

        if (whatsappPhone === undefined && !channels) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            "Provide whatsapp_phone and/or channels.",
          );
        }

        let notifications: Awaited<ReturnType<typeof updateNotificationsSettings>>;
        try {
          notifications = await updateNotificationsSettings(
            site.db,
            site.organizationId,
            site.siteId,
            whatsappPhone,
            channels,
            site.env,
            ctx.event ? (getHeaders(ctx.event) as HeadersInit) : undefined,
          );
        } catch (error) {
          // setOrgWhatsAppPhone rejects an invalid/impossible number outright (issue #293
          // Section D — "reject impossible or invalid numbers at write boundaries") rather
          // than throwing, not returning a result. Surface that as a clean MCP invalid-params
          // error instead of an unhandled 500.
          const message = error instanceof Error ? error.message : String(error);
          if (message.startsWith('Invalid phone number')) {
            throw mcpProtocolError(MCP_ERROR.invalidParams, message);
          }
          throw error;
        }
        return {
          notifications,
          context: await mutationContextPayload(site),
        };
      }
    default:
      return NOT_HANDLED
  }
}
