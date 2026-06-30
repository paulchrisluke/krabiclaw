export interface LlmFaqItem {
  question?: string | null
  answer?: string | null
  position?: number | null
}

export interface LlmHowToStep {
  name?: string | null
  text?: string | null
  url?: string | null
  image_public_url?: string | null
  position?: number | null
}

export interface LlmContentComponent {
  id: string
  type: 'faq' | 'how_to'
  content_type?: string
  content_id?: string
  label?: string | null
  status: 'active' | 'inactive'
  render_enabled: boolean
  schema_enabled: boolean
  position?: number | null
  created_at?: string
  updated_at?: string
  data: {
    items?: LlmFaqItem[] | null
    steps?: LlmHowToStep[] | null
    estimated_time?: string | null
    tool_items?: string[] | null
    supply_items?: string[] | null
  }
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

export interface PlatformMarkdownDocLike {
  id?: string
  title: string
  slug: string
  body: string
  excerpt?: string | null
  category?: string | null
  difficulty_level?: string | null
  canonical_url?: string | null
  seo_description?: string | null
  published_at?: string | null
  updated_at?: string | null
  components: LlmContentComponent[]
}

export interface PlatformMarkdownPostLike {
  id?: string
  title: string
  slug: string
  body: string
  excerpt?: string | null
  category?: string | null
  canonical_url?: string | null
  seo_description?: string | null
  published_at?: string | null
  updated_at?: string | null
  author_name?: string | null
  components: LlmContentComponent[]
}

const COMPONENT_EMBED_REGEX = /\{\{\s*component\s+type\s*=\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+))\s*\}\}/g

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

function absoluteUrl(origin: string, path: string) {
  return new URL(path.startsWith('/') ? path : `/${path}`, origin).toString()
}

function optionalFrontMatterLine(key: string, value: string | null | undefined) {
  const normalized = normalizeWhitespace(value)
  return normalized ? `${key}: ${escapeYamlString(normalized)}` : null
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

function serializeFaqMarkdown(component: LlmContentComponent) {
  const validItems = (component.data.items ?? [])
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

function serializeHowToMarkdown(component: LlmContentComponent) {
  const validSteps = (component.data.steps ?? [])
    .filter(step => step.name?.trim() && step.text?.trim())
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  if (!validSteps.length) return ''

  const lines: string[] = [`## ${normalizeWhitespace(component.label) || 'How To'}`]
  const estimatedTime = normalizeWhitespace(component.data.estimated_time)
  const toolItems = (component.data.tool_items ?? []).map(item => normalizeWhitespace(item)).filter(Boolean)
  const supplyItems = (component.data.supply_items ?? []).map(item => normalizeWhitespace(item)).filter(Boolean)

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

function serializeComponentMarkdown(component: LlmContentComponent) {
  if (component.render_enabled === false) return ''
  if (component.status !== 'active') return ''
  if (component.type === 'faq') return serializeFaqMarkdown(component)
  return serializeHowToMarkdown(component)
}

export function renderContentMarkdownWithComponents(body: string, components: LlmContentComponent[]) {
  const normalizedComponents = [...components].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const queues = {
    faq: normalizedComponents.filter(component => component.type === 'faq'),
    how_to: normalizedComponents.filter(component => component.type === 'how_to'),
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

  const trailingSections = normalizedComponents
    .filter(component => !usedComponentIds.has(component.id))
    .map(component => serializeComponentMarkdown(component))
    .filter(Boolean)

  return normalizeWhitespace([replacedBody, ...trailingSections].filter(Boolean).join('\n\n'))
}

export function renderPlatformDocMarkdown(
  doc: PlatformMarkdownDocLike,
  origin: string,
  categorySlug: string,
) {
  const path = `/docs/${categorySlug}/${doc.slug}`
  const markdownPath = `/docs-md/${categorySlug}/${doc.slug}`
  const canonicalUrl = doc.canonical_url?.trim() || absoluteUrl(origin, path)

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
    renderContentMarkdownWithComponents(doc.body, doc.components),
  ].join('\n')
}

export function renderPlatformBlogMarkdown(
  post: PlatformMarkdownPostLike,
  origin: string,
  categorySlug: string,
) {
  const path = `/blog/${categorySlug}/${post.slug}`
  const markdownPath = `${path}.md`
  const canonicalUrl = post.canonical_url?.trim() || absoluteUrl(origin, path)

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
    renderContentMarkdownWithComponents(post.body, post.components),
  ].join('\n')
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
    `- [Docs index JSON](${absoluteUrl(origin, '/docs-index.json')}): Machine-readable manifest of published docs.`,
    `- [Blog index JSON](${absoluteUrl(origin, '/blog/index.json')}): Machine-readable manifest of published platform blog posts.`,
    `- [Blog RSS feed](${absoluteUrl(origin, '/blog/rss.xml')}): Chronological feed for published platform posts.`,
    `- [Blog JSON feed](${absoluteUrl(origin, '/blog/feed.json')}): JSON Feed export for published platform posts.`,
  ]

  return `${lines.join('\n').trim()}\n`
}

export function buildLlmsFullTxt(
  origin: string,
  docs: Array<PlatformMarkdownDocLike & { categorySlug: string }>,
  posts: Array<PlatformMarkdownPostLike & { categorySlug: string }>,
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
    lines.push('', renderPlatformDocMarkdown(doc, origin, doc.categorySlug), '')
  }

  lines.push('## Blog')

  for (const post of posts) {
    lines.push('', renderPlatformBlogMarkdown(post, origin, post.categorySlug), '')
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

export function fallbackSummary(value: string | null | undefined, fallback: string) {
  return safeSummary(value, fallback)
}
