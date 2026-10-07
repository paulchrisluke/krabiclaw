import { HTTPError } from 'nitro'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import type { MetaDeadline } from '~/server/utils/meta-graph'

/**
 * The one HTTP boundary to Discord's incoming webhooks: Get Webhook with Token,
 * Execute Webhook, and Get and Delete Webhook Message. Requests go only to the
 * fixed API origin, never follow a redirect, and never carry the token into an
 * error, a log line or a response. Every failure is classified the way the
 * Meta boundary classifies its own:
 *
 * - `rejected`: Discord answered with an error. The request did not take effect.
 * - `authorization`: the webhook is gone or its token was reset. The connection
 *   is in error.
 * - `rate_limited`: Discord answered 429 and nothing was created; it may be
 *   sent again after `retryAfterMs`.
 * - `transport`: no answer, a timeout, or a server error. The request may or may
 *   not have taken effect.
 * - `invalid-response`: Discord answered successfully with an unexpected shape.
 *
 * https://docs.discord.com/developers/resources/webhook
 */

const DISCORD_API = 'https://discord.com/api/v10'
const WEBHOOK_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'])
const SNOWFLAKE = /^\d{15,25}$/

/** Discord's documented limits for one webhook message. */
export const DISCORD_CONTENT_LIMIT = 2000
export const DISCORD_FILE_LIMIT_BYTES = 20 * 1024 * 1024
export const DISCORD_ATTACHMENT_LIMIT = 10
export const DISCORD_DESCRIPTION_LIMIT = 1024
/**
 * The most attachment bytes one message carries. The Worker holds the whole
 * multipart request in memory, so this is the runtime's limit, not Discord's.
 */
export const DISCORD_REQUEST_LIMIT_BYTES = 25 * 1024 * 1024
export const DISCORD_MEDIA_TYPES: Record<string, 'image' | 'video'> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video',
}

export type DiscordFailure = 'rejected' | 'authorization' | 'rate_limited' | 'transport' | 'invalid-response'

export class DiscordError extends Error {
  readonly failure: DiscordFailure
  readonly status: number | null
  readonly code: number | null
  readonly retryAfterMs: number | null
  constructor(failure: DiscordFailure, message: string, details: { status?: number | null; code?: number | null; retryAfterMs?: number | null } = {}, options?: { cause?: unknown }) {
    super(details.code ? `${message} (Discord code ${details.code})` : message, options)
    this.name = 'DiscordError'
    this.failure = failure
    this.status = details.status ?? null
    this.code = details.code ?? null
    this.retryAfterMs = details.retryAfterMs ?? null
  }

  /** Unknown Message: the message is not one this webhook can see. */
  get messageMissing(): boolean { return this.code === 10008 }
  /** A forum or media channel, which needs a thread this integration does not create. */
  get threadRequired(): boolean { return this.code === 220001 }
}

export interface DiscordWebhook { webhookId: string; token: string }

/**
 * A Discord webhook URL as Discord shows it — `https://discord.com/api/webhooks/{id}/{token}` —
 * reduced to its id and token. Any other host, scheme, path, query or fragment is refused,
 * so a caller cannot point the server elsewhere or pick a thread.
 */
export function parseWebhookUrl(value: string): DiscordWebhook {
  const fail = (): never => { throw new HTTPError({ statusCode: 400, message: 'Paste the webhook URL Discord shows under Integrations → Webhooks → Copy Webhook URL.' }) }
  let url: URL
  try { url = new URL(value.trim()) } catch { return fail() }
  if (url.protocol !== 'https:' || !WEBHOOK_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.search || url.hash) fail()
  const match = /^\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/.exec(url.pathname)
  if (!match || !SNOWFLAKE.test(match[1]!) || match[2]!.length < 60 || match[2]!.length > 100) fail()
  return { webhookId: match![1]!, token: match![2]! }
}

/** The token, encrypted with the key Better Auth encrypts OAuth tokens with (BETTER_AUTH_SECRET or BETTER_AUTH_SECRETS). */
export async function encryptWebhookToken(env: CloudflareEnv, token: string): Promise<string> {
  return await symmetricEncrypt({ key: (await createAuth(env).$context).secretConfig, data: token })
}

export async function decryptWebhookToken(env: CloudflareEnv, credential: string): Promise<string> {
  return await symmetricDecrypt({ key: (await createAuth(env).$context).secretConfig, data: credential })
}

function timeoutOf(deadline: MetaDeadline | undefined, perRequestMs: number): number {
  if (!deadline) return perRequestMs
  const remaining = deadline.remaining()
  if (remaining <= 250) throw new DiscordError('transport', 'The operation ran out of time before the Discord request could be sent')
  return Math.min(perRequestMs, remaining)
}

async function discordRequest<T>(webhook: DiscordWebhook, path: string, init: { method?: string; body?: BodyInit; query?: Record<string, string>; deadline?: MetaDeadline; timeoutMs?: number }): Promise<T | null> {
  const url = new URL(`${DISCORD_API}/webhooks/${webhook.webhookId}/${webhook.token}${path}`)
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value)
  const timeout = timeoutOf(init.deadline, init.timeoutMs ?? 10_000)
  let response: Response
  try {
    response = await fetch(url, { method: init.method ?? 'GET', body: init.body, headers: typeof init.body === 'string' ? { 'content-type': 'application/json' } : undefined,
      redirect: 'error', signal: AbortSignal.timeout(timeout) })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    throw new DiscordError('transport', name === 'TimeoutError' || name === 'AbortError' ? `Discord did not answer within ${timeout}ms` : 'Discord could not be reached', {}, { cause: error })
  }
  if (response.status === 204) return null
  const text = await response.text()
  let body: Record<string, unknown> | null
  try { body = text ? JSON.parse(text) as Record<string, unknown> : null } catch { body = null }
  if (response.ok) {
    if (!body) throw new DiscordError('invalid-response', `Discord answered ${response.status} without a JSON body`, { status: response.status })
    return body as T
  }
  const code = typeof body?.code === 'number' ? body.code : null
  const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`
  if (response.status === 429) {
    const seconds = typeof body?.retry_after === 'number' ? body.retry_after : Number(response.headers.get('retry-after'))
    throw new DiscordError('rate_limited', `Discord rate limited this webhook: ${message}`, { status: 429, code, retryAfterMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null })
  }
  if (response.status >= 500 || !body) throw new DiscordError('transport', `Discord answered ${response.status}`, { status: response.status, code })
  // Unknown Webhook, Invalid Webhook Token: the webhook was deleted or its URL reset.
  if (response.status === 401 || code === 10015 || code === 50027) throw new DiscordError('authorization', `Discord no longer accepts this webhook: ${message}`, { status: response.status, code })
  throw new DiscordError('rejected', `Discord refused the request: ${message}`, { status: response.status, code })
}

export interface DiscordWebhookInfo { id: string; type: number; guild_id: string | null; channel_id: string | null; application_id: string | null; name: string | null }

export async function getWebhook(webhook: DiscordWebhook, deadline?: MetaDeadline): Promise<DiscordWebhookInfo> {
  const info = await discordRequest<DiscordWebhookInfo>(webhook, '', { deadline })
  if (!info || info.id !== webhook.webhookId || typeof info.type !== 'number') throw new DiscordError('invalid-response', 'Discord answered Get Webhook without this webhook')
  return { id: info.id, type: info.type, guild_id: info.guild_id ?? null, channel_id: info.channel_id ?? null, application_id: info.application_id ?? null, name: info.name ?? null }
}

export interface DiscordAttachment { id: string; filename: string; description?: string | null; content_type?: string | null; size: number; url: string }
export interface DiscordMessage { id: string; channel_id: string; webhook_id?: string | null; content: string; timestamp: string; attachments: DiscordAttachment[] }

function messageOf(value: DiscordMessage | null): DiscordMessage {
  if (!value || typeof value.id !== 'string' || typeof value.channel_id !== 'string' || typeof value.timestamp !== 'string' || !Array.isArray(value.attachments)) {
    throw new DiscordError('invalid-response', 'Discord answered without the message')
  }
  return value
}

export interface DiscordFile { name: string; type: string; bytes: ArrayBuffer; description: string | null }

/**
 * Execute Webhook with `wait=true`, so Discord answers with the message it
 * saved. Mentions are never parsed from the content. A 429 is Discord saying
 * nothing was sent, so it is sent again after Discord's own delay while the
 * deadline allows; otherwise the 429 is thrown.
 */
export async function executeWebhook(webhook: DiscordWebhook, input: { content: string; files: DiscordFile[] }, deadline: MetaDeadline): Promise<DiscordMessage> {
  const payload = {
    content: input.content,
    allowed_mentions: { parse: [] },
    attachments: input.files.map((file, index) => ({ id: index, filename: file.name, ...(file.description ? { description: file.description } : {}) })),
  }
  for (;;) {
    let body: BodyInit
    if (input.files.length) {
      const form = new FormData()
      form.set('payload_json', JSON.stringify(payload))
      input.files.forEach((file, index) => form.set(`files[${index}]`, new Blob([file.bytes], { type: file.type }), file.name))
      body = form
    } else {
      body = JSON.stringify(payload)
    }
    try {
      return messageOf(await discordRequest<DiscordMessage>(webhook, '', { method: 'POST', body, query: { wait: 'true' }, deadline, timeoutMs: 25_000 }))
    } catch (error) {
      if (!(error instanceof DiscordError) || error.failure !== 'rate_limited' || error.retryAfterMs === null) throw error
      if (deadline.remaining() - error.retryAfterMs < 10_000) throw error
      await new Promise(resolve => setTimeout(resolve, error.retryAfterMs!))
    }
  }
}

export async function getWebhookMessage(webhook: DiscordWebhook, messageId: string, deadline?: MetaDeadline): Promise<DiscordMessage> {
  if (!SNOWFLAKE.test(messageId)) throw new HTTPError({ statusCode: 400, message: 'A Discord message id is a numeric snowflake.' })
  return messageOf(await discordRequest<DiscordMessage>(webhook, `/messages/${messageId}`, { deadline }))
}

export async function deleteWebhookMessage(webhook: DiscordWebhook, messageId: string, deadline?: MetaDeadline): Promise<void> {
  if (!SNOWFLAKE.test(messageId)) throw new HTTPError({ statusCode: 400, message: 'A Discord message id is a numeric snowflake.' })
  await discordRequest(webhook, `/messages/${messageId}`, { method: 'DELETE', deadline })
}

/** Where the message is, for the people who can open that channel. Not a public URL. */
export function discordMessageLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
}
