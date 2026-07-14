import { normalizeNonprofitStatus } from './nonprofit-status.mjs'

const SOURCE_ORIGIN = 'https://www.northcarolinalegalservices.org'

function normalizePath(value) {
  const url = new URL(value, SOURCE_ORIGIN)
  if (url.origin !== SOURCE_ORIGIN) throw new Error(`Unexpected SEO source origin: ${url.origin}`)
  return url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')
}

function normalizeDestination(value) {
  const url = new URL(value, SOURCE_ORIGIN)
  return url.origin === SOURCE_ORIGIN ? normalizePath(value) : url.toString()
}

export function parseSitemapXml(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(match => match[1])
}

export function parseSearchConsoleCsv(csv) {
  return csv.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const comma = line.indexOf(',')
    return (comma === -1 ? line : line.slice(0, comma)).replace(/^"|"$/g, '')
  })
}

export function buildSeoMigrationContract({ sitemapUrls, searchConsoleUrls, routeManifest }) {
  const sourceUrls = [...new Set(sitemapUrls.map(normalizePath))].sort()
  const indexedUrls = [...new Set(searchConsoleUrls.map(normalizePath))].sort()
  const outcomes = new Map()

  for (const path of routeManifest.preservedRoutes ?? []) outcomes.set(normalizePath(path), { behavior: 'preserve' })
  for (const redirect of routeManifest.redirects ?? []) {
    outcomes.set(normalizePath(redirect.from_path), redirect.behavior === 'gone'
      ? { behavior: 'gone', statusCode: 410 }
      : {
          behavior: 'redirect',
          statusCode: redirect.status_code,
          destination: normalizeDestination(redirect.to_path),
        })
  }
  for (const exclusion of routeManifest.intentionalExclusions ?? []) {
    if (exclusion.behavior === 'gone') outcomes.set(normalizePath(exclusion.path), { behavior: 'gone', statusCode: 410 })
  }

  const required = [...new Set([...sourceUrls, ...indexedUrls])].sort()
  return {
    sourceUrls,
    indexedUrls,
    outcomes,
    unclassified: required.filter(path => !outcomes.has(path)),
  }
}

/**
 * Flattens a parsed JSON-LD value into its constituent nodes, descending into
 * top-level `@graph` arrays (the shape utils/professional-service-schema.ts
 * emits) as well as bare top-level arrays/objects (used by legacy/platform
 * schema composables).
 */
function flattenSchemaNodes(value) {
  if (Array.isArray(value)) return value.flatMap(flattenSchemaNodes)
  if (value && typeof value === 'object') {
    if (Array.isArray(value['@graph'])) return value['@graph'].flatMap(flattenSchemaNodes)
    return [value]
  }
  return []
}

export function auditSeoHtml(html, expectedCanonical) {
  const errors = []
  const canonicalUrls = [...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match => match[1])
  if (canonicalUrls.length !== 1) errors.push(`expected exactly one canonical, found ${canonicalUrls.length}`)
  else if (canonicalUrls[0] !== expectedCanonical) errors.push(`canonical ${canonicalUrls[0]} does not match ${expectedCanonical}`)

  const robots = [...html.matchAll(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/gi)].map(match => match[1])
  if (robots.some(value => /noindex/i.test(value))) errors.push('indexable page emits noindex')

  if (!/<title>\s*[^<]+\s*<\/title>/i.test(html)) errors.push('missing title')
  if (!/<meta\b(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["'][^"']+["'][^>]*>/i.test(html)) errors.push('missing meta description')

  const schemaTypes = []
  const schemaIds = []
  /** @type {Array<Record<string, unknown>>} */
  const schemaNodes = []
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1])
      const nodes = flattenSchemaNodes(value)
      for (const node of nodes) {
        const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']]
        schemaTypes.push(...types.filter(Boolean))
        if (typeof node?.['@id'] === 'string') schemaIds.push(node['@id'])
        schemaNodes.push(node)
      }
    } catch {
      errors.push('malformed JSON-LD')
    }
  }
  if (!schemaTypes.length && !errors.includes('malformed JSON-LD')) errors.push('missing JSON-LD')

  // Canonical contract: any nonprofitStatus value emitted anywhere on the
  // page must already be normalized to a schema.org enum URL (see
  // utils/professional-service-schema.ts normalizeNonprofitStatus) — never
  // free text like "501(c)(3)".
  for (const node of schemaNodes) {
    if (typeof node?.nonprofitStatus === 'string') {
      const normalized = normalizeNonprofitStatus(node.nonprofitStatus)
      if (!normalized.valid) {
        errors.push(`invalid nonprofitStatus value "${node.nonprofitStatus}" (expected a schema.org enum URL like https://schema.org/Nonprofit501c3)`)
      } else if (node.nonprofitStatus !== normalized.value) {
        errors.push(`nonprofitStatus "${node.nonprofitStatus}" is not in canonical form (expected "${normalized.value}")`)
      }
    }
  }

  return { errors, canonicalUrls, schemaTypes, schemaIds, schemaNodes }
}
