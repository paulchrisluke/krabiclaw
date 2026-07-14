import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// Corpus-construction rows keyed by which query text they answer, mirroring the
// `mock.module` pattern already used in tests/unit/site-content-scopes.test.ts.
const PLATFORM_DOCS = [
  {
    id: 'doc-1',
    title: 'Connecting Google Business',
    slug: 'connecting-google-business',
    body: 'Step by step instructions for linking your Google Business profile.',
    excerpt: 'Link Google Business to sync hours and reviews.',
    category: 'Integrations',
    seo_description: null,
    seo_keywords: 'google, business, sync',
  },
]

const PLATFORM_BLOG_POSTS = [
  {
    id: 'post-1',
    title: 'Why Google reviews matter for local SEO',
    slug: 'why-google-reviews-matter',
    body: 'A deep dive into Google reviews and local ranking factors.',
    excerpt: 'Google reviews drive local search ranking.',
    category: 'SEO',
    seo_description: null,
    seo_keywords: 'google reviews, seo',
  },
]

const TENANT_BLOG_POSTS = [
  {
    id: 'tenant-post-1',
    site_id: 'site-ncls',
    title: 'Your Landlord Cannot Evict You Without a Court Order',
    slug: 'your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try',
    body: 'Explains the legal eviction process and tenant rights during eviction disputes.',
    excerpt: 'What to do when a landlord tries to evict without a court order.',
    category: 'Housing',
    tags_json: JSON.stringify(['eviction', 'tenant rights']),
    seo_description: null,
    seo_keywords: 'eviction, landlord, tenant rights, court order',
  },
  {
    id: 'tenant-post-2',
    site_id: 'site-other-tenant',
    title: 'Unrelated other-tenant article',
    slug: 'unrelated-other-tenant-article',
    body: 'Content belonging to a different tenant site entirely.',
    excerpt: null,
    category: null,
    tags_json: '[]',
    seo_description: null,
    seo_keywords: null,
  },
]

async function queryAll<T>(_db: unknown, query: string): Promise<T[]> {
  if (query.includes('FROM platform_docs')) return PLATFORM_DOCS as T[]
  if (query.includes('site_id IS NULL')) return PLATFORM_BLOG_POSTS as T[]
  if (query.includes('site_id IS NOT NULL')) return TENANT_BLOG_POSTS as T[]
  return [] as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll },
})

const {
  buildSearchFilters,
  buildTenantBlogDocuments,
  buildPlatformKnowledgeDocuments,
  expandDocumentsForSurfaces,
  recordMetadata,
  computeLexicalBoost,
  dedupeByPath,
  balanceResultTypes,
} = await import('../../server/utils/public-search.ts')

// ── Corpus construction ──────────────────────────────────────────────────────

test('buildTenantBlogDocuments carries each post\'s own site_id onto the indexed record', async () => {
  const docs = await buildTenantBlogDocuments({} as never)
  assert.equal(docs.length, 2)
  const nclsDoc = docs.find(doc => doc.id === 'tenant-blog:tenant-post-1')
  assert.ok(nclsDoc)
  assert.equal(nclsDoc.siteId, 'site-ncls')
  assert.equal(nclsDoc.type, 'blog')
  assert.equal(nclsDoc.path, '/blog/your-landlord-cannot-evict-you-without-a-court-order-heres-what-to-do-when-they-try')
  // Concept/keyword terms from tags + seo_keywords must be indexed, not just the title,
  // so a related multi-word concept query (not just literal title words) can match it.
  assert.match(nclsDoc.body, /eviction/)
  assert.match(nclsDoc.body, /tenant rights/)

  const otherTenantDoc = docs.find(doc => doc.id === 'tenant-blog:tenant-post-2')
  assert.ok(otherTenantDoc)
  assert.equal(otherTenantDoc.siteId, 'site-other-tenant')
})

test('buildPlatformKnowledgeDocuments assembles docs, platform blog, and tenant blog records together', async () => {
  const docs = await buildPlatformKnowledgeDocuments({} as never)
  const types = docs.map(doc => doc.type)
  assert.ok(types.includes('doc'))
  assert.ok(types.includes('blog'))
  assert.ok(types.includes('faq'))
  assert.ok(types.includes('route'))
  assert.ok(types.includes('platform_page'))
  assert.ok(types.includes('dashboard_route'))

  const tenantRecords = docs.filter(doc => doc.surfaces.includes('tenant_blog'))
  assert.equal(tenantRecords.length, 2)
})

test('expandDocumentsForSurfaces + recordMetadata isolate tenant_blog records by site_id in indexed metadata', async () => {
  const docs = await buildTenantBlogDocuments({} as never)
  const expanded = expandDocumentsForSurfaces(docs)
  assert.ok(expanded.every(record => record.metadata.surface === 'tenant_blog'))

  const nclsRecord = expanded.find(record => record.metadata.record_id === 'tenant-blog:tenant-post-1')
  assert.ok(nclsRecord)
  assert.equal(nclsRecord.metadata.site_id, 'site-ncls')

  const otherRecord = expanded.find(record => record.metadata.record_id === 'tenant-blog:tenant-post-2')
  assert.ok(otherRecord)
  assert.equal(otherRecord.metadata.site_id, 'site-other-tenant')

  // A platform (non-tenant) record must never carry a stray site_id — it must resolve to
  // the empty string, or buildSearchFilters's site_id equality filter has nothing reliable
  // to exclude it with.
  const platformDocs = await buildPlatformKnowledgeDocuments({} as never)
  const platformDoc = platformDocs.find(doc => doc.type === 'doc')
  assert.ok(platformDoc)
  assert.equal(recordMetadata(platformDoc).site_id, '')
})

// ── Tenant site_id isolation in query filters ────────────────────────────────

test('buildSearchFilters pins tenant_blog queries to the resolved site_id', () => {
  const filters = buildSearchFilters('tenant_blog', 'all', 'site-ncls') as { $and: Array<Record<string, unknown>> }
  const siteClause = filters.$and.find(clause => 'site_id' in clause) as { site_id: { $eq: string } }
  assert.equal(siteClause.site_id.$eq, 'site-ncls')
})

test('buildSearchFilters excludes every tenant_blog document when siteId is missing', () => {
  const filters = buildSearchFilters('tenant_blog', 'all', null) as { $and: Array<Record<string, unknown>> }
  const siteClause = filters.$and.find(clause => 'site_id' in clause) as { site_id: { $eq: string } }
  // An unscoped request must resolve to a sentinel no site can ever match, not skip the
  // predicate entirely — otherwise it would search every tenant's blog at once.
  assert.equal(siteClause.site_id.$eq, '__no_site__')
})

test('buildSearchFilters does not add a site_id clause for non-tenant surfaces', () => {
  const filters = buildSearchFilters('docs', 'all', null)
  assert.deepEqual(filters, { surface: { $eq: 'docs' } })
})

// ── Ranking: lexical boost ───────────────────────────────────────────────────

test('computeLexicalBoost rewards exact and partial title matches over no match', () => {
  const exact = computeLexicalBoost('pricing', { title: 'Pricing', section: 'Platform' })
  const partial = computeLexicalBoost('pricing', { title: 'KrabiClaw Pricing Plans', section: 'Platform' })
  const none = computeLexicalBoost('pricing', { title: 'Domain Settings', section: 'Settings' })
  assert.ok(exact > partial)
  assert.ok(partial > none)
  assert.equal(none, 0)
})

test('computeLexicalBoost rewards multi-word concept overlap for tenant articles', () => {
  const boost = computeLexicalBoost('landlord eviction court order', {
    title: 'Your Landlord Cannot Evict You Without a Court Order',
    section: 'Housing',
  })
  assert.ok(boost > 0)
})

// ── Ranking: path dedup ──────────────────────────────────────────────────────

test('dedupeByPath keeps the richer content record over a generic route entry at the same path', () => {
  const route = { id: 'route:pricing', type: 'route', title: 'Pricing', path: '/pricing', snippet: '', surface: 'public', section: 'Platform', icon: 'credit-card', score: 0.9 } as const
  const page = { id: 'page:pricing-page', type: 'platform_page', title: 'Pricing Plans', path: '/pricing', snippet: '', surface: 'public', section: 'Platform', icon: 'credit-card', score: 0.4 } as const
  const deduped = dedupeByPath([route, page])
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0]?.type, 'platform_page')
})

test('dedupeByPath never merges dashboard_route entries that share an unresolved fallback path', () => {
  const menu = { id: 'dashboard:location-menu', type: 'dashboard_route', title: 'Menu', path: '/dashboard', snippet: '', surface: 'dashboard', section: 'Location', icon: 'utensils-crossed', score: 0.5 } as const
  const inbox = { id: 'dashboard:location-inbox', type: 'dashboard_route', title: 'Inbox', path: '/dashboard', snippet: '', surface: 'dashboard', section: 'Operations', icon: 'inbox', score: 0.4 } as const
  const deduped = dedupeByPath([menu, inbox])
  assert.equal(deduped.length, 2)
})

// ── Ranking: type balance ────────────────────────────────────────────────────

test('balanceResultTypes reserves at least half the slots for non-nav content when enough content exists', () => {
  const content = Array.from({ length: 6 }, (_, index) => ({
    id: `doc:${index}`, type: 'doc', title: `Doc ${index}`, path: `/docs/${index}`, snippet: '', surface: 'public', section: 'Docs', icon: 'book', score: 0.5,
  } as const))
  const nav = Array.from({ length: 6 }, (_, index) => ({
    id: `route:${index}`, type: 'route', title: `Route ${index}`, path: `/route-${index}`, snippet: '', surface: 'public', section: 'Platform', icon: 'search', score: 0.9,
  } as const))

  const balanced = balanceResultTypes([...nav, ...content], 8)
  const navCount = balanced.filter(result => result.type === 'route').length
  const contentCount = balanced.filter(result => result.type === 'doc').length
  assert.ok(navCount <= 4, `expected nav results capped to half the limit, got ${navCount}`)
  assert.equal(contentCount, 6)
})

test('balanceResultTypes still returns nav results when no content matched at all', () => {
  const nav = Array.from({ length: 5 }, (_, index) => ({
    id: `route:${index}`, type: 'route', title: `Route ${index}`, path: `/route-${index}`, snippet: '', surface: 'public', section: 'Platform', icon: 'search', score: 0.9,
  } as const))
  const balanced = balanceResultTypes(nav, 8)
  assert.equal(balanced.length, 5)
})
