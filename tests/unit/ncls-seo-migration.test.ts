import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createRequiredTypesForPath } from '../../scripts/utils/ncls-seo-schema-requirements.mjs'
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

test('professional-service verifier treats general site Q&A as fallback only on current visible-Q&A recipes', () => {
  const requiredTypesForPath = createRequiredTypesForPath({
    servicePathsWithFaqs: new Set(['/services/family']),
    sitePagesWithQa: new Set(['/contact']),
    generalSiteQaExists: true,
  })

  assert.deepEqual(requiredTypesForPath('/'), ['FAQPage'])
  assert.deepEqual(requiredTypesForPath('/services'), ['CollectionPage', 'BreadcrumbList', 'ItemList', 'FAQPage'])
  assert.deepEqual(requiredTypesForPath('/contact'), ['ContactPage', 'BreadcrumbList', 'FAQPage'])
  assert.deepEqual(requiredTypesForPath('/services/family'), ['LegalService', 'BreadcrumbList', 'FAQPage'])
  assert.deepEqual(requiredTypesForPath('/blog'), ['CollectionPage', 'BreadcrumbList', 'ItemList'])
})

test('0044 safely copies populated compliance rows and normalizes legacy nonprofit status', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE tenant_compliance (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
    entity_name TEXT, dba_name TEXT, entity_type TEXT, nonprofit_status TEXT,
    registration_number TEXT, service_area TEXT, disclaimer TEXT, footer_disclaimer TEXT,
    privacy_page_id TEXT, terms_page_id TEXT, notice_page_id TEXT, document_asset_ids TEXT,
    metadata_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
  );`)
  const insert = db.prepare(`INSERT INTO tenant_compliance VALUES (?, 'org', ?, 'Example', NULL, 'LegalService', ?, NULL, 'NC', NULL, NULL, NULL, NULL, NULL, '[]', '{}', '2026-01-01', '2026-01-01', NULL)`)
  insert.run('valid', 'site-valid', '501(c)(3)')
  insert.run('invalid', 'site-invalid', '501(c)(29)')

  db.exec(readFileSync('migrations/0044_fearless_spyke.sql', 'utf8').replaceAll('--> statement-breakpoint', ''))
  const rows = db.prepare('SELECT id, nonprofit_status, service_area_type, founder_name, same_as, contact_points, address_visibility FROM tenant_compliance ORDER BY id').all().map(row => ({ ...row }))

  assert.deepEqual(rows, [
    { id: 'invalid', nonprofit_status: null, service_area_type: null, founder_name: null, same_as: '[]', contact_points: '[]', address_visibility: 'hidden' },
    { id: 'valid', nonprofit_status: 'https://schema.org/Nonprofit501c3', service_area_type: null, founder_name: null, same_as: '[]', contact_points: '[]', address_visibility: 'hidden' },
  ])
  db.close()
})
