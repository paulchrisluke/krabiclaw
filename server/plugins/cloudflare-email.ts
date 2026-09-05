import type { ForwardableEmailMessage } from '@cloudflare/workers-types'
import { definePlugin } from 'nitro'
import PostalMime from 'postal-mime'
import { receiveGuestEmail } from '~/server/domain/guest-threads/inbound-email'
import type { CloudflareEnv } from '~/server/utils/auth'
import { isDatabaseWriteFrozen } from '~/server/utils/database-write-freeze'
import { isSubmissionType, parseReplyToAddress } from '~/server/utils/submission-messages'

function isCloudflareEnvironment(value: unknown): value is CloudflareEnv {
  if (typeof value !== 'object' || value === null) return false

  const database = Reflect.get(value, 'DB')
  return typeof database === 'object'
    && database !== null
    && typeof Reflect.get(database, 'prepare') === 'function'
    && typeof Reflect.get(database, 'batch') === 'function'
    && typeof Reflect.get(database, 'exec') === 'function'
    && typeof Reflect.get(database, 'withSession') === 'function'
    && typeof Reflect.get(database, 'dump') === 'function'
    && typeof Reflect.get(value, 'BETTER_AUTH_SECRET') === 'string'
    && typeof Reflect.get(value, 'GOOGLE_CLIENT_ID') === 'string'
    && typeof Reflect.get(value, 'GOOGLE_CLIENT_SECRET') === 'string'
}

async function readEmailBytes(stream: ForwardableEmailMessage['raw']): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    chunks.push(chunk.value)
    byteLength += chunk.value.byteLength
  }

  const email = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    email.set(chunk, offset)
    offset += chunk.byteLength
  }
  return email
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function processEmail(message: ForwardableEmailMessage, env: unknown): Promise<void> {
  if (!isCloudflareEnvironment(env)) throw new Error('Cloudflare environment is not configured')
  if (isDatabaseWriteFrozen(env)) throw new Error('Database writes are frozen')

  const rawEmail = await readEmailBytes(message.raw)
  const messageId = message.headers.get('Message-ID')?.trim()
    || `content-sha256:${await sha256Hex(rawEmail)}`
  const parsedMime = await PostalMime.parse(rawEmail)
  const body = (parsedMime.text || (parsedMime.html
    ? parsedMime.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : '')).trim()
  if (!body) return

  const reply = parseReplyToAddress(message.to)
  if (!reply || !isSubmissionType(reply.submissionType)) {
    throw new Error('Unrecognized reply address')
  }

  await receiveGuestEmail(env, {
    submissionType: reply.submissionType,
    submissionId: reply.submissionId,
    token: reply.token,
    body,
    messageId,
  })
}

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:email', async ({ message, env }) => {
    try {
      await processEmail(message, env)
    } catch (error) {
      console.error('email_inbound_processing_failed', {
        messageId: message.headers.get('Message-ID') ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
})
