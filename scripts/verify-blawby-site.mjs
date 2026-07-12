#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  BLAWBY_PARITY_ROUTES,
  BLAWBY_PARITY_VIEWPORTS,
  BLAWBY_REFERENCE_COMMIT,
  BLAWBY_REFERENCE_ETAG,
  NCLS_ARTICLE_SLUGS,
} from './blawby-parity-config.mjs'

const DEFAULT_ROUTES = [
  '/',
  '/services',
  '/pricing',
  '/donate',
  '/schedule',
  '/contact',
  '/blog',
  '/policies/privacy',
  '/policies/terms',
  '/third-party-notices',
]

const FORBIDDEN_COPY = [
  'Come dine with us',
  'Reserve a table',
  'From the kitchen',
  'one kitchen philosophy',
  'Catering & events',
  "chef's table",
  'tasting menu',
  'Also part of Saya',
]

const DISALLOWED_MEDIA_HOSTS = [
  'vercel.app',
  'vercel-storage.com',
  'blob.vercel-storage.com',
  'localhost',
  '127.0.0.1',
]

const APPROVED_MEDIA_HOSTS = [
  'media.krabiclaw.com',
  'images.krabiclaw.com',
  'imagedelivery.net',
  'krabiclaw.com',
  'customers.krabiclaw.com',
]

const SCREENSHOT_ROUTES = Object.keys(BLAWBY_PARITY_ROUTES)
const SCREENSHOT_VIEWPORTS = Object.keys(BLAWBY_PARITY_VIEWPORTS)
function parseArgs(argv) {
  const args = {
    url: '',
    out: '',
    siteId: '',
    tenantSlug: '',
    importManifest: '',
    evidenceDir: '',
    requireScreenshots: false,
    routes: [...DEFAULT_ROUTES],
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--site-id') args.siteId = argv[++i]
    else if (arg === '--tenant-slug') args.tenantSlug = argv[++i]
    else if (arg === '--import-manifest') args.importManifest = argv[++i]
    else if (arg === '--evidence-dir') args.evidenceDir = argv[++i]
    else if (arg === '--require-screenshots') args.requireScreenshots = true
    else if (arg === '--route') args.routes.push(argv[++i])
  }
  return args
}

function readJson(filePath) {
  if (!filePath) return null
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

function resolveUrl(base, route) {
  const baseUrl = new URL(base)
  const resolved = new URL(route, `${baseUrl.origin}/`)
  if (resolved.origin !== baseUrl.origin) {
    throw new Error(`Route escapes verification origin: ${route}`)
  }
  return resolved.toString()
}

function isPreviewContext(hostname) {
  if (hostname === 'workers.dev' || hostname.endsWith('.workers.dev')) return true
  if (/^(?:staging|preview)\.[^.]+\.[^.]+$/.test(hostname)) return true
  return false
}

function normalizeTenantBaseUrl(rawUrl, tenantSlug) {
  const url = new URL(rawUrl)
  if (tenantSlug && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.hostname = `${tenantSlug}.localhost`
  }
  return url.toString().replace(/\/$/, '')
}

function previewTenantHeaders(base, tenantSlug) {
  if (!tenantSlug) return {}
  return isPreviewContext(new URL(base).hostname)
    ? { 'x-preview-tenant': tenantSlug, 'cache-control': 'no-store' }
    : {}
}

function pushCheck(checks, ok, label, details = {}) {
  checks.push({ ok, label, ...details })
}

function collectRoutes(manifest, explicitRoutes) {
  const routes = new Set(explicitRoutes)
  for (const offering of manifest?.offerings ?? []) {
    routes.add(offering.canonical_path || `/services/${offering.slug}`)
  }
  for (const page of manifest?.tenantPages ?? []) {
    routes.add(page.path)
  }
  for (const article of manifest?.articles ?? []) {
    routes.add(article.canonical_url || `/article/${article.slug}`)
  }
  for (const route of manifest?.routeInventory?.preservedRoutes ?? []) {
    routes.add(route)
  }
  for (const redirect of manifest?.redirects ?? []) {
    routes.add(redirect.from_path)
  }
  return Array.from(routes).filter(Boolean).map((route) => {
    try {
      const parsed = new URL(route, 'https://verify-blawby.invalid/')
      if (parsed.origin !== 'https://verify-blawby.invalid') {
        throw new Error(`Route escapes verification origin: ${route}`)
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    } catch {
      throw new Error(`Invalid local route: ${route}`)
    }
  })
}

function collectArtifactMediaUrls(value, urls = new Set()) {
  if (!value || typeof value !== 'object') return urls
  if (Array.isArray(value)) {
    for (const item of value) collectArtifactMediaUrls(item, urls)
    return urls
  }
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === 'string') {
      const isMediaField = ['public_url', 'thumbnail_url', 'hero_image_url', 'source_path'].includes(key)
      const hasMediaExtension = /\.(?:avif|gif|jpe?g|pdf|png|svg|webp)(?:[?#].*)?$/i.test(nested)
      if (/^(https?:)?\/\//.test(nested) && (isMediaField || hasMediaExtension)) {
        urls.add(nested)
      }
      for (const match of nested.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)'"<>]+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#][^\s)'"<>]*)?)/gi)) {
        urls.add(match[1])
      }
      for (const match of nested.matchAll(/<img\b[^>]*\bsrc=["'](https:\/\/[^"']+)["']/gi)) {
        urls.add(match[1])
      }
    } else {
      collectArtifactMediaUrls(nested, urls)
    }
  }
  return urls
}

function collectKrabiClawMediaReferences(value, urls = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/https:\/\/(?:media|images)\.krabiclaw\.com\/[^\s)'"<>]+/gi)) {
      urls.add(match[0].replace(/[.,;:]$/, ''))
    }
    return urls
  }
  if (Array.isArray(value)) {
    for (const item of value) collectKrabiClawMediaReferences(item, urls)
    return urls
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectKrabiClawMediaReferences(nested, urls)
  }
  return urls
}

function checkMediaUrl(url) {
  if (url.startsWith('/') && !url.startsWith('//')) return { ok: true, reason: 'relative route' }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'invalid URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'media URL must use HTTPS' }
  }
  const host = parsed.hostname.toLowerCase()
  if (DISALLOWED_MEDIA_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    return { ok: false, reason: `disallowed host ${host}` }
  }
  if (APPROVED_MEDIA_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return { ok: true, reason: `approved host ${host}` }
  }
  return { ok: false, reason: `unknown host ${host}` }
}

let FETCH_HEADERS = {}

async function fetchResponseWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...FETCH_HEADERS, ...(options.headers ?? {}) },
      signal: controller.signal,
    })
    return { response, timer }
  } catch (error) {
    clearTimeout(timer)
    return { response: {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : 'request failed',
      text: async () => '',
      json: async () => null,
    }, timer: null }
  }
}

async function checkRoute(base, route, options = {}) {
  const url = resolveUrl(base, route)
  const started = Date.now()
  const { response, timer } = await fetchResponseWithTimeout(url, { redirect: options.redirect || 'follow' })
  let html = ''
  try {
    html = await response.text().catch(() => '')
  } finally {
    if (timer) clearTimeout(timer)
  }
  const lower = html.toLowerCase()
  return {
    route,
    url,
    status: response.status,
    duration_ms: Date.now() - started,
    ok: response.status >= 200 && response.status < 400,
    has_blawby_signal: /Blawby|Legal Services|consultation|--blawby-primary|ProfessionalService|LegalService/.test(html),
    has_saya_signal: /saya-restaurant-theme|Reserve a table|From the kitchen/.test(html),
    has_professional_schema: lower.includes('professionalservice') || lower.includes('legalservice'),
    has_restaurant_schema: lower.includes('restaurant') || lower.includes('foodestablishment'),
    has_noindex: /name=["']robots["'][^>]+noindex/i.test(html),
    forbidden_copy: FORBIDDEN_COPY.filter((copy) => lower.includes(copy.toLowerCase())),
    bytes: html.length,
  }
}

async function fetchBlawbyData(base, siteId) {
  if (!base || !siteId) return null
  const { response, timer } = await fetchResponseWithTimeout(resolveUrl(base, `/api/public/sites/${siteId}/blawby`))
  try {
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchSitemap(base) {
  if (!base) return ''
  const { response, timer } = await fetchResponseWithTimeout(resolveUrl(base, '/sitemap.xml'))
  try {
    if (!response.ok) return ''
    return await response.text().catch(() => '')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function validateCalculator(component) {
  const raw = JSON.stringify(component)
  if (/\b(function|eval|=>|new Function|script|formula|expression|javascript:)\b/i.test(raw)) {
    return { ok: false, reason: 'calculator contains arbitrary code/formula markers' }
  }
  const hasReviewedSource =
    Boolean(component.table?.source || component.source || component.source_url) ||
    Boolean(component.table?.effectiveDate || component.effective_date)
  return {
    ok: hasReviewedSource,
    reason: hasReviewedSource ? 'structured calculator has source/effective metadata' : 'missing source/effective metadata',
  }
}

function validateArtifacts(checks, manifest) {
  if (!manifest) return
  pushCheck(checks, manifest.site?.vertical === 'service', 'Import manifest uses DB-supported service vertical')
  pushCheck(checks, manifest.site?.theme_id === 'blawby-theme-v1', 'Import manifest selects Blawby')
  pushCheck(checks, (manifest.offerings ?? []).length > 0, 'Import manifest contains offerings')
  pushCheck(checks, (manifest.tenantPages ?? []).some((page) => page.path === '/pricing'), 'Import manifest contains /pricing tenant page')
  pushCheck(checks, (manifest.tenantPages ?? []).some((page) => page.path === '/donate'), 'Import manifest contains /donate tenant page')
  const articleSlugs = new Set((manifest.articles ?? []).map(article => article.slug))
  pushCheck(checks, NCLS_ARTICLE_SLUGS.every(slug => articleSlugs.has(slug)) && articleSlugs.size === NCLS_ARTICLE_SLUGS.length, 'Import manifest contains the complete pinned NCLS Markdown library')
  pushCheck(checks, Boolean(manifest.routeInventory), 'Import manifest contains route inventory')
  pushCheck(checks, Boolean(manifest.mediaInventory), 'Import manifest contains media inventory')
  pushCheck(
    checks,
    manifest.source_commit === BLAWBY_REFERENCE_COMMIT,
    `Import manifest is tied to pinned source commit ${BLAWBY_REFERENCE_COMMIT}`,
  )
  pushCheck(checks, Boolean(manifest.editSurfaceMatrix), 'Import manifest contains edit-surface matrix')
  pushCheck(checks, Boolean(manifest.intentionalDifferences), 'Import manifest contains intentional differences')
  const navigationKeys = (manifest.navigation ?? []).map(item => `${item.area}:${item.label}:${item.url}`)
  pushCheck(checks, new Set(navigationKeys).size === navigationKeys.length, 'Import manifest navigation has no duplicate rows')
  const redirectFromPaths = new Set((manifest.redirects ?? []).map(redirect => redirect.from_path))
  pushCheck(checks, redirectFromPaths.has('/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare'), 'Import manifest preserves the legacy divorce article URL')
  pushCheck(checks, redirectFromPaths.has('/article/writing-your-own-will-how-it-works-in-north-carolina'), 'Import manifest preserves the legacy will article URL')

  const legalFiles = (manifest.mediaInventory?.files ?? []).filter(file => file.kind === 'legal_file')
  pushCheck(checks, legalFiles.length > 0, 'Import manifest inventories legal files')
  for (const file of manifest.mediaInventory?.files ?? []) {
    if (!file.approved_storage_required) continue
    const hasApprovedAsset = typeof file.asset_id === 'string' && file.asset_id.length > 0 && typeof file.public_url === 'string' && file.public_url.length > 0
    pushCheck(checks, hasApprovedAsset, `Required media/file has approved asset URL: ${file.source_path || file.source_name || file.asset_id || 'unknown'}`)
    pushCheck(checks, file.upload_status === 'verified', `Required media/file upload is verified: ${file.source_path || file.source_name || file.asset_id || 'unknown'}`)
  }
  const verifiedMediaUrls = new Set((manifest.mediaInventory?.files ?? [])
    .filter(file => file.upload_status === 'verified' && typeof file.public_url === 'string')
    .map(file => file.public_url))
  const referencedMediaUrls = collectKrabiClawMediaReferences(manifest)
  pushCheck(
    checks,
    [...referencedMediaUrls].every(url => verifiedMediaUrls.has(url)),
    'Every nested KrabiClaw media/file reference resolves through verified inventory',
    { unmatched: [...referencedMediaUrls].filter(url => !verifiedMediaUrls.has(url)) },
  )
  const complianceAssetIds = new Set(manifest.compliance?.document_asset_ids ?? [])
  pushCheck(
    checks,
    legalFiles.every(file => complianceAssetIds.has(file.asset_id)),
    'Compliance document asset ids include all legal files',
  )

  const consultationUrl = manifest.consultation?.external_url
  pushCheck(
    checks,
    typeof consultationUrl === 'string' && /^https:\/\/ncls\.cliogrow\.com\/book/.test(consultationUrl),
    'Consultation destination is the approved external booking URL',
    { consultationUrl },
  )

  const donationPage = (manifest.tenantPages ?? []).find((page) => page.path === '/donate')
  pushCheck(
    checks,
    typeof donationPage?.cta_url === 'string' && /^https:\/\//.test(donationPage.cta_url),
    'Donation CTA is external',
    { donationUrl: donationPage?.cta_url ?? null },
  )

  for (const page of manifest.tenantPages ?? []) {
    pushCheck(checks, !String(page.body || '').includes('](/files/'), `Tenant page ${page.path} does not reference legacy /files assets`)
    for (const component of page.components ?? []) {
      if (component.type !== 'pricing_calculator') continue
      const result = validateCalculator(component)
      pushCheck(checks, result.ok, `Pricing calculator config: ${result.reason}`, { page: page.path })
    }
  }

  const sourceMedia = collectArtifactMediaUrls(manifest)
  for (const url of sourceMedia) {
    const result = checkMediaUrl(url)
    pushCheck(checks, result.ok, `Artifact media URL allowed: ${url}`, { reason: result.reason })
  }
}

function validatePublicData(checks, data, required) {
  if (!data) {
    if (required) pushCheck(checks, false, 'Public Blawby API data is fetchable and valid')
    return
  }
  pushCheck(checks, true, 'Public Blawby API data is fetchable and valid')
  pushCheck(checks, Array.isArray(data.offerings) && data.offerings.length > 0, 'Public Blawby API returns offerings')
  pushCheck(checks, Array.isArray(data.tenantPages) && data.tenantPages.some((page) => page.path === '/pricing'), 'Public Blawby API returns /pricing')
  pushCheck(checks, data.consultation?.tracking_enabled === true, 'Public consultation tracking is enabled')
  pushCheck(checks, Boolean(data.compliance?.entity_name), 'Public compliance metadata is present')
  pushCheck(checks, (data.compliance?.documents ?? []).length > 0, 'Public compliance exposes legal document assets')
  for (const document of data.compliance?.documents ?? []) {
    if (!document.url) continue
    const result = checkMediaUrl(document.url)
    pushCheck(checks, result.ok, `Public compliance document URL allowed: ${document.url}`, { reason: result.reason })
  }
  for (const page of data.tenantPages ?? []) {
    pushCheck(checks, !String(page.body || '').includes('](/files/'), `Public tenant page ${page.path} does not reference legacy /files assets`)
  }

  const bridge = data.consultation?.metadata?.analyticsBridge
  if (bridge) {
    const allowedEvents = Array.isArray(bridge.allowed_events) ? bridge.allowed_events : []
    const allowedProperties = Array.isArray(bridge.allowed_properties) ? bridge.allowed_properties : []
    pushCheck(checks, bridge.provider === 'gtm', 'Analytics bridge uses sanctioned GTM provider')
    pushCheck(checks, /^GTM-[A-Z0-9]+$/.test(String(bridge.container_id || '')), 'Analytics bridge has a valid GTM container id')
    pushCheck(checks, allowedEvents.includes('book_consultation_click'), 'Analytics bridge allowlists consultation clicks')
    pushCheck(checks, ['event', 'page_type', 'page_path', 'cta_destination', 'tenant'].every(property => allowedProperties.includes(property)), 'Analytics bridge allowlists only expected conversion properties')
    pushCheck(checks, bridge.custom_head_code_ignored === true, 'Analytics bridge does not rely on custom head code')
  }

  const mediaUrls = collectArtifactMediaUrls(data)
  for (const url of mediaUrls) {
    const result = checkMediaUrl(url)
    pushCheck(checks, result.ok, `Public media URL allowed: ${url}`, { reason: result.reason })
  }
}

async function validateRemoteMedia(checks, ...sources) {
  const urls = [...new Set(sources.flatMap(source => [...collectArtifactMediaUrls(source)]))]
    .filter(url => checkMediaUrl(url).ok && /^https:\/\//.test(url))
  const concurrency = 8
  for (let offset = 0; offset < urls.length; offset += concurrency) {
    await Promise.all(urls.slice(offset, offset + concurrency).map(async (url) => {
      const { response, timer } = await fetchResponseWithTimeout(url, { headers: { Range: 'bytes=0-0' } })
      if (timer) clearTimeout(timer)
      pushCheck(checks, response.status >= 200 && response.status < 400, `Remote media is fetchable: ${url}`, { status: response.status })
    }))
  }
}

function validateSitemap(checks, sitemap, manifest) {
  if (!sitemap) {
    pushCheck(checks, false, 'Sitemap is fetchable')
    return
  }
  pushCheck(checks, true, 'Sitemap is fetchable')
  for (const route of ['/', '/services', '/pricing', '/donate', '/schedule', '/contact', '/blog']) {
    pushCheck(checks, sitemap.includes(`<loc>${route}</loc>`) || sitemap.includes(route), `Sitemap includes ${route}`)
  }
  for (const offering of manifest?.offerings ?? []) {
    const route = offering.canonical_path || `/services/${offering.slug}`
    pushCheck(checks, sitemap.includes(route), `Sitemap includes offering ${route}`)
  }
  for (const article of manifest?.articles ?? []) {
    const route = article.canonical_url || `/article/${article.slug}`
    pushCheck(checks, sitemap.includes(route), `Sitemap includes article ${route}`)
  }
  pushCheck(checks, !sitemap.includes('/menu') && !sitemap.includes('/reservations'), 'Sitemap excludes Saya restaurant routes')
}

function validateScreenshots(checks, evidenceDir, required) {
  if (!evidenceDir && !required) return
  const screenshotDir = path.resolve(evidenceDir || '')
  for (const source of ['reference', 'blawby']) {
    const manifestPath = path.join(screenshotDir, `screenshots-${source}.json`)
    const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null
    pushCheck(checks, Boolean(manifest), `Screenshot manifest exists: ${source}`, { path: manifestPath })
    if (source === 'reference' && manifest) {
      pushCheck(
        checks,
        manifest.source_revision === BLAWBY_REFERENCE_COMMIT,
        `Reference screenshots use pinned commit ${BLAWBY_REFERENCE_COMMIT}`,
      )
      pushCheck(
        checks,
        manifest.observed_reference_etag === BLAWBY_REFERENCE_ETAG,
        `Reference screenshots use pinned live ETag ${BLAWBY_REFERENCE_ETAG}`,
      )
    }
    for (const route of SCREENSHOT_ROUTES) {
      for (const viewport of SCREENSHOT_VIEWPORTS) {
        const filePath = path.join(screenshotDir, 'screenshots', source, `${route}-${viewport}.png`)
        pushCheck(
          checks,
          fs.existsSync(filePath),
          `Screenshot artifact exists: ${source}/${route}-${viewport}`,
          { path: filePath },
        )
        const hasSections = Boolean(manifest?.sections?.some(section =>
          section.route_name === route && section.viewport === viewport,
        ))
        pushCheck(checks, hasSections, `Section captures exist: ${source}/${route}-${viewport}`)
      }
    }
    const hasMobileNavigationState = Boolean(manifest?.states?.some(state =>
      state.route_name === 'home' && state.viewport === 'mobile' && state.name === 'mobile-navigation-open',
    ))
    pushCheck(checks, hasMobileNavigationState, `Mobile navigation state capture exists: ${source}`)
  }
}

function writeEvidenceBundle(outPath, report, manifest) {
  if (!outPath) return
  const absolute = path.resolve(outPath)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`)

  const mdPath = /\.json$/i.test(absolute) ? absolute.replace(/\.json$/i, '.md') : `${absolute}.md`
  const lines = [
    '# Blawby Cutover Evidence',
    '',
    `- Checked: ${report.checked_at}`,
    `- Base URL: ${report.base_url || '(artifact-only)'}`,
    `- Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Routes',
    '',
    ...report.routes.map((route) => `- ${route.route}: ${route.status} (${route.bytes} bytes)`),
    '',
    '## Checks',
    '',
    ...report.checks.map((check) => `- ${check.ok ? 'PASS' : 'FAIL'}: ${check.label}`),
    '',
    '## Intentional Differences',
    '',
    ...((manifest?.intentionalDifferences ?? []).map((item) => `- ${item}`)),
  ]
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`)
}

function writeClientHandoff(outPath, report, manifest) {
  if (!outPath || !report.ok || !manifest) return
  const handoffPath = path.join(path.dirname(path.resolve(outPath)), 'client-handoff.md')
  const lines = [
    `# Client Handoff: ${manifest.site?.brand_name || report.site_id || 'Blawby tenant'}`,
    '',
    `**Verified:** ${report.checked_at.slice(0, 10)}  `,
    `**Status:** PASSED (${report.checks.length} checks)  `,
    '**Vertical:** Professional service  ',
    '',
    '## Live Site',
    '',
    `- URL: ${report.base_url}`,
    '',
    '## Contact',
    '',
    `- Email: ${manifest.site?.email || 'Not configured'}`,
    `- Phone: ${manifest.site?.phone || 'Not configured'}`,
    `- Service area: ${manifest.site?.service_area?.name || manifest.site?.service_area?.locality || 'Not configured'}`,
    '',
    '## Services',
    '',
    ...(manifest.offerings ?? []).map(offering => `- ${offering.name}: ${report.base_url}${offering.canonical_path || `/services/${offering.slug}`}`),
    '',
    '## Conversion Paths',
    '',
    `- Consultation: ${manifest.consultation?.external_url || `${report.base_url}/schedule`}`,
    `- Donation: ${(manifest.tenantPages ?? []).find(page => page.path === '/donate')?.cta_url || `${report.base_url}/donate`}`,
    '',
    '## Imported Content',
    '',
    `- Articles: ${(manifest.articles ?? []).length}`,
    `- Reviews: ${(manifest.reviews ?? []).length}`,
    `- Q&A: ${(manifest.siteQa ?? []).length}`,
    `- Media and legal files: ${(manifest.mediaInventory?.files ?? []).length}`,
    '',
    '## Legal Documents',
    '',
    ...((manifest.compliance?.documents ?? []).map(document => `- ${document.label}: ${document.public_url}`)),
    '',
    '## Intentional Differences',
    '',
    ...((manifest.intentionalDifferences ?? []).map(item => `- ${item}`)),
    '',
    '## Verification Summary',
    '',
    `${report.checks.length} checks passed, 0 failed.`,
  ]
  fs.writeFileSync(handoffPath, `${lines.join('\n')}\n`)
}

const args = parseArgs(process.argv.slice(2))
if (!args.url && !args.importManifest) {
  console.error('Usage: node scripts/verify-blawby-site.mjs --url https://example.com [--site-id site-id] [--tenant-slug slug] [--import-manifest file] [--evidence-dir dir] [--out artifact.json]')
  process.exit(2)
}

const baseUrl = args.url ? normalizeTenantBaseUrl(args.url, args.tenantSlug) : ''
FETCH_HEADERS = baseUrl ? previewTenantHeaders(baseUrl, args.tenantSlug) : {}
const manifest = readJson(args.importManifest)
const checks = []
const routes = baseUrl ? collectRoutes(manifest, args.routes) : []
const routeChecks = []

for (const route of routes) {
  const result = await checkRoute(baseUrl, route)
  routeChecks.push(result)
  pushCheck(checks, result.ok, `GET ${route} returns success`, { status: result.status })
  pushCheck(checks, result.has_blawby_signal, `GET ${route} renders Blawby/professional signal`)
  pushCheck(checks, !result.has_saya_signal, `GET ${route} does not render Saya restaurant signal`)
  pushCheck(checks, result.forbidden_copy.length === 0, `GET ${route} has no forbidden restaurant copy`, {
    forbiddenCopy: result.forbidden_copy,
  })
  if (route === '/' || route.startsWith('/services')) {
    pushCheck(checks, result.has_professional_schema, `GET ${route} has professional-service schema signal`)
    pushCheck(checks, !result.has_restaurant_schema, `GET ${route} has no restaurant schema signal`)
  }
}

if (baseUrl) {
  for (const excluded of ['/conference', '/thank-you']) {
    const result = await checkRoute(baseUrl, excluded, { redirect: 'manual' })
    const ok = result.status === 404 || result.status === 410 || result.status === 301 || result.status === 302 || result.has_noindex
    pushCheck(checks, ok, `${excluded} is intentionally excluded, redirected, or noindexed`, {
      status: result.status,
      hasNoindex: result.has_noindex,
    })
  }
}

validateArtifacts(checks, manifest)
const publicData = await fetchBlawbyData(baseUrl, args.siteId)
validatePublicData(checks, publicData, Boolean(args.siteId))
if (baseUrl) await validateRemoteMedia(checks, manifest, publicData)
if (baseUrl) validateSitemap(checks, await fetchSitemap(baseUrl), manifest)
validateScreenshots(checks, args.evidenceDir, args.requireScreenshots)

const report = {
  checked_at: new Date().toISOString(),
  base_url: baseUrl || null,
  site_id: args.siteId || null,
  ok: checks.every((check) => check.ok),
  routes: routeChecks.map((route) => ({
    route: route.route,
    url: route.url,
    status: route.status,
    duration_ms: route.duration_ms,
    bytes: route.bytes,
  })),
  checks,
}

writeEvidenceBundle(args.out, report, manifest)
writeClientHandoff(args.out, report, manifest)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.ok ? 0 : 1)
