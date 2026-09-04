import { DurableObject } from 'cloudflare:workers'
import { isDashboardInvalidation, type DashboardInvalidation } from '~/shared/dashboard-invalidations'

interface GuestInboxHubEnv {
  GUEST_INBOX_HUBS?: DurableObjectNamespace
}

interface InboxSocketAttachment {
  organizationId: string
  userId: string
  allowedSiteIds: string[] | null
  allowedLocationIds: string[]
  connectedAt: string
}

function parseAllowedIds(value: string | null): string[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSocketAttachment(value: unknown): value is InboxSocketAttachment {
  return isRecord(value)
    && typeof value.organizationId === 'string'
    && typeof value.userId === 'string'
    && (value.allowedSiteIds === null
      || Array.isArray(value.allowedSiteIds) && value.allowedSiteIds.every(id => typeof id === 'string'))
    && Array.isArray(value.allowedLocationIds)
    && value.allowedLocationIds.every(id => typeof id === 'string')
    && typeof value.connectedAt === 'string'
}

function canReceive(attachment: InboxSocketAttachment, event: DashboardInvalidation): boolean {
  if (attachment.organizationId !== event.organizationId) return false
  if ('targetUserId' in event && event.targetUserId && event.targetUserId !== attachment.userId) return false
  if (event.type === 'notification.read' && event.targetUserId === attachment.userId) return true
  if (attachment.allowedSiteIds === null) return true
  return Boolean(
    event.siteId && attachment.allowedSiteIds.includes(event.siteId)
    || event.locationId && attachment.allowedLocationIds.includes(event.locationId),
  )
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

    const organizationId = request.headers.get('x-krabiclaw-organization-id')
    const userId = request.headers.get('x-krabiclaw-user-id')
    if (!organizationId || !userId) return new Response('Unauthorized', { status: 401 })

    let allowedSiteIds: string[] | null
    let allowedLocationIds: string[]
    try {
      const sites = request.headers.get('x-krabiclaw-allowed-site-ids')
      allowedSiteIds = sites === '*' ? null : parseAllowedIds(sites)
      allowedLocationIds = parseAllowedIds(request.headers.get('x-krabiclaw-allowed-location-ids'))
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Invalid authorization payload', { status: 400 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    if (!client || !server) return new Response('WebSocket pair unavailable', { status: 500 })
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      organizationId,
      userId,
      allowedSiteIds,
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
    console.error('Dashboard WebSocket error', error)
    try {
      socket.close(1011, 'Guest inbox connection error')
    } catch {
      // Cloudflare may already have closed the socket.
    }
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const event: unknown = await request.json().catch(() => null)
    const organizationId = request.headers.get('x-krabiclaw-organization-id')
    if (!organizationId || !isDashboardInvalidation(event) || event.organizationId !== organizationId) {
      return new Response('Invalid dashboard invalidation', { status: 400 })
    }

    const encoded = JSON.stringify(event)
    for (const socket of this.ctx.getWebSockets()) {
      const attachment: unknown = socket.deserializeAttachment()
      if (!isSocketAttachment(attachment) || !canReceive(attachment, event)) continue
      try {
        socket.send(encoded)
      } catch (error) {
        console.error('Dashboard invalidation delivery failed', error)
      }
    }

    return new Response(null, { status: 204 })
  }
}
