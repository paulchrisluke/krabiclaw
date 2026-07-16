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

        const notifications = await updateNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
          whatsappPhone,
          channels,
          site.env,
          ctx.event ? (getHeaders(ctx.event) as HeadersInit) : undefined,
        );
        return {
          notifications,
          context: await mutationContextPayload(site),
        };
      }
    default:
      return NOT_HANDLED
  }
}
