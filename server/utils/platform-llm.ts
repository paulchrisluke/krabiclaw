import { createError, getRequestURL, type H3Event } from 'h3'
import { queryAll, queryFirst, type DbClient } from '../db/index.ts'
import {
  listContentComponents,
  resolveContentComponentsMedia,
  type PlatformFaqComponentData,
  type PlatformHowToComponentData,
  type PlatformContentComponent,
} from './platform-content.ts'
import { blogCategoryToSlug, slugToBlogCategory } from '../../utils/blog-categories.ts'
import { categoryToSlug, slugToCategory } from '../../utils/docs-categories.ts'

const COMPONENT_EMBED_REGEX = /\{\{\s*component\s+type\s*=\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+))\s*\}\}/g

interface PlatformLlmDocSummary {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  category?: string | null
  difficulty_level?: string | null
  canonical_url?: string | null
  seo_description?: string | null
  published_at?: string | null
  updated_at?: string | null
}

interface PlatformLlmDocDetail extends PlatformLlmDocSummary {
  body: string
  components: PlatformContentComponent[]
}

interface PlatformLlmBlogSummary {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  category?: string | null
  canonical_url?: string | null
  seo_description?: string | null
  published_at?: string | null
  updated_at?: string | null
  author_name?: string | null
}

interface PlatformLlmBlogDetail extends PlatformLlmBlogSummary {
  body: string
  components: PlatformContentComponent[]
}

export interface PlatformLlmLinkEntry {
  title: string
  path: string
  markdownPath: string
  canonicalUrl: string
  summary: string
  category?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  difficultyLevel?: string | null
  authorName?: string | null
}

function normalizeWhitespace(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeYamlString(value: string | null | undefined) {
  return JSON.stringify(String(value ?? ''))
}

function safeSummary(value: string | null | undefined, fallback: string) {
  const normalized = normalizeWhitespace(value)
  return normalized || fallback
}

function normalizePath(value: string) {
  return value.startsWith('/') ? value : `/${value}`
}

function absoluteUrl(origin: string, path: string) {
  return new URL(normalizePath(path), origin).toString()
}

function optionalFrontMatterLine(key: string, value: string | null | undefined) {
  const normalized = normalizeWhitespace(value)
  return normalized ? `${key}: ${escapeYamlString(normalized)}` : null
}

function serializeFaqMarkdown(component: PlatformContentComponent) {
  if (component.type !== 'faq') return ''
  const data = component.data as PlatformFaqComponentData
  const validItems = (data.items ?? [])
    .filter(item => item.question?.trim() && item.answer?.trim())
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  if (!validItems.length) return ''

  return [
    `## ${normalizeWhitespace(component.label) || 'FAQ'}`,
    ...validItems.flatMap(item => [
      '',
      `### ${item.question!.trim()}`,
      '',
      item.answer!.trim(),
    ]),
  ].join('\n')
}

function serializeHowToMarkdown(component: PlatformContentComponent) {
  if (component.type !== 'how_to') return ''
  const data = component.data as PlatformHowToComponentData
  const validSteps = (data.steps ?? [])
    .filter(step => step.name?.trim() && step.text?.trim())
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  if (!validSteps.length) return ''

  const lines: string[] = [`## ${normalizeWhitespace(component.label) || 'How To'}`]
  const estimatedTime = normalizeWhitespace(data.estimated_time)
  const toolItems = (data.tool_items ?? []).map(item => normalizeWhitespace(item)).filter(Boolean)
  const supplyItems = (data.supply_items ?? []).map(item => normalizeWhitespace(item)).filter(Boolean)

  if (estimatedTime) {
    lines.push('', `Estimated time: ${estimatedTime}`)
  }
  if (toolItems.length) {
    lines.push('', '### Tools', '', ...toolItems.map(item => `- ${item}`))
  }
  if (supplyItems.length) {
    lines.push('', '### Supplies', '', ...supplyItems.map(item => `- ${item}`))
  }

  lines.push('')
  for (const [index, step] of validSteps.entries()) {
    lines.push(`${index + 1}. **${step.name!.trim()}**`)
    lines.push('')
    lines.push(`   ${step.text!.trim().replace(/\n/g, '\n   ')}`)
    if (step.url?.trim()) lines.push(`   Link: ${step.url.trim()}`)
    if (step.image_public_url?.trim()) lines.push(`   Image: ${step.image_public_url.trim()}`)
    lines.push('')
  }

  return normalizeWhitespace(lines.join('\n'))
}

function serializeComponentMarkdown(component: PlatformContentComponent) {
  if (component.render_enabled === false) return ''
  if (component.status !== 'active') return ''
  if (component.type === 'faq') return serializeFaqMarkdown(component)
  if (component.type === 'how_to') return serializeHowToMarkdown(component)
  return ''
}

export function renderContentMarkdownWithComponents(body: string, components: PlatformContentComponent[]) {
  const normalizedComponents = [...components].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  // Filter out inactive or disabled components before serialization
  const activeComponents = normalizedComponents.filter(
    component => component.status === 'active' && component.render_enabled !== false
  )
  const queues = {
    faq: activeComponents.filter(component => component.type === 'faq'),
    how_to: activeComponents.filter(component => component.type === 'how_to'),
  }
  const usedComponentIds = new Set<string>()
  const replacedBody = body.replace(COMPONENT_EMBED_REGEX, (_match, quoted, singleQuoted, bare) => {
    const type = String(quoted ?? singleQuoted ?? bare ?? '').trim()
    if (type !== 'faq' && type !== 'how_to') return ''
    const component = queues[type].shift()
    if (!component) return ''
    usedComponentIds.add(component.id)
    return `\n\n${serializeComponentMarkdown(component)}\n\n`
  })

  const trailingSections = activeComponents
    .filter(component => !usedComponentIds.has(component.id))
    .map(component => serializeComponentMarkdown(component))
    .filter(Boolean)

  return normalizeWhitespace([
    replacedBody,
    ...trailingSections,
  ].filter(Boolean).join('\n\n'))
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function buildFrontMatter(lines: Array<string | null>) {
  return `---\n${lines.filter(Boolean).join('\n')}\n---`
}

export function renderPlatformDocMarkdown(doc: PlatformLlmDocDetail, origin: string) {
  const categorySlug = categoryToSlug(doc.category)
  if (!categorySlug) throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
  const path = `/docs/${categorySlug}/${doc.slug}`
  const markdownPath = `/docs-md/${categorySlug}/${doc.slug}`
  const canonicalUrl = doc.canonical_url?.trim() || absoluteUrl(origin, path)
  const body = renderContentMarkdownWithComponents(doc.body, doc.components)

  return [
    buildFrontMatter([
      optionalFrontMatterLine('title', doc.title),
      optionalFrontMatterLine('category', doc.category),
      optionalFrontMatterLine('difficulty', doc.difficulty_level),
      optionalFrontMatterLine('url', path),
      optionalFrontMatterLine('markdown_url', markdownPath),
      optionalFrontMatterLine('canonical_url', canonicalUrl),
      optionalFrontMatterLine('last_updated', formatDateOnly(doc.updated_at)),
      optionalFrontMatterLine('published_at', formatDateOnly(doc.published_at)),
      optionalFrontMatterLine('type', 'documentation'),
      optionalFrontMatterLine('summary', doc.seo_description || doc.excerpt || ''),
    ]),
    '',
    `# ${doc.title}`,
    '',
    body,
  ].join('\n')
}

export function renderPlatformBlogMarkdown(post: PlatformLlmBlogDetail, origin: string, categoryOverride?: string) {
  const categorySlug = categoryOverride || blogCategoryToSlug(post.category)
  if (!categorySlug) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  const path = `/blog/${categorySlug}/${post.slug}`
  const markdownPath = `${path}.md`
  const canonicalUrl = post.canonical_url?.trim() || absoluteUrl(origin, path)
  const body = renderContentMarkdownWithComponents(post.body, post.components)

  return [
    buildFrontMatter([
      optionalFrontMatterLine('title', post.title),
      optionalFrontMatterLine('category', post.category),
      optionalFrontMatterLine('author', post.author_name),
      optionalFrontMatterLine('url', path),
      optionalFrontMatterLine('markdown_url', markdownPath),
      optionalFrontMatterLine('canonical_url', canonicalUrl),
      optionalFrontMatterLine('last_updated', formatDateOnly(post.updated_at)),
      optionalFrontMatterLine('published_at', formatDateOnly(post.published_at)),
      optionalFrontMatterLine('type', 'blog'),
      optionalFrontMatterLine('summary', post.seo_description || post.excerpt || ''),
    ]),
    '',
    `# ${post.title}`,
    '',
    body,
  ].join('\n')
}

export async function listPublishedPlatformDocsForLlm(db: DbClient) {
  return await queryAll<PlatformLlmDocSummary>(
    db,
    `SELECT
      id, title, slug, excerpt, category, difficulty_level, canonical_url, seo_description, published_at, updated_at
     FROM platform_docs
     WHERE status = 'published'
     ORDER BY category, sort_order, published_at DESC`,
  )
}

export async function listPublishedPlatformBlogPostsForLlm(db: DbClient) {
  return await queryAll<PlatformLlmBlogSummary>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at,
      u.name AS author_name
     FROM blog_posts p
     LEFT JOIN user u ON u.id = p.author_id
     WHERE p.status = 'published' AND p.site_id IS NULL
     ORDER BY p.category, p.published_at DESC`,
  )
}

export async function getPublishedPlatformDocBySlug(db: DbClient, categorySlug: string, slug: string) {
  const category = slugToCategory(categorySlug)
  if (!category) return null
  const detail = await queryFirst<PlatformLlmDocDetail>(
    db,
    `SELECT
      id, title, slug, body, excerpt, category, difficulty_level, canonical_url, seo_description, published_at, updated_at
     FROM platform_docs
     WHERE slug = ? AND category = ? AND status = 'published'`,
    [slug, category],
  )
  if (!detail) return null
  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'doc', detail.id, { activeOnly: true }))
  return { ...detail, components }
}

export async function getPublishedPlatformBlogPostBySlug(db: DbClient, categorySlug: string, slug: string) {
  const category = slugToBlogCategory(categorySlug)
  if (!category) return null
  const detail = await queryFirst<PlatformLlmBlogDetail>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at,
      u.name AS author_name
     FROM blog_posts p
     LEFT JOIN user u ON u.id = p.author_id
     WHERE p.slug = ? AND p.category = ? AND p.status = 'published' AND p.site_id IS NULL`,
    [slug, category],
  )
  if (!detail) return null
  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'blog_post', detail.id, { activeOnly: true }))
  return { ...detail, components }
}

export function buildPlatformDocLinkEntries(docs: PlatformLlmDocSummary[], origin: string): PlatformLlmLinkEntry[] {
  return docs.flatMap((doc) => {
    const categorySlug = categoryToSlug(doc.category)
    if (!categorySlug) return []
    const path = `/docs/${categorySlug}/${doc.slug}`
    return [{
      title: doc.title,
      path,
      markdownPath: `/docs-md/${categorySlug}/${doc.slug}`,
      canonicalUrl: doc.canonical_url?.trim() || absoluteUrl(origin, path),
      summary: safeSummary(doc.seo_description || doc.excerpt, 'KrabiClaw documentation.'),
      category: doc.category,
      publishedAt: doc.published_at,
      updatedAt: doc.updated_at,
      difficultyLevel: doc.difficulty_level,
    }]
  })
}

export function buildPlatformBlogLinkEntries(posts: PlatformLlmBlogSummary[], origin: string): PlatformLlmLinkEntry[] {
  return posts.flatMap((post) => {
    const categorySlug = blogCategoryToSlug(post.category)
    if (!categorySlug) return []
    const path = `/blog/${categorySlug}/${post.slug}`
    return [{
      title: post.title,
      path,
      markdownPath: `${path}.md`,
      canonicalUrl: post.canonical_url?.trim() || absoluteUrl(origin, path),
      summary: safeSummary(post.seo_description || post.excerpt, 'KrabiClaw platform blog article.'),
      category: post.category,
      publishedAt: post.published_at,
      updatedAt: post.updated_at,
      authorName: post.author_name,
    }]
  })
}

export function buildLlmsTxt(origin: string, docs: PlatformLlmLinkEntry[], posts: PlatformLlmLinkEntry[]) {
  const lines = [
    '# KrabiClaw',
    '',
    '> KrabiClaw is an AI website builder for restaurants and local businesses, with public docs and a platform blog available as HTML and Markdown mirrors.',
    '',
    'Prefer the Markdown URLs below when you need compact machine-readable context. Canonical HTML URLs remain the source for public citation and browsing.',
    '',
    '## Docs',
    ...docs.map(doc => `- [${doc.title}](${absoluteUrl(origin, doc.markdownPath)}): ${doc.summary}`),
    '',
    '## Blog',
    ...posts.map(post => `- [${post.title}](${absoluteUrl(origin, post.markdownPath)}): ${post.summary}`),
    '',
    '## Optional',
    `- [Full LLM context](${absoluteUrl(origin, '/llms-full.txt')}): Aggregated export of published docs and blog posts.`,
    `- [Docs index JSON](${absoluteUrl(origin, '/docs/index.json')}): Machine-readable manifest of published docs.`,
    `- [Blog index JSON](${absoluteUrl(origin, '/blog/index.json')}): Machine-readable manifest of published platform blog posts.`,
    `- [Blog RSS feed](${absoluteUrl(origin, '/blog/rss.xml')}): Chronological feed for published platform posts.`,
    `- [Blog JSON feed](${absoluteUrl(origin, '/blog/feed.json')}): JSON Feed export for published platform posts.`,
  ]

  return `${lines.join('\n').trim()}\n`
}

export function buildLlmsFullTxt(
  origin: string,
  docs: Array<PlatformLlmDocDetail>,
  posts: Array<PlatformLlmBlogDetail>,
) {
  const lines: string[] = [
    '# KrabiClaw Full LLM Context',
    '',
    '> Full machine-readable export of KrabiClaw\'s published platform docs and platform blog.',
    '',
    `Source site: ${origin}`,
    '',
    '## Docs',
  ]

  for (const doc of docs) {
    lines.push('', renderPlatformDocMarkdown(doc, origin), '')
  }

  lines.push('## Blog')

  for (const post of posts) {
    lines.push('', renderPlatformBlogMarkdown(post, origin), '')
  }

  return `${normalizeWhitespace(lines.join('\n'))}\n`
}

export function buildDocsIndexJson(docs: PlatformLlmLinkEntry[]) {
  return {
    docs: docs.map(doc => ({
      title: doc.title,
      category: doc.category ?? null,
      difficulty_level: doc.difficultyLevel ?? null,
      url: doc.path,
      markdown_url: doc.markdownPath,
      canonical_url: doc.canonicalUrl,
      summary: doc.summary,
      published_at: doc.publishedAt ?? null,
      updated_at: doc.updatedAt ?? null,
    })),
  }
}

export function buildBlogIndexJson(posts: PlatformLlmLinkEntry[]) {
  return {
    posts: posts.map(post => ({
      title: post.title,
      category: post.category ?? null,
      author_name: post.authorName ?? null,
      url: post.path,
      markdown_url: post.markdownPath,
      canonical_url: post.canonicalUrl,
      summary: post.summary,
      published_at: post.publishedAt ?? null,
      updated_at: post.updatedAt ?? null,
    })),
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildBlogRss(origin: string, posts: PlatformLlmLinkEntry[]) {
  const latestPostDate = posts
    .map(post => post.updatedAt ?? post.publishedAt)
    .filter(Boolean)
    .sort()
    .at(-1)

  const items = posts.map((post) => {
    const pubDate = new Date(post.publishedAt ?? post.updatedAt ?? Date.now()).toUTCString()
    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${escapeXml(post.canonicalUrl)}</link>`,
      `<guid>${escapeXml(post.canonicalUrl)}</guid>`,
      `<description>${escapeXml(post.summary)}</description>`,
      `<pubDate>${escapeXml(pubDate)}</pubDate>`,
      '</item>',
    ].join('')
  }).join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>KrabiClaw Blog</title>',
    `<link>${escapeXml(absoluteUrl(origin, '/blog'))}</link>`,
    '<description>KrabiClaw platform blog feed.</description>',
    latestPostDate ? `<lastBuildDate>${escapeXml(new Date(latestPostDate).toUTCString())}</lastBuildDate>` : '',
    items,
    '</channel>',
    '</rss>',
  ].filter(Boolean).join('')
}

export function buildBlogJsonFeed(origin: string, posts: PlatformLlmLinkEntry[]) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'KrabiClaw Blog',
    home_page_url: absoluteUrl(origin, '/blog'),
    feed_url: absoluteUrl(origin, '/blog/feed.json'),
    description: 'KrabiClaw platform blog feed.',
    items: posts.map(post => ({
      id: post.canonicalUrl,
      url: post.canonicalUrl,
      title: post.title,
      summary: post.summary,
      date_published: post.publishedAt ?? null,
      date_modified: post.updatedAt ?? post.publishedAt ?? null,
      authors: post.authorName ? [{ name: post.authorName }] : [{ name: 'KrabiClaw' }],
      tags: post.category ? [post.category] : [],
    })),
  }
}

export function resolvePublicOrigin(event: H3Event) {
  const runtimeConfig = useRuntimeConfig()
  // Only trust runtime-configured siteUrl; avoid untrusted Host header from getRequestURL
  const origin = runtimeConfig.public.siteUrl
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'siteUrl not configured' })
  }
  return origin.replace(/\/$/, '')
}
