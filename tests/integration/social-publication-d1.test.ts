import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { H3 } from 'nitro/h3'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { createPost, deletePost, getPost, listPublicSocialPosts, postPayloadFingerprint, updatePost } from '../../server/utils/post-management.ts'
import { publishPost, reconcilePostPublication, type PublishTarget } from '../../server/utils/social-publication.ts'
import { syncSocialPosts } from '../../server/utils/social-sync.ts'
import { remainingMetaSubjectData } from '../../server/utils/integration-release.ts'
import { verifyMetaSignedRequest, configuredMetaApps } from '../../server/utils/meta-graph.ts'
import { attachMediaPlacement } from '../../server/utils/media-placement.ts'
import deauthorizeCallback from '../../server/api/integrations/meta/deauthorize.post.ts'
import deleteCallback from '../../server/api/integrations/meta/data-deletion.post.ts'
import deletionStatus from '../../server/api/integrations/meta/data-deletion.get.ts'

/**
 * Publication, import and erasure against real local D1, with Meta and
 * Cloudflare Images replaced at their HTTP boundary by a fixture that behaves
 * like their documented primitives and records every request it receives.
 * The assertions read what the provider was sent and what D1 holds.
 */

const PAGE = '1205835975938850'
const IG = '17841401765050246'
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 64 }, () => 1)])
const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, ...Array.from({ length: 64 }, () => 2)])
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 64 }, () => 3)])

type Fault = { match: (request: SeenRequest) => boolean; kind: 'timeout' | 'reject' | 'missing'; times: number }
interface SeenRequest { method: string; host: string; path: string; query: URLSearchParams; body: Record<string, string> }

class FakeMeta {
  requests: SeenRequest[] = []
  faults: Fault[] = []
  counter = 0
  fbPosts = new Map<string, { published: boolean; message?: string; link?: string; attached: string[] }>()
  fbPhotos = new Map<string, string>()
  fbVideos = new Map<string, { ready: number; published: boolean; postId: string | null }>()
  igContainers = new Map<string, { status: string; inProgressReads: number; children?: string[]; kind: string; url?: string; caption?: string }>()
  igMedia = new Map<string, { container: string }>()
  pagePosts: Array<Record<string, unknown>> = []
  igFeed: Array<Record<string, unknown>> = []
  media = new Map<string, { bytes: Uint8Array; redirect?: string }>()

  fault(kind: Fault['kind'], match: Fault['match'], times = 1) { this.faults.push({ kind, match, times }) }
  sent(predicate: (request: SeenRequest) => boolean) { return this.requests.filter(predicate) }
  id(prefix: string) { this.counter += 1; return `${prefix}${this.counter}` }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const body: Record<string, string> = {}
    if (typeof init.body === 'string') for (const [key, value] of new URLSearchParams(init.body)) body[key] = value
    const request: SeenRequest = { method, host: url.hostname, path: url.pathname, query: url.searchParams, body }
    this.requests.push(request)
    const fault = this.faults.find(candidate => candidate.times > 0 && candidate.match(request))
    if (fault) {
      fault.times -= 1
      if (fault.kind === 'timeout') throw new DOMException('The operation timed out', 'TimeoutError')
      if (fault.kind === 'missing') return json({ error: { message: 'Unsupported get request. Object does not exist', code: 100, error_subcode: 33, fbtrace_id: 'trace-missing' } }, 400)
      return json({ error: { message: 'Invalid parameter', code: 100, fbtrace_id: 'trace-reject' } }, 400)
    }
    if (url.hostname === 'api.cloudflare.com') return json({ success: true, result: { id: this.id('img-') } })
    if (url.hostname.endsWith('fbcdn.net') || url.hostname.endsWith('cdninstagram.com') || url.hostname === 'evil.example.test') {
      const item = this.media.get(url.toString())
      if (!item) return new Response('missing', { status: 404 })
      if (item.redirect) return new Response(null, { status: 302, headers: { location: item.redirect } })
      return new Response(item.bytes, { status: 200, headers: { 'content-length': String(item.bytes.byteLength) } })
    }
    if (url.hostname === 'graph.facebook.com') return this.facebook(method, url.pathname.replace('/v25.0/', ''), url.searchParams, body)
    if (url.hostname === 'graph.instagram.com') return this.instagram(method, url.pathname.replace('/v23.0/', ''), url.searchParams, body)
    throw new Error(`Unexpected request ${method} ${url}`)
  }

  facebook(method: string, path: string, query: URLSearchParams, body: Record<string, string>): Response {
    if (path === 'me/accounts') return json({ data: [{ id: PAGE, name: 'Krabi Claw', access_token: 'page-token' }] })
    if (method === 'POST' && path === `${PAGE}/photos`) { const id = this.id('photo-'); this.fbPhotos.set(id, body.url!); return json({ id }) }
    if (method === 'POST' && path === `${PAGE}/feed`) {
      const id = this.id(`${PAGE}_`)
      this.fbPosts.set(id, { published: body.published !== 'false', message: body.message, link: body.link, attached: Object.keys(body).filter(key => key.startsWith('attached_media')).sort().map(key => JSON.parse(body[key]!).media_fbid) })
      return json({ id })
    }
    if (method === 'POST' && path === `${PAGE}/videos`) { const id = this.id('video-'); this.fbVideos.set(id, { ready: 1, published: false, postId: null }); return json({ id }) }
    if (method === 'GET' && path === `${PAGE}/posts`) {
      const offset = Number(query.get('after') ?? 0)
      const limit = Number(query.get('limit'))
      const page = this.pagePosts.slice(offset, offset + limit)
      const next = offset + limit < this.pagePosts.length
      return json({ data: page, paging: next ? { cursors: { after: String(offset + limit) }, next: `https://graph.facebook.com/next?access_token=secret&after=${offset + limit}` } : { cursors: {} } })
    }
    const post = this.fbPosts.get(path)
    // Facebook does not publish an unpublished feed post later (production answered this on 2026-09-28).
    if (post && method === 'POST') return json({ error: { message: '(#10) Failed to publish post', code: 10, fbtrace_id: 'trace-10' } }, 400)
    if (post && method === 'GET') return json({ id: path, is_published: post.published, permalink_url: `https://www.facebook.com/${path}`, created_time: '2026-09-28T10:00:00+0000' })
    const video = this.fbVideos.get(path)
    if (video && method === 'GET') {
      if (query.get('fields')?.includes('source')) return json({ source: 'https://video.xx.fbcdn.net/v.mp4', picture: 'https://scontent.xx.fbcdn.net/poster.jpg', length: 12 })
      video.ready -= 1
      return json({ id: path, published: video.published, post_id: video.postId, permalink_url: `/Krabi/videos/${path}/`, status: { video_status: video.ready < 0 ? 'ready' : 'processing' } })
    }
    if (video && method === 'POST') { video.published = true; video.postId = `${PAGE}_${path}`; return json({ success: true }) }
    if (method === 'DELETE') { this.fbPosts.delete(path); this.fbPhotos.delete(path); return json({ success: true }) }
    const record = this.pagePosts.find(item => item.id === path)
    if (record) return json(record)
    return json({ error: { message: 'Unsupported get request. Object does not exist', code: 100, error_subcode: 33 } }, 400)
  }

  instagram(method: string, path: string, query: URLSearchParams, body: Record<string, string>): Response {
    if (method === 'POST' && path === `${IG}/media`) {
      const id = this.id('container-')
      const kind = body.media_type ?? 'IMAGE'
      this.igContainers.set(id, { status: this.expireNewContainers ? 'EXPIRED' : 'FINISHED', inProgressReads: kind === 'REELS' ? this.reelProcessingReads : 0, kind, url: body.image_url ?? body.video_url, caption: body.caption, children: body.children?.split(',') })
      return json({ id })
    }
    if (method === 'POST' && path === `${IG}/media_publish`) {
      const container = this.igContainers.get(body.creation_id!)
      if (!container || container.status !== 'FINISHED') return json({ error: { message: 'Media not ready', code: 9007 } }, 400)
      container.status = 'PUBLISHED'
      const id = this.id('ig-media-')
      this.igMedia.set(id, { container: body.creation_id! })
      return json({ id })
    }
    if (method === 'GET' && path === `${IG}/media`) {
      const offset = Number(query.get('after') ?? 0)
      const limit = Number(query.get('limit'))
      const next = offset + limit < this.igFeed.length
      return json({ data: this.igFeed.slice(offset, offset + limit), paging: next ? { cursors: { after: String(offset + limit) }, next: 'https://graph.instagram.com/next' } : { cursors: {} } })
    }
    const container = this.igContainers.get(path)
    if (container && method === 'GET') {
      if (container.inProgressReads > 0) { container.inProgressReads -= 1; return json({ status_code: 'IN_PROGRESS' }) }
      return json({ status_code: container.status })
    }
    if (this.igMedia.has(path)) return json({ id: path, permalink: `https://www.instagram.com/p/${path}/`, timestamp: '2026-09-28T10:00:00+0000', username: 'krabiclaw' })
    const record = this.igFeed.find(item => item.id === path)
    if (record) return json(record)
    return json({ error: { message: 'Object does not exist', code: 100, error_subcode: 33 } }, 400)
  }
  reelProcessingReads = 0
  expireNewContainers = false
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

async function setUp() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'social-publication-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' }, MEDIA_BUCKET: { type: 'r2' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  for (const statement of readFileSync('migrations/0000_baseline.sql', 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) await db.prepare(statement).run()
  const env = {
    ...await runtime.getBindings<CloudflareEnv>(),
    BETTER_AUTH_SECRET: 'local-proof-secret-long-enough-for-auth', BETTER_AUTH_URL: 'https://proof.example', STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests',
    NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://proof.example', PREVIEW_SECRET: 'preview-proof-secret',
    FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: 'facebook-secret', INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'instagram-secret',
    CONNECTOR_TOKEN_ENCRYPTION_KEY: 'local-proof-meta-deletion-confirmation-key',
    CF_ACCOUNT_ID: 'cf-proof', CLOUDFLARE_IMAGES_API_TOKEN: 'cf-images-proof', CLOUDFLARE_IMAGES_VARIANT_BASE: 'https://imagedelivery.example.test/hash',
    MEDIA_BASE_URL: 'https://media.example.test',
  } as unknown as CloudflareEnv
  const later = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60
  const run = (sql: string) => db.prepare(sql).run()
  for (const organization of ['org-a', 'org-b']) {
    await run(`INSERT INTO organization (id, name, slug, subdomain) VALUES ('${organization}', '${organization}', '${organization}', '${organization}')`)
    await run(`INSERT INTO organization_domains (id, organization_id, domain, type, role, status) VALUES ('domain-${organization}', '${organization}', '${organization}.krabiclaw.test', 'subdomain', 'canonical', 'active')`)
    await run(`INSERT INTO organization_locales (id, organization_id, locale, is_source, status) VALUES ('${organization}-en', '${organization}', 'en', 1, 'published')`)
    await run(`INSERT INTO subscription (id, plan, referenceId, status) VALUES ('sub-${organization}', 'growth', '${organization}', 'active')`)
  }
  await run("INSERT INTO user (id, name, email) VALUES ('owner', 'Owner', 'owner@proof.example')")
  await run("INSERT INTO account (id, accountId, providerId, userId, accessToken) VALUES ('fb-account', 'fb-subject', 'facebook', 'owner', 'user-token')")
  await run(`INSERT INTO account (id, accountId, providerId, userId, accessToken, accessTokenExpiresAt) VALUES ('ig-account', 'ig-subject', 'instagram', 'owner', 'ig-token', ${later})`)
  for (const organization of ['org-a', 'org-b']) {
    await run(`UPDATE organization SET integrations_json = '${JSON.stringify({
      facebook: { revision: `fb-rev-${organization}`, account_id: 'fb-account', page_id: PAGE, page_name: 'Krabi Claw', status: 'active', created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T00:00:00.000Z' },
      instagram: { revision: `ig-rev-${organization}`, account_id: 'ig-account', instagram_user_id: IG, username: 'krabiclaw', status: 'active', created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T00:00:00.000Z' },
    })}' WHERE id = '${organization}'`)
  }
  const meta = new FakeMeta()
  const realFetch = globalThis.fetch
  globalThis.fetch = meta.fetch as typeof fetch
  const asset = async (id: string, mime: string, kind: 'image' | 'video' = 'image') => run(`INSERT INTO media_assets (id, organization_id, kind, provider, source, public_url, thumbnail_url, mime_type, file_size, duration)
    VALUES ('${id}', 'org-a', '${kind}', 'cloudflare_images', 'uploaded', 'https://imagedelivery.example.test/hash/${id}/public', ${kind === 'video' ? `'https://imagedelivery.example.test/hash/${id}-poster/public'` : 'NULL'}, '${mime}', 1000, ${kind === 'video' ? 20 : 'NULL'})`)
  // Social cards are rendered by the Worker's Images binding, which this Node
  // runtime does not have; writes that refresh a card run where Cloudflare
  // Images is not configured, and so skip it, exactly as local development does.
  const { CLOUDFLARE_IMAGES_API_TOKEN: _token, ...cardless } = env as unknown as Record<string, unknown>
  return { runtime, db, env, cardless: cardless as unknown as CloudflareEnv, meta, run, asset, restore: () => { globalThis.fetch = realFetch } }
}

const targets = {
  website: { channel: 'organization' } as PublishTarget,
  facebook: (organization = 'org-a') => ({ channel: 'facebook', target_id: PAGE, connection_revision: `fb-rev-${organization}` }) as PublishTarget,
  instagram: (organization = 'org-a') => ({ channel: 'instagram', target_id: IG, connection_revision: `ig-rev-${organization}` }) as PublishTarget,
}

test('publication: one result, one external post per target, and no blind resend under any fault', async () => {
  const { runtime, db, env, cardless, meta, run, asset, restore } = await setUp()
  try {
    await asset('a1', 'image/jpeg')
    await asset('a2', 'image/jpeg')
    await asset('a3', 'image/png')
    await asset('v1', 'video/mp4', 'video')
    const create = (key: string, post: Record<string, unknown>) => createPost(db, cardless, 'org-a', { post, idempotencyKey: key }, 'owner')
    // What a receipt claims, read back from the database and from the fake provider's own state.
    const publishedOnMeta = async (postId: string, channel: 'facebook' | 'instagram') => {
      const row = await db.prepare('SELECT state, provider_post_id FROM post_publications WHERE post_id = ? AND channel = ?').bind(postId, channel).first<{ state: string; provider_post_id: string | null }>()
      assert.equal(row?.state, 'published')
      assert.ok(row!.provider_post_id)
      if (channel === 'instagram') assert.ok(meta.igMedia.has(row!.provider_post_id!))
      else assert.equal(meta.fbPosts.get(row!.provider_post_id!)?.published ?? meta.fbVideos.get(row!.provider_post_id!)?.published, true)
    }

    // Creation is idempotent by key, and a reused key for other words conflicts.
    const first = await create('key-1', { body: 'Pizza night Friday', media: [{ asset_id: 'a1', slot: 'cover' }, { asset_id: 'a2', slot: 'gallery' }], call_to_action: { label: 'Book', url: 'https://example.test/book' } })
    assert.equal(first.replayed, false)
    assert.equal(first.post.status, 'draft')
    assert.equal(first.post.slug, 'pizza-night-friday')
    assert.match(first.post.preview_url ?? '', /^https:\/\/org-a\.krabiclaw\.test\/posts\/pizza-night-friday\?preview_token=/)
    assert.equal((await create('key-1', { body: 'Pizza night Friday', media: [{ asset_id: 'a1', slot: 'cover' }, { asset_id: 'a2', slot: 'gallery' }], call_to_action: { label: 'Book', url: 'https://example.test/book' } })).post.id, first.post.id)
    await assert.rejects(create('key-1', { body: 'Something else' }), /different post/)
    assert.equal(await db.prepare("SELECT count(*) FROM content_documents WHERE kind = 'social_post'").first('count(*)'), 1)
    // An empty draft exists and has a generated route, and cannot be published.
    const empty = await create('key-empty', {})
    assert.equal(empty.post.slug, `update-${empty.post.id}`)
    const emptyResult = await publishPost(env, 'org-a', empty.post.id, { expectedUpdatedAt: empty.post.updated_at, targets: [targets.website] }, 'owner')
    assert.deepEqual([emptyResult.ok, emptyResult.outcomes[0]!.code], [false, 'empty_post'])
    assert.deepEqual(await db.prepare('SELECT status, published_at FROM content_documents WHERE id = ?').bind(empty.post.id).first(), { status: 'draft', published_at: null })

    // Website, Facebook photos and an Instagram carousel in one call.
    const all = await publishPost(env, 'org-a', first.post.id, { expectedUpdatedAt: first.post.updated_at, targets: [targets.website, targets.facebook(), targets.instagram()] }, 'owner')
    assert.equal(all.ok, true, JSON.stringify(all.outcomes))
    assert.deepEqual(all.outcomes.map(outcome => [outcome.channel, outcome.status]), [['organization', 'published'], ['facebook', 'published'], ['instagram', 'published']])
    // What Facebook received: two unpublished photos in order, then one published post attaching them with the caption and link line.
    const photos = meta.sent(request => request.path.endsWith(`${PAGE}/photos`))
    assert.deepEqual(photos.map(request => [request.body.url, request.body.published]), [['https://imagedelivery.example.test/hash/a1/public', 'false'], ['https://imagedelivery.example.test/hash/a2/public', 'false']])
    const [feed] = meta.sent(request => request.path.endsWith(`${PAGE}/feed`))
    assert.equal(feed!.body.message, 'Pizza night Friday\n\nBook: https://example.test/book')
    assert.equal(feed!.body.published, undefined)
    assert.equal(feed!.body.link, undefined)
    assert.deepEqual([...meta.fbPosts.values()][0]!.attached, ['photo-1', 'photo-2'])
    assert.equal(meta.sent(request => request.body.is_published !== undefined).length, 0)
    // What Instagram received: two carousel children, one carousel container with the caption, one media_publish.
    const containers = meta.sent(request => request.method === 'POST' && request.path.endsWith(`${IG}/media`))
    assert.deepEqual(containers.map(request => [request.body.media_type ?? 'IMAGE', request.body.is_carousel_item ?? '', request.body.caption ?? '']), [
      ['IMAGE', 'true', ''], ['IMAGE', 'true', ''], ['CAROUSEL', '', 'Pizza night Friday\n\nBook: https://example.test/book'],
    ])
    assert.equal(meta.sent(request => request.path.endsWith('media_publish')).length, 1)
    const stored = await db.prepare("SELECT channel, origin, state, provider_post_id, provider_permalink, attempt_id FROM post_publications WHERE post_id = ? ORDER BY channel").bind(first.post.id).all()
    assert.deepEqual(stored.results.map(row => [row.channel, row.origin, row.state, row.attempt_id]), [['facebook', 'publish', 'published', null], ['instagram', 'publish', 'published', null]])

    // A repeat reads the receipts: nothing is sent again and the publication date stays.
    const requestCount = meta.requests.length
    const published = await getPost(db, env, 'org-a', first.post.id)
    const again = await publishPost(env, 'org-a', first.post.id, { expectedUpdatedAt: 'stale-token', targets: [targets.website, targets.facebook(), targets.instagram()] }, 'owner')
    assert.deepEqual(again.outcomes.map(outcome => outcome.status), ['already_published', 'already_published', 'already_published'])
    assert.equal(again.ok, true)
    assert.equal(meta.requests.filter(request => request.method !== 'GET').length, meta.requests.slice(0, requestCount).filter(request => request.method !== 'GET').length)
    assert.equal((await getPost(db, env, 'org-a', first.post.id))!.published_at, published!.published_at)
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE event_name = 'post.published'").first('count(*)'), 1)
    // The public projection carries only confirmed publications, with Meta's own links.
    const feedPage = await listPublicSocialPosts(env, db, 'org-a', { locale: 'en', window: { limit: 12, offset: 0 }, resource: 'r' })
    assert.deepEqual(feedPage.posts[0]!.publications, [{ channel: 'facebook', url: `https://www.facebook.com/${PAGE}_3` }, { channel: 'instagram', url: `https://www.instagram.com/p/${[...meta.igMedia.keys()][0]}/` }])
    assert.deepEqual(feedPage.posts[0]!.media.map(item => item.asset_id), ['a1', 'a2'])
    // A post is published once per channel: another Page is a conflict.
    const elsewhere = await publishPost(env, 'org-a', first.post.id, { expectedUpdatedAt: published!.updated_at, targets: [{ channel: 'facebook', target_id: 'another-page', connection_revision: 'fb-rev-org-a' }] }, 'owner')
    assert.equal(elsewhere.outcomes[0]!.code, 'target_conflict')

    // A disconnected channel is skipped; the independent website target still publishes; ok is false.
    await run("UPDATE organization SET integrations_json = json_remove(integrations_json, '$.facebook') WHERE id = 'org-a'")
    const second = await create('key-2', { body: 'Text only' })
    const partial = await publishPost(env, 'org-a', second.post.id, { expectedUpdatedAt: second.post.updated_at, targets: [targets.website, targets.facebook()] }, 'owner')
    assert.deepEqual([partial.ok, partial.outcomes.map(outcome => `${outcome.status}:${outcome.code ?? ''}`)], [false, ['published:', 'skipped:not_connected']])
    assert.equal(await db.prepare('SELECT count(*) FROM post_publications WHERE post_id = ?').bind(second.post.id).first('count(*)'), 0)
    await run(`UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook', json('${JSON.stringify({ revision: 'fb-rev-org-a', account_id: 'fb-account', page_id: PAGE, page_name: 'Krabi Claw', status: 'active', created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T00:00:00.000Z' })}')) WHERE id = 'org-a'`)
    // Instagram refuses a text-only post and a PNG before anything is sent; a changed connection is a conflict, not another account.
    const refused = await publishPost(env, 'org-a', second.post.id, { expectedUpdatedAt: (await getPost(db, env, 'org-a', second.post.id))!.updated_at, targets: [targets.instagram(), { ...targets.facebook(), connection_revision: 'old' } as PublishTarget] }, 'owner')
    assert.deepEqual(refused.outcomes.map(outcome => outcome.code), ['media_required', 'connection_changed'])
    const png = await create('key-png', { media: [{ asset_id: 'a3', slot: 'cover' }] })
    assert.match((await publishPost(env, 'org-a', png.post.id, { expectedUpdatedAt: png.post.updated_at, targets: [targets.instagram()] }, 'owner')).outcomes[0]!.message!, /JPEG images only; asset a3 is image\/png/)
    // Stale content for a new target.
    const stale = await publishPost(env, 'org-a', second.post.id, { expectedUpdatedAt: second.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.equal(stale.outcomes[0]!.code, 'stale_revision')

    // Definite rejection before the native draft: failed, then the corrected retry publishes once.
    const third = await create('key-3', { body: 'Rejected first', media: [{ asset_id: 'a1', slot: 'cover' }] })
    meta.fault('reject', request => request.path.endsWith(`${PAGE}/photos`))
    const rejected = await publishPost(env, 'org-a', third.post.id, { expectedUpdatedAt: third.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.deepEqual([rejected.ok, rejected.outcomes[0]!.status, rejected.outcomes[0]!.code], [false, 'failed', 'provider_rejected'])
    const retried = await publishPost(env, 'org-a', third.post.id, { expectedUpdatedAt: third.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.equal(retried.outcomes[0]!.status, 'published')
    await publishedOnMeta(third.post.id, 'facebook')

    // The final call timed out before Facebook applied it: unknown, never sent again; its photos stay saved.
    const fourth = await create('key-4', { body: 'Lost feed', media: [{ asset_id: 'a2', slot: 'cover' }] })
    meta.fault('timeout', request => request.path.endsWith(`${PAGE}/feed`))
    const lost = await publishPost(env, 'org-a', fourth.post.id, { expectedUpdatedAt: fourth.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.deepEqual([lost.ok, lost.outcomes[0]!.status, lost.outcomes[0]!.code], [false, 'unknown', 'final_unconfirmed'])
    const pinned = (await getPost(db, env, 'org-a', fourth.post.id))!
    await assert.rejects(updatePost(db, cardless, 'org-a', fourth.post.id, { changes: { body: 'Edited' }, expectedUpdatedAt: pinned.updated_at }, 'owner'), /unresolved/)
    await assert.rejects(deletePost(db, 'org-a', fourth.post.id, 'owner'), /unresolved/)
    const feedsBefore = meta.sent(request => request.path.endsWith(`${PAGE}/feed`)).length
    assert.equal((await publishPost(env, 'org-a', fourth.post.id, { expectedUpdatedAt: pinned.updated_at, targets: [targets.facebook()] }, 'owner')).outcomes[0]!.status, 'unknown')
    assert.equal(meta.sent(request => request.path.endsWith(`${PAGE}/feed`)).length, feedsBefore)

    // The final call took effect but its answer was lost: unknown until reconciliation is told the post it became, which it reads on the Page.
    const fifth = await create('key-5', { body: 'Answer lost' })
    let createdId: string | null = null
    meta.fault('timeout', request => {
      if (request.method !== 'POST' || !request.path.endsWith(`${PAGE}/feed`)) return false
      createdId = `${PAGE}_answer-lost`
      meta.fbPosts.set(createdId, { published: true, message: request.body.message, link: request.body.link, attached: [] })
      return true
    })
    const answerLost = await publishPost(env, 'org-a', fifth.post.id, { expectedUpdatedAt: fifth.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.equal(answerLost.outcomes[0]!.status, 'unknown')
    const fifthPublication = (await getPost(db, env, 'org-a', fifth.post.id))!.publications[0]!
    assert.equal((await reconcilePostPublication(env, 'org-a', fifthPublication.id, createdId)).state, 'published')
    await publishedOnMeta(fifth.post.id, 'facebook')

    // A publication an earlier version prepared as an unpublished feed post: that draft is deleted and the post is published once with the saved photos.
    const sixth = await create('key-6', { body: 'Prepared the old way', media: [{ asset_id: 'a1', slot: 'cover' }] })
    const draftId = `${PAGE}_legacy-draft`
    meta.fbPosts.set(draftId, { published: false, attached: ['photo-legacy'] })
    await run(`INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state, provider_post_id, provider_handles_json, payload_hash, error_code, error_message)
      VALUES ('legacy', 'org-a', '${sixth.post.id}', 'facebook', 'fb-app', 'fb-subject', '${PAGE}', 'publish', 'failed', '${draftId}', '${JSON.stringify({ photo_ids: ['photo-legacy'], post_id: draftId })}',
        '${await postPayloadFingerprint((await getPost(db, env, 'org-a', sixth.post.id))!, { channel: 'facebook', target_id: PAGE })}', 'connection_error', '(#10) Failed to publish post')`)
    const stillUnpublished = await reconcilePostPublication(env, 'org-a', 'legacy', draftId)
    assert.deepEqual([stillUnpublished.state, stillUnpublished.publication?.status, stillUnpublished.publication?.code, stillUnpublished.publication?.message],
      ['failed', 'failed', 'connection_error', '(#10) Failed to publish post'])
    assert.deepEqual(await db.prepare('SELECT state, attempt_id, error_code, error_message FROM post_publications WHERE id = ?').bind('legacy').first(),
      { state: 'failed', attempt_id: null, error_code: 'connection_error', error_message: '(#10) Failed to publish post' })
    const republished = await publishPost(env, 'org-a', sixth.post.id, { expectedUpdatedAt: sixth.post.updated_at, targets: [targets.facebook()] }, 'owner')
    assert.equal(republished.outcomes[0]!.status, 'published', JSON.stringify(republished.outcomes))
    assert.equal(meta.fbPosts.has(draftId), false)
    assert.deepEqual(meta.sent(request => request.method === 'POST' && request.path.endsWith(`${PAGE}/feed`)).at(-1)!.body['attached_media[0]'], JSON.stringify({ media_fbid: 'photo-legacy' }))
    await publishedOnMeta(sixth.post.id, 'facebook')

    // An earlier reconciliation left an unclaimed unpublished draft in preparing.
    const seventh = await create('key-7', { body: 'Unclaimed legacy draft' })
    const unclaimedId = `${PAGE}_unclaimed-draft`
    meta.fbPosts.set(unclaimedId, { published: false, attached: [] })
    await run(`INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state, provider_post_id, provider_handles_json, payload_hash)
      VALUES ('unclaimed', 'org-a', '${seventh.post.id}', 'facebook', 'fb-app', 'fb-subject', '${PAGE}', 'publish', 'preparing', '${unclaimedId}', '${JSON.stringify({ post_id: unclaimedId })}',
        '${await postPayloadFingerprint((await getPost(db, env, 'org-a', seventh.post.id))!, { channel: 'facebook', target_id: PAGE })}')`)
    const ready = await reconcilePostPublication(env, 'org-a', 'unclaimed', unclaimedId)
    assert.deepEqual([ready.state, ready.publication?.status, ready.publication?.code], ['preparing', 'processing', 'preparation_ready'])
    assert.match(ready.publication!.message!, /Call publish_post again/)
    assert.equal((await publishPost(env, 'org-a', seventh.post.id, { expectedUpdatedAt: seventh.post.updated_at, targets: [targets.facebook()] }, 'owner')).outcomes[0]!.status, 'published')
    assert.equal(meta.fbPosts.has(unclaimedId), false)
    await publishedOnMeta(seventh.post.id, 'facebook')

    // A Reel still processing returns processing, keeps its container, and a later call finishes that same container.
    meta.reelProcessingReads = 10
    const reel = await create('key-reel', { body: 'Reel', media: [{ asset_id: 'v1', slot: 'cover' }] })
    const processing = await publishPost(env, 'org-a', reel.post.id, { expectedUpdatedAt: reel.post.updated_at, targets: [targets.instagram()] }, 'owner')
    assert.deepEqual([processing.outcomes[0]!.status, processing.outcomes[0]!.code], ['processing', 'container_processing'])
    const reelContainers = meta.sent(request => request.body.media_type === 'REELS').length
    assert.equal(reelContainers, 1)
    for (const container of meta.igContainers.values()) container.inProgressReads = 0
    assert.equal((await publishPost(env, 'org-a', reel.post.id, { expectedUpdatedAt: reel.post.updated_at, targets: [targets.instagram()] }, 'owner')).outcomes[0]!.status, 'published')
    assert.equal(meta.sent(request => request.body.media_type === 'REELS').length, 1)
    await publishedOnMeta(reel.post.id, 'instagram')

    // An expired container is a definite non-publication; the next call prepares new ones.
    const expiring = await create('key-expire', { media: [{ asset_id: 'a2', slot: 'cover' }] })
    meta.expireNewContainers = true
    const expired = await publishPost(env, 'org-a', expiring.post.id, { expectedUpdatedAt: expiring.post.updated_at, targets: [targets.instagram()] }, 'owner')
    assert.equal(expired.outcomes[0]!.code, 'container_expired')
    meta.expireNewContainers = false
    assert.equal((await publishPost(env, 'org-a', expiring.post.id, { expectedUpdatedAt: expiring.post.updated_at, targets: [targets.instagram()] }, 'owner')).outcomes[0]!.status, 'published')
    await publishedOnMeta(expiring.post.id, 'instagram')

    // Concurrent calls for one new target: one claim, one media_publish.
    const racing = await create('key-race', { media: [{ asset_id: 'a1', slot: 'cover' }] })
    const publishesBefore = meta.sent(request => request.path.endsWith('media_publish')).length
    const raced = await Promise.all([1, 2].map(() => publishPost(env, 'org-a', racing.post.id, { expectedUpdatedAt: racing.post.updated_at, targets: [targets.instagram()] }, 'owner')))
    assert.deepEqual(raced.map(result => result.outcomes[0]!.status).sort(), ['processing', 'published'])
    assert.equal(meta.sent(request => request.path.endsWith('media_publish')).length, publishesBefore + 1)

    // After publication, local edits are allowed and nothing is re-sent; the management view says the website copy changed.
    const edited = await updatePost(db, cardless, 'org-a', racing.post.id, { changes: { body: 'Edited later' }, expectedUpdatedAt: (await getPost(db, env, 'org-a', racing.post.id))!.updated_at }, 'owner')
    assert.equal(edited!.publications[0]!.local_content_changed, true)
    // Deleting the website post detaches, and keeps, the provider identity.
    assert.equal(await deletePost(db, 'org-a', racing.post.id, 'owner'), true)
    assert.equal(await db.prepare("SELECT count(*) FROM post_publications WHERE post_id IS NULL AND provider_post_id IS NOT NULL").first('count(*)'), 1)
    // Deleted keys answer gone.
    await assert.rejects(create('key-race', { media: [{ asset_id: 'a1', slot: 'cover' }] }), /deleted/)
    assert.equal(await db.prepare('PRAGMA foreign_key_check').all().then(result => result.results.length), 0)
  } finally {
    restore()
    await runtime.dispose()
  }
})

test('import: every page and child, provider-owned copies, edits and deletions kept, tenants apart, and provenance-safe erasure', async () => {
  const { runtime, db, env, cardless, meta, run, asset, restore } = await setUp()
  try {
    meta.media.set('https://scontent.xx.fbcdn.net/a.jpg', { bytes: JPEG })
    meta.media.set('https://scontent.xx.fbcdn.net/b.jpg', { bytes: JPEG })
    meta.media.set('https://scontent.xx.fbcdn.net/poster.jpg', { bytes: JPEG })
    meta.media.set('https://video.xx.fbcdn.net/v.mp4', { bytes: MP4 })
    meta.media.set('https://scontent.cdninstagram.com/c1.jpg', { bytes: JPEG })
    meta.media.set('https://scontent.cdninstagram.com/c2.mp4', { bytes: MP4 })
    meta.media.set('https://scontent.cdninstagram.com/png-as-jpg.jpg', { bytes: PNG })
    meta.media.set('https://scontent.cdninstagram.com/html.jpg', { bytes: new TextEncoder().encode('<html>not an image</html>') })
    meta.media.set('https://scontent.cdninstagram.com/redirect.jpg', { bytes: JPEG, redirect: 'https://evil.example.test/x.jpg' })
    const photo = (src: string) => ({ type: 'photo', media_type: 'photo', target: { id: src }, media: { image: { src, width: 800, height: 600 } } })
    // A published post with words and a picture renders its social card, which
    // only the Worker's Images binding can do; posts with media here are
    // captionless so this test stays at the D1 and HTTP boundaries.
    // 24 text-only posts across two pages, then a photo, an album, a video, a shared link and a Meta story with no message.
    meta.pagePosts = [
      ...Array.from({ length: 24 }, (_, index) => ({ id: `${PAGE}_t${index}`, message: `Note ${index}`, created_time: `2026-09-${String(1 + (index % 20)).padStart(2, '0')}T10:00:00+0000`, permalink_url: `https://www.facebook.com/${PAGE}_t${index}` })),
      { id: `${PAGE}_photo`, created_time: '2026-09-25T10:00:00+0000', attachments: { data: [photo('https://scontent.xx.fbcdn.net/a.jpg')] } },
      { id: `${PAGE}_album`, created_time: '2026-09-26T10:00:00+0000', attachments: { data: [{ type: 'album', subattachments: { data: [photo('https://scontent.xx.fbcdn.net/b.jpg'), photo('https://scontent.xx.fbcdn.net/a.jpg')] } }] } },
      { id: `${PAGE}_video`, created_time: '2026-09-27T10:00:00+0000', attachments: { data: [{ type: 'video_inline', media_type: 'video', target: { id: 'fbv1' } }] } },
      { id: `${PAGE}_link`, created_time: '2026-09-27T11:00:00+0000', attachments: { data: [{ type: 'share', url: 'https://l.facebook.com/x', unshimmed_url: 'https://news.example.test/story', title: 'Our story in the paper' }] } },
      { id: `${PAGE}_badtime`, message: 'Bad time', created_time: 'not a time' },
    ]
    meta.fbVideos.set('fbv1', { ready: 0, published: true, postId: `${PAGE}_video` })
    meta.igFeed = [
      { id: 'ig-carousel', media_type: 'CAROUSEL_ALBUM', permalink: 'https://www.instagram.com/p/carousel/', timestamp: '2026-09-20T10:00:00+0000',
        children: { data: [{ id: 'ch1', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/c1.jpg' }, { id: 'ch2', media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/c2.mp4', thumbnail_url: 'https://scontent.cdninstagram.com/c1.jpg' }] } },
      { id: 'ig-captionless', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/c1.jpg', permalink: 'https://www.instagram.com/p/nocap/', timestamp: '2026-09-21T10:00:00+0000' },
      { id: 'ig-png', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/png-as-jpg.jpg', timestamp: '2026-09-22T10:00:00+0000' },
      { id: 'ig-html', caption: 'Not an image', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/html.jpg', timestamp: '2026-09-22T11:00:00+0000' },
      { id: 'ig-redirect', caption: 'Redirected away', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/redirect.jpg', timestamp: '2026-09-22T12:00:00+0000' },
    ]

    const [facebook, instagram] = await syncSocialPosts(env, 'org-a', 60_000)
    assert.equal(facebook!.status, 'partial', JSON.stringify(facebook))
    assert.equal(facebook!.imported, 28, JSON.stringify(facebook))
    assert.deepEqual(facebook!.errors.map(error => error.item), [`${PAGE}_badtime`])
    assert.equal(meta.sent(request => request.path.endsWith(`${PAGE}/posts`)).length, 2)
    assert.deepEqual(instagram!.errors.map(error => error.item).sort(), ['ig-html', 'ig-redirect'])
    assert.match(instagram!.errors.find(error => error.item === 'ig-redirect')!.message, /not on a Meta media host/)
    const imported = async (providerId: string) => await db.prepare(`SELECT d.id, d.status, d.summary, d.slug, d.source, d.published_at, d.metadata_json,
        (SELECT group_concat(a.kind || ':' || a.mime_type || ':' || p.slot, ',') FROM media_placements p JOIN media_assets a ON a.id = p.asset_id WHERE p.owner_id = d.id AND p.slot IN ('cover','gallery') ORDER BY p.slot, p.sort_order) AS media
      FROM post_publications pp JOIN content_documents d ON d.id = pp.post_id WHERE pp.organization_id = 'org-a' AND pp.provider_post_id = ?`).bind(providerId).first<Record<string, string>>()
    assert.deepEqual(await imported(`${PAGE}_t3`), { id: (await imported(`${PAGE}_t3`))!.id, status: 'published', summary: 'Note 3', slug: 'note-3', source: 'facebook', published_at: '2026-09-04T10:00:00.000Z', metadata_json: '{}', media: null })
    assert.equal((await imported(`${PAGE}_album`))!.media, 'image:image/jpeg:cover,image:image/jpeg:gallery')
    assert.equal((await imported(`${PAGE}_album`))!.summary, null)
    assert.match((await imported(`${PAGE}_album`))!.slug!, /^update-/)
    assert.equal((await imported(`${PAGE}_video`))!.media, 'video:video/mp4:cover')
    assert.deepEqual(JSON.parse((await imported(`${PAGE}_link`))!.metadata_json), { call_to_action: { label: 'Our story in the paper', url: 'https://news.example.test/story' } })
    assert.equal((await imported('ig-carousel'))!.media, 'image:image/jpeg:cover,video:video/mp4:gallery')
    assert.equal((await imported('ig-captionless'))!.summary, null)
    // PNG bytes under a .jpg name are stored as what they are.
    assert.equal((await imported('ig-png'))!.media, 'image:image/png:cover')
    // Every imported asset is provenance, never manufactured.
    assert.equal(await db.prepare("SELECT count(*) FROM media_assets WHERE organization_id = 'org-a' AND origin_publication_id IS NULL").first('count(*)'), 0)
    const progress = JSON.parse(String(await db.prepare("SELECT json_extract(integrations_json, '$.facebook.sync') AS sync FROM organization WHERE id = 'org-a'").first('sync')))
    assert.equal(progress.last_error_item, `${PAGE}_badtime`)
    assert.ok(!JSON.stringify(progress).includes('access_token'))

    // A repeat scan converges: nothing new, and no duplicate row.
    const again = await syncSocialPosts(env, 'org-a', 60_000)
    assert.equal(again[0]!.imported + again[1]!.imported, 0)
    // A native caption change updates the provider-owned copy; an edited copy keeps its words; a deleted one stays deleted.
    const note1 = (await imported(`${PAGE}_t1`))!
    const note2 = (await imported(`${PAGE}_t2`))!
    const note4 = (await imported(`${PAGE}_t4`))!
    meta.pagePosts.find(item => item.id === `${PAGE}_t1`)!.message = 'Note 1, corrected'
    meta.pagePosts.find(item => item.id === `${PAGE}_t2`)!.message = 'Note 2, corrected'
    const note2Row = (await getPost(db, env, 'org-a', note2.id))!
    await updatePost(db, cardless, 'org-a', note2.id, { changes: { body: 'My own words' }, expectedUpdatedAt: note2Row.updated_at }, 'owner')
    await deletePost(db, 'org-a', note4.id, 'owner')
    await syncSocialPosts(env, 'org-a', 60_000)
    const corrected = (await imported(`${PAGE}_t1`))!
    assert.equal(corrected.id, note1.id)
    assert.equal(corrected.summary, 'Note 1, corrected')
    assert.equal((await getPost(db, env, 'org-a', note2.id))!.body, 'My own words')
    assert.equal(await imported(`${PAGE}_t4`), null)
    assert.equal(await db.prepare(`SELECT count(*) FROM post_publications WHERE provider_post_id = '${PAGE}_t4' AND post_id IS NULL`).first('count(*)'), 1)

    // The same Page connected to a second organization imports independently.
    const [facebookB] = await syncSocialPosts(env, 'org-b', 60_000)
    assert.equal(facebookB!.imported, 28)
    assert.equal(await db.prepare(`SELECT count(DISTINCT organization_id) FROM post_publications WHERE provider_post_id = '${PAGE}_t1'`).first('count(DISTINCT organization_id)'), 2)

    // An outbound publication whose identity is not known blocks new imports from that target, and says which.
    await run(`INSERT INTO content_documents (id, organization_id, kind, row_role, locale, slug, summary, status, visibility, source, metadata_json) VALUES ('mine', 'org-b', 'social_post', 'root', 'en', 'mine', 'Mine', 'draft', 'listed', 'manual', '{}')`)
    await run(`INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state, payload_hash, error_code, error_message)
      VALUES ('pub-unknown', 'org-b', 'mine', 'facebook', 'fb-app', 'fb-subject', '${PAGE}', 'publish', 'unknown', 'h', 'final_unconfirmed', 'lost')`)
    meta.pagePosts.unshift({ id: `${PAGE}_new`, message: 'Brand new', created_time: '2026-09-28T09:00:00+0000' })
    const [blocked] = await syncSocialPosts(env, 'org-b', 60_000)
    assert.deepEqual([blocked!.status, blocked!.blocked_by_publication_id, blocked!.imported], ['blocked', 'pub-unknown', 0])

    // A positively established removal unpublishes a provider-owned copy; an edited copy stays up.
    meta.fault('missing', request => request.path.endsWith(`${PAGE}_t5`) && request.method === 'GET', 5)
    meta.pagePosts = meta.pagePosts.filter(item => item.id !== `${PAGE}_t5`)
    for (let pass = 0; pass < 4; pass += 1) await syncSocialPosts(env, 'org-a', 60_000)
    assert.equal(await db.prepare(`SELECT state FROM post_publications WHERE organization_id = 'org-a' AND provider_post_id = '${PAGE}_t5'`).first('state'), 'removed')
    assert.equal(await db.prepare(`SELECT d.status FROM post_publications pp JOIN content_documents d ON d.id = pp.post_id WHERE pp.organization_id = 'org-a' AND pp.provider_post_id = '${PAGE}_t5'`).first('status'), 'draft')

    // Erasure. The tenant's own post published to the same subject, and an
    // imported picture reused in another document's image block.
    await asset('own', 'image/jpeg')
    const own = await createPost(db, cardless, 'org-a', { post: { body: 'Written by us', media: [{ asset_id: 'own', slot: 'cover' }] }, idempotencyKey: 'own' }, 'owner')
    assert.equal((await publishPost(env, 'org-a', own.post.id, { expectedUpdatedAt: own.post.updated_at, targets: [targets.website, targets.facebook()] }, 'owner')).ok, true)
    const reused = await db.prepare("SELECT a.id FROM media_assets a JOIN post_publications p ON p.id = a.origin_publication_id WHERE p.provider_post_id = ? AND a.organization_id = 'org-a'").bind(`${PAGE}_photo`).first<{ id: string }>()
    await run("INSERT INTO content_documents (id, organization_id, kind, row_role, locale, title, path, metadata_json) VALUES ('page-reuse', 'org-a', 'page', 'root', 'en', 'Reuse', '/reuse', '{\"page_type\":\"custom\",\"recipe\":null}')")
    await run("INSERT INTO content_blocks (id, document_id, type, position, data_json) VALUES ('keep-text', 'page-reuse', 'markdown', 0, '{\"markdown\":\"Stays\",\"editor_mode\":\"rich\"}'), ('reused-image', 'page-reuse', 'image', 1, '{}')")
    await run(`INSERT INTO media_placements (id, organization_id, owner_type, owner_id, slot, asset_id, sort_order) VALUES ('reuse-placement', 'org-a', 'content_block', 'reused-image', 'media', '${reused!.id}', 0)`)
    // An identical bare id in the other Meta app is another person and is untouched.
    await run(`INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state, provider_post_id, published_at)
      VALUES ('other-app', 'org-a', NULL, 'instagram', 'ig-app', 'fb-subject', '${IG}', 'import', 'published', 'other-app-post', '2026-09-01T00:00:00.000Z')`)
    const body = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fb-subject' })).toString('base64url')
    const signed = `${createHmac('sha256', 'facebook-secret').update(body).digest('base64url')}.${body}`
    const subject = (await verifyMetaSignedRequest(signed, configuredMetaApps(env as unknown as Record<string, unknown>)))!
    assert.deepEqual([subject.channel, subject.providerAppId, subject.providerSubjectId], ['facebook', 'fb-app', 'fb-subject'])
    const app = new H3()
    app.post('/api/integrations/meta/deauthorize', deauthorizeCallback)
    app.post('/api/integrations/meta/data-deletion', deleteCallback)
    app.get('/api/integrations/meta/data-deletion', deletionStatus)
    const callback = (path: string, method: 'GET' | 'POST') => app.request(Object.assign(new Request(new URL(path, 'https://proof.example'), {
      method,
      ...(method === 'POST' && { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signed_request: signed }) }),
    }), { runtime: { name: 'cloudflare', cloudflare: { env } } }))
    // Deauthorization removes this person's linked account and both tenant
    // selections, but keeps the imported and authored website content.
    const deauthorized = await callback('/api/integrations/meta/deauthorize', 'POST')
    assert.equal(deauthorized.status, 200)
    assert.deepEqual(await deauthorized.json(), { success: true, released: 2 })
    assert.equal(await db.prepare("SELECT count(*) FROM account WHERE id = 'fb-account'").first('count(*)'), 0)
    assert.equal(await db.prepare("SELECT count(*) FROM organization WHERE json_extract(integrations_json, '$.facebook') IS NOT NULL").first('count(*)'), 0)
    assert.equal(await db.prepare("SELECT count(*) FROM organization WHERE json_extract(integrations_json, '$.instagram') IS NOT NULL").first('count(*)'), 2)
    const repeatedDeauthorization = await callback('/api/integrations/meta/deauthorize', 'POST')
    assert.equal(repeatedDeauthorization.status, 200)
    assert.deepEqual(await repeatedDeauthorization.json(), { success: true, released: 0 })
    assert.deepEqual(await db.prepare('SELECT status, summary FROM content_documents WHERE id = ?').bind(own.post.id).first(), { status: 'published', summary: 'Written by us' })
    const importedDocuments = Number(await db.prepare("SELECT count(*) FROM post_publications WHERE channel = 'facebook' AND provider_app_id = 'fb-app' AND provider_subject_id = 'fb-subject' AND origin = 'import' AND post_id IS NOT NULL").first('count(*)'))
    // A failed storage cleanup must not claim the subject was erased. The
    // publication provenance remains so the next callback can resume it.
    const imageDelete = (request: SeenRequest) => request.host === 'api.cloudflare.com' && request.method === 'DELETE'
    const imageDeletesBeforeFailure = meta.sent(imageDelete).length
    meta.fault('reject', imageDelete)
    const failedDeletion = await callback('/api/integrations/meta/data-deletion', 'POST')
    assert.equal(failedDeletion.status, 500)
    const failedImageDelete = meta.sent(imageDelete)[imageDeletesBeforeFailure]!
    assert.ok(await remainingMetaSubjectData(env, subject) > 0)
    const documentsAfterFailure = Number(await db.prepare("SELECT count(*) FROM post_publications WHERE channel = 'facebook' AND provider_app_id = 'fb-app' AND provider_subject_id = 'fb-subject' AND origin = 'import' AND post_id IS NOT NULL").first('count(*)'))
    assert.ok(documentsAfterFailure <= importedDocuments)
    assert.deepEqual(await db.prepare('SELECT status, summary FROM content_documents WHERE id = ?').bind(own.post.id).first(), { status: 'published', summary: 'Written by us' })
    const deletion = await callback('/api/integrations/meta/data-deletion', 'POST')
    assert.equal(deletion.status, 200)
    const erased = await deletion.json() as { url: string; confirmation_code: string; erased_documents: number; remaining: number }
    assert.equal(erased.erased_documents, documentsAfterFailure)
    assert.equal(meta.sent(request => imageDelete(request) && request.path === failedImageDelete.path).length, 2)
    assert.equal(erased.remaining, 0)
    const status = await callback(erased.url, 'GET')
    assert.equal(status.status, 200)
    const statusBody = await status.json() as { confirmation_code: string; status: string; description: string }
    assert.equal(statusBody.confirmation_code, erased.confirmation_code)
    assert.equal(statusBody.status, 'complete')
    assert.match(statusBody.description, /have been deleted/)
    assert.equal(await remainingMetaSubjectData(env, subject), 0)
    // The tenant's own post and upload stay; only the Facebook association went.
    assert.deepEqual(await db.prepare('SELECT status, summary FROM content_documents WHERE id = ?').bind(own.post.id).first(), { status: 'published', summary: 'Written by us' })
    assert.equal(await db.prepare("SELECT status FROM media_assets WHERE id = 'own'").first('status'), 'active')
    assert.equal((await getPost(db, env, 'org-a', own.post.id))!.publications.length, 0)
    // The reused picture's empty image block is gone; the page and its words stay.
    assert.deepEqual((await db.prepare("SELECT id FROM content_blocks WHERE document_id = 'page-reuse'").all()).results, [{ id: 'keep-text' }])
    assert.equal(await db.prepare("SELECT count(*) FROM content_documents WHERE source = 'facebook'").first('count(*)'), 0)
    // Instagram imports, and the other app's identical id, are untouched.
    assert.equal(await db.prepare("SELECT count(*) FROM post_publications WHERE channel = 'instagram'").first('count(*)'), 7)
    assert.equal(await db.prepare("SELECT count(*) FROM post_publications WHERE id = 'other-app'").first('count(*)'), 1)
    // A repeated callback succeeds with nothing left to do.
    const repeatedDeletion = await callback('/api/integrations/meta/data-deletion', 'POST')
    assert.equal(repeatedDeletion.status, 200)
    const repeatedBody = await repeatedDeletion.json() as { erased_documents: number; erased_media: number; detached_publications: number; remaining: number }
    assert.deepEqual([repeatedBody.erased_documents, repeatedBody.erased_media, repeatedBody.detached_publications, repeatedBody.remaining], [0, 0, 0, 0])
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0)
    // With nothing in flight, the tenant adds a gallery picture; it advances the post's revision.
    const beforeGallery = (await getPost(db, env, 'org-a', own.post.id))!
    await attachMediaPlacement(db, { organizationId: 'org-a', env: cardless, placement: { owner_type: 'content_document', owner_id: own.post.id, slot: 'gallery' }, assetId: 'own' })
    const afterGallery = (await getPost(db, env, 'org-a', own.post.id))!
    assert.deepEqual(afterGallery.media.map(item => `${item.slot}:${item.asset_id}`), [...beforeGallery.media.map(item => `${item.slot}:${item.asset_id}`), 'gallery:own'])
    assert.notEqual(afterGallery.updated_at, beforeGallery.updated_at)
    // A post whose publication is unresolved pins its media placements too.
    await run(`INSERT INTO post_publications (id, organization_id, post_id, channel, provider_app_id, provider_subject_id, provider_target_id, origin, state, payload_hash, error_code, error_message)
      VALUES ('pin', 'org-a', '${own.post.id}', 'instagram', 'ig-app', 'ig-subject', '${IG}', 'publish', 'unknown', 'h', 'final_unconfirmed', 'lost')`)
    await assert.rejects(attachMediaPlacement(db, { organizationId: 'org-a', env, placement: { owner_type: 'content_document', owner_id: own.post.id, slot: 'gallery' }, assetId: 'own' }), /unresolved/)
  } finally {
    restore()
    await runtime.dispose()
  }
})
