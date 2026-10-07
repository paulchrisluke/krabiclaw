import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import { DiscordError, encryptWebhookToken, getWebhook, parseWebhookUrl } from '~/server/utils/discord-webhooks'
import { readIntegration, storeIntegration } from '~/server/utils/organization-integrations'
import { requireOrganizationAccess } from '~/server/utils/location-access'

/**
 * Connects, or replaces, the organization's Discord channel webhook. Discord
 * is asked about the webhook with its own token — nothing is posted — and only
 * an incoming webhook of a server channel is kept: its token encrypted, the
 * webhook, guild and channel ids as Discord reported them, and the label the
 * owner gave the destination, because a webhook does not name its channel.
 * `expected_revision` replaces exactly the connection that was read; without
 * it the webhook is connected only where none is.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const body = await readStrictBody<{ webhook_url?: string; label?: string; expected_revision?: string }>(event, { webhook_url: 'string', label: 'string', expected_revision: 'string' })
  const label = body.label?.trim() ?? ''
  if (!body.webhook_url?.trim() || !label) return jsonResponse({ error: 'Paste the webhook URL and name the channel it posts to.' }, { status: 400 })
  if (label.length > 100) return jsonResponse({ error: 'Keep the channel name to 100 characters.' }, { status: 400 })
  const webhook = parseWebhookUrl(body.webhook_url)

  const { env, organization } = await requireOrganizationAccess(event, organizationId)
  if (!await hasOrganizationEntitlement(env, organization.id, 'managed_service')) {
    return jsonResponse({ error: 'Discord requires the Growth plan.' }, { status: 403 })
  }
  const current = await readIntegration(env.DB, organization.id, 'discord')
  if (current && body.expected_revision !== current.revision) return jsonResponse({ error: 'The Discord connection changed. Reload before replacing it.' }, { status: 409 })
  if (!current && body.expected_revision) return jsonResponse({ error: 'Discord was disconnected. Reload before connecting it.' }, { status: 409 })

  let info
  try {
    info = await getWebhook(webhook)
  } catch (error) {
    if (error instanceof DiscordError && error.failure === 'authorization') return jsonResponse({ error: 'Discord does not recognize that webhook. It may have been deleted or its URL reset; copy it again.' }, { status: 400 })
    throw error
  }
  if (info.type !== 1) return jsonResponse({ error: 'That is not an incoming webhook. Create one under the channel’s Integrations → Webhooks.' }, { status: 400 })
  if (!info.guild_id || !info.channel_id) return jsonResponse({ error: 'Discord did not report the server and channel this webhook posts to.' }, { status: 400 })

  const revision = await storeIntegration(env.DB, organization.id, 'discord', {
    account_id: null, target_id: info.channel_id, target_name: label,
    webhook: { webhook_id: info.id, guild_id: info.guild_id, credential: await encryptWebhookToken(env, webhook.token) },
  }, { revision: current?.revision ?? null })

  return jsonResponse({ success: true, channel_id: info.channel_id, label, revision })
})
