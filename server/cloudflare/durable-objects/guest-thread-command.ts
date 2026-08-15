import { DurableObject } from 'cloudflare:workers'
import { createDb, queryFirst } from '~/server/db'
import { executeGuestThreadOperation, GUEST_THREAD_ACTIONS, type ExecuteOperationInput } from '~/server/domain/guest-threads/operations'
import { publishGuestInboxEvent } from '../guest-inbox-events'
import type { ReplyEmailEnv } from '~/server/utils/submission-messages'

interface GuestThreadCommandEnv extends ReplyEmailEnv {
  DB: D1Database
  GUEST_INBOX_HUBS?: DurableObjectNamespace
  GUEST_DELIVERY_QUEUE?: Queue
  [key: string]: unknown
}

interface GuestThreadCommandRequest {
  threadId: string
  siteId: string
  action: string
  actorUserId: string
  actorMemberId: string
  body?: string
  deliveryId?: string
  idempotencyKey?: string
  expectedThreadVersion?: number
}

function isCommandRequest(value: unknown): value is GuestThreadCommandRequest {
  if (!value || typeof value !== 'object') return false
  const command = value as Record<string, unknown>
  return typeof command.threadId === 'string'
    && typeof command.siteId === 'string'
    && typeof command.action === 'string'
    && GUEST_THREAD_ACTIONS.has(command.action)
    && typeof command.actorUserId === 'string'
    && typeof command.actorMemberId === 'string'
    && (command.expectedThreadVersion === undefined
      || (typeof command.expectedThreadVersion === 'number' && Number.isInteger(command.expectedThreadVersion) && command.expectedThreadVersion >= 0))
}

export class GuestThreadCommandObject extends DurableObject<GuestThreadCommandEnv> {
  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    return await this.ctx.blockConcurrencyWhile(() => this.executeCommand(request))
  }

  private async executeCommand(request: Request): Promise<Response> {
    const command = await request.json().catch(() => null) as unknown
    const siteId = request.headers.get('x-krabiclaw-site-id')
    const memberId = request.headers.get('x-krabiclaw-member-id')
    const userId = request.headers.get('x-krabiclaw-user-id')
    if (!siteId || !memberId || !userId || !isCommandRequest(command)) {
      return Response.json({ error: 'Invalid internal guest thread command' }, { status: 400 })
    }
    if (command.siteId !== siteId || command.actorMemberId !== memberId || command.actorUserId !== userId) {
      return Response.json({ error: 'Guest thread command authorization mismatch' }, { status: 403 })
    }

    const db = createDb(this.env.DB)
    if (command.expectedThreadVersion !== undefined) {
      const current = await queryFirst<{ version: number }>(db, `
        SELECT version FROM guest_threads WHERE id = ? AND site_id = ? LIMIT 1
      `, [command.threadId, command.siteId])
      if (current && current.version !== command.expectedThreadVersion) {
        return Response.json({
          ok: false,
          status: 409,
          reason: 'invalid_transition',
          message: 'Guest thread changed before this command was applied',
        }, { status: 409 })
      }
    }
    const input: ExecuteOperationInput = {
      ...command,
      env: this.env,
    }
    const outcome = await executeGuestThreadOperation(db, input)
    if (outcome.ok) {
      this.ctx.waitUntil(publishGuestInboxEvent(this.env, {
        eventId: crypto.randomUUID(),
        type: 'thread.changed',
        siteId: outcome.thread.site_id,
        locationId: outcome.thread.location_id,
        threadId: outcome.thread.id,
        threadVersion: outcome.thread.version,
        occurredAt: new Date().toISOString(),
      }).catch((error) => console.error('Guest inbox command publication failed', error)))
      if (['reply', 'confirm', 'cancel', 'complete', 'retry_delivery'].includes(command.action)) {
        this.ctx.waitUntil(publishGuestInboxEvent(this.env, {
          eventId: crypto.randomUUID(),
          type: 'delivery.changed',
          siteId: outcome.thread.site_id,
          locationId: outcome.thread.location_id,
          threadId: outcome.thread.id,
          threadVersion: outcome.thread.version,
          occurredAt: new Date().toISOString(),
        }).catch((error) => console.error('Guest inbox delivery publication failed', error)))
      }
    }

    return Response.json(outcome, { status: outcome.ok ? 200 : outcome.status })
  }
}
