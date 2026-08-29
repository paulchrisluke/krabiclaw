import { HTTPError } from 'nitro';
import type { H3Event } from 'nitro';
import {  getRequestHost } from 'nitro/h3';
import { queryAll, queryFirst, type DbClient } from '../db/index.ts'
import { getContentBlocksForOwner } from './content-documents.ts'
import { findAuthUsersByIds, type CloudflareEnv } from './auth.ts'
import { blogCategoryToSlug, slugToBlogCategory } from '../../utils/blog-categories.ts'
import { categoryToSlug, slugToCategory } from '../../utils/docs-categories.ts'
import { PLATFORM_SITE_ID } from '../../shared/platform-scope.ts'

interface PlatformLlmDocSummary {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  category?: string | null
  difficulty_level?: string | null
  canonical_url?: string | null
  seo_description?: string | null
  updated_at?: string | null
}

interface PlatformLlmDocDetail extends PlatformLlmDocSummary {
  content_blocks: LlmContentBlock[]
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
  content_blocks: LlmContentBlock[]
}

interface LlmContentBlock {
  type: string
  position: number
  level: number | null
  data: Record<string, unknown>
  media: Array<{ public_url?: string | null; alt_text?: string | null; caption?: string | null }>
}

type TenantLlmBlogSummary = PlatformLlmBlogSummary

type TenantLlmBlogDetail = PlatformLlmBlogDetail

export interface PlatformLlmLinkEntry {
  title: string
  path: string
  markdownPath: string
  canonicalUrl: string
  summary: string
  category?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  authorName?: string | null
  difficultyLevel?: string | null
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

function serializeFaqMarkdown(block: LlmContentBlock) {
  const items = Array.isArray(block.data.items) ? block.data.items as Array<Record<string, unknown>> : []
  const validItems = items.filter(item => String(item.question || '').trim() && String(item.answer || '').trim())

  if (!validItems.length) return ''

  return [
    `## ${normalizeWhitespace(String(block.data.label || '')) || 'FAQ'}`,
    ...validItems.flatMap(item => [
      '',
      `### ${String(item.question).trim()}`,
      '',
      String(item.answer).trim(),
    ]),
  ].join('\n')
}

function serializeHowToMarkdown(block: LlmContentBlock) {
  const steps = Array.isArray(block.data.steps) ? block.data.steps as Array<Record<string, unknown>> : []
  const validSteps = steps.filter(step => String(step.name || '').trim() && String(step.text || '').trim())

  if (!validSteps.length) return ''

  const lines: string[] = [`## ${normalizeWhitespace(String(block.data.label || '')) || 'How To'}`]
  const estimatedTime = normalizeWhitespace(String(block.data.estimated_time || ''))
  const toolItems = (Array.isArray(block.data.tool_items) ? block.data.tool_items : []).map(item => normalizeWhitespace(String(item))).filter(Boolean)
  const supplyItems = (Array.isArray(block.data.supply_items) ? block.data.supply_items : []).map(item => normalizeWhitespace(String(item))).filter(Boolean)

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
    lines.push(`${index + 1}. **${String(step.name).trim()}**`)
    lines.push('')
    lines.push(`   ${String(step.text).trim().replace(/\n/g, '\n   ')}`)
    if (String(step.url || '').trim()) lines.push(`   Link: ${String(step.url).trim()}`)
    lines.push('')
  }

  return normalizeWhitespace(lines.join('\n'))
}

function serializeAiAssistanceMarkdown(block: LlmContentBlock) {
  const prompts = Array.isArray(block.data.prompts) ? block.data.prompts as Array<Record<string, unknown>> : []
  const validPrompts = prompts.filter(item => String(item.prompt || '').trim())

  if (!validPrompts.length) return ''

  const lines: string[] = [`## ${normalizeWhitespace(String(block.data.label || '')) || 'AI Assistance'}`]
  const intro = normalizeWhitespace(String(block.data.intro || ''))
  if (intro) lines.push('', intro)

  for (const prompt of validPrompts) {
    const title = normalizeWhitespace(String(prompt.title || ''))
    const description = normalizeWhitespace(String(prompt.description || ''))
    if (title) lines.push('', `### ${title}`)
    if (description) lines.push('', description)
    lines.push('', '```text', String(prompt.prompt).trim(), '```')
  }

  return normalizeWhitespace(lines.join('\n'))
}

export function renderContentBlocksForLlm(blocks: LlmContentBlock[]) {
  return normalizeWhitespace([...blocks].sort((a, b) => a.position - b.position).map((block) => {
    if (block.data.status === 'inactive' || block.data.render_enabled === false) return ''
    if (block.type === 'heading') return `${'#'.repeat(Math.max(1, Math.min(6, block.level || 2)))} ${String(block.data.text || '').trim()}`
    if (block.type === 'markdown') return String(block.data.markdown || '').trim()
    if (block.type === 'divider') return '---'
    if (block.type === 'faq') return serializeFaqMarkdown(block)
    if (block.type === 'how_to') return serializeHowToMarkdown(block)
    if (block.type === 'ai_assistance') return serializeAiAssistanceMarkdown(block)
    if (block.type === 'image' || block.type === 'gallery') return block.media.map(item => item.public_url ? `![${item.alt_text || ''}](${item.public_url})${item.caption ? `\n\n${item.caption}` : ''}` : '').filter(Boolean).join('\n\n')
    if (block.type === 'cta') return block.data.url ? `[${String(block.data.label || block.data.title || 'Learn more')}](${String(block.data.url)})` : ''
    return String(block.data.markdown || block.data.text || '')
  }).filter(Boolean).join('\n\n'))
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
  if (!categorySlug) throw new HTTPError({ statusCode: 404, statusMessage: 'Documentation not found' })
  const path = `/docs/${categorySlug}/${doc.slug}`
  const markdownPath = `/docs-md/${categorySlug}/${doc.slug}.md`
  const canonicalUrl = doc.canonical_url?.trim() || absoluteUrl(origin, path)
  const body = renderContentBlocksForLlm(doc.content_blocks)

  return [
    buildFrontMatter([
      optionalFrontMatterLine('title', doc.title),
      optionalFrontMatterLine('category', doc.category),
      optionalFrontMatterLine('difficulty', doc.difficulty_level),
      optionalFrontMatterLine('url', path),
      optionalFrontMatterLine('markdown_url', markdownPath),
      optionalFrontMatterLine('canonical_url', canonicalUrl),
      optionalFrontMatterLine('last_updated', formatDateOnly(doc.updated_at)),
      optionalFrontMatterLine('type', 'documentation'),
      optionalFrontMatterLine('summary', doc.seo_description || doc.excerpt || ''),
    ]),
    '',
    `# ${doc.title}`,
    '',
    body,
  ].join('\n')
}

function renderBlogMarkdown(
  post: PlatformLlmBlogDetail,
  origin: string,
  paths: { path: string; markdownPath: string },
) {
  const { path, markdownPath } = paths
  const canonicalUrl = post.canonical_url?.trim() || absoluteUrl(origin, path)
  const body = renderContentBlocksForLlm(post.content_blocks)

  return [
    buildFrontMatter([
      optionalFrontMatterLine('title', post.title),
      optionalFrontMatterLine('category', post.category),
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

export function renderPlatformBlogMarkdown(post: PlatformLlmBlogDetail, origin: string, categoryOverride?: string) {
  const categorySlug = categoryOverride || blogCategoryToSlug(post.category)
  if (!categorySlug) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
  const path = `/blog/${categorySlug}/${post.slug}`
  const markdownPath = `/blog-md/${categorySlug}/${post.slug}.md`
  return renderBlogMarkdown(post, origin, { path, markdownPath })
}

export function renderTenantBlogMarkdown(post: TenantLlmBlogDetail, origin: string) {
  const path = `/blog/${post.slug}`
  const markdownPath = `/blog-md/${post.slug}.md`
  return renderBlogMarkdown(post, origin, { path, markdownPath })
}

export async function listPublishedPlatformDocsForLlm(db: DbClient) {
  return await queryAll<PlatformLlmDocSummary>(
    db,
    `SELECT
      id, title, slug, excerpt, category, difficulty_level, canonical_url, seo_description, updated_at
     FROM platform_docs
     ORDER BY category, sort_order, updated_at DESC`,
  )
}

export async function listPublishedPlatformBlogPostsForLlm(db: DbClient, env: CloudflareEnv) {
  const posts = await queryAll<PlatformLlmBlogSummary & { author_id: string | null }>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at, p.author_id
     FROM blog_posts p
     WHERE p.status = 'published' AND p.site_id = '${PLATFORM_SITE_ID}' AND p.visibility = 'public'
     ORDER BY p.category, p.published_at DESC`,
  )
  const authors = await findAuthUsersByIds(env, posts.map(post => post.author_id))
  return posts.map(({ author_id: authorId, ...post }) => ({
    ...post,
    author_name: (authorId ? authors.get(authorId)?.name : null) ?? null,
  }))
}

export async function listPublishedTenantBlogPostsForLlm(db: DbClient, siteId: string, env: CloudflareEnv) {
  const posts = await queryAll<TenantLlmBlogSummary & { author_id: string | null }>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at, p.author_id
     FROM blog_posts p
     WHERE p.status = 'published' AND p.site_id = ? AND p.visibility = 'public'
     ORDER BY p.published_at DESC, p.updated_at DESC`,
    [siteId],
  )
  const authors = await findAuthUsersByIds(env, posts.map(post => post.author_id))
  return posts.map(({ author_id: authorId, ...post }) => ({
    ...post,
    author_name: (authorId ? authors.get(authorId)?.name : null) ?? null,
  }))
}

export async function getPublishedPlatformDocBySlug(db: DbClient, categorySlug: string, slug: string) {
  const category = slugToCategory(categorySlug)
  if (!category) return null
  const detail = await queryFirst<Omit<PlatformLlmDocDetail, 'content_blocks'>>(
    db,
    `SELECT
      id, title, slug, excerpt, category, difficulty_level, canonical_url, seo_description, updated_at
     FROM platform_docs
     WHERE slug = ? AND category = ?`,
    [slug, category],
  )
  if (!detail) return null
  const contentBlocks = await getContentBlocksForOwner(db, 'platform_doc', detail.id)
  if (!contentBlocks) throw new HTTPError({ statusCode: 500, statusMessage: 'Documentation content document is missing' })
  return { ...detail, content_blocks: contentBlocks }
}

export async function getPublishedPlatformBlogPostBySlug(db: DbClient, categorySlug: string, slug: string) {
  const category = slugToBlogCategory(categorySlug)
  if (!category) return null
  const detail = await queryFirst<Omit<PlatformLlmBlogDetail, 'content_blocks'>>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at
     FROM blog_posts p
     WHERE p.slug = ? AND p.category = ? AND p.status = 'published' AND p.site_id = '${PLATFORM_SITE_ID}'`,
    [slug, category],
  )
  if (!detail) return null
  const contentBlocks = await getContentBlocksForOwner(db, 'platform_blog', detail.id)
  if (!contentBlocks) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  return { ...detail, content_blocks: contentBlocks }
}

export async function getPublishedTenantBlogPostBySlug(db: DbClient, siteId: string, slug: string) {
  const detail = await queryFirst<Omit<TenantLlmBlogDetail, 'content_blocks'>>(
    db,
    `SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.canonical_url, p.seo_description, p.published_at, p.updated_at
     FROM blog_posts p
     WHERE p.slug = ? AND p.status = 'published' AND p.site_id = ?`,
    [slug, siteId],
  )
  if (!detail) return null
  const contentBlocks = await getContentBlocksForOwner(db, 'tenant_blog', detail.id)
  if (!contentBlocks) throw new HTTPError({ statusCode: 500, statusMessage: 'Blog content document is missing' })
  return { ...detail, content_blocks: contentBlocks }
}

export function buildPlatformDocLinkEntries(docs: PlatformLlmDocSummary[], origin: string): PlatformLlmLinkEntry[] {
  return docs.flatMap((doc) => {
    const categorySlug = categoryToSlug(doc.category)
    if (!categorySlug) return []
    const path = `/docs/${categorySlug}/${doc.slug}`
    return [{
      title: doc.title,
      path,
      markdownPath: `/docs-md/${categorySlug}/${doc.slug}.md`,
      canonicalUrl: doc.canonical_url?.trim() || absoluteUrl(origin, path),
      summary: safeSummary(doc.seo_description || doc.excerpt, 'KrabiClaw documentation.'),
      category: doc.category,
      updatedAt: doc.updated_at,
      difficultyLevel: doc.difficulty_level,
    }]
  })
}

export function buildPlatformBlogLinkEntries(posts: PlatformLlmBlogSummary[], origin: string): PlatformLlmLinkEntry[] {
  // Sort by published date descending before serialization
  const sortedPosts = [...posts].sort((a, b) => {
    const aDate = a.published_at ? new Date(a.published_at).getTime() : 0
    const bDate = b.published_at ? new Date(b.published_at).getTime() : 0
    return bDate - aDate
  })
  return sortedPosts.flatMap((post) => {
    const categorySlug = blogCategoryToSlug(post.category)
    if (!categorySlug) return []
    const path = `/blog/${categorySlug}/${post.slug}`
    return [{
      title: post.title,
      path,
      markdownPath: `/blog-md/${categorySlug}/${post.slug}.md`,
      canonicalUrl: post.canonical_url?.trim() || absoluteUrl(origin, path),
      summary: safeSummary(post.seo_description || post.excerpt, 'KrabiClaw platform blog article.'),
      category: post.category,
      publishedAt: post.published_at,
      updatedAt: post.updated_at,
      authorName: post.author_name,
    }]
  })
}

export function buildTenantBlogLinkEntries(posts: TenantLlmBlogSummary[], origin: string): PlatformLlmLinkEntry[] {
  const sortedPosts = [...posts].sort((a, b) => {
    const aDate = a.published_at ? new Date(a.published_at).getTime() : 0
    const bDate = b.published_at ? new Date(b.published_at).getTime() : 0
    return bDate - aDate
  })
  return sortedPosts.map((post) => {
    const path = `/blog/${post.slug}`
    return {
      title: post.title,
      path,
      markdownPath: `/blog-md/${post.slug}.md`,
      canonicalUrl: post.canonical_url?.trim() || absoluteUrl(origin, path),
      summary: safeSummary(post.seo_description || post.excerpt, 'Published blog article.'),
      category: post.category,
      publishedAt: post.published_at,
      updatedAt: post.updated_at,
      authorName: post.author_name,
    }
  })
}

interface LlmsTxtOptions {
  title?: string
  intro?: string
  docsHeading?: string
  blogHeading?: string
  includeDocsOptionalLinks?: boolean
  blogIndexDescription?: string
  blogRssDescription?: string
  blogJsonFeedDescription?: string
  fullContextDescription?: string
}

export function buildLlmsTxt(
  origin: string,
  docs: PlatformLlmLinkEntry[],
  posts: PlatformLlmLinkEntry[],
  options: LlmsTxtOptions = {},
) {
  const includeDocsSection = docs.length > 0
  const lines = [
    `# ${options.title || 'KrabiClaw'}`,
    '',
    `> ${options.intro || 'KrabiClaw is an AI website builder for restaurants and local businesses, with public docs and a platform blog available as HTML and Markdown mirrors.'}`,
    '',
    'Prefer the Markdown URLs below when you need compact machine-readable context. Canonical HTML URLs remain the source for public citation and browsing.',
    '',
    ...(includeDocsSection
      ? [
          `## ${options.docsHeading || 'Docs'}`,
          ...docs.map(doc => `- [${doc.title}](${absoluteUrl(origin, doc.markdownPath)}): ${doc.summary}`),
          '',
        ]
      : []),
    `## ${options.blogHeading || 'Blog'}`,
    ...posts.map(post => `- [${post.title}](${absoluteUrl(origin, post.markdownPath)}): ${post.summary}`),
    '',
    '## Optional',
    `- [Full LLM context](${absoluteUrl(origin, '/llms-full.txt')}): ${options.fullContextDescription || 'Aggregated export of published docs and blog posts.'}`,
    ...(options.includeDocsOptionalLinks === false || !includeDocsSection
      ? []
      : [`- [Docs index JSON](${absoluteUrl(origin, '/docs/index.json')}): Machine-readable manifest of published docs.`]),
    `- [Blog index JSON](${absoluteUrl(origin, '/blog/index.json')}): ${options.blogIndexDescription || 'Machine-readable manifest of published platform blog posts.'}`,
    `- [Blog RSS feed](${absoluteUrl(origin, '/blog/rss.xml')}): ${options.blogRssDescription || 'Chronological feed for published platform posts.'}`,
    `- [Blog JSON feed](${absoluteUrl(origin, '/blog/feed.json')}): ${options.blogJsonFeedDescription || 'JSON Feed export for published platform posts.'}`,
  ]

  return `${lines.join('\n').trim()}\n`
}

interface LlmsFullTxtOptions {
  title?: string
  intro?: string
  includeDocs?: boolean
  renderBlog?: (_post: PlatformLlmBlogDetail, _origin: string) => string
}

export function buildLlmsFullTxt(
  origin: string,
  docs: Array<PlatformLlmDocDetail>,
  posts: Array<PlatformLlmBlogDetail>,
  options: LlmsFullTxtOptions = {},
) {
  const includeDocs = options.includeDocs !== false
  const lines: string[] = [
    `# ${options.title || 'KrabiClaw Full LLM Context'}`,
    '',
    `> ${options.intro || 'Full machine-readable export of KrabiClaw\'s published platform docs and platform blog.'}`,
    '',
    `Source site: ${origin}`,
  ]

  if (includeDocs) {
    lines.push('', '## Docs')
    for (const doc of docs) {
      lines.push('', renderPlatformDocMarkdown(doc, origin), '')
    }
  }

  lines.push('## Blog')
  const renderBlog = options.renderBlog || renderPlatformBlogMarkdown

  for (const post of posts) {
    lines.push('', renderBlog(post, origin), '')
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
      updated_at: doc.updatedAt ?? null,
    })),
  }
}

export function buildBlogIndexJson(posts: PlatformLlmLinkEntry[]) {
  return {
    posts: posts.map(post => ({
      title: post.title,
      category: post.category ?? null,
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
  const title = 'KrabiClaw Blog'
  const description = 'KrabiClaw platform blog feed.'
  return buildNamedBlogRss(origin, posts, { title, description })
}

interface BlogFeedOptions {
  title?: string
  description?: string
}

export function buildNamedBlogRss(origin: string, posts: PlatformLlmLinkEntry[], options: BlogFeedOptions = {}) {
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
    `<title>${escapeXml(options.title || 'KrabiClaw Blog')}</title>`,
    `<link>${escapeXml(absoluteUrl(origin, '/blog'))}</link>`,
    `<description>${escapeXml(options.description || 'KrabiClaw platform blog feed.')}</description>`,
    latestPostDate ? `<lastBuildDate>${escapeXml(new Date(latestPostDate).toUTCString())}</lastBuildDate>` : '',
    items,
    '</channel>',
    '</rss>',
  ].filter(Boolean).join('')
}

export function buildBlogJsonFeed(origin: string, posts: PlatformLlmLinkEntry[]) {
  return buildNamedBlogJsonFeed(origin, posts)
}

export function buildNamedBlogJsonFeed(origin: string, posts: PlatformLlmLinkEntry[], options: BlogFeedOptions = {}) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: options.title || 'KrabiClaw Blog',
    home_page_url: absoluteUrl(origin, '/blog'),
    feed_url: absoluteUrl(origin, '/blog/feed.json'),
    description: options.description || 'KrabiClaw platform blog feed.',
    items: posts.map(post => ({
      id: post.canonicalUrl,
      url: post.canonicalUrl,
      title: post.title,
      summary: post.summary,
      date_published: post.publishedAt ?? null,
      date_modified: post.updatedAt ?? post.publishedAt ?? null,
      ...(post.authorName ? { authors: [{ name: post.authorName }] } : {}),
      tags: post.category ? [post.category] : [],
    })),
  }
}

export function resolvePublicOrigin(event: H3Event) {
  if (event.context.tenantType === 'tenant') {
    const tenantHost = String(
      event.context.tenantHost
      || getRequestHost(event, { xForwardedHost: true })
      || (event.req.headers.get('host'))
      || ''
    ).split(':')[0]
    if (!tenantHost) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant host not resolved' })
    }
    const forwardedProto = (event.req.headers.get('x-forwarded-proto'))
    const protocol = forwardedProto?.split(',')[0]?.trim()
      || (tenantHost.endsWith('.localhost') || tenantHost === 'localhost' ? 'http' : 'https')
    return `${protocol}://${tenantHost}`
  }

  const runtimeConfig = useRuntimeConfig()
  const origin = runtimeConfig.public.siteUrl
  if (!origin) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'siteUrl not configured' })
  }
  return origin.replace(/\/$/, '')
}
