#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// This is deliberately target-specific.  It is the reviewed public/browser
// inventory for the last attributable production release whose checkout did
// not yet contain the current release verifier/spec.  Do not generalize this
// bridge or use it for another source SHA; a new target must carry its own
// verifier and inventory.
export const LEGACY_ROLLBACK_TARGET_SHA = '4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9'

const route = (path, content, identity = 'body', extra = {}) => ({
  path,
  expectedPath: extra.expectedPath ?? path,
  identity,
  content,
  allowRedirects: extra.allowRedirects ?? [],
})

function normalizeRoutes(baseUrl, routes) {
  const origin = new URL(baseUrl).origin
  return routes.map((entry) => ({
    ...entry,
    expectedOrigin: origin,
    allowRedirects: entry.allowRedirects.map(redirect => ({ ...redirect, origin })),
  }))
}

const PLATFORM_ROUTES = [
  route('/', 'Your local business'),
  route('/features', 'Features'),
  route('/help', 'How can we help'),
  route('/login', 'Sign in'),
  route('/signup', 'Create your account'),
  route('/forgot-password', 'Forgot password'),
  route('/oauth/login', 'Sign in'),
  route('/oauth/consent', 'Authorize'),
]

// These routes and copy are taken from the immutable pottery-house fixture and
// its public rendering sentinel at LEGACY_ROLLBACK_TARGET_SHA.
const SAYA_ROUTES = [
  route('/', 'Pottery House Krabi'),
  route('/about', 'Pottery House'),
  route('/contact', 'Get in touch'),
  route('/locations', 'Pottery House'),
  route('/experiences', 'Pottery Wheel Class'),
  route('/experiences/pottery-wheel-class', 'Shape something beautiful'),
  route('/experiences/cocktails-and-clay', 'Friday nights'),
  route('/experiences/beachfront-pottery', 'Throw on the wheel'),
  route('/experiences/monthly-membership', 'creative base'),
]

const BLAWBY_ROUTES = [
  route('/', 'Access to Justice for All'),
  route('/services', 'Our Services'),
  route('/services/family', 'Family law'),
  route('/about', 'About Us'),
  route('/pricing', 'Affordable, for everyone'),
  route('/contact', 'Contact Us'),
  route('/contact/confirmed', 'Message received'),
  route('/schedule', 'Request a Legal Consultation'),
  route('/blog', 'Our Blog'),
  route('/article/getting-a-divorce-in-north-carolina', 'Getting a Divorce in North Carolina'),
  route('/donate', 'Support Equal Access to Justice'),
  route('/policies/privacy', 'Privacy Policy'),
  route('/policies/terms', 'Terms of Use'),
  route('/third-party-notices', 'Third-Party Notices'),
  route('/article/divorce-and-children-in-north-carolina-what-to-expect-and-how-to-prepare', 'Getting a Divorce in North Carolina', 'body', {
    expectedPath: '/article/divorce-and-children-in-north-carolina',
    allowRedirects: [{ status: 301, path: '/article/divorce-and-children-in-north-carolina' }],
  }),
  route('/article/preparing-for-your-consultation', 'Preparing for Your Consultation', 'body', {
    expectedPath: '/article/preparing-for-your-consultation-with-north-carolina-legal-services',
    allowRedirects: [{ status: 301, path: '/article/preparing-for-your-consultation-with-north-carolina-legal-services' }],
  }),
  route('/article/property-division-in-north-carolina-divorce', 'Property Division', 'body', {
    expectedPath: '/article/property-division-in-north-carolina-divorce-protecting-whats-yours',
    allowRedirects: [{ status: 301, path: '/article/property-division-in-north-carolina-divorce-protecting-whats-yours' }],
  }),
  route('/article/writing-your-own-will-how-it-works-in-north-carolina', 'Writing Your Own Will', 'body', {
    expectedPath: '/article/writing-your-own-will-how-it-works',
    allowRedirects: [{ status: 301, path: '/article/writing-your-own-will-how-it-works' }],
  }),
]

function normalizeBaseUrl(value) {
  const url = new URL(String(value ?? ''))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Legacy rollback inventory base URL must be an origin without credentials, query, or hash')
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

function surface(baseUrl, tenantSlug, routes) {
  const root = new URL(baseUrl)
  const preview = isPreviewLikeHost(root.hostname)
  if (!preview) root.hostname = `${tenantSlug}.${root.hostname}`
  return {
    name: tenantSlug === 'pottery-house' ? 'saya' : 'blawby',
    baseUrl: root.toString().replace(/\/$/, ''),
    headers: preview ? { 'x-preview-tenant': tenantSlug } : {},
    routes: normalizeRoutes(root.toString(), routes),
  }
}

export function buildLegacyRollbackRouteInventory(baseUrl) {
  const rootBaseUrl = normalizeBaseUrl(baseUrl)
  return {
    schemaVersion: 2,
    inventoryKind: 'legacy-rollback-reviewed',
    targetSourceSha: LEGACY_ROLLBACK_TARGET_SHA,
    rootBaseUrl,
    requiredSurfaces: ['platform', 'saya', 'blawby'],
    surfaces: [
      { name: 'platform', baseUrl: rootBaseUrl, headers: {}, routes: normalizeRoutes(rootBaseUrl, PLATFORM_ROUTES) },
      surface(rootBaseUrl, 'pottery-house', SAYA_ROUTES),
      surface(rootBaseUrl, 'ncls', BLAWBY_ROUTES),
    ],
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

async function main(argv = process.argv.slice(2)) {
  let baseUrl
  let output
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--base-url') {
      baseUrl = requiredValue(argv, index, option)
      index += 1
    } else if (option === '--output') {
      output = resolve(requiredValue(argv, index, option))
      index += 1
    } else if (option === '--help' || option === '-h') {
      console.log('Usage: node scripts/legacy-rollback-route-inventory-4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9.mjs --base-url URL [--output FILE]')
      return
    } else {
      throw new Error(`Unknown option: ${option}`)
    }
  }
  if (!baseUrl) throw new Error('--base-url is required')
  const serialized = `${JSON.stringify(buildLegacyRollbackRouteInventory(baseUrl), null, 2)}\n`
  if (output) {
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, serialized, 'utf8')
  }
  process.stdout.write(serialized)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
