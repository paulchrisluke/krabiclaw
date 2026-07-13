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
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1])
      const nodes = Array.isArray(value) ? value : [value]
      for (const node of nodes) {
        const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']]
        schemaTypes.push(...types.filter(Boolean))
      }
    } catch {
      errors.push('malformed JSON-LD')
    }
  }
  if (!schemaTypes.length && !errors.includes('malformed JSON-LD')) errors.push('missing JSON-LD')
  return { errors, canonicalUrls, schemaTypes }
}
