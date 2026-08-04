import { DurableObject } from 'cloudflare:workers'
import nitroApp from '../.output/server/index.mjs'
import { createDb, execute, queryFirst } from '../server/db'
import { appendEntry } from '../server/domain/guest-threads/entries'
import { attemptEmailDelivery, getDeliveryById } from '../server/domain/guest-threads/deliveries'
import { publishPendingGuestDeliveryOutbox, type GuestDeliveryQueueMessage } from '../server/domain/guest-threads/outbox-publisher'
import { getGuestThreadById } from '../server/domain/guest-threads/repository'
import { getAdapter } from '../server/domain/guest-threads/adapters/registry'
import { nextConversationState } from '../server/domain/guest-threads/state-machine'
import { isPlatformHost } from '../server/utils/tenant-hosts'

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

function isStaticPlatformHomeRequest(request: Request, env: Env): boolean {
  const url = new URL(request.url)
  return request.method === 'GET'
    && url.pathname === '/'
    && isPlatformHost(url.host, env)
    && !request.headers.has('x-preview-tenant')
}

function shouldDeferPublicHydration(request: Request): boolean {
  if (request.method !== 'GET') return false
  const pathname = new URL(request.url).pathname
  const privatePrefixes = [
    '/api/', '/_nuxt/', '/assets/', '/admin', '/dashboard', '/auth/', '/oauth/',
    '/account', '/login', '/signup', '/forgot-password', '/reset-password',
    '/accept-invitation', '/transfer',
  ]
  return !privatePrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix))
}

function removePublicNuxtUiColors(html: string): string {
  return html.replace(/<style\b[^>]*id="nuxt-ui-colors"[^>]*>[\s\S]*?<\/style>/, '')
}

function renderDeferredHydrationLoader(entryUrl: string): string {
  const serializedEntryUrl = JSON.stringify(entryUrl)
  return `<script>(()=>{const entry=${serializedEntryUrl};let started=false;let loaded=false;let pending=null;const control=node=>node instanceof Element?node.closest('button,[role="button"],input[type="submit"],input[type="button"]'):null;const start=action=>{if(started)return;started=true;pending=action;const script=document.createElement("script");script.type="module";script.src=entry;script.crossOrigin="anonymous";script.addEventListener("load",()=>{loaded=true;document.removeEventListener("pointerdown",onPointerDown,true);document.removeEventListener("click",onClick,true);document.removeEventListener("submit",onSubmit,true);setTimeout(()=>{document.querySelectorAll("#nuxt-ui-colors,[data-nuxt-ui-colors]").forEach(style=>style.remove());const actionToReplay=pending;pending=null;if(!actionToReplay||!actionToReplay.target.isConnected){if(actionToReplay)console.error("Public interaction could not be replayed after hydration",actionToReplay);return}if(actionToReplay.kind==="click"){actionToReplay.target.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}))}else{actionToReplay.target.requestSubmit(actionToReplay.submitter||undefined)}},0)},{once:true});script.addEventListener("error",()=>console.error("Public interaction hydration failed",entry),{once:true});document.head.append(script)};const onPointerDown=event=>{const target=control(event.target);if(target&&!target.disabled)start(null)};const onClick=event=>{const target=control(event.target);if(!target||target.disabled||loaded)return;if(!started)start({kind:"click",target});else pending={kind:"click",target};event.preventDefault();event.stopImmediatePropagation()};const onSubmit=event=>{if(loaded)return;const target=event.target;if(!(target instanceof HTMLFormElement))return;if(!started)start({kind:"submit",target,submitter:event.submitter});else pending={kind:"submit",target,submitter:event.submitter};event.preventDefault();event.stopImmediatePropagation()};const hydrateVisibleMedia=()=>{const videos=Array.from(document.querySelectorAll("video"));if(videos.length===0)return;if(!("IntersectionObserver" in window)){if(videos.some(video=>{const rect=video.getBoundingClientRect();return rect.bottom>0&&rect.top<window.innerHeight}))start(null);return}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();start(null)}},{threshold:0.01});videos.forEach(video=>observer.observe(video))};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",hydrateVisibleMedia,{once:true});else hydrateVisibleMedia()})()</script>`
}

async function renderStaticPlatformHome(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('text/html')) return response

  const html = await response.text()
  const moduleScript = /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/_nuxt\/)[^>]*><\/script>/
  const nuxtConfigScript = /<script>window\.__NUXT__=[\s\S]*?<\/script>/
  const nuxtDataScript = /<script type="application\/json" data-nuxt-data="nuxt-app"[^>]*>[\s\S]*?<\/script>/

  if (!moduleScript.test(html) || !nuxtConfigScript.test(html) || !nuxtDataScript.test(html)) {
    throw new Error('Static platform homepage contract is missing the Nuxt runtime markers')
  }

  const staticHtml = removePublicNuxtUiColors(html)
    .replace(moduleScript, '<script defer src="/platform-home-static.js"></script>')
    .replace(nuxtConfigScript, '')
    .replace(nuxtDataScript, '')
    .replace(
      '</head>',
      '<script>try{const p=localStorage.getItem("krabiclaw-theme");document.documentElement.classList.toggle("dark",p==="dark"||p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)}catch(error){console.error("Unable to restore platform theme",error)}</script></head>',
    )

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('x-public-render-mode', 'static-html')
  return new Response(staticHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function deferPublicHydration(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.includes('text/html')) return response

  const html = await response.text()
  const moduleScript = /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="(\/_nuxt\/[^\"]+)")[^>]*><\/script>/
  const nuxtDataScript = /<script type="application\/json" data-nuxt-data="nuxt-app"[^>]*>[\s\S]*?<\/script>/
  const match = html.match(moduleScript)
  if (!match?.[1] || !nuxtDataScript.test(html)) {
    throw new Error('Interaction hydration contract is missing the Nuxt entry script or payload')
  }

  const hydrationLoader = renderDeferredHydrationLoader(match[1])
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('x-public-hydration', 'interaction-or-visible-media')
  return new Response(removePublicNuxtUiColors(html)
    .replace(moduleScript, hydrationLoader), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request, env, ctx) {
    const response = await handler.fetch(request, env, ctx)
    if (isStaticPlatformHomeRequest(request, env)) return renderStaticPlatformHome(response)
    if (!shouldDeferPublicHydration(request)) return response
    return deferPublicHydration(response)
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(publishPendingGuestDeliveryOutbox(createDb(env.DB), env, 50))
    return handler.scheduled?.(controller, env, ctx)
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
