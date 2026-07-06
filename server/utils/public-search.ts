import { queryAll, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  PLATFORM_DASHBOARD_ROUTE_ENTRIES,
  PLATFORM_KNOWLEDGE_FAQ_ENTRIES,
  PLATFORM_KNOWLEDGE_PAGE_ENTRIES,
  PLATFORM_KNOWLEDGE_ROUTE_ENTRIES,
  getDocPath,
  getPlatformBlogPath,
  resolveDashboardPath,
  type DashboardRouteContext,
  type PlatformDashboardRouteEntry,
  type PlatformKnowledgeResultType,
  type PlatformKnowledgeSurface,
} from '~/config/platform-knowledge'

const AI_SEARCH_CUSTOM_METADATA: AiSearchConfig['custom_metadata'] = [
  { field_name: 'record_id', data_type: 'text' },
  { field_name: 'type', data_type: 'text' },
  { field_name: 'surface', data_type: 'text' },
  { field_name: 'path', data_type: 'text' },
  { field_name: 'display', data_type: 'text' },
]

const DEFAULT_MATCH_THRESHOLD = 0.2

export type PublicSearchType = PlatformKnowledgeResultType

export interface PublicSearchResult {
  id: string
  type: PublicSearchType
  title: string
  path: string
  pathTemplate?: string | null
  snippet: string
  surface: PlatformKnowledgeSurface
  section: string
  icon: string
  score: number
}

interface SearchOptions {
  limit?: number
  type?: PublicSearchType | 'all'
  surface?: PlatformKnowledgeSurface
  dashboardContext?: DashboardRouteContext
}

interface PlatformDocSearchRow {
  id: string
  title: string
  slug: string
  body: string
  excerpt: string | null
  category: string | null
  seo_description: string | null
  seo_keywords: string | null
}

interface PlatformBlogSearchRow {
  id: string
  title: string
  slug: string
  body: string
  excerpt: string | null
  category: string | null
  seo_description: string | null
  seo_keywords: string | null
}

interface PlatformKnowledgeDocument {
  id: string
  key: string
  type: PlatformKnowledgeResultType
  title: string
  path: string
  pathTemplate?: string | null
  snippet: string
  section: string
  icon: string
  body: string
  surfaces: PlatformKnowledgeSurface[]
}

function platformKnowledgeInstanceId(env: CloudflareEnv) {
  const value = env.AI_SEARCH_INSTANCE_ID
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('AI_SEARCH_INSTANCE_ID is not configured')
}

function cloudflareAccountId(env: CloudflareEnv) {
  const value = env.CLOUDFLARE_ACCOUNT_ID ?? env.CF_ACCOUNT_ID
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('CLOUDFLARE_ACCOUNT_ID is not configured')
}

function cloudflareApiToken(env: CloudflareEnv) {
  const value = env.CLOUDFLARE_API_TOKEN
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('CLOUDFLARE_API_TOKEN is not configured')
}

function normalizeQuery(query: string) {
  return query.trim()
}

function aiSearchApiUrl(env: CloudflareEnv, suffix = '') {
  const accountId = cloudflareAccountId(env)
  const instanceId = platformKnowledgeInstanceId(env)
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-search/instances/${instanceId}${suffix}`
}

async function readApiResponse(response: Response) {
  const payload = await response.json().catch(() => null) as {
    success?: boolean
    errors?: Array<{ message?: string }>
    result?: ApiValue
    result_info?: ApiValue
  } | null

  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || JSON.stringify(payload)
      || response.statusText
    throw new Error(`Cloudflare AI Search API error ${response.status}: ${detail}`)
  }

  return payload
}

async function aiSearchApiRequest(env: CloudflareEnv, path: string, init: RequestInit = {}) {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(aiSearchApiUrl(env, path), {
        ...init,
        headers: {
          Authorization: `Bearer ${cloudflareApiToken(env)}`,
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers ?? {}),
        },
      })

      if (response.status >= 500 && attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500))
        continue
      }

      return await readApiResponse(response)
    } catch (error) {
      lastError = error
      if (attempt >= 5) break
      await new Promise(resolve => setTimeout(resolve, attempt * 500))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Cloudflare AI Search API request failed')
}

function stripMarkdown(value: string | null | undefined) {
  return (value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateSnippet(value: string, maxLength = 180) {
  const text = stripMarkdown(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

function renderDocumentContent(record: PlatformKnowledgeDocument) {
  return [
    `# ${record.title}`,
    '',
    record.snippet,
    '',
    `Type: ${record.type}`,
    `Section: ${record.section}`,
    '',
    stripMarkdown(record.body),
  ].join('\n')
}

function recordMetadata(record: PlatformKnowledgeDocument): Record<string, string> {
  return {
    record_id: record.id,
    type: record.type,
    surface: '',
    path: record.path,
    display: JSON.stringify({
      title: record.title,
      snippet: truncateSnippet(record.snippet),
      section: record.section,
      icon: record.icon,
      pathTemplate: record.pathTemplate ?? '',
    }),
  }
}

function resultTypeFilter(type: SearchOptions['type']) {
  return type && type !== 'all' ? type : undefined
}

function buildSearchFilters(surface: PlatformKnowledgeSurface, type?: PublicSearchType | 'all') {
  const clauses: Array<Record<string, { $eq: string }>> = [
    { surface: { $eq: surface } },
  ]

  if (type && type !== 'all') {
    clauses.push({ type: { $eq: type } })
  }

  return (clauses.length === 1 ? clauses[0] : { $and: clauses }) as unknown as VectorizeVectorMetadataFilter
}

function normalizeChunkPath(path: string, pathTemplate: string | null | undefined, surface: PlatformKnowledgeSurface, dashboardContext?: DashboardRouteContext) {
  if (surface !== 'dashboard' || !pathTemplate) return path
  return resolveDashboardPath(pathTemplate, dashboardContext) ?? path
}

function normalizeSearchResults(
  chunks: AiSearchSearchResponse['chunks'],
  options: Required<Pick<SearchOptions, 'limit' | 'surface'>> & Pick<SearchOptions, 'dashboardContext'>,
) {
  const deduped = new Map<string, PublicSearchResult>()

  for (const chunk of chunks) {
    const metadata = chunk.item.metadata ?? {}
    const display = (() => {
      const raw = typeof metadata.display === 'string' ? metadata.display : ''
      if (!raw) return {}
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return {}
      }
    })()
    const id = String(metadata.record_id ?? chunk.item.key ?? chunk.id)
    const title = typeof display.title === 'string' && display.title.trim()
      ? display.title.trim()
      : chunk.text.replace(/^#\s+/u, '').split('\n')[0]?.trim()
        || chunk.item.key
    const type = String(metadata.type ?? 'route') as PublicSearchType
    const path = typeof metadata.path === 'string' && metadata.path.trim() ? metadata.path.trim() : '/'
    const pathTemplate = typeof display.pathTemplate === 'string' && display.pathTemplate.trim() ? display.pathTemplate.trim() : null
    const snippet = typeof display.snippet === 'string' && display.snippet.trim()
      ? display.snippet.trim()
      : truncateSnippet(chunk.text)
    const section = typeof display.section === 'string' && display.section.trim() ? display.section.trim() : 'Search'
    const icon = typeof display.icon === 'string' && display.icon.trim() ? display.icon.trim() : 'search'
    const normalizedPath = normalizeChunkPath(path, pathTemplate, options.surface, options.dashboardContext)

    const next: PublicSearchResult = {
      id,
      type,
      title,
      path: normalizedPath,
      pathTemplate,
      snippet,
      surface: options.surface,
      section,
      icon,
      score: chunk.score,
    }

    const current = deduped.get(id)
    if (!current || current.score < next.score) {
      deduped.set(id, next)
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, options.limit)
}

function platformKnowledgeInstanceConfig(): Omit<AiSearchConfig, 'metadata'> {
  return {
    rewrite_query: true,
    reranking: true,
    index_method: {
      vector: true,
      keyword: true,
    },
    fusion_method: 'rrf',
    indexing_options: {
      keyword_tokenizer: 'porter',
    },
    retrieval_options: {
      keyword_match_mode: 'or',
    },
    score_threshold: DEFAULT_MATCH_THRESHOLD,
    max_num_results: 20,
    custom_metadata: AI_SEARCH_CUSTOM_METADATA,
  }
}

async function ensurePlatformKnowledgeInstance(env: CloudflareEnv) {
  const instanceId = platformKnowledgeInstanceId(env)
  try {
    await aiSearchApiRequest(env, '', {
      method: 'GET',
    })
  } catch {
    await aiSearchApiRequest(env, '', {
      method: 'POST',
      body: JSON.stringify({
        id: platformKnowledgeInstanceId(env),
        ...platformKnowledgeInstanceConfig(),
      }),
    })
  }

  await aiSearchApiRequest(env, '', {
    method: 'PUT',
    body: JSON.stringify({
      id: instanceId,
      ...platformKnowledgeInstanceConfig(),
    }),
  })
}

async function listAllItems(env: CloudflareEnv) {
  const items: AiSearchItemInfo[] = []
  let page = 1

  while (true) {
    const response = await aiSearchApiRequest(env, `/items?page=${page}&per_page=50`, {
      method: 'GET',
    }) as {
      result?: AiSearchItemInfo[]
      result_info?: { per_page: number, total_count: number }
    }
    const pageItems = response.result ?? []
    items.push(...pageItems)
    if (!response.result_info || page * response.result_info.per_page >= response.result_info.total_count) break
    page += 1
  }

  return items
}

async function deleteIndexItem(env: CloudflareEnv, itemId: string) {
  await aiSearchApiRequest(env, `/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  })
}

async function uploadIndexItem(env: CloudflareEnv, key: string, content: string, metadata: Record<string, string>) {
  const formData = new FormData()
  formData.set('file', new Blob([content], { type: 'text/markdown' }), key)
  formData.set('metadata', JSON.stringify(metadata))

  await aiSearchApiRequest(env, '/items', {
    method: 'POST',
    body: formData,
  })
}

async function getIndexStats(env: CloudflareEnv) {
  const response = await aiSearchApiRequest(env, '/stats', {
    method: 'GET',
  }) as { result?: AiSearchStatsResponse }

  return response.result ?? {}
}

async function waitForIndexing(env: CloudflareEnv, timeoutMs = 10 * 60 * 1000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const stats = await getIndexStats(env)
    const queued = Number(stats.queued ?? 0)
    const running = Number(stats.running ?? 0)
    const outdated = Number(stats.outdated ?? 0)
    if (queued === 0 && running === 0 && outdated === 0) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error('Timed out waiting for AI Search indexing to complete')
}

async function buildPlatformKnowledgeDocuments(db: DbClient): Promise<PlatformKnowledgeDocument[]> {
  const [docs, posts] = await Promise.all([
    queryAll<PlatformDocSearchRow>(db, `
      SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords
      FROM platform_docs
      WHERE status = 'published'
      ORDER BY category, sort_order, published_at DESC, updated_at DESC
    `),
    queryAll<PlatformBlogSearchRow>(db, `
      SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords
      FROM blog_posts
      WHERE status = 'published' AND site_id IS NULL
      ORDER BY category, published_at DESC, updated_at DESC
    `),
  ])

  const docRecords: PlatformKnowledgeDocument[] = (docs ?? []).flatMap((doc) => {
    const path = getDocPath(doc.category, doc.slug)
    if (!path) return []
    const snippet = truncateSnippet(doc.excerpt || doc.seo_description || doc.body || doc.title)
    const body = [
      doc.title,
      doc.category ?? '',
      doc.seo_keywords ?? '',
      doc.excerpt ?? '',
      stripMarkdown(doc.body),
    ].join('\n\n')
    return [{
      id: `doc:${doc.id}`,
      key: `docs/${doc.slug}.md`,
      type: 'doc',
      title: doc.title,
      path,
      snippet,
      section: doc.category ?? 'Docs',
      icon: 'book',
      body,
      surfaces: ['public', 'docs', 'blog', 'help', 'chowbot', 'dashboard'],
    }]
  })

  const blogRecords: PlatformKnowledgeDocument[] = (posts ?? []).flatMap((post) => {
    const path = getPlatformBlogPath(post.category, post.slug)
    if (!path) return []
    const snippet = truncateSnippet(post.excerpt || post.seo_description || post.body || post.title)
    const body = [
      post.title,
      post.category ?? '',
      post.seo_keywords ?? '',
      post.excerpt ?? '',
      stripMarkdown(post.body),
    ].join('\n\n')
    return [{
      id: `blog:${post.id}`,
      key: `blog/${post.slug}.md`,
      type: 'blog',
      title: post.title,
      path,
      snippet,
      section: post.category ?? 'Blog',
      icon: 'newspaper',
      body,
      surfaces: ['public', 'docs', 'blog', 'help', 'chowbot', 'dashboard'],
    }]
  })

  const faqRecords: PlatformKnowledgeDocument[] = PLATFORM_KNOWLEDGE_FAQ_ENTRIES.map((faq) => ({
    id: `faq:${faq.id}`,
    key: `faq/${faq.id}.md`,
    type: 'faq',
    title: faq.title,
    path: '/help',
    snippet: truncateSnippet(faq.answer),
    section: 'Support',
    icon: 'circle-help',
    body: `${faq.answer}\n\nKeywords: ${faq.keywords.join(', ')}`,
    surfaces: ['public', 'help', 'chowbot', 'dashboard'],
  }))

  const routeRecords: PlatformKnowledgeDocument[] = PLATFORM_KNOWLEDGE_ROUTE_ENTRIES.map((route) => ({
    id: `route:${route.id}`,
    key: `routes/${route.id}.md`,
    type: 'route',
    title: route.title,
    path: route.path,
    snippet: route.snippet,
    section: route.section,
    icon: route.icon,
    body: `${route.snippet}\n\nKeywords: ${route.keywords.join(', ')}`,
    surfaces: route.surfaces,
  }))

  const pageRecords: PlatformKnowledgeDocument[] = PLATFORM_KNOWLEDGE_PAGE_ENTRIES.map((page) => ({
    id: `page:${page.id}`,
    key: `platform/${page.id}.md`,
    type: 'platform_page',
    title: page.title,
    path: page.path,
    snippet: page.snippet,
    section: page.section,
    icon: page.icon,
    body: `${page.body}\n\nKeywords: ${page.keywords.join(', ')}`,
    surfaces: page.surfaces,
  }))

  const dashboardRecords: PlatformKnowledgeDocument[] = PLATFORM_DASHBOARD_ROUTE_ENTRIES.map((route: PlatformDashboardRouteEntry) => ({
    id: `dashboard:${route.id}`,
    key: `dashboard/${route.id}.md`,
    type: 'dashboard_route',
    title: route.title,
    path: route.fallbackPath,
    pathTemplate: route.pathTemplate,
    snippet: route.snippet,
    section: route.section,
    icon: route.icon,
    body: `${route.body}\n\nKeywords: ${route.keywords.join(', ')}`,
    surfaces: route.surfaces,
  }))

  return [
    ...docRecords,
    ...blogRecords,
    ...faqRecords,
    ...routeRecords,
    ...pageRecords,
    ...dashboardRecords,
  ]
}

function expandDocumentsForSurfaces(records: PlatformKnowledgeDocument[]) {
  return records.flatMap((record) =>
    record.surfaces.map((surface) => ({
      ...record,
      key: `${surface}/${record.key}`,
      metadata: {
        ...recordMetadata(record),
        surface,
      },
    })),
  )
}

export async function rebuildPlatformKnowledgeIndex(env: CloudflareEnv, db: DbClient) {
  await ensurePlatformKnowledgeInstance(env)
  const [existingItems, baseRecords] = await Promise.all([
    listAllItems(env),
    buildPlatformKnowledgeDocuments(db),
  ])
  const records = expandDocumentsForSurfaces(baseRecords)

  await Promise.all(existingItems.map(item => deleteIndexItem(env, item.id)))
  for (const record of records) {
    await uploadIndexItem(env, record.key, renderDocumentContent(record), record.metadata)
  }
  await waitForIndexing(env)

  return {
    instanceId: platformKnowledgeInstanceId(env),
    indexed: records.length,
    deleted: existingItems.length,
  }
}

export async function searchPublicResources(
  env: CloudflareEnv,
  query: string,
  options: SearchOptions = {},
): Promise<PublicSearchResult[]> {
  const normalized = normalizeQuery(query)
  if (!normalized) return []

  const surface = options.surface ?? 'public'
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const typeFilter = resultTypeFilter(options.type ?? 'all')

  const response = await aiSearchApiRequest(env, '/search', {
    method: 'POST',
    body: JSON.stringify({
      query: normalized,
      ai_search_options: {
        retrieval: {
          retrieval_type: 'hybrid',
          match_threshold: 0,
          max_num_results: Math.min(50, limit * 5),
          keyword_match_mode: 'or',
          return_on_failure: true,
          filters: buildSearchFilters(surface, typeFilter),
        },
        query_rewrite: {
          enabled: false,
        },
        reranking: {
          enabled: false,
        },
      },
    }),
  }) as { result?: { chunks?: AiSearchSearchResponse['chunks'] } }

  return normalizeSearchResults(response.result?.chunks ?? [], {
    limit,
    surface,
    dashboardContext: options.dashboardContext,
  })
}

export function formatPublicSearchResultsForPrompt(results: PublicSearchResult[]) {
  return results.map((result, index) =>
    `${index + 1}. [${result.type}] ${result.title} (${result.path}) - ${result.snippet}`,
  ).join('\n')
}
