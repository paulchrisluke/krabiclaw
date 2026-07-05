import { queryAll, type DbClient } from '~/server/db'
import {
  PUBLIC_SUPPORT_FAQ_ENTRIES,
  PUBLIC_SUPPORT_ROUTE_METADATA,
  getDocPath,
  getPlatformBlogPath,
  type PublicSearchType,
} from '~/utils/public-support'

export interface PublicSearchResult {
  type: PublicSearchType
  title: string
  path: string
  snippet: string
  score: number
}

interface SearchOptions {
  limit?: number
  type?: PublicSearchType | 'all'
}

interface PlatformDocSearchRow {
  title: string
  slug: string
  body: string
  excerpt: string | null
  category: string | null
}

interface PlatformBlogSearchRow {
  title: string
  slug: string
  body: string
  excerpt: string | null
  category: string | null
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase()
}

function queryTerms(query: string) {
  return normalizeQuery(query).split(/\s+/).filter(term => term.length >= 2)
}

function stripMarkdown(value: string | null | undefined) {
  return (value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSnippet(text: string, query: string, fallback = '') {
  const source = stripMarkdown(text || fallback)
  if (!source) return ''
  const normalized = normalizeQuery(source)
  const needle = normalizeQuery(query)
  const at = normalized.indexOf(needle)
  if (at === -1) return source.slice(0, 180)
  const start = Math.max(0, at - 70)
  const end = Math.min(source.length, at + needle.length + 90)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < source.length ? '...' : ''
  return `${prefix}${source.slice(start, end).trim()}${suffix}`
}

function scoreCandidate(query: string, title: string, haystack: string, keywords: string[] = []) {
  const q = normalizeQuery(query)
  const terms = queryTerms(query)
  const lowerTitle = title.toLowerCase()
  const lowerHaystack = haystack.toLowerCase()
  const lowerKeywords = keywords.map(keyword => keyword.toLowerCase())
  let score = 0

  if (lowerTitle === q) score += 120
  else if (lowerTitle.startsWith(q)) score += 85
  else if (lowerTitle.includes(q)) score += 60

  if (lowerHaystack.includes(q)) score += 30

  for (const term of terms) {
    if (lowerTitle.includes(term)) score += 12
    if (lowerHaystack.includes(term)) score += 5
    if (lowerKeywords.some(keyword => keyword.includes(term))) score += 9
  }

  return score
}

export async function searchPublicResources(
  db: DbClient,
  query: string,
  options: SearchOptions = {},
): Promise<PublicSearchResult[]> {
  const normalized = normalizeQuery(query)
  if (!normalized) return []

  const type = options.type ?? 'all'
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const like = `%${normalized}%`
  const results: PublicSearchResult[] = []

  if (type === 'all' || type === 'doc') {
    const docs = await queryAll<PlatformDocSearchRow>(db, `
      SELECT title, slug, body, excerpt, category
      FROM platform_docs
      WHERE status = 'published'
        AND (
          lower(title) LIKE ?
          OR lower(coalesce(excerpt, '')) LIKE ?
          OR lower(body) LIKE ?
        )
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 20
    `, [like, like, like])

    for (const doc of docs ?? []) {
      const path = getDocPath(doc.category, doc.slug)
      if (!path) continue
      const haystack = `${doc.title} ${doc.excerpt ?? ''} ${stripMarkdown(doc.body)}`
      results.push({
        type: 'doc',
        title: doc.title,
        path,
        snippet: buildSnippet(doc.excerpt || doc.body, normalized),
        score: scoreCandidate(normalized, doc.title, haystack, [doc.category ?? '']) + 12,
      })
    }
  }

  if (type === 'all' || type === 'blog') {
    const posts = await queryAll<PlatformBlogSearchRow>(db, `
      SELECT title, slug, body, excerpt, category
      FROM blog_posts
      WHERE status = 'published'
        AND site_id IS NULL
        AND (
          lower(title) LIKE ?
          OR lower(coalesce(excerpt, '')) LIKE ?
          OR lower(body) LIKE ?
        )
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 20
    `, [like, like, like])

    for (const post of posts ?? []) {
      const path = getPlatformBlogPath(post.category, post.slug)
      if (!path) continue
      const haystack = `${post.title} ${post.excerpt ?? ''} ${stripMarkdown(post.body)}`
      results.push({
        type: 'blog',
        title: post.title,
        path,
        snippet: buildSnippet(post.excerpt || post.body, normalized),
        score: scoreCandidate(normalized, post.title, haystack, [post.category ?? '']) + 4,
      })
    }
  }

  if (type === 'all' || type === 'faq') {
    for (const faq of PUBLIC_SUPPORT_FAQ_ENTRIES) {
      const haystack = `${faq.title} ${faq.answer} ${faq.keywords.join(' ')}`
      const score = scoreCandidate(normalized, faq.title, haystack, faq.keywords)
      if (score <= 0) continue
      results.push({
        type: 'faq',
        title: faq.title,
        path: '/help',
        snippet: buildSnippet(faq.answer, normalized, faq.answer),
        score: score + 8,
      })
    }
  }

  if (type === 'all' || type === 'route') {
    for (const route of PUBLIC_SUPPORT_ROUTE_METADATA) {
      const haystack = `${route.title} ${route.snippet} ${route.keywords.join(' ')}`
      const score = scoreCandidate(normalized, route.title, haystack, route.keywords)
      if (score <= 0) continue
      results.push({
        type: 'route',
        title: route.title,
        path: route.path,
        snippet: route.snippet,
        score: score + 10,
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}

export function formatPublicSearchResultsForPrompt(results: PublicSearchResult[]) {
  return results.map((result, index) =>
    `${index + 1}. [${result.type}] ${result.title} (${result.path}) - ${result.snippet}`,
  ).join('\n')
}
