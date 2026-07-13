import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { auditSeoHtml, buildSeoMigrationContract, parseSearchConsoleCsv, parseSitemapXml } from '../../scripts/utils/seo-migration-contract.mjs'

const evidenceDir = 'client-imports/north-carolina-legal-services/evidence/seo'
const routeManifest = JSON.parse(readFileSync('client-imports/north-carolina-legal-services/route-manifest.json', 'utf8'))

test('every live sitemap and Search Console URL has an explicit cutover outcome', () => {
  const sitemapUrls = parseSitemapXml(readFileSync(`${evidenceDir}/source-sitemap-2026-07-13.xml`, 'utf8'))
  const searchConsoleUrls = parseSearchConsoleCsv(readFileSync(`${evidenceDir}/search-console-valid-2026-07-13.csv`, 'utf8'))
  const contract = buildSeoMigrationContract({ sitemapUrls, searchConsoleUrls, routeManifest })

  assert.deepEqual(contract.unclassified, [])
  assert.equal(contract.sourceUrls.length, 40)
  assert.equal(contract.indexedUrls.length, 37)
  assert.equal(contract.outcomes.get('/services/personal-injury')?.behavior, 'redirect')
  assert.equal(contract.outcomes.get('/conference')?.behavior, 'gone')
})

test('the contract reports source URLs missing a preserved, redirect, or gone outcome', () => {
  const contract = buildSeoMigrationContract({
    sitemapUrls: ['https://www.northcarolinalegalservices.org/unknown'],
    searchConsoleUrls: [],
    routeManifest: { preservedRoutes: [], redirects: [], intentionalExclusions: [] },
  })

  assert.deepEqual(contract.unclassified, ['/unknown'])
})

test('SEO HTML audit requires a self-canonical indexable page with parseable structured data', () => {
  const result = auditSeoHtml(`<!doctype html><head>
    <title>Family Law | North Carolina Legal Services</title>
    <meta name="description" content="Affordable family-law help in North Carolina.">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="https://www.northcarolinalegalservices.org/services/family">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"LegalService"}</script>
  </head>`, 'https://www.northcarolinalegalservices.org/services/family')

  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.schemaTypes, ['LegalService'])
})

test('SEO HTML audit rejects preview canonicals, noindex, duplicate canonicals, and malformed JSON-LD', () => {
  const result = auditSeoHtml(`<!doctype html><head>
    <link rel="canonical" href="https://preview.krabiclaw.com/services/family">
    <link rel="canonical" href="https://www.northcarolinalegalservices.org/services/family">
    <meta name="robots" content="noindex,nofollow">
    <script type="application/ld+json">{broken}</script>
  </head>`, 'https://www.northcarolinalegalservices.org/services/family')

  assert.ok(result.errors.some(error => error.includes('exactly one canonical')))
  assert.ok(result.errors.some(error => error.includes('noindex')))
  assert.ok(result.errors.some(error => error.includes('malformed JSON-LD')))
})
