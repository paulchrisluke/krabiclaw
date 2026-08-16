import { DurableObject } from 'cloudflare:workers'
import type { GuestInboxEvent } from '../guest-inbox-events'

interface GuestInboxHubEnv {
  GUEST_INBOX_HUBS?: DurableObjectNamespace
}

interface InboxSocketAttachment {
  siteId: string
  memberId: string
  allowedLocationIds: string[] | null
  connectedAt: string
}

const GUEST_INBOX_EVENT_TYPES = new Set<GuestInboxEvent['type']>([
  'thread.created',
  'thread.changed',
  'entry.appended',
  'delivery.changed',
  'read-state.changed',
])

function parseAllowedLocationIds(value: string | null): string[] | null {
  if (value === '*') return null
  if (!value) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Invalid location authorization payload')
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Invalid location authorization payload')
  }
  return [...new Set(parsed)]
}

function isGuestInboxEvent(value: unknown): value is GuestInboxEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return typeof event.eventId === 'string'
    && typeof event.type === 'string'
    && GUEST_INBOX_EVENT_TYPES.has(event.type as GuestInboxEvent['type'])
    && typeof event.siteId === 'string'
    && (typeof event.locationId === 'string' || event.locationId === null)
    && typeof event.threadId === 'string'
    && typeof event.threadVersion === 'number'
    && Number.isInteger(event.threadVersion)
    && event.threadVersion >= 0
    && typeof event.occurredAt === 'string'
}

export class GuestInboxHubObject extends DurableObject<GuestInboxHubEnv> {
  constructor(ctx: DurableObjectState, env: GuestInboxHubEnv) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return await this.handleBroadcast(request)
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const siteId = request.headers.get('x-krabiclaw-site-id')
    const memberId = request.headers.get('x-krabiclaw-member-id')
    if (!siteId || !memberId) return new Response('Unauthorized', { status: 401 })

    let allowedLocationIds: string[] | null
    try {
      allowedLocationIds = parseAllowedLocationIds(request.headers.get('x-krabiclaw-allowed-location-ids'))
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Invalid authorization payload', { status: 400 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    if (!client || !server) return new Response('WebSocket pair unavailable', { status: 500 })
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      siteId,
      memberId,
      allowedLocationIds,
      connectedAt: new Date().toISOString(),
    } satisfies InboxSocketAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping' || (typeof message === 'string' && message === 'ping')) {
      socket.send('pong')
    }
  }

  override webSocketClose(socket: WebSocket): void {
    try {
      socket.close()
    } catch {
      // Cloudflare may already have closed the socket.
    }
  }

  override webSocketError(socket: WebSocket, error: unknown): void {
    console.error('Guest inbox WebSocket error', error)
    try {
      socket.close(1011, 'Guest inbox connection error')
    } catch {
      // Cloudflare may already have closed the socket.
    }
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const event = await request.json().catch(() => null) as unknown
    const siteId = request.headers.get('x-krabiclaw-site-id')
    if (!siteId || !isGuestInboxEvent(event) || event.siteId !== siteId) {
      return new Response('Invalid guest inbox event', { status: 400 })
    }

    const encoded = JSON.stringify(event)
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as InboxSocketAttachment | null
      if (!attachment || attachment.siteId !== event.siteId) continue
      if (attachment.allowedLocationIds && (!event.locationId || !attachment.allowedLocationIds.includes(event.locationId))) continue
      try {
        socket.send(encoded)
      } catch (error) {
        console.error('Guest inbox event delivery failed', error)
      }
    }

    return new Response(null, { status: 204 })
  }
}
