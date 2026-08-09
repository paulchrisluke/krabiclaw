#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NCLS_ARTICLE_SLUGS } from './blawby-parity-config.mjs'

export const REQUIRED_RELEASE_SURFACES = Object.freeze(['platform', 'saya', 'blawby'])

// Public release routes are derived from the checked-in fixture/sitemap sources
// and the reviewed NCLS route manifest. Authenticated dashboard/CMS/billing/
// Pages coverage belongs to the locked full staging E2E lane; this inventory is
// the immutable public renderer gate used again after promotion and rollback.
const route = (path, content, identity = 'body', extra = {}) => Object.freeze({
  path,
  expectedPath: extra.expectedPath ?? path,
  identity,
  content,
  allowRedirects: Object.freeze(extra.allowRedirects ?? []),
})

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

function fixtureSectionSlugs(fileName, startMarker, endMarker) {
  const source = readFileSync(resolve(REPO_ROOT, 'seed-definitions', fileName), 'utf8')
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Unable to derive ${startMarker} route source from ${fileName}`)
  return [...source.slice(start, end).matchAll(/\bslug:\s*['"]([^'"]+)['"]/g)].map(match => match[1])
}

function fixtureSectionIds(fileName, startMarker, endMarker, prefix) {
  const source = readFileSync(resolve(REPO_ROOT, 'seed-definitions', fileName), 'utf8')
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`Unable to derive ${startMarker} route source from ${fileName}`)
  const endMarkers = Array.isArray(endMarker) ? endMarker : [endMarker]
  const end = Math.min(...endMarkers
    .map(marker => source.indexOf(marker, start + startMarker.length))
    .filter(index => index >= 0))
  if (!Number.isFinite(end)) throw new Error(`Unable to derive ${startMarker} route source from ${fileName}`)
  return [...source.slice(start, end).matchAll(new RegExp(`\\bid:\\s*['"](${prefix}[^'"]+)['"]`, 'g'))].map(match => match[1])
}

function fixtureLocationSlugs(fileName) {
  return fixtureSectionSlugs(fileName, 'locations:', 'experiences:')
}

function fixtureMenuItemSlugs(fileName) {
  const menuSlugs = fixtureSectionSlugs(fileName, 'menus:', 'locationQa:')
  if (menuSlugs.length > 0) return menuSlugs
  const source = readFileSync(resolve(REPO_ROOT, 'seed-definitions', fileName), 'utf8')
  const declaration = source.match(/\bconst\s+\w+MenuItems\b[^=]*=\s*\[/)
  const fixtureStart = source.search(/\bexport\s+const\s+\w+Fixture\b/)
  if (!declaration || fixtureStart < 0 || declaration.index === undefined || declaration.index >= fixtureStart) {
    return []
  }
  return [...source.slice(declaration.index, fixtureStart).matchAll(/\bslug:\s*['"]([^'"]+)['"]/g)].map(match => match[1])
}

function fixtureLocationIdsToSlugs(fileName) {
  const source = readFileSync(resolve(REPO_ROOT, 'seed-definitions', fileName), 'utf8')
  const start = source.indexOf('locations:')
  const end = source.indexOf('experiences:', start + 'locations:'.length)
  if (start < 0 || end < 0) throw new Error(`Unable to derive location route source from ${fileName}`)
  const locations = new Map()
  for (const match of source.slice(start, end).matchAll(/\{\s*id:\s*['"]([^'"]+)['"][\s\S]{0,260}?slug:\s*['"]([^'"]+)['"]/g)) {
    locations.set(match[1], match[2])
  }
  return locations
}

function fixtureReviewRoutes(fileName) {
  const source = readFileSync(resolve(REPO_ROOT, 'seed-definitions', fileName), 'utf8')
  const start = source.indexOf('reviews:')
  const end = source.indexOf('menus:', start + 'reviews:'.length)
  if (start < 0 || end < 0) throw new Error(`Unable to derive review route source from ${fileName}`)
  const locationSlugs = fixtureLocationIdsToSlugs(fileName)
  const routes = []
  for (const match of source.slice(start, end).matchAll(/\{\s*id:\s*['"]((?:review|rev|gplaces)-[^'"]+)['"][\s\S]{0,360}?locationId:\s*['"]([^'"]+)['"]/g)) {
    const locationSlug = locationSlugs.get(match[2])
    if (locationSlug) routes.push({ reviewId: match[1], locationSlug })
  }
  return routes
}

function contentForSayaPath(path, brandName) {
  if (path === '/') return brandName
  if (path.includes('/menu')) return 'Menu'
  if (path.includes('/experiences')) return 'Experiences'
  if (path.includes('/locations')) return 'Locations'
  if (path.includes('/reviews')) return 'Reviews'
  if (path.includes('/qa')) return 'Questions'
  if (path.includes('/photos')) return 'Photos'
  if (path.includes('/posts') || path.includes('/blog')) return brandName
  if (path.includes('/contact')) return 'Contact'
  return brandName
}

function sayaFixtureRoutes(fileName, brandName, locationSlugs = fixtureLocationSlugs(fileName), identity = 'body') {
  const experienceSlugs = fixtureSectionSlugs(fileName, 'experiences:', 'reviews:')
  const menuItemSlugs = fixtureMenuItemSlugs(fileName)
  const postIds = fixtureSectionIds(fileName, 'posts:', ['tenantPageLocaleFields:', 'publicRoutes:', 'aiCredits:'], 'post-')
  const reviewRoutes = fixtureReviewRoutes(fileName)
  const paths = new Map()
  const add = (path, extra = {}) => {
    if (!paths.has(path)) paths.set(path, route(path, contentForSayaPath(path, brandName), identity, extra))
  }

  for (const path of ['/', '/about', '/menu', '/order', '/reviews', '/qa', '/photos', '/posts', '/blog', '/experiences', '/reservations', '/contact', '/locations']) add(path)
  for (const location of locationSlugs) {
    add(`/locations/${location}`)
    for (const subpage of ['photos', 'menu', 'reviews', 'qa', 'contact', 'experiences', 'posts', 'reservations', 'review-submit']) add(`/locations/${location}/${subpage}`)
  }
  for (const { reviewId, locationSlug } of reviewRoutes) add(`/locations/${locationSlug}/reviews/${reviewId}`)
  for (const slug of experienceSlugs) add(`/experiences/${slug}`)
  for (const slug of menuItemSlugs) add(`/menu/${slug}`)
  for (const slug of postIds) {
    add(`/blog/${slug}`)
    add(`/posts/${slug}`)
  }
  return [...paths.values()]
}

const NCLS_SERVICE_ROUTES = [
  ['/services/family', 'Family law'],
  ['/services/small-business-and-nonprofits', 'Small business'],
  ['/services/employment', 'Employment'],
  ['/services/tenant-rights', 'Tenant rights'],
  ['/services/probate-and-estate', 'Probate and estate'],
  ['/services/special-education-and-iep-advocacy', 'Special education'],
]

const PLATFORM_DOC_ROUTES = [
  ['/docs/getting-started/getting-started-with-krabiclaw', 'Getting started with KrabiClaw'],
  ['/docs/getting-started/deploy-your-site', 'Deploy your first KrabiClaw site'],
  ['/docs/getting-started/customize-brand-theme', 'Set a brand color'],
  ['/docs/getting-started/invite-your-team', 'Invite team members'],
  ['/docs/getting-started/set-up-notifications', 'Choose how KrabiClaw alerts you'],
  ['/docs/integrations/mcp-setup', 'Connect KrabiClaw to ChatGPT'],
]

const NCLS_REDIRECTS = [
  ['/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', '/article/divorce-and-children-in-north-carolina'],
  ['/article/preparing-for-your-consultation', '/article/preparing-for-your-consultation-with-north-carolina-legal-services'],
  ['/article/property-division-in-north-carolina-divorce', '/article/property-division-in-north-carolina-divorce-protecting-whats-yours'],
  ['/article/writing-your-own-will-how-it-works-in-north-carolina', '/article/writing-your-own-will-how-it-works'],
]

function nclsArticleCopy(slug) {
  return slug === 'getting-a-divorce-in-north-carolina'
    ? 'Getting a Divorce in North Carolina'
    : 'North Carolina'
}

function nclsRoutes() {
  const routes = [
    route('/', 'Access to Justice for All'),
    route('/about', 'About Us'),
    route('/services', 'Our Services'),
    ...NCLS_SERVICE_ROUTES.map(([path, content]) => route(path, content)),
    route('/pricing', 'Affordable, for everyone'),
    route('/contact', 'Contact Us'),
    route('/contact/confirmed', 'Message received'),
    route('/schedule', 'Request a Legal Consultation'),
    route('/blog', 'Our Blog'),
    route('/donate', 'Support Equal Access to Justice'),
    route('/policies/privacy', 'Privacy Policy'),
    route('/policies/terms', 'Terms of Use'),
    route('/third-party-notices', 'Third-Party Notices'),
    ...NCLS_ARTICLE_SLUGS.map(slug => route(`/article/${slug}`, nclsArticleCopy(slug))),
  ]
  for (const [from, to] of NCLS_REDIRECTS) {
    routes.push(route(from, 'North Carolina', 'body', {
      expectedPath: to,
      allowRedirects: [{ status: 301, path: to }],
    }))
  }
  return routes
}

const SURFACE_DEFINITIONS = Object.freeze([
  {
    name: 'platform',
    routes: [
      route('/', 'Your local business'), route('/features', 'Features'), route('/pricing', 'Pricing'),
      route('/about', 'About'), route('/templates', 'Templates'), route('/templates/saya', 'Saya'), route('/templates/blawby', 'Blawby'),
      route('/plugin', 'KrabiClaw for ChatGPT'),
      route('/help', 'How can we help'), route('/docs', 'Documentation'), route('/blog', 'Local AI Growth Notes'),
      route('/privacy', 'Privacy'), route('/terms', 'Terms'), route('/policies/privacy', 'Privacy'),
      route('/policies/terms', 'Terms'), route('/login', 'Sign in'), route('/signup', 'Create your account'),
      route('/forgot-password', 'Forgot password'), route('/reset-password', 'Reset password'), route('/oauth/login', 'Sign in'),
      route('/oauth/consent', 'Authorize'), route('/third-party-notices', 'Third-party notices'),
      ...PLATFORM_DOC_ROUTES.map(([path, content]) => route(path, content)),
    ],
  },
  {
    name: 'saya',
    tenantSlug: 'demo',
    routes: sayaFixtureRoutes('demo.ts', 'Ember & Slice', ['brooklyn', 'west-village']),
    variants: [
      { name: 'pottery-house', tenantSlug: 'pottery-house', routes: sayaFixtureRoutes('pottery-house.ts', 'Pottery House') },
      { name: 'kikuzuki', tenantSlug: 'kikuzuki-krabi-thailand', routes: sayaFixtureRoutes('kikuzuki.ts', 'Kikuzuki') },
    ],
  },
  {
    name: 'blawby',
    tenantSlug: 'ncls',
    routes: nclsRoutes(),
  },
])

function normalizeBaseUrl(value) {
  let url
  try {
    url = new URL(String(value ?? ''))
  } catch {
    throw new Error(`Release route inventory base URL is invalid: ${value}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Release route inventory base URL must use HTTP(S): ${value}`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Release route inventory base URL may not contain credentials, query, or hash')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

function isPreviewLikeHost(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname.endsWith('.localhost')
    || hostname === 'workers.dev'
    || hostname.endsWith('.workers.dev')
    || /^(?:staging|preview)\.[^.]+\.[^.]+$/.test(hostname)
}

function surfaceBaseUrl(rootBaseUrl, tenantSlug) {
  if (!tenantSlug) return rootBaseUrl
  const url = new URL(rootBaseUrl)
  if (isPreviewLikeHost(url.hostname)) return rootBaseUrl
  url.hostname = `${tenantSlug}.${url.hostname}`
  return url.toString().replace(/\/$/, '')
}

function surfaceHeaders(rootBaseUrl, tenantSlug) {
  if (!tenantSlug || !isPreviewLikeHost(new URL(rootBaseUrl).hostname)) return {}
  return { 'x-preview-tenant': tenantSlug }
}

function normalizeRedirects(baseUrl, redirects) {
  if (!Array.isArray(redirects)) return []
  return redirects.map((redirect) => {
    if (!redirect || typeof redirect !== 'object') throw new Error('Release route redirect must be an object')
    const status = Number(redirect.status)
    if (![301, 302, 303, 307, 308].includes(status)) throw new Error(`Unsupported release route redirect status: ${redirect.status}`)
    const path = String(redirect.path ?? '')
    if (!path.startsWith('/')) throw new Error(`Release route redirect path must begin with '/': ${path}`)
    if (path.includes('?') || path.includes('#')) throw new Error(`Release route redirect path may not contain a query or hash: ${path}`)
    return Object.freeze({ status, origin: new URL(baseUrl).origin, path })
  })
}

function normalizeRouteDefinition(baseUrl, definition) {
  const path = String(definition.path ?? '')
  if (!path.startsWith('/')) throw new Error(`Release route must begin with '/': ${path}`)
  if (path.includes('?') || path.includes('#')) throw new Error(`Release route may not contain a query or hash: ${path}`)
  const expectedPath = String(definition.expectedPath ?? path)
  if (!expectedPath.startsWith('/')) throw new Error(`Release route expectedPath must begin with '/': ${expectedPath}`)
  if (expectedPath.includes('?') || expectedPath.includes('#')) throw new Error(`Release route expectedPath may not contain a query or hash: ${expectedPath}`)
  if (typeof definition.identity !== 'string' || !definition.identity.trim()) throw new Error(`Release route ${path} must define an identity selector`)
  if (typeof definition.content !== 'string' || !definition.content.trim()) throw new Error(`Release route ${path} must define expected content`)
  return {
    path,
    expectedOrigin: new URL(baseUrl).origin,
    expectedPath,
    identity: definition.identity,
    content: definition.content,
    allowRedirects: normalizeRedirects(baseUrl, definition.allowRedirects),
  }
}

export function buildReleaseRouteInventory(baseUrl) {
  const rootBaseUrl = normalizeBaseUrl(baseUrl)
  return {
    schemaVersion: 2,
    rootBaseUrl,
    requiredSurfaces: [...REQUIRED_RELEASE_SURFACES],
    surfaces: SURFACE_DEFINITIONS.map((definition) => {
      const baseUrlForSurface = surfaceBaseUrl(rootBaseUrl, definition.tenantSlug)
      const normalizeTarget = (targetDefinition, targetName, targetBaseUrl, targetTenantSlug) => ({
        name: targetName,
        baseUrl: targetBaseUrl,
        headers: surfaceHeaders(rootBaseUrl, targetTenantSlug),
        routes: targetDefinition.routes.map(routeDefinition => normalizeRouteDefinition(targetBaseUrl, routeDefinition)),
      })
      return {
        name: definition.name,
        baseUrl: baseUrlForSurface,
        headers: surfaceHeaders(rootBaseUrl, definition.tenantSlug),
        routes: definition.routes.map(routeDefinition => normalizeRouteDefinition(baseUrlForSurface, routeDefinition)),
        ...(definition.variants?.length
          ? {
              variants: definition.variants.map(variant => normalizeTarget(
                variant,
                variant.name,
                surfaceBaseUrl(rootBaseUrl, variant.tenantSlug),
                variant.tenantSlug,
              )),
            }
          : {}),
      }
    }),
  }
}

function requiredOption(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

async function main(argv = process.argv.slice(2)) {
  let baseUrl
  let outputPath
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--base-url') {
      baseUrl = requiredOption(argv, index, option)
      index += 1
    } else if (option === '--output' || option === '--output-json') {
      outputPath = requiredOption(argv, index, option)
      index += 1
    } else if (option === '--help' || option === '-h') {
      console.log('Usage: node scripts/release-route-inventory.mjs --base-url URL [--output FILE]')
      return
    } else {
      throw new Error(`Unknown option: ${option}`)
    }
  }
  if (!baseUrl) throw new Error('--base-url is required')
  const inventory = buildReleaseRouteInventory(baseUrl)
  const serialized = `${JSON.stringify(inventory, null, 2)}\n`
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized, 'utf8')
  }
  process.stdout.write(serialized)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
