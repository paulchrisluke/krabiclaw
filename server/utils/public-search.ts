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
import type { PublicSearchTypeFilter } from '~/server/utils/platform-search-types'

const AI_SEARCH_CUSTOM_METADATA: AiSearchConfig['custom_metadata'] = [
  { field_name: 'record_id', data_type: 'text' },
  { field_name: 'type', data_type: 'text' },
  { field_name: 'surface', data_type: 'text' },
  { field_name: 'path', data_type: 'text' },
  { field_name: 'display', data_type: 'text' },
  { field_name: 'site_id', data_type: 'text' },
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
  type?: PublicSearchTypeFilter
  surface?: PlatformKnowledgeSurface
  dashboardContext?: DashboardRouteContext
  siteId?: string | null
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

type TenantBlogSearchRow = PlatformBlogSearchRow

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
  siteId?: string | null
}

interface TenantBlogDocRow {
  id: string
  site_id: string
  title: string
  slug: string
  body: string
  excerpt: string | null
  category: string | null
  tags_json: string | null
  seo_description: string | null
  seo_keywords: string | null
}

function platformKnowledgeInstanceId(env: CloudflareEnv) {
  const value = env.AI_SEARCH_INSTANCE_ID
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('AI_SEARCH_INSTANCE_ID is not configured')
}

function normalizeQuery(query: string) {
  return query.trim()
}

// SQLite LIKE treats '%' and '_' as wildcards even inside a bound parameter, so a
// literal search term containing them (e.g. "50% off") must have those escaped —
// paired with `ESCAPE '\'` on every LIKE predicate that uses this.
function escapeLikePattern(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function searchNamespace(env: CloudflareEnv) {
  const binding = env.AI_SEARCH as AiSearchNamespace | undefined
  if (!binding) {
    throw new Error('Cloudflare AI Search binding is not available')
  }
  return binding
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
    site_id: record.siteId ?? '',
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

function buildSearchFilters(surface: PlatformKnowledgeSurface, type?: PublicSearchType | 'all', siteId?: string | null) {
  const clauses: Array<Record<string, { $eq: string }>> = [
    { surface: { $eq: surface } },
  ]

  if (type && type !== 'all') {
    clauses.push({ type: { $eq: type } })
  }

  // tenant_blog is one shared corpus across every tenant site — the surface
  // filter alone isn't enough, results must also be pinned to one site_id or
  // every tenant's posts would be searchable from every other tenant's blog.
  // A missing siteId must exclude every tenant_blog document, not just skip
  // the predicate, or an unscoped request would search the entire corpus.
  if (surface === 'tenant_blog') {
    clauses.push({ site_id: { $eq: siteId || '__no_site__' } })
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

function normalizeTenantBlogSearchResults(
  rows: TenantBlogSearchRow[],
  options: Required<Pick<SearchOptions, 'limit' | 'surface'>>,
) {
  return rows
    .slice(0, options.limit)
    .map((post, index) => ({
      id: `tenant-blog:${post.id}`,
      type: 'blog' as const,
      title: post.title,
      path: `/blog/${post.slug}`,
      snippet: truncateSnippet(post.excerpt || post.seo_description || post.body || post.title),
      surface: options.surface,
      section: post.category || 'Blog',
      icon: 'newspaper',
      // These are plain SQL LIKE substring matches, not relevance-ranked — keep the
      // synthetic score modest (well under the platform instance's AI Search scores)
      // so keyword-only blog matches don't crowd out genuinely reranked results.
      score: Math.max(0.15, 0.5 - (index * 0.03)),
    }))
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
  const namespace = searchNamespace(env)

  try {
    const instance = namespace.get(instanceId)
    await instance.update({
      id: instanceId,
      ...platformKnowledgeInstanceConfig(),
    })
  } catch {
    await namespace.create({
      id: platformKnowledgeInstanceId(env),
      ...platformKnowledgeInstanceConfig(),
    })
  }
}

async function listAllItems(env: CloudflareEnv) {
  const instance = searchNamespace(env).get(platformKnowledgeInstanceId(env))
  const items: AiSearchItemInfo[] = []
  let page = 1

  while (true) {
    const response = await instance.items.list({ page, per_page: 50 })
    const pageItems = response.result ?? []
    items.push(...pageItems)
    if (!response.result_info || page * response.result_info.per_page >= response.result_info.total_count) break
    page += 1
  }

  return items
}

async function deleteIndexItem(env: CloudflareEnv, itemId: string) {
  await searchNamespace(env).get(platformKnowledgeInstanceId(env)).items.delete(itemId)
}

async function uploadIndexItem(env: CloudflareEnv, key: string, content: string, metadata: Record<string, string>) {
  await searchNamespace(env).get(platformKnowledgeInstanceId(env)).items.upload(key, content, { metadata })
}

async function waitForIndexing(env: CloudflareEnv, timeoutMs = 10 * 60 * 1000) {
  const instance = searchNamespace(env).get(platformKnowledgeInstanceId(env))
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const stats = await instance.stats()
    const queued = Number(stats.queued ?? 0)
    const running = Number(stats.running ?? 0)
    const outdated = Number(stats.outdated ?? 0)
    if (queued === 0 && running === 0 && outdated === 0) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error('Timed out waiting for AI Search indexing to complete')
}

async function buildTenantBlogDocuments(db: DbClient): Promise<PlatformKnowledgeDocument[]> {
  const posts = await queryAll<TenantBlogDocRow>(db, `
    SELECT id, site_id, title, slug, body, excerpt, category, tags_json, seo_description, seo_keywords
    FROM blog_posts
    WHERE status = 'published' AND site_id IS NOT NULL
    ORDER BY site_id, published_at DESC, updated_at DESC
  `)

  return (posts ?? []).map((post) => {
    const tags = (() => { try { return JSON.parse(post.tags_json || '[]') as string[] } catch { return [] } })()
    const snippet = truncateSnippet(post.excerpt || post.seo_description || post.body || post.title)
    const body = [
      post.title,
      post.category ?? '',
      tags.join(' '),
      post.seo_keywords ?? '',
      post.excerpt ?? '',
      stripMarkdown(post.body),
    ].join('\n\n')
    return {
      id: `tenant-blog:${post.id}`,
      key: `tenant-blog/${post.site_id}/${post.slug}.md`,
      type: 'blog' as const,
      title: post.title,
      path: `/blog/${post.slug}`,
      snippet,
      section: post.category || 'Blog',
      icon: 'newspaper',
      body,
      surfaces: ['tenant_blog' as const],
      siteId: post.site_id,
    }
  })
}

async function buildPlatformKnowledgeDocuments(db: DbClient): Promise<PlatformKnowledgeDocument[]> {
  const [docs, posts, tenantBlogRecords] = await Promise.all([
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
    buildTenantBlogDocuments(db),
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
    ...tenantBlogRecords,
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
  const nextKeys = new Set(records.map(record => record.key))
  for (const record of records) {
    await uploadIndexItem(env, record.key, renderDocumentContent(record), record.metadata)
  }
  const staleItems = existingItems.filter(item => !nextKeys.has(item.key))
  await Promise.all(staleItems.map(item => deleteIndexItem(env, item.id)))
  await waitForIndexing(env)

  return {
    instanceId: platformKnowledgeInstanceId(env),
    indexed: records.length,
    deleted: staleItems.length,
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
  const instance = searchNamespace(env).get(platformKnowledgeInstanceId(env))

  const [response, tenantBlogRows] = await Promise.all([
    instance.search({
      query: normalized,
      ai_search_options: {
        retrieval: {
          retrieval_type: 'hybrid',
          match_threshold: 0,
          max_num_results: Math.min(50, limit * 5),
          keyword_match_mode: 'or',
          return_on_failure: true,
          filters: buildSearchFilters(surface, typeFilter, options.siteId),
        },
        query_rewrite: {
          enabled: false,
        },
        reranking: {
          enabled: false,
        },
      },
    }),
    (async () => {
      if (!options.siteId || !env.db || (typeFilter && typeFilter !== 'blog')) {
        return [] as TenantBlogSearchRow[]
      }
      try {
        const likePattern = `%${escapeLikePattern(normalized)}%`
        return await queryAll<TenantBlogSearchRow>(
          env.db,
          `SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords
           FROM blog_posts
           WHERE status = 'published'
             AND site_id = ?
             AND (
               lower(title) LIKE lower(?) ESCAPE '\\'
               OR lower(body) LIKE lower(?) ESCAPE '\\'
               OR lower(COALESCE(excerpt, '')) LIKE lower(?) ESCAPE '\\'
               OR lower(COALESCE(category, '')) LIKE lower(?) ESCAPE '\\'
               OR lower(COALESCE(seo_description, '')) LIKE lower(?) ESCAPE '\\'
               OR lower(COALESCE(seo_keywords, '')) LIKE lower(?) ESCAPE '\\'
             )
           ORDER BY published_at DESC, updated_at DESC
           LIMIT ?`,
          [
            options.siteId,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            likePattern,
            limit,
          ],
        )
      } catch {
        return [] as TenantBlogSearchRow[]
      }
    })(),
  ])

  const platformResults = normalizeSearchResults(response.chunks ?? [], {
    limit,
    surface,
    dashboardContext: options.dashboardContext,
  })
  const tenantResults = normalizeTenantBlogSearchResults(tenantBlogRows ?? [], {
    limit,
    surface,
  })

  const merged = new Map<string, PublicSearchResult>()
  for (const result of [...tenantResults, ...platformResults]) {
    const key = `${result.type}:${result.id}:${result.path}`
    const current = merged.get(key)
    if (!current || current.score < result.score) merged.set(key, result)
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}

export function formatPublicSearchResultsForPrompt(results: PublicSearchResult[]) {
  return results.map((result, index) =>
    `${index + 1}. [${result.type}] ${result.title} (${result.path}) - ${result.snippet}`,
  ).join('\n')
}
