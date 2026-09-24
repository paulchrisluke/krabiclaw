import { DurableObject } from 'cloudflare:workers'
import { isDashboardInvalidation, type DashboardInvalidation } from '~/shared/dashboard-invalidations'

interface GuestInboxHubEnv {
  GUEST_INBOX_HUBS?: DurableObjectNamespace
}

interface InboxSocketAttachment {
  organizationId: string
  userId: string
  connectedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSocketAttachment(value: unknown): value is InboxSocketAttachment {
  return isRecord(value)
    && typeof value.organizationId === 'string'
    && typeof value.userId === 'string'
    && typeof value.connectedAt === 'string'
}

function canReceive(attachment: InboxSocketAttachment, event: DashboardInvalidation): boolean {
  if (attachment.organizationId !== event.organizationId) return false
  if ('targetUserId' in event && event.targetUserId && event.targetUserId !== attachment.userId) return false
  // Every member of a tenant is organization-wide, so reaching the tenant is
  // the whole of the decision. This used to also carry the location teams a
  // scoped editor held, which no role has any more.
  return true
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

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    if (!client || !server) return new Response('WebSocket pair unavailable', { status: 500 })
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      organizationId,
      userId,
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

    // A send that throws is usually a socket the client has already dropped, and
    // the other dashboards watching this organization should still be told. But
    // if every eligible socket failed then the event reached nobody who was
    // entitled to it, and answering 204 to that is the publisher's cue to carry
    // on as though the dashboards had been updated.
    const encoded = JSON.stringify(event)
    let eligible = 0
    let delivered = 0
    const failures: string[] = []
    for (const socket of this.ctx.getWebSockets()) {
      const attachment: unknown = socket.deserializeAttachment()
      if (!isSocketAttachment(attachment) || !canReceive(attachment, event)) continue
      eligible += 1
      try {
        socket.send(encoded)
        delivered += 1
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    if (eligible > 0 && delivered === 0) {
      return new Response(
        `Dashboard invalidation reached none of ${eligible} connected dashboards: ${failures.join('; ')}`,
        { status: 500 },
      )
    }

    return new Response(null, { status: 204 })
  }
}
