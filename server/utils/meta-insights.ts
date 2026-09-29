import type { CloudflareEnv } from './auth'
import { readLinkedAccount } from './auth'
import { FACEBOOK_GRAPH_VERSION, facebookPageToken, getFacebookPagesConnection, listPagePosts } from './facebook-pages'
import { INSTAGRAM_GRAPH_VERSION, instagramAccessToken, listMedia, readInstagramConnection } from './instagram'
import { MetaDeadline, MetaGraphError, metaGraphRequest } from './meta-graph'

export type InsightStatus = 'available' | 'unavailable' | 'not_yet_collected' | 'threshold' | 'unsupported' | 'permission_denied' | 'failed'
export interface ProviderMetric {
  name: string
  value: number | null
  unit: 'count' | 'people'
  period: 'selected_range' | 'lifetime' | 'latest_day'
  status: InsightStatus
  reason: string | null
  previousValue: number | null
  previousStatus: InsightStatus | null
}
export interface ProviderContentInsight {
  id: string
  kind: string
  publishedAt: string
  permalink: string | null
  caption: string | null
  metrics: ProviderMetric[]
}
export interface ProviderInsights {
  source: 'facebook' | 'instagram'
  apiVersion: 'v25.0' | 'v23.0'
  status: 'connected' | 'disconnected' | 'permission_denied' | 'failed'
  targetId: string | null
  targetName: string | null
  connectionRevision: string | null
  fetchedAt: string | null
  error: string | null
  metrics: ProviderMetric[]
  content: ProviderContentInsight[]
  contentCoverage: 'complete' | 'partial' | 'unavailable'
  contentCoverageReason: string | null
  nextCursor: string | null
}

type Channel = ProviderInsights['source']
interface InsightRange { start: string; end: string; previous: { start: string; end: string } }
interface InsightData {
  name?: string
  period?: string
  values?: Array<{ value?: unknown; end_time?: string }>
  total_value?: { value?: unknown; breakdowns?: Array<{ dimension_keys?: string[]; results?: Array<{ dimension_values?: string[]; value?: unknown }> }> }
}

const CONTENT_PAGE_SIZE = 12
const FACEBOOK_GRAPH = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`
const INSTAGRAM_GRAPH = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`

function blank(source: Channel, status: ProviderInsights['status'], reason: string | null = null): ProviderInsights {
  return { source, apiVersion: source === 'facebook' ? FACEBOOK_GRAPH_VERSION : INSTAGRAM_GRAPH_VERSION, status,
    targetId: null, targetName: null, connectionRevision: null, fetchedAt: null, error: reason,
    metrics: [], content: [], contentCoverage: 'unavailable', contentCoverageReason: reason, nextCursor: null }
}

function unavailable(name: string, period: ProviderMetric['period'], unit: ProviderMetric['unit'], status: InsightStatus, reason: string): ProviderMetric {
  return { name, value: null, unit, period, status, reason, previousValue: null, previousStatus: null }
}

function classify(error: unknown): { status: InsightStatus; reason: string } {
  if (error instanceof MetaGraphError) {
    if (/not yet (available|collected|processed)|still (being )?(collected|processed)/i.test(error.message)) {
      return { status: 'not_yet_collected', reason: error.message }
    }
    if (/not enough viewers|fewer than 100|less than 100|insufficient audience/i.test(error.message)) {
      return { status: 'threshold', reason: error.message }
    }
    if (error.failure === 'authorization') {
      return { status: 'permission_denied', reason: error.message }
    }
    if (error.details.code === 100 && /metric|period|not supported/i.test(error.message)) return { status: 'unsupported', reason: error.message }
  }
  return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

interface MetricSpec {
  name: string
  unit: ProviderMetric['unit']
  period: ProviderMetric['period']
  aggregation: 'total_value' | 'sum_days' | 'latest_day' | 'lifetime'
}

async function metrics(input: {
  base: string; objectId: string; token: string; specs: MetricSpec[];
  parameters?: Record<string, string>; deadline: MetaDeadline
}): Promise<ProviderMetric[]> {
  const params = new URLSearchParams({ metric: input.specs.map(spec => spec.name).join(','), ...input.parameters })
  let data: InsightData[]
  try {
    const response = await metaGraphRequest<{ data?: InsightData[] }>(`${input.base}/${encodeURIComponent(input.objectId)}/insights?${params}`, {
      headers: { authorization: `Bearer ${input.token}` }, deadline: input.deadline,
    })
    if (!Array.isArray(response.data)) throw new Error('Meta returned no insights array')
    data = response.data
  } catch (error) {
    // Graph rejects the whole metric group when one item is ineligible for a
    // particular media type. Isolate only that documented invalid-metric case
    // so valid metrics in the same group remain visible.
    if (error instanceof MetaGraphError && error.details.code === 100 && input.specs.length > 1
      && /metric|period|not supported/i.test(error.message)) {
      const middle = Math.ceil(input.specs.length / 2)
      const [left, right] = await Promise.all([
        metrics({ ...input, specs: input.specs.slice(0, middle) }),
        metrics({ ...input, specs: input.specs.slice(middle) }),
      ])
      return [...left, ...right]
    }
    const result = classify(error)
    return input.specs.map(spec => unavailable(spec.name, spec.period, spec.unit, result.status, result.reason))
  }
  return input.specs.map(spec => {
    const row = data.find(item => item.name === spec.name)
    if (!row) return unavailable(spec.name, spec.period, spec.unit, 'unavailable', 'Meta returned no data for this metric and range.')
    let value: number | null
    if (spec.aggregation === 'total_value') value = numeric(row.total_value?.value)
    else {
      const values = row.values?.map(item => numeric(item.value)) ?? []
      if (spec.aggregation === 'sum_days') value = values.length && values.every(item => item !== null) ? values.reduce<number>((sum, item) => sum + item!, 0) : null
      else value = values.length ? values.at(-1)! : null
    }
    if (value === null) return unavailable(spec.name, spec.period, spec.unit, 'unavailable', 'Meta returned no numeric value for this metric and range.')
    return { name: spec.name, value, unit: spec.unit, period: spec.period, status: 'available', reason: null,
      previousValue: null, previousStatus: null }
  })
}

function compare(current: ProviderMetric[], previous: ProviderMetric[]): ProviderMetric[] {
  return current.map(item => {
    const prior = previous.find(candidate => candidate.name === item.name)
    return { ...item, previousValue: prior?.value ?? null, previousStatus: prior?.status ?? null }
  })
}

function encodeCursor(revision: string, range: InsightRange, after: string | null): string | null {
  return after ? btoa(JSON.stringify({ revision, start: range.start, end: range.end, after })) : null
}
function decodeCursor(cursor: string | undefined, revision: string, range: InsightRange): string | null {
  if (!cursor) return null
  let value: unknown
  try { value = JSON.parse(atob(cursor)) } catch { throw new Error('Invalid social insights page cursor') }
  if (!value || typeof value !== 'object' || !('revision' in value) || !('after' in value)
    || !('start' in value) || !('end' in value) || value.revision !== revision
    || value.start !== range.start || value.end !== range.end || typeof value.after !== 'string' || !value.after) {
    throw new Error('The social connection or date range changed, or the page cursor is invalid. Reload insights.')
  }
  return value.after
}

async function readContentMetrics(content: ProviderContentInsight[], read: (item: ProviderContentInsight) => Promise<ProviderMetric[]>): Promise<void> {
  for (let index = 0; index < content.length; index += 4) {
    await Promise.all(content.slice(index, index + 4).map(async item => { item.metrics = await read(item) }))
  }
}

function unixSeconds(instant: string): string { return String(Math.floor(new Date(instant).getTime() / 1000)) }

async function followerMovement(base: string, objectId: string, token: string, range: InsightRange,
  deadline: MetaDeadline, cutoff: number): Promise<ProviderMetric[]> {
  const names = ['follows', 'unfollows'] as const
  const read = async (bounds: { start: string; end: string }): Promise<ProviderMetric[]> => {
    if (new Date(bounds.start).getTime() < cutoff) return names.map(name => unavailable(name, 'selected_range', 'people', 'unsupported', 'Instagram account insights are retained for up to 90 days.'))
    const params = new URLSearchParams({ metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value',
      breakdown: 'follow_type', since: unixSeconds(bounds.start), until: unixSeconds(bounds.end) })
    let data: InsightData[]
    try {
      const response = await metaGraphRequest<{ data?: InsightData[] }>(`${base}/${encodeURIComponent(objectId)}/insights?${params}`, {
        headers: { authorization: `Bearer ${token}` }, deadline,
      })
      if (!Array.isArray(response.data)) throw new Error('Meta returned no follower insights array')
      data = response.data
    } catch (error) {
      const state = classify(error)
      return names.map(name => unavailable(name, 'selected_range', 'people', state.status, state.reason))
    }
    const results = data.find(item => item.name === 'follows_and_unfollows')?.total_value?.breakdowns?.flatMap(part => part.results ?? []) ?? []
    return names.map(name => {
      const values = results.filter(row => {
        const kind = row.dimension_values?.join('_').toLowerCase() ?? ''
        return name === 'unfollows' ? kind.includes('unfollow') : kind.includes('follow') && !kind.includes('unfollow')
      }).map(row => numeric(row.value))
      return values.length && values.every(value => value !== null)
        ? { name, value: values.reduce<number>((sum, value) => sum + value!, 0), unit: 'people', period: 'selected_range',
          status: 'available', reason: null, previousValue: null, previousStatus: null }
        : unavailable(name, 'selected_range', 'people', 'unavailable', 'Meta returned no follower movement for this range.')
    })
  }
  const [current, previous] = await Promise.all([read(range), read(range.previous)])
  return compare(current, previous)
}

async function facebook(env: CloudflareEnv, organizationId: string, range: InsightRange, cursor?: string): Promise<ProviderInsights> {
  const connection = await getFacebookPagesConnection(env, organizationId)
  if (!connection) return blank('facebook', 'disconnected', 'Connect a Facebook Page to read its insights.')
  const report = blank('facebook', 'connected')
  Object.assign(report, { targetId: connection.page_id, targetName: connection.page_name, connectionRevision: connection.revision })
  try {
    const after = decodeCursor(cursor, connection.revision, range)
    const token = await facebookPageToken(env, connection)
    const deadline = new MetaDeadline(45_000)
    const specs: MetricSpec[] = [
      { name: 'page_media_view', unit: 'count', period: 'selected_range', aggregation: 'sum_days' },
      { name: 'page_total_media_view_unique', unit: 'people', period: 'latest_day', aggregation: 'latest_day' },
      { name: 'page_post_engagements', unit: 'count', period: 'selected_range', aggregation: 'sum_days' },
      { name: 'page_follows', unit: 'people', period: 'latest_day', aggregation: 'latest_day' },
    ]
    const account = (bounds: { start: string; end: string }) => metrics({ base: FACEBOOK_GRAPH, objectId: connection.page_id,
      token, specs, deadline, parameters: { period: 'day', since: unixSeconds(bounds.start), until: unixSeconds(bounds.end) } })
    const [current, previous] = await Promise.all([account(range), account(range.previous)])
    report.metrics = compare(current, previous)
    const target = { pageId: connection.page_id, pageToken: token }
    const page = await listPagePosts(target, { after, limit: CONTENT_PAGE_SIZE }, deadline)
    let reachedStart = false
    for (const post of page.items) {
      if (new Date(post.created_time).getTime() < new Date(range.start).getTime()) { reachedStart = true; break }
      if (new Date(post.created_time).getTime() >= new Date(range.end).getTime()) continue
      report.content.push({ id: post.id, kind: post.attachments?.data?.[0]?.media_type ?? 'post',
        publishedAt: post.created_time, permalink: post.permalink_url ?? null, caption: post.message ?? null, metrics: [] })
    }
    report.nextCursor = reachedStart ? null : encodeCursor(connection.revision, range, page.after)
    report.contentCoverage = report.nextCursor ? 'partial' : 'complete'
    report.contentCoverageReason = report.nextCursor ? 'More Page posts are available. Load the next page to continue through this date range.' : null
    const contentSpecs: MetricSpec[] = [
      { name: 'post_media_view', unit: 'count', period: 'lifetime', aggregation: 'lifetime' },
      { name: 'post_total_media_view_unique', unit: 'people', period: 'lifetime', aggregation: 'lifetime' },
      ...['like', 'love', 'wow', 'haha', 'sorry', 'anger'].map(kind => ({ name: `post_reactions_${kind}_total`, unit: 'count' as const,
        period: 'lifetime' as const, aggregation: 'lifetime' as const })),
    ]
    await readContentMetrics(report.content, post => metrics({ base: FACEBOOK_GRAPH, objectId: post.id, token,
      specs: contentSpecs, parameters: { period: 'lifetime' }, deadline }))
    report.fetchedAt = new Date().toISOString()
  } catch (error) {
    const result = classify(error)
    report.status = result.status === 'permission_denied' ? 'permission_denied' : 'failed'
    report.error = result.reason
    report.contentCoverage = 'unavailable'
    report.contentCoverageReason = result.reason
  }
  return report
}

async function instagram(env: CloudflareEnv, organizationId: string, range: InsightRange, now: Date, cursor?: string): Promise<ProviderInsights> {
  const connection = await readInstagramConnection(env, organizationId)
  if (!connection) return blank('instagram', 'disconnected', 'Connect an Instagram professional account to read its insights.')
  const report = blank('instagram', 'connected')
  Object.assign(report, { targetId: connection.instagram_user_id, targetName: `@${connection.username}`, connectionRevision: connection.revision })
  try {
    const after = decodeCursor(cursor, connection.revision, range)
    const account = await readLinkedAccount(env, connection.account_id)
    if (!account || account.providerId !== 'instagram') throw new Error('The selected Instagram account is no longer linked. Connect it again.')
    if (!account.scopes.includes('instagram_business_manage_insights')) {
      report.status = 'permission_denied'
      report.error = 'Instagram insights permission has not been granted. Reconnect Instagram.'
      report.contentCoverageReason = report.error
      return report
    }
    const token = await instagramAccessToken(env, connection.account_id)
    const deadline = new MetaDeadline(45_000)
    const specs: MetricSpec[] = ['views', 'reach', 'accounts_engaged', 'total_interactions', 'profile_links_taps', 'likes', 'comments', 'shares', 'saves']
      .map(name => ({ name, unit: name === 'reach' || name === 'accounts_engaged' ? 'people' : 'count', period: 'selected_range', aggregation: 'total_value' }))
    const cutoff = now.getTime() - 90 * 86_400_000
    const readAccountMetrics = async (bounds: { start: string; end: string }) => new Date(bounds.start).getTime() < cutoff
      ? specs.map(spec => unavailable(spec.name, spec.period, spec.unit, 'unsupported', 'Instagram account insights are retained for up to 90 days.'))
      : await metrics({ base: INSTAGRAM_GRAPH, objectId: connection.instagram_user_id, token, specs, deadline,
        parameters: { period: 'day', metric_type: 'total_value', since: unixSeconds(bounds.start), until: unixSeconds(bounds.end) } })
    const [current, previous] = await Promise.all([readAccountMetrics(range), readAccountMetrics(range.previous)])
    report.metrics = compare(current, previous)
    report.metrics.push(...await followerMovement(INSTAGRAM_GRAPH, connection.instagram_user_id, token, range, deadline, cutoff))
    const target = { userId: connection.instagram_user_id, accessToken: token }
    const page = await listMedia(target, { after, limit: CONTENT_PAGE_SIZE }, deadline)
    let reachedStart = false
    for (const media of page.items) {
      if (new Date(media.timestamp).getTime() < new Date(range.start).getTime()) { reachedStart = true; break }
      if (new Date(media.timestamp).getTime() >= new Date(range.end).getTime()) continue
      report.content.push({ id: media.id, kind: media.media_product_type ?? media.media_type,
        publishedAt: media.timestamp, permalink: media.permalink ?? null, caption: media.caption ?? null, metrics: [] })
    }
    report.nextCursor = reachedStart ? null : encodeCursor(connection.revision, range, page.after)
    report.contentCoverage = report.nextCursor ? 'partial' : 'complete'
    report.contentCoverageReason = report.nextCursor ? 'More Instagram media are available. Load the next page to continue through this date range.' : null
    await readContentMetrics(report.content, media => {
      const feed = media.kind !== 'REELS'
      const specs: MetricSpec[] = ['views', 'reach', 'total_interactions', 'likes', 'comments', 'saved', 'shares', ...(feed ? ['profile_activity', 'profile_visits'] : [])]
        .map(name => ({ name, unit: name === 'reach' ? 'people' : 'count', period: 'lifetime', aggregation: 'lifetime' }))
      // Carousel children have no insights; only the container is queried.
      return metrics({ base: INSTAGRAM_GRAPH, objectId: media.id, token, specs, deadline })
    })
    report.fetchedAt = new Date().toISOString()
  } catch (error) {
    const result = classify(error)
    report.status = result.status === 'permission_denied' ? 'permission_denied' : 'failed'
    report.error = result.reason
    report.contentCoverage = 'unavailable'
    report.contentCoverageReason = result.reason
  }
  return report
}

export async function readMetaInsights(env: CloudflareEnv, organizationId: string, range: InsightRange,
  now = new Date(), cursors: { facebook?: string; instagram?: string } = {}) {
  const [facebookReport, instagramReport] = await Promise.all([
    facebook(env, organizationId, range, cursors.facebook),
    instagram(env, organizationId, range, now, cursors.instagram),
  ])
  return { facebook: facebookReport, instagram: instagramReport }
}
