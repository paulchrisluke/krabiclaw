export interface Post {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  google_post_id: string | null
  post_type: 'standard' | 'offer' | 'event' | 'update'
  title: string | null
  body: string
  image_asset_id: string | null
  /** Resolved public URL — injected by listPosts/getPublishedPosts JOIN, not a DB column */
  public_url?: string | null
  kind?: string | null
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  status: 'draft' | 'published' | 'scheduled' | 'archived'
  scheduled_for: string | null
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PostChannelJob {
  id: string
  post_id: string
  organization_id: string
  channel: 'site' | 'gmb' | 'instagram' | 'facebook'
  status: 'pending' | 'published' | 'failed' | 'skipped'
  provider_post_id: string | null
  error: string | null
  published_at: string | null
  created_at: string
}

export interface PostWithChannels extends Post {
  channels: PostChannelJob[]
}

type SqlBindValue = string | number | boolean | null

interface PublishedPostSummary {
  name: string
  title: string
  summary: string
  createTime: string | null
  media: Array<{ googleUrl: string; mediaFormat: 'IMAGE' | 'VIDEO' }>
}

interface PublishedPostRow {
  id: string
  title: string | null
  body: string
  published_at: string | null
  created_at: string
  public_url: string | null
  kind: string | null
}

export async function listPosts(
  db: D1Database,
  organizationId: string,
  siteId: string,
  status?: string,
  locationId?: string
): Promise<Post[]> {
  let query = `
    SELECT p.*, ma.public_url, ma.kind
    FROM posts p
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.organization_id = ? AND p.site_id = ?
  `
  const params: string[] = [organizationId, siteId]
  if (status) {
    query += ` AND p.status = ?`
    params.push(status)
  }
  if (locationId) {
    query += ` AND p.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY p.updated_at DESC LIMIT 100`
  const result = await db.prepare(query).bind(...params).all()
  return (result.results ?? []) as unknown as Post[]
}

export async function getPost(
  db: D1Database,
  organizationId: string,
  siteId: string,
  postId: string
): Promise<PostWithChannels | null> {
  const post = await db.prepare(`
    SELECT * FROM posts WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1
  `).bind(postId, organizationId, siteId).first<Post>()
  if (!post) return null

  const jobs = await db.prepare(
    `SELECT * FROM post_channel_jobs WHERE post_id = ? ORDER BY channel`
  ).bind(postId).all()

  return { ...post, channels: (jobs.results ?? []) as unknown as PostChannelJob[] }
}

export async function createPost(
  db: D1Database,
  organizationId: string,
  siteId: string,
  data: {
    title?: string; body: string; image_asset_id?: string; scheduled_for?: string
    location_id?: string; post_type?: string
    cta_type?: string; cta_url?: string
    event_title?: string; event_start?: string; event_end?: string
    offer_coupon?: string; offer_terms?: string
    status?: 'draft' | 'published'
  },
  createdBy: string
): Promise<Post> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const status = data.status ?? (data.scheduled_for ? 'scheduled' : 'published')
  const publishedAt = status === 'published' ? now : null

  await db.prepare(`
    INSERT INTO posts (id, organization_id, site_id, location_id, post_type, title, body, image_asset_id,
      cta_type, cta_url, event_title, event_start, event_end, offer_coupon, offer_terms,
      status, scheduled_for, published_at, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, organizationId, siteId,
    data.location_id ?? null, data.post_type ?? 'standard',
    data.title ?? null, data.body, data.image_asset_id ?? null,
    data.cta_type ?? null, data.cta_url ?? null,
    data.event_title ?? null, data.event_start ?? null, data.event_end ?? null,
    data.offer_coupon ?? null, data.offer_terms ?? null,
    status, data.scheduled_for ?? null, publishedAt, createdBy, now, now
  ).run()

  const createdPost = await db.prepare('SELECT * FROM posts WHERE id = ? LIMIT 1').bind(id).first() as Post | null
  if (!createdPost) throw new Error('Post not found after creation')
  return createdPost
}

export async function updatePost(
  db: D1Database,
  organizationId: string,
  siteId: string,
  postId: string,
  data: {
    title?: string; body?: string; image_asset_id?: string; scheduled_for?: string | null
    location_id?: string | null; post_type?: string
    cta_type?: string | null; cta_url?: string | null
    event_title?: string | null; event_start?: string | null; event_end?: string | null
    offer_coupon?: string | null; offer_terms?: string | null
  },
  _updatedBy: string
): Promise<Post | null> {
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const params: SqlBindValue[] = [now]

  const fields: Array<[string, string | null | undefined]> = [
    ['title', data.title], ['body', data.body], ['image_asset_id', data.image_asset_id],
    ['scheduled_for', data.scheduled_for], ['location_id', data.location_id],
    ['post_type', data.post_type], ['cta_type', data.cta_type], ['cta_url', data.cta_url],
    ['event_title', data.event_title], ['event_start', data.event_start], ['event_end', data.event_end],
    ['offer_coupon', data.offer_coupon], ['offer_terms', data.offer_terms],
  ]
  for (const [col, val] of fields) {
    if (val !== undefined) { sets.push(`${col} = ?`); params.push(val ?? null) }
  }

  params.push(postId, organizationId, siteId)
  await db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ?`)
    .bind(...params).run()

  return await db.prepare('SELECT * FROM posts WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1').bind(postId, organizationId, siteId).first()
}

export async function publishPost(
  db: D1Database,
  organizationId: string,
  siteId: string,
  postId: string,
  channels: Array<'site' | 'gmb' | 'instagram' | 'facebook'>
): Promise<PostWithChannels | null> {
  if (!channels.length) {
    throw new Error('At least one publish channel is required')
  }

  const now = new Date().toISOString()

  const updateResult = await db.prepare(`
    UPDATE posts SET status = 'published', published_at = ?, updated_at = ?
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `).bind(now, now, postId, organizationId, siteId).run()

  if ((updateResult.meta.changes ?? 0) === 0) return null

  // Create a channel job for each requested channel
  const jobs = channels.map(channel =>
    db.prepare(`
      INSERT INTO post_channel_jobs (id, post_id, organization_id, channel, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
      ON CONFLICT DO NOTHING
    `).bind(crypto.randomUUID(), postId, organizationId, channel, now)
  )
  if (jobs.length > 0) await db.batch(jobs)

  // 'site' channel publishes immediately — nothing async needed, post is live via public API
  await db.prepare(`
    UPDATE post_channel_jobs SET status = 'published', published_at = ?
    WHERE post_id = ? AND channel = 'site'
  `).bind(now, postId).run()

  return getPost(db, organizationId, siteId, postId)
}

export async function deletePost(
  db: D1Database,
  organizationId: string,
  siteId: string,
  postId: string
): Promise<boolean> {
  const result = await db.prepare(
    'DELETE FROM posts WHERE id = ? AND organization_id = ? AND site_id = ?'
  ).bind(postId, organizationId, siteId).run()
  return (result.meta.changes ?? 0) > 0
}

/** Public: published posts for the site, formatted for SayaPosts component */
export async function getPublishedPosts(
  db: D1Database,
  siteId: string,
  limit = 20,
  locationId?: string
): Promise<PublishedPostSummary[]> {
  let query = `
    SELECT p.id, p.title, p.body, p.image_asset_id, p.published_at, p.created_at,
           ma.public_url, ma.kind
    FROM posts p
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.site_id = ? AND p.status = 'published'
  `
  const params: SqlBindValue[] = [siteId]
  if (locationId) {
    query += ` AND p.location_id = ?`
    params.push(locationId)
  }
  query += ` ORDER BY p.published_at DESC LIMIT ?`
  params.push(limit)
  const result = await db.prepare(query).bind(...params).all()

  const rows = (result.results ?? []) as unknown as PublishedPostRow[]

  return rows.map((p) => ({
    name: `posts/${p.id}`,
    title: p.title ?? '',
    summary: p.body,
    createTime: p.published_at ?? p.created_at,
    media: (p.public_url && (p.kind === 'image' || p.kind === 'video')) ? [{
      googleUrl: p.public_url,
      mediaFormat: p.kind === 'video' ? 'VIDEO' : 'IMAGE'
    }] : [],
  }))
}
