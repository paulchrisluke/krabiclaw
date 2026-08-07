import { DurableObject } from 'cloudflare:workers'
import nitroApp from '../.output/server/index.mjs'
import { createDb, execute, queryFirst } from '../server/db'
import { appendEntry } from '../server/domain/guest-threads/entries'
import { attemptEmailDelivery, getDeliveryById } from '../server/domain/guest-threads/deliveries'
import { publishPendingGuestDeliveryOutbox, type GuestDeliveryQueueMessage } from '../server/domain/guest-threads/outbox-publisher'
import { getGuestThreadById } from '../server/domain/guest-threads/repository'
import { getAdapter } from '../server/domain/guest-threads/adapters/registry'
import { nextConversationState } from '../server/domain/guest-threads/state-machine'
import { runScheduledTasks } from '../server/scheduled-tasks'

interface Env {
  DB: D1Database
  GUEST_DELIVERY_QUEUE: Queue<GuestDeliveryQueueMessage>
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

type HandlerWithQueue = ExportedHandler<Env, GuestDeliveryQueueMessage>

export class GuestThreadCommandObject extends DurableObject<Env> {
  async executeCommand(request: Request): Promise<Response> {
    return fetch(request)
  }
}

type InboxAttachment = {
  siteId: string
  memberId: string
  allowedLocationIds: string[] | null
  connectionId: string
}

export class GuestInboxHubObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const siteId = request.headers.get('x-krabiclaw-site-id')
    const memberId = request.headers.get('x-krabiclaw-member-id')
    if (!siteId || !memberId) return new Response('Unauthorized', { status: 401 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      siteId,
      memberId,
      allowedLocationIds: null,
      connectionId: crypto.randomUUID(),
    } satisfies InboxAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  broadcast(event: {
    schemaVersion: 1
    type: 'thread.created' | 'thread.changed' | 'entry.appended' | 'delivery.changed' | 'read.changed'
    siteId: string
    locationId: string | null
    threadId: string
    threadVersion: number
  }): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as InboxAttachment | undefined
      if (!attachment || attachment.siteId !== event.siteId) continue
      if (attachment.allowedLocationIds && (!event.locationId || !attachment.allowedLocationIds.includes(event.locationId))) continue
      socket.send(JSON.stringify(event))
    }
  }
}

async function processGuestDelivery(env: Env, message: GuestDeliveryQueueMessage): Promise<void> {
  const db = createDb(env.DB)
  const delivery = await getDeliveryById(db, message.deliveryId)
  if (!delivery || delivery.status === 'sent') return
  const now = new Date().toISOString()
  const leaseUntil = new Date(Date.now() + 2 * 60_000).toISOString()
  await execute(db, `
    UPDATE guest_thread_deliveries
    SET processing_lease_until = ?, updated_at = ?
    WHERE id = ?
      AND status IN ('queued', 'failed')
      AND (processing_lease_until IS NULL OR processing_lease_until <= ?)
  `, [leaseUntil, now, delivery.id, now])
  const claimedDelivery = await getDeliveryById(db, message.deliveryId)
  if (!claimedDelivery || claimedDelivery.processing_lease_until !== leaseUntil) return

  const threadSite = await queryFirst<{ site_id: string }>(db, `SELECT site_id FROM guest_threads WHERE id = ? LIMIT 1`, [claimedDelivery.thread_id])
  const thread = threadSite ? await getGuestThreadById(db, claimedDelivery.thread_id, threadSite.site_id) : null
  if (!thread) throw new Error(`Guest thread not found for delivery ${delivery.id}`)

  const adapter = getAdapter(thread.submission_type)
  const outcome = await attemptEmailDelivery(db, {
    delivery: claimedDelivery,
    env,
    submissionType: thread.submission_type,
    submissionId: thread.submission_id,
  })

  const eventName = outcome.success ? 'delivery.sent' : 'delivery.failed'
  const conversationState = claimedDelivery.entry_id
    ? await queryFirst<{ kind: string }>(db, `SELECT kind FROM guest_thread_entries WHERE id = ? LIMIT 1`, [claimedDelivery.entry_id])
    : null
  const nextState = outcome.success
    ? conversationState?.kind === 'message'
      ? nextConversationState(thread.conversation_state, { type: 'owner_reply_sent' })
      : nextConversationState(thread.conversation_state, { type: 'operation_succeeded', notificationOutcome: 'sent' })
    : nextConversationState(thread.conversation_state, { type: 'operation_succeeded', notificationOutcome: 'failed' })

  await appendEntry(db, {
    threadId: thread.id,
    organizationId: thread.organization_id,
    siteId: thread.site_id,
    kind: 'delivery',
    actorKind: 'system',
    channel: claimedDelivery.channel,
    eventName,
    payloadJson: { outboxId: message.outboxId, deliveryId: claimedDelivery.id, error: outcome.error ?? null },
  })

  await execute(db, `
    UPDATE guest_threads
    SET conversation_state = ?, version = version + 1, updated_at = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END
    WHERE id = ?
  `, [nextState, now, nextState, now, thread.id])

  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!outcome.success) {
    await appendEntry(db, {
      threadId: thread.id,
      organizationId: thread.organization_id,
      siteId: thread.site_id,
      kind: 'delivery',
      actorKind: 'system',
      channel: claimedDelivery.channel,
      eventName: 'delivery.retry_available',
      payloadJson: { deliveryId: claimedDelivery.id, sourceFound: Boolean(source) },
    })
  }

  if (!outcome.success) throw new Error(outcome.error ?? 'Guest delivery failed')
}

const handler = nitroApp as HandlerWithQueue

export default {
  fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx)
  },
  scheduled(controller, env, ctx) {
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(publishPendingGuestDeliveryOutbox(createDb(env.DB), env, 50))
    }
    ctx.waitUntil(runScheduledTasks(controller.cron, env as ApiRecord, {
      scheduledTime: controller.scheduledTime,
    }))
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        if (message.body.schemaVersion !== 1) throw new Error('Unsupported guest delivery queue message schema')
        await processGuestDelivery(env, message.body)
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
} satisfies HandlerWithQueue
