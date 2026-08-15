import { onBeforeUnmount, ref } from 'vue'

export interface GuestInboxSocketEvent {
  eventId: string
  type: 'thread.created' | 'thread.changed' | 'entry.appended' | 'delivery.changed' | 'read-state.changed'
  siteId: string
  locationId: string | null
  threadId: string
  threadVersion: number
  occurredAt: string
}

interface GuestInboxSocketOptions {
  siteId: string
  onEvent: (event: GuestInboxSocketEvent) => void
  onReconnect: () => void
}

const GUEST_INBOX_EVENT_TYPES = new Set<GuestInboxSocketEvent['type']>([
  'thread.created',
  'thread.changed',
  'entry.appended',
  'delivery.changed',
  'read-state.changed',
])

function parseEvent(value: unknown): GuestInboxSocketEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (
    typeof event.eventId !== 'string'
    || typeof event.type !== 'string'
    || !GUEST_INBOX_EVENT_TYPES.has(event.type as GuestInboxSocketEvent['type'])
    || typeof event.siteId !== 'string'
    || (typeof event.locationId !== 'string' && event.locationId !== null)
    || typeof event.threadId !== 'string'
    || typeof event.threadVersion !== 'number'
    || !Number.isInteger(event.threadVersion)
    || event.threadVersion < 0
    || typeof event.occurredAt !== 'string'
  ) return null
  return event as unknown as GuestInboxSocketEvent
}

export function useGuestInboxSocket(options: GuestInboxSocketOptions) {
  const status = ref<'closed' | 'connecting' | 'open' | 'reconnecting'>('closed')
  const seenEventIds = new Set<string>()
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let intentionallyClosed = false

  function connect() {
    if (!import.meta.client || intentionallyClosed || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${scheme}//${window.location.host}/api/dashboard/sites/${encodeURIComponent(options.siteId)}/guest-inbox/socket`
    status.value = reconnectAttempt > 0 ? 'reconnecting' : 'connecting'
    socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      const wasReconnect = reconnectAttempt > 0
      reconnectAttempt = 0
      status.value = 'open'
      if (wasReconnect) options.onReconnect()
    })

    socket.addEventListener('message', (message) => {
      if (message.data === 'pong') return
      let parsed: unknown
      try {
        parsed = JSON.parse(String(message.data))
      } catch {
        return
      }
      const event = parseEvent(parsed)
      if (!event || event.siteId !== options.siteId || seenEventIds.has(event.eventId)) return
      seenEventIds.add(event.eventId)
      if (seenEventIds.size > 1000) {
        const first = seenEventIds.values().next().value
        if (first) seenEventIds.delete(first)
      }
      options.onEvent(event)
    })

    socket.addEventListener('close', () => {
      socket = null
      if (intentionallyClosed) {
        status.value = 'closed'
        return
      }
      status.value = 'reconnecting'
      const delay = Math.min(10_000, 500 * 2 ** Math.min(reconnectAttempt, 5))
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    })

    socket.addEventListener('error', () => {
      socket?.close()
    })
  }

  function close() {
    intentionallyClosed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    socket?.close(1000, 'Inbox closed')
    socket = null
    status.value = 'closed'
  }

  onBeforeUnmount(close)

  return { status, connect, close }
}
