#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { auditSeoHtml, buildSeoMigrationContract, parseSearchConsoleCsv, parseSitemapXml } from './utils/seo-migration-contract.mjs'

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
    const requiredTypes = path === '/'
      ? ['ProfessionalService']
      : /^\/services\/[^/]+$/.test(path)
        ? ['LegalService', 'BreadcrumbList', ...(servicePathsWithFaqs.has(path) ? ['FAQPage'] : [])]
        : path.startsWith('/article/') ? ['Article'] : []
    for (const type of requiredTypes) {
      if (!audit.schemaTypes.includes(type)) failures.push(`${path}: missing ${type} JSON-LD`)
    }
  } else if (outcome.behavior === 'redirect') {
    if (response.status !== outcome.statusCode) failures.push(`${path}: expected ${outcome.statusCode}, received ${response.status}`)
    const expected = new URL(outcome.destination, expectedOrigin).toString()
    const actual = response.headers.get('location')
    if (new URL(actual || '/', expectedOrigin).toString() !== expected) failures.push(`${path}: expected Location ${expected}, received ${actual}`)
  } else if (outcome.behavior === 'gone' && response.status !== 410) {
    failures.push(`${path}: expected 410, received ${response.status}`)
  }
}

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
if (/disallow:\s*\//i.test(robots)) failures.push('/robots.txt: blocks the entire site')
if (!/sitemap:/i.test(robots)) failures.push('/robots.txt: missing Sitemap directive')

const report = { checkedAt: new Date().toISOString(), baseUrl: base.origin, expectedOrigin, sourceUrlCount: contract.sourceUrls.length, indexedUrlCount: contract.indexedUrls.length, failures }
console.log(JSON.stringify(report, null, 2))
process.exit(failures.length ? 1 : 0)
