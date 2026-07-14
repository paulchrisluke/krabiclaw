#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { auditSeoHtml, buildSeoMigrationContract, parseSearchConsoleCsv, parseSitemapXml } from './utils/seo-migration-contract.mjs'
import { isNonIndexableHost } from '../server/utils/seo-policy.ts'

function args(argv) {
  const result = { url: '', expectedOrigin: '', tenantSlug: '' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--url') result.url = argv[++index]
    else if (argv[index] === '--expected-origin') result.expectedOrigin = argv[++index]
    else if (argv[index] === '--tenant-slug') result.tenantSlug = argv[++index]
  }
  if (!result.url) throw new Error('--url is required')
  result.expectedOrigin ||= new URL(result.url).origin
  return result
}

const options = args(process.argv.slice(2))
const base = new URL(options.url)
const expectedOrigin = new URL(options.expectedOrigin).origin
const headers = options.tenantSlug ? { 'x-preview-tenant': options.tenantSlug, 'cache-control': 'no-store' } : {}
const evidenceDir = new URL('../client-imports/north-carolina-legal-services/evidence/seo/', import.meta.url)
const routeManifest = JSON.parse(readFileSync(new URL('../client-imports/north-carolina-legal-services/route-manifest.json', import.meta.url), 'utf8'))
const clientManifest = JSON.parse(readFileSync(new URL('../client-imports/north-carolina-legal-services/client-manifest.json', import.meta.url), 'utf8'))
const servicePathsWithFaqs = new Set((clientManifest.offerings ?? [])
  .filter(offering => offering.faqs?.some(faq => faq.question?.trim() && faq.answer?.trim()))
  .map(offering => offering.canonical_path || `/services/${offering.slug}`))
const sitePagesWithQa = new Set((clientManifest.siteQa ?? [])
  .filter(qa => qa.question?.trim() && qa.answer?.trim())
  .map(qa => qa.page_path))

/**
 * Route-specific required schema.org @types for every preserved, indexed
 * professional-service route. `Organization`/`WebSite` (with stable, canonical
 * `#organization`/`#website` IDs) are required on every route by the loop
 * below regardless of what's listed here — this only adds the recipe-specific
 * nodes from utils/professional-service-schema.ts. FAQPage is only required
 * where the source client-manifest actually has visible Q&A for that path, so
 * this never demands phantom FAQ schema.
 */
function requiredTypesForPath(path) {
  if (path === '/') return withFaq('/', [])
  if (path === '/services') return withFaq('/services', ['CollectionPage', 'BreadcrumbList', 'ItemList'])
  if (/^\/services\/[^/]+$/.test(path)) return ['LegalService', 'BreadcrumbList', ...(servicePathsWithFaqs.has(path) ? ['FAQPage'] : [])]
  if (path === '/about') return withFaq('/about', ['AboutPage', 'BreadcrumbList'])
  if (path === '/contact') return withFaq('/contact', ['ContactPage', 'BreadcrumbList'])
  if (path === '/schedule') return withFaq('/schedule', ['BreadcrumbList'])
  if (path === '/pricing') return withFaq('/pricing', ['BreadcrumbList'])
  if (path === '/donate') return withFaq('/donate', ['BreadcrumbList'])
  if (path === '/blog') return ['CollectionPage', 'BreadcrumbList', 'ItemList']
  if (path.startsWith('/article/')) return ['BlogPosting', 'BreadcrumbList']
  if (['/policies/privacy', '/policies/terms', '/third-party-notices'].includes(path)) return ['BreadcrumbList']
  return []
}

function withFaq(path, types) {
  return sitePagesWithQa.has(path) ? [...types, 'FAQPage'] : types
}
const sourceSitemap = parseSitemapXml(readFileSync(new URL('source-sitemap-2026-07-13.xml', evidenceDir), 'utf8'))
const indexedUrls = parseSearchConsoleCsv(readFileSync(new URL('search-console-valid-2026-07-13.csv', evidenceDir), 'utf8'))
const contract = buildSeoMigrationContract({ sitemapUrls: sourceSitemap, searchConsoleUrls: indexedUrls, routeManifest })
const failures = contract.unclassified.map(path => `${path}: missing cutover outcome`)

async function request(path, redirect = 'manual') {
  return fetch(new URL(path, base), { headers, redirect, signal: AbortSignal.timeout(15_000) })
}

for (const [path, outcome] of contract.outcomes) {
  if (!contract.sourceUrls.includes(path) && !contract.indexedUrls.includes(path)) continue
  const response = await request(path)
  if (outcome.behavior === 'preserve') {
    if (response.status !== 200) {
      failures.push(`${path}: expected 200, received ${response.status}`)
      continue
    }
    if (/noindex/i.test(response.headers.get('x-robots-tag') || '')) failures.push(`${path}: X-Robots-Tag contains noindex`)
    const audit = auditSeoHtml(await response.text(), new URL(path, expectedOrigin).toString())
    failures.push(...audit.errors.map(error => `${path}: ${error}`))

    // Every preserved professional-service route must carry the shared,
    // stable-ID Organization/WebSite graph anchored at the canonical origin —
    // this is what proves dashboard/ChowBot/MCP/import-authored compliance
    // data and public rendering never drifted apart (see #253).
    const organizationId = `${expectedOrigin}/#organization`
    const websiteId = `${expectedOrigin}/#website`
    if (!audit.schemaTypes.includes('Organization')) failures.push(`${path}: missing Organization JSON-LD`)
    if (!audit.schemaTypes.includes('WebSite')) failures.push(`${path}: missing WebSite JSON-LD`)
    if (!audit.schemaIds.includes(organizationId)) failures.push(`${path}: Organization node missing stable @id ${organizationId}`)
    if (!audit.schemaIds.includes(websiteId)) failures.push(`${path}: WebSite node missing stable @id ${websiteId}`)

    const requiredTypes = requiredTypesForPath(path)
    for (const type of requiredTypes) {
      if (!audit.schemaTypes.includes(type)) failures.push(`${path}: missing ${type} JSON-LD`)
    }
    // Non-detail routes (everything except /services/<slug> and /article/<slug>)
    // must never ship with zero schema at all — missing schema on those routes
    // fails the cutover gate outright per #253's acceptance criteria.
    const isDetailRoute = /^\/services\/[^/]+$/.test(path) || path.startsWith('/article/')
    if (!isDetailRoute && !audit.schemaTypes.length) failures.push(`${path}: non-detail route has no structured data at all`)
  } else if (outcome.behavior === 'redirect') {
    if (response.status !== outcome.statusCode) failures.push(`${path}: expected ${outcome.statusCode}, received ${response.status}`)
    const expected = new URL(outcome.destination, expectedOrigin).toString()
    const actual = response.headers.get('location')
    if (new URL(actual || '/', expectedOrigin).toString() !== expected) failures.push(`${path}: expected Location ${expected}, received ${actual}`)
  } else if (outcome.behavior === 'gone' && response.status !== 410) {
    failures.push(`${path}: expected 410, received ${response.status}`)
  }
}

// server/plugins/sitemap.ts and the app's robots policy both intentionally block indexing
// on preview/staging/workers.dev hosts (server/utils/seo-policy.ts isNonIndexableHost) — an
// empty sitemap and a blanket robots disallow there are correct, not a migration regression.
if (!isNonIndexableHost(base.hostname)) {
  const sitemapResponse = await request('/sitemap.xml', 'follow')
  const targetSitemap = sitemapResponse.ok ? parseSitemapXml(await sitemapResponse.text()).map(url => new URL(url).pathname) : []
  if (!sitemapResponse.ok) failures.push(`/sitemap.xml: received ${sitemapResponse.status}`)
  for (const [path, outcome] of contract.outcomes) {
    if (outcome.behavior === 'preserve' && contract.sourceUrls.includes(path) && !targetSitemap.includes(path)) failures.push(`${path}: missing from target sitemap`)
    if (outcome.behavior !== 'preserve' && targetSitemap.includes(path)) failures.push(`${path}: redirect/gone URL appears in target sitemap`)
  }

  const robotsResponse = await request('/robots.txt', 'follow')
  const robots = robotsResponse.ok ? await robotsResponse.text() : ''
  if (!robotsResponse.ok) failures.push(`/robots.txt: received ${robotsResponse.status}`)
  if (/^disallow:\s*\/\s*$/im.test(robots)) failures.push('/robots.txt: blocks the entire site')
  if (!/sitemap:/i.test(robots)) failures.push('/robots.txt: missing Sitemap directive')
}

const report = { checkedAt: new Date().toISOString(), baseUrl: base.origin, expectedOrigin, sourceUrlCount: contract.sourceUrls.length, indexedUrlCount: contract.indexedUrls.length, failures }
console.log(JSON.stringify(report, null, 2))
process.exit(failures.length ? 1 : 0)
