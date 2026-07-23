#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import slugify from 'slugify'
import { parse as parseYaml } from 'yaml'
import { BLAWBY_REFERENCE_COMMIT, NCLS_ARTICLE_SLUGS } from '../blawby-parity-config.mjs'
import { normalizeNonprofitStatus } from '../utils/nonprofit-status.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const defaultReferenceRepo = path.join(repoRoot, '.scratch', 'reference', 'react-next-marketing-site-template')
const defaultSource = path.join(defaultReferenceRepo, 'tenants', 'northcarolinalegalservices', 'northcarolinalegalservices.ts')
const defaultClientImportDir = path.join(repoRoot, 'client-imports', 'north-carolina-legal-services')
const siteId = 'site-ncls-blawby'
const approvedDonationUrl = 'https://donate.stripe.com/bIY29UfAUec37GocMM'
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

function parseArgs(argv) {
  const args = { source: defaultSource, out: null, stdout: false, dryRun: false, approve: false, apply: false, clientImportDir: defaultClientImportDir }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--source') args.source = path.resolve(argv[++i])
    else if (arg === '--out') args.out = path.resolve(argv[++i])
    else if (arg === '--stdout') args.stdout = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--approve') args.approve = true
    else if (arg === '--apply') args.apply = true
    else if (arg === '--client-import-dir') args.clientImportDir = path.resolve(argv[++i])
  }
  return args
}

function resolveConsultationPriceUsd(sourcePath) {
  const sharedConstPath = path.resolve(path.dirname(sourcePath), '..', '..', 'lib', 'const', 'shared.ts')
  const sharedSource = fs.readFileSync(sharedConstPath, 'utf8')
  const match = sharedSource.match(/export const CONSULTATION_PRICE_USD\s*=\s*(\d+(?:\.\d+)?)/)
  if (!match) throw new Error(`Unable to resolve CONSULTATION_PRICE_USD from ${sharedConstPath}`)
  return match[1]
}

function evaluateTenantConfig(sourcePath) {
  let source = fs.readFileSync(sourcePath, 'utf8')
  source = source
    .replace(/^import[\s\S]*?^const domain/m, 'const domain')
    .replace(/export const northcarolinalegalservices\s*:\s*ISeedTenant\s*=/, 'const northcarolinalegalservices =')
    .replace(/DateTime\.fromObject\((\{[\s\S]*?\})\)\.toJSDate\(\)/g, 'new Date($1)')
    .replace(/\bE(AccountRole|MediaType|SocialPlatform)\.([A-Za-z0-9_]+)/g, (_, _enumName, value) => JSON.stringify(value))

  if (/\bCONSULTATION_PRICE_USD\b/.test(source)) {
    source = source.replace(/\bCONSULTATION_PRICE_USD\b/g, resolveConsultationPriceUsd(sourcePath))
  }

  const context = {
    Date,
    console,
  }
  vm.createContext(context)
  const script = new vm.Script(`${source}\n; northcarolinalegalservices;`, { filename: sourcePath })
  return script.runInContext(context)
}

function safeFileName(sourcePath) {
  const decoded = decodeURIComponent(String(sourcePath || '').replace(/^\/+/, ''))
  return path.basename(decoded).replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function legalAssetFor(sourcePath) {
  const fileName = safeFileName(sourcePath)
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const r2Key = `sites/${siteId}/media/legal/${fileName}`
  return {
    kind: 'legal_file',
    role: sourcePath.toLowerCase().includes('irs') ? 'irs_determination' : sourcePath.toLowerCase().includes('dba') ? 'dba_registration' : 'legal_document',
    source_path: sourcePath,
    approved_storage_required: true,
    asset_id: `asset_ncls_legal_${base || createHash('sha1').update(sourcePath).digest('hex').slice(0, 10)}`,
    r2_key: r2Key,
    public_url: `https://media.krabiclaw.com/${r2Key}`,
    file_name: fileName,
    mime_type: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
  }
}

function mimeTypeFor(fileName) {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'pdf') return 'application/pdf'
  return 'application/octet-stream'
}

function storageAssetFor(entry) {
  const source = entry.source_path || entry.source_name || entry.file_name || entry.role || 'asset'
  const fileName = safeFileName(source)
  const hash = createHash('sha1').update(String(source).toLowerCase()).digest('hex').slice(0, 8)
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const mimeType = mimeTypeFor(fileName)
  const isR2 = mimeType === 'application/pdf' || mimeType === 'image/svg+xml'
  const storagePath = `sites/${siteId}/media/${isR2 ? 'files' : 'images'}/${fileName}`
  return {
    asset_id: `asset_ncls_media_${base || 'asset'}_${hash}`,
    public_url: isR2 ? `https://media.krabiclaw.com/${storagePath}` : `https://images.krabiclaw.com/${storagePath}`,
    r2_key: isR2 ? storagePath : null,
    file_name: fileName,
    mime_type: mimeType,
    storage_provider: isR2 ? 'cloudflare_r2' : 'cloudflare_images',
  }
}

function htmlishToMarkdown(value, linkMap = new Map()) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/<strong><u>(.*?)<\/u><\/strong>/gi, '**$1**')
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href, label) => `[${label}](${linkMap.get(href) || href})`)
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeNclsArticleContent(value) {
  return value
    .replace(
      "**Inequality isn't just about identity—it's woven into our systems. It shows up in **",
      "**Inequality isn't just about identity—it's woven into our systems.** It shows up in **",
    )
    .replace('programs don’t stop there\\*\\*.', 'programs don’t stop there**.')
    .replaceAll('contact@northcarolinalegalservices.com', 'contact@northcarolinalegalservices.org')
    .replace(
      'An attested written will is a type-written, signed will that is also signed by two competent witnesses and notarized.',
      'An attested written will is signed by the testator and by two competent witnesses. Notarization is not required for basic validity; it is used to make the will self-proved under N.C.G.S. § 31-11.6.',
    )
}

function plainMdx(value) {
  return String(value || '')
    .replace(/<br\s*\/?>(?:<\/br>)?/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mdxLead(value) {
  const content = String(value || '').trim()
  const heading = content.match(/^#{1,6}\s+([^\n]+)/)?.[1] || ''
  const headingAccent = heading.match(/\*\*(.*?)\*\*/)?.[1] || null
  const trailing = content.replace(/^#{1,6}\s+[^\n]+/, '').trim()
  const leadingAccentMatch = trailing.match(/^\*\*(.*?)\*\*(?:\s*\n|\s*$)/)
  const accent = headingAccent || leadingAccentMatch?.[1] || null
  const description = headingAccent || !leadingAccentMatch
    ? trailing
    : trailing.slice(leadingAccentMatch[0].length).trim()
  return {
    title: plainMdx(heading),
    title_with_breaks: heading
      .split(/<br\s*\/?>(?:<\/br>)?/gi)
      .map(part => plainMdx(part))
      .filter(Boolean)
      .join('\n'),
    title_without_accent: headingAccent ? plainMdx(heading).replace(plainMdx(headingAccent), '').trim() : plainMdx(heading),
    accent: plainMdx(accent),
    description: plainMdx(description),
  }
}

function heroSubFor(config, variant) {
  return (config.heroSubComponents || []).find(component => component.variant === variant) || null
}

function assetPointer(role, sourceName, extra = {}) {
  if (!sourceName) return null
  const asset = storageAssetFor({ kind: 'image', role, source_name: sourceName, ...extra })
  return {
    asset_id: asset.asset_id,
    url: asset.public_url,
    role,
    source_name: sourceName,
  }
}

function parseSourceDate(value) {
  if (!value) return null
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  const source = String(value).trim()
  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const us = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null
  if (!parts) {
    const parsed = new Date(source)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const [year, month, day] = parts.map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed.toISOString()
    : null
}

function parseMarkdownArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match) throw new Error(`Article is missing YAML front matter: ${filePath}`)
  const metadata = parseYaml(match[1]) || {}
  const fileSlug = path.basename(filePath, path.extname(filePath))
  const slug = String(metadata.slug || slugify(String(metadata.title || fileSlug), { lower: true, strict: true })).trim()
  const authorParts = String(metadata.author || '').trim().split(/\s+/).filter(Boolean)
  const authorFirstName = authorParts.shift() || null
  const authorSurname = authorParts.pop() || null
  const localMedia = new Set()
  const addLocalMedia = (value) => {
    const source = String(value || '').trim()
    if (source.startsWith('/') && /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(source)) localMedia.add(source)
  }
  addLocalMedia(metadata.image)
  addLocalMedia(metadata.authorImage)
  for (const imageMatch of match[2].matchAll(/!\[[^\]]*\]\((\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) addLocalMedia(imageMatch[1])
  for (const imageMatch of match[2].matchAll(/<img\b[^>]*\bsrc=["'](\/[^"']+)["'][^>]*>/gi)) addLocalMedia(imageMatch[1])

  const mediaReplacements = new Map([...localMedia].map(source => [
    source,
    assetPointer('article_inline_image', safeFileName(source), { article_slug: slug, source_path: source })?.url,
  ]))
  // Preserve Markdown hard breaks without carrying source trailing whitespace into generated SQL.
  let body = match[2].replace(/[ \t]+(?=\r?$)/gm, whitespace => whitespace.length >= 2 ? '<br>' : '').trim()
  for (const [source, destination] of mediaReplacements) {
    if (destination) body = body.split(source).join(destination)
  }

  return {
    title: String(metadata.title || slug),
    slug,
    description: metadata.desc ? String(metadata.desc) : null,
    content: body,
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords.map(String) : [],
    imageName: metadata.image ? safeFileName(metadata.image) : null,
    authorImageName: metadata.authorImage ? safeFileName(metadata.authorImage) : null,
    authorFirstName,
    authorSurname,
    createdAt: parseSourceDate(metadata.createdAt),
    updatedAt: parseSourceDate(metadata.updatedAt),
    oldSlugs: [...new Set([
      ...(Array.isArray(metadata.oldSlugs) ? metadata.oldSlugs.map(String) : []),
      ...(fileSlug !== slug ? [fileSlug] : []),
    ])],
    inlineMedia: [...localMedia]
      .filter(source => safeFileName(source) !== safeFileName(metadata.image) && safeFileName(source) !== safeFileName(metadata.authorImage))
      .map(source => ({ source_name: safeFileName(source) })),
  }
}

function loadSourceArticles(sourcePath, fallbackArticles = []) {
  if (!sourcePath) return fallbackArticles
  const articlesDir = path.join(path.dirname(sourcePath), 'articles')
  if (!fs.existsSync(articlesDir)) return fallbackArticles
  const markdownArticles = fs.readdirSync(articlesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => parseMarkdownArticle(path.join(articlesDir, entry.name)))
  const bySlug = new Map((fallbackArticles || []).map(article => [article.slug, article]))
  for (const article of markdownArticles) bySlug.set(article.slug, article)
  return [...bySlug.values()]
}

function metadataFor(config, type) {
  return (config.pagesMetadata || []).find((page) => page.type === type) || {}
}

function pagePathForVariant(variant) {
  if (variant === 'home') return '/'
  if (variant === 'services') return '/services'
  if (variant === 'privacy') return '/policies/privacy'
  if (variant === 'terms') return '/policies/terms'
  if (variant === 'third-party') return '/third-party-notices'
  if (variant === 'pricing') return '/pricing'
  if (variant === 'donate') return '/donate'
  if (variant === 'about') return '/about'
  return `/${variant}`
}

function consultationExternalUrl(config) {
  return (
    config.scheduleRedirectComponent?.buttonUrl ||
    config.scheduleHeroComponent?.buttonUrl ||
    config.enhancedScheduleComponent?.buttonUrl ||
    config.tenant.bookingUrl ||
    '/schedule'
  )
}

function donationExternalUrl(config) {
  return config.tenant.donationUrl || config.donationUrl || approvedDonationUrl
}

function tenantPageFromVariant(page, config, linkMap) {
  const variant = page.variant || page.type
  const metadata = metadataFor(config, variant)
  const body = Array.isArray(page.description) ? page.description.join('\n\n') : page.description
  return {
    id: `page_ncls_${variant}`,
    path: pagePathForVariant(variant),
    title: page.title,
    page_type: variant,
    summary: metadata.description || (Array.isArray(page.description) ? page.description[0] : ''),
    body: htmlishToMarkdown(body, linkMap),
    components: page.components || [],
    cta_label: variant === 'donate' ? 'Donate externally' : null,
    cta_url: variant === 'donate' ? donationExternalUrl(config) : null,
    seo_title: metadata.title || null,
    seo_description: metadata.description || null,
    canonical_url: null,
    robots: null,
    status: 'published',
    sort_order: 0,
  }
}

function collectLegalFiles(config) {
  const html = `${config.tenant?.footerDescription || ''}\n${config.terms?.content || ''}\n${config.privacy?.content || ''}`
  const files = []
  const seen = new Set()
  for (const match of html.matchAll(/href="([^"]+\.(?:pdf|docx?|xlsx?))"/gi)) {
    const sourcePath = match[1]
    if (seen.has(sourcePath)) continue
    seen.add(sourcePath)
    files.push(legalAssetFor(sourcePath))
  }
  return files
}

function collectMediaInventory(config, offerings, articles, legalFiles = collectLegalFiles(config)) {
  const files = []
  const seen = new Set()
  const add = (entry) => {
    const normalized = entry.approved_storage_required !== false && !entry.public_url
      ? { ...storageAssetFor(entry), ...entry, ...storageAssetFor(entry) }
      : entry
    const key = `${normalized.kind}:${normalized.source_path || normalized.source_name || normalized.asset_id}`
    if (seen.has(key)) return
    seen.add(key)
    files.push({
      approved_storage_required: true,
      upload_status: 'pending',
      asset_id: null,
      public_url: null,
      ...normalized,
    })
  }

  add({ kind: 'logo', role: 'brand_logo', source_path: 'icons/logo.svg' })
  add({ kind: 'logo', role: 'brand_logo_dark', source_path: 'icons/logo-dark.svg' })
  add({ kind: 'image', role: 'article_author_image', source_name: 'rich-gittings-author.webp' })

  if (config.heroComponent) add({ kind: 'image', role: 'home_hero_background', source_name: 'background-hero.webp' })
  if (config.secondaryServicesComp) add({ kind: 'image', role: 'services_background', source_name: 'background-features.webp' })
  if (config.faqs?.length) add({ kind: 'image', role: 'qa_background', source_name: 'background-feature-2.webp' })
  if (config.ctaComponent) {
    add({ kind: 'image', role: 'consultation_cta_background', source_name: 'background-cta.webp' })
    add({ kind: 'image', role: 'consultation_cta_featured', source_name: 'logo-2.webp' })
  }

  for (const videoFeature of config.videoFeatures || []) {
    for (const imageName of videoFeature.imageNames || []) {
      add({ kind: 'image', role: 'approach_supporting_image', source_name: imageName })
    }
  }

  for (const entry of config.peopleAndAccounts || []) {
    const person = entry.person
    if (!person?.firstName || !person?.surname) continue
    const sourceName = `${person.firstName.toLowerCase()}-${person.surname.toLowerCase()}.webp`
    if (person.type === 'creator') add({ kind: 'image', role: 'team_portrait', source_name: sourceName })
  }

  for (const testimonial of config.testimonials || []) {
    if (!testimonial.firstname || !testimonial.surname) continue
    add({
      kind: 'image',
      role: 'reviewer_photo',
      source_name: `${testimonial.firstname.toLowerCase()}-${testimonial.surname.toLowerCase()}.webp`,
    })
  }

  for (const feature of config.tenant.features || []) {
    if (feature.icon) add({ kind: 'image', role: 'tenant_feature_icon', source_name: feature.icon })
  }

  for (const offering of offerings) {
    if (offering.source_media?.thumbnailFileName) {
      add({
        kind: 'image',
        role: 'offering_thumbnail',
        offering_slug: offering.slug,
        source_name: offering.source_media.thumbnailFileName,
      })
    }
    for (const media of offering.source_media?.media || []) {
      if (media.name) {
        add({
          kind: 'image',
          role: 'offering_media',
          offering_slug: offering.slug,
          source_name: media.name,
        })
      }
    }
    for (const image of offering.source_media?.features || []) {
      add({
        kind: 'image',
        role: 'offering_feature',
        offering_slug: offering.slug,
        source_name: image,
      })
    }
  }

  for (const article of articles) {
    if (article.source_image) {
      add({
        kind: 'image',
        role: 'article_image',
        article_slug: article.slug,
        source_name: article.source_image,
      })
    }
    if (article.author_image_source) {
      add({
        kind: 'image',
        role: 'article_author_image',
        article_slug: article.slug,
        source_name: article.author_image_source,
      })
    }
    for (const media of article.inline_media || []) {
      add({
        kind: 'image',
        role: 'article_inline_image',
        article_slug: article.slug,
        source_name: media.source_name,
      })
    }
  }

  for (const legalFile of legalFiles) add(legalFile)

  return {
    source: 'react-next-marketing-site-template/tenants/northcarolinalegalservices',
    source_commit: BLAWBY_REFERENCE_COMMIT,
    approved_hosts: ['media.krabiclaw.com', 'images.krabiclaw.com', 'imagedelivery.net'],
    disallowed_hosts: ['vercel.app', 'vercel-storage.com', 'blob.vercel-storage.com'],
    files,
  }
}

function buildRouteInventory(offerings, pages, articles, redirects = []) {
  return {
    preservedRoutes: [
      '/',
      '/services',
      ...offerings.map((offering) => offering.canonical_path || `/services/${offering.slug}`),
      '/schedule',
      '/pricing',
      '/donate',
      '/blog',
      ...articles.map((article) => article.canonical_url || `/article/${article.slug}`),
      ...pages.map((page) => page.path),
    ],
    intentionalExclusions: [
      {
        path: '/thank-you',
        handling: 'Use KrabiClaw native noindex confirmation pages instead of SEO content.',
      },
      {
        path: '/conference',
        behavior: 'gone',
        handling: 'Out of cutover scope for the first Blawby/NCLS PR.',
      },
    ],
    redirects,
  }
}

function buildEditSurfaceMatrix() {
  return [
    {
      area: 'offerings',
      dashboard: 'server/api/editor/sites/[siteId]/professional-services.patch.ts',
      mcp: 'professional_services content tools share the same tables',
      chowbot: 'professional_services content tools share the same tables',
      status: 'core fields editable',
    },
    {
      area: 'tenant_pages',
      dashboard: 'server/api/editor/sites/[siteId]/professional-services.patch.ts',
      mcp: 'professional_services content tools share the same tables',
      chowbot: 'professional_services content tools share the same tables',
      status: 'core fields editable',
    },
    {
      area: 'consultation',
      dashboard: 'server/api/editor/sites/[siteId]/professional-services.patch.ts',
      mcp: 'professional_services content tools share the same tables',
      chowbot: 'professional_services content tools share the same tables',
      status: 'external URL editable',
    },
    {
      area: 'theme_tokens',
      dashboard: 'server/api/editor/sites/[siteId]/professional-services.patch.ts',
      mcp: 'professional_services content tools share the same tables',
      chowbot: 'professional_services content tools share the same tables',
      status: 'constrained token JSON editable',
    },
  ]
}

function buildPayload(config, sourcePath = null) {
  const tenant = config.tenant
  const impactStats = config.impactStats || tenant.impactStats || null
  const sourceArticles = loadSourceArticles(sourcePath, config.articles || [])
  const legalFiles = collectLegalFiles(config)
  const legalLinkMap = new Map(legalFiles.map(file => [file.source_path, file.public_url]))
  const homeHero = mdxLead(config.heroComponent?.content)
  const servicesIntro = mdxLead(config.secondaryServicesComp?.content)
  const approach = mdxLead((config.videoFeatures || []).find(feature => feature.variant === 'index')?.content)
  const cta = mdxLead(config.ctaComponent?.content)
  const homeVideo = (config.videoFeatures || []).find(feature => feature.variant === 'index') || null
  const homeHeroAsset = assetPointer('home_hero_background', 'background-hero.webp')
  const servicesDecoration = assetPointer('services_background', 'background-features.webp')
  const faqDecoration = assetPointer('qa_background', 'background-feature-2.webp')
  const ctaBackground = assetPointer('consultation_cta_background', 'background-cta.webp')
  const ctaFeatured = assetPointer('consultation_cta_featured', 'logo-2.webp')
  const commonCta = {
    type: 'consultation_cta',
    title: cta.title,
    accent: cta.accent,
    description: cta.description,
    label: config.ctaComponent?.cta || 'Request a Consultation',
    url: config.ctaComponent?.href || '/schedule',
    background: ctaBackground,
    featured: ctaFeatured,
  }
  const servicesComponent = {
    type: 'services_intro',
    title: servicesIntro.title_without_accent,
    accent: servicesIntro.accent,
    description: servicesIntro.description,
    decoration: servicesDecoration,
  }
  const pageHero = (variant) => {
    const source = heroSubFor(config, variant)
    return source
      ? {
          type: 'page_hero',
          title: source.title,
          description: Array.isArray(source.description) ? source.description.join('\n\n') : source.description,
          variant: variant === 'price' ? 'pricing' : variant,
          background: source.bgColor || null,
        }
      : null
  }
  const team = (config.peopleAndAccounts || [])
    .map(entry => entry.person)
    .filter(person => person?.type === 'creator')
    .map((person, index) => {
      const fileName = `${String(person.firstName).toLowerCase()}-${String(person.surname).toLowerCase()}.webp`
      return {
        first_name: person.firstName,
        last_name: person.surname,
        title: person.title || null,
        bio: person.bio || null,
        url: person.url || null,
        sort_order: index,
        image: assetPointer('team_portrait', fileName, { person_name: `${person.firstName} ${person.surname}` }),
      }
    })
  const staticPageSources = [
    {
      variant: 'home',
      title: homeHero.title || tenant.name,
      description: homeHero.description || tenant.description,
      components: [
        {
          type: 'home_hero',
          title: homeHero.title_with_breaks || homeHero.title || tenant.name,
          accent: homeHero.accent,
          description: homeHero.description || tenant.description,
          label: config.heroComponent?.cta || 'Request a Consultation',
          url: config.heroComponent?.ctaLink || '/schedule',
          background: homeHeroAsset,
        },
        servicesComponent,
        homeVideo && {
          type: 'video_feature',
          title: approach.title,
          accent: approach.accent,
          video_url: homeVideo.videoUrl,
          video_title: config.videoMedia?.[0]?.alt || null,
          features: homeVideo.features || [],
          images: (homeVideo.imageNames || []).map(name => assetPointer('approach_supporting_image', name)),
        },
        { type: 'qa', decoration: faqDecoration },
        { type: 'reviews', title: mdxLead(config.testimonialsComp?.content).title, description: mdxLead(config.testimonialsComp?.content).description },
        { type: 'latest_articles' },
        commonCta,
      ].filter(Boolean),
    },
    {
      variant: 'services',
      title: tenant.servicesName || 'Services',
      description: servicesIntro.description,
      components: [servicesComponent, { type: 'qa', decoration: faqDecoration }, commonCta],
    },
    {
      variant: 'about',
      title: heroSubFor(config, 'about')?.title || `About ${tenant.name}`,
      description: heroSubFor(config, 'about')?.description || tenant.description,
      components: [
        pageHero('about'),
        {
          type: 'team',
          features: (config.tenant.features || []).map(feature => ({
            title: feature.title,
            description: feature.desc,
            icon: assetPointer('tenant_feature_icon', feature.icon),
          })),
          people: team,
        },
        impactStats && { type: 'impact', ...impactStats },
        servicesComponent,
        { type: 'qa', decoration: faqDecoration },
        { type: 'reviews', title: mdxLead(config.testimonialsComp?.content).title, description: mdxLead(config.testimonialsComp?.content).description },
        commonCta,
      ].filter(Boolean),
    },
    {
      variant: 'pricing',
      title: 'Pricing and Fees',
      description: [
        metadataFor(config, 'pricing').description,
        config.priceTableComponent?.description,
      ].filter(Boolean),
      components: [
        pageHero('price'),
        { type: 'pricing_plans', plans: config.pricePlans || [] },
        {
          type: 'pricing_calculator',
          title: 'Sliding-scale fee estimator',
          note: config.priceTableComponent?.notice || config.priceTableComponent?.description || '',
          source: 'React NCLS priceTableComponent normalized by Blawby adapter',
          effectiveDate: config.priceTableComponent?.effectiveDate || null,
          table: config.priceTableComponent || null,
          enabled: Boolean(config.priceTableComponent),
        },
        { type: 'qa', decoration: faqDecoration },
        servicesComponent,
        commonCta,
      ].filter(Boolean),
    },
    {
      variant: 'contact',
      title: heroSubFor(config, 'contact')?.title || 'Contact Us',
      description: heroSubFor(config, 'contact')?.description || config.contactRowComponent?.description,
      components: [
        pageHero('contact'),
        {
          type: 'contact_cards',
          ...config.contactRowComponent,
          cardsContent: (config.contactRowComponent?.cardsContent || []).map(htmlishToMarkdown),
        },
        { type: 'qa', decoration: faqDecoration },
        { type: 'reviews' },
        commonCta,
      ].filter(Boolean),
    },
    {
      variant: 'schedule',
      title: config.scheduleHeroComponent?.title || heroSubFor(config, 'schedule')?.title || 'Request a Consultation',
      description: config.scheduleHeroComponent?.description || heroSubFor(config, 'schedule')?.description,
      components: [
        { type: 'schedule_hero', ...config.scheduleHeroComponent },
        { type: 'schedule_guidance', ...config.enhancedScheduleComponent, decoration: servicesDecoration },
        {
          type: 'schedule_qa',
          items: (config.faqs || []).filter(faq => faq.pageType === 'schedule'),
          decoration: faqDecoration,
        },
        { type: 'reviews' },
        {
          type: 'schedule_cta',
          ...config.scheduleRedirectComponent,
          background: ctaBackground,
        },
      ],
    },
    {
      variant: 'blog',
      title: heroSubFor(config, 'blog')?.title || 'Our Blog',
      description: heroSubFor(config, 'blog')?.description || metadataFor(config, 'blog').description,
      components: [pageHero('blog'), { type: 'article_filters' }, { type: 'disclaimer', content: tenant.disclaimer }, { type: 'qa', decoration: faqDecoration }, commonCta].filter(Boolean),
    },
    {
      variant: 'donate',
      title: 'Support Equal Access to Justice',
      description: [
        impactStats?.additionalDescription,
        metadataFor(config, 'donate').description,
      ].filter(Boolean),
      components: [
        pageHero('donate'),
        {
          type: 'donation_choices',
          tiers: (config.donationTiers || []).map(tier => ({
            amount: Number(tier.amount),
            title: tier.title,
            description: tier.description,
            featured: tier.featured === true,
            icon: tier.icon || 'ScaleIcon',
          })),
        },
        impactStats && { type: 'impact', ...impactStats },
        {
          type: 'donation_support',
          difference: {
            title: 'Your Donation Makes a Difference',
            description: 'Every dollar you contribute goes directly to providing legal services for those who need it most. Your support helps us fight for justice, equality, and fairness in our community.',
            items: ['Tax-deductible contribution', 'Secure payment processing', 'Immediate impact on our community'],
          },
          other_ways: {
            title: 'Other Ways to Support',
            description: 'Beyond financial contributions, there are many ways to support our mission:',
            items: [
              { title: 'Volunteer your time and expertise', description: 'Help us serve more families in need', url: '/contact?type=volunteer', icon: 'UserGroupIcon' },
              { title: 'Spread awareness about our services', description: 'Share our mission with your network', url: '/blog', icon: 'AcademicCapIcon' },
              { title: 'Partner with us professionally', description: 'Join us in making justice accessible', url: '/contact?type=partnership', icon: 'ScaleIcon' },
            ],
          },
        },
        { type: 'qa', decoration: faqDecoration },
      ].filter(Boolean),
    },
    {
      variant: 'privacy',
      title: 'Privacy Policy',
      description: config.privacy?.content || metadataFor(config, 'privacy').description,
      components: [
        pageHero('privacy'),
        config.privacy?.updatedAt && { type: 'legal_meta', updated_at: parseSourceDate(config.privacy.updatedAt) },
      ].filter(Boolean),
    },
    {
      variant: 'terms',
      title: 'Terms of Use',
      description: config.terms?.content || metadataFor(config, 'terms').description,
      components: [pageHero('terms')].filter(Boolean),
    },
    {
      variant: 'third-party',
      title: 'Third-Party Notices',
      description: config.thirdPartyNotice?.content || metadataFor(config, 'third-party').description,
      components: [pageHero('third-party'), commonCta].filter(Boolean),
    },
  ]
  const pages = staticPageSources.map((page) => tenantPageFromVariant(page, config, legalLinkMap))

  const offerings = (config.services || []).map((service) => {
    const thumbnail = assetPointer('offering_thumbnail', service.thumbnailFileName, { offering_slug: service.slug })
    const media = (service.media || []).map((item, index) => item.name
      ? assetPointer('offering_media', item.name, { offering_slug: service.slug, sort_order: index })
      : null).filter(Boolean)
    const hero = media[0] || thumbnail
    return {
      id: `offering_ncls_${service.slug}`,
      name: service.name,
      slug: service.slug,
      label: service.name,
      summary: htmlishToMarkdown(service.summary || service.description || '') || null,
      short_description: htmlishToMarkdown(service.description || service.summary || '') || null,
      body: htmlishToMarkdown(service.content || service.description || '') || null,
      features: (service.features || []).map((feature, index) => ({
        title: feature.title,
        description: feature.description,
        image_url: assetPointer('offering_feature', feature.img, { offering_slug: service.slug })?.url || null,
        image_asset_id: assetPointer('offering_feature', feature.img, { offering_slug: service.slug })?.asset_id || null,
        icon: feature.icon || null,
        icon_url: null,
        sort_order: index,
      })),
      faqs: (service.faqs || []).map((faq) => ({ question: faq.question, answer: faq.answer })),
      cta_label: 'Schedule a consultation',
      cta_url: '/schedule',
      thumbnail_asset_id: thumbnail?.asset_id || null,
      hero_image_asset_id: hero?.asset_id || null,
      media_asset_ids: media.map(item => item.asset_id),
      schema_type: service.itemType || 'LegalService',
      seo_title: `${service.name} | ${tenant.name}`,
      seo_description: service.description || service.summary || null,
      canonical_path: `/services/${service.slug}`,
      status: 'published',
      sort_order: Number(service.order || 0),
      featured: Number(service.order || 0) <= 3,
      source_media: {
        thumbnailFileName: service.thumbnailFileName || null,
        media: service.media || [],
        features: (service.features || []).map((feature) => feature.img).filter(Boolean),
      },
    }
  })

  const articles = sourceArticles.map((article) => {
    const featuredImage = assetPointer('article_image', article.imageName, { article_slug: article.slug })
    const authorImageName = [article.authorFirstName, article.authorSurname].filter(Boolean).length === 2
      ? `${article.authorFirstName.toLowerCase()}-${article.authorSurname.toLowerCase()}-author.webp`
      : article.authorImageName || null
    const publishedAt = parseSourceDate(article.createdAt)
    const updatedAt = parseSourceDate(article.updatedAt) || publishedAt
    return {
      title: article.title,
      slug: article.slug,
      excerpt: article.description || null,
      body: normalizeNclsArticleContent(article.content || ''),
      category: Array.isArray(article.tags) ? article.tags[0] : null,
      tags: Array.isArray(article.tags) ? article.tags : [],
      author_name: [article.authorFirstName, article.authorSurname].filter(Boolean).join(' ') || null,
      published_at: publishedAt,
      updated_at: updatedAt,
      seo_description: article.description || null,
      seo_keywords: Array.isArray(article.keywords) ? article.keywords.join(', ') : null,
      canonical_url: null,
      featured_image_asset_id: featuredImage?.asset_id || null,
      source_image: article.imageName || null,
      author_image_source: authorImageName,
      inline_media: article.inlineMedia || [],
      old_slugs: article.oldSlugs || [],
    }
  })
  const redirects = [
    ...articles.flatMap(article => article.old_slugs.map((oldSlug, index) => ({
      id: `redirect_ncls_article_${article.slug}_${index}`,
      from_path: `/article/${oldSlug}`,
      to_path: `/article/${article.slug}`,
      status_code: 301,
      behavior: 'redirect',
      reason: 'Pinned React article oldSlugs migration',
      source: 'react-adapter',
    }))),
    {
      id: 'redirect_ncls_conference_gone',
      from_path: '/conference',
      to_path: null,
      status_code: 410,
      behavior: 'gone',
      reason: 'Explicitly retire the indexed conference route',
      source: 'search-console-2026-07-13',
    },
    {
      id: 'redirect_ncls_service_personal_injury',
      from_path: '/services/personal-injury',
      to_path: '/services',
      status_code: 301,
      behavior: 'redirect',
      reason: 'Preserve the indexed source service URL after the offering was retired',
      source: 'search-console-2026-07-13',
    },
    ...legalFiles.map((file, index) => ({
      id: `redirect_ncls_legal_file_${index + 1}`,
      from_path: file.source_path,
      to_path: file.public_url,
      status_code: 301,
      behavior: 'redirect',
      reason: 'Preserve the indexed legal document URL on approved storage',
      source: 'search-console-2026-07-13',
    })),
  ]
  const externalConsultationUrl = consultationExternalUrl(config)
  const externalDonationUrl = donationExternalUrl(config)
  const serviceAreaName = config.serviceArea?.name === 'North Carlina'
    ? 'North Carolina'
    : config.serviceArea?.name || config.serviceArea?.locality || 'North Carolina'
  const personTitles = new Map((config.peopleAndAccounts || []).map(entry => [
    `${entry.person?.firstName || ''} ${entry.person?.surname || ''}`.trim(),
    entry.person?.title || null,
  ]))
  const siteQa = (config.faqs || [])
    .map((faq, index) => ({
      id: `qa_ncls_site_${index + 1}`,
      question: faq.question,
      answer: faq.answer,
      page_path: faq.pageType ? `/${faq.pageType}` : null,
      sort_order: index,
      source: 'import',
      status: 'published',
    }))
  const reviews = (config.testimonials || []).map((testimonial, index) => {
    const authorName = `${testimonial.firstname || ''} ${testimonial.surname || ''}`.trim()
    const photo = assetPointer(
      'reviewer_photo',
      `${String(testimonial.firstname || '').toLowerCase()}-${String(testimonial.surname || '').toLowerCase()}.webp`,
      { reviewer_name: authorName },
    )
    return {
      id: `review_ncls_owner_${index + 1}`,
      author_name: authorName,
      reviewer_photo_asset_id: photo?.asset_id || null,
      reviewer_photo_url: photo?.url || null,
      rating: 5,
      title: personTitles.get(authorName) || null,
      content: testimonial.content,
      source: 'owner_entered',
      collection_method: 'migration',
      original_reference: 'Pinned React tenant testimonial import',
      publication_authorized: true,
      status: 'approved',
      sort_order: index,
    }
  })
  const headerNavigation = [
    ['Services', '/services'],
    ['Pricing', '/pricing'],
    ['About', '/about'],
    ['Contact', '/contact'],
    ['Blog', '/blog'],
    ['Donate', '/donate'],
  ].map(([label, url], index) => ({
    id: `nav_ncls_header_${index}`,
    area: 'header',
    label,
    url,
    item_type: 'internal',
    sort_order: index,
    status: 'active',
    metadata: {},
  }))
  const footerNavigation = (config.navigationItems || [])
    .filter(item => ['support', 'company', 'legal'].includes(item.category) && item.title && item.href)
    .filter((item, index, items) => items.findIndex(candidate =>
      candidate.category === item.category && candidate.title === item.title && candidate.href === item.href,
    ) === index)
    .map((item, index) => ({
      id: `nav_ncls_${item.category}_${index}`,
      area: item.category === 'legal' ? 'legal' : 'footer',
      label: item.title,
      url: item.href,
      item_type: /^https?:\/\//i.test(item.href) ? 'external' : 'internal',
      sort_order: Number(item.displayOrder ?? index),
      status: 'active',
      metadata: item.category === 'legal' ? {} : { group: item.category },
    }))
  const socialNavigation = (config.socials || []).map((social, index) => ({
    id: `nav_ncls_social_${index}`,
    area: 'social',
    label: social.platform,
    url: social.url,
    item_type: 'external',
    sort_order: index,
    status: 'active',
    metadata: { platform: social.platform },
  }))

  return {
    source: 'react-next-marketing-site-template/northcarolinalegalservices',
    source_commit: BLAWBY_REFERENCE_COMMIT,
    expected_article_slugs: NCLS_ARTICLE_SLUGS,
    site: {
      brand_name: tenant.name,
      brand_description: tenant.description,
      vertical: 'service',
      theme_id: 'blawby-theme-v1',
      domain: tenant.domain,
      email: tenant.email,
      phone: tenant.phone,
      service_area: config.serviceArea
        ? {
            ...config.serviceArea,
            name: serviceAreaName,
          }
        : null,
      logo_asset_id: assetPointer('brand_logo', 'icons/logo.svg')?.asset_id || null,
      favicon_url: '/tenants/northcarolinalegalservices/favicon.svg',
      author_image_url: assetPointer('article_author_image', 'rich-gittings-author.webp')?.url || null,
    },
    compliance: (() => {
      // Canonical contract: nonprofit_status must be a schema.org enum URL
      // (e.g. https://schema.org/Nonprofit501c3), never free text like
      // "501(c)(3)" — normalize here so the emitted seed/manifest is already
      // valid, matching the reject/normalize rule enforced at the shared
      // write layer (server/utils/professional-services-editor.ts).
      const nonprofitStatus = normalizeNonprofitStatus(tenant.nonProfitStatus || null)
      if (!nonprofitStatus.valid) {
        throw new Error(`NCLS adapter: tenant.nonProfitStatus "${tenant.nonProfitStatus}" is not a recognized schema.org nonprofit enumeration value.`)
      }
      const sameAs = (config.socials || [])
        .map(social => social.url)
        .filter(Boolean)
      const contactPoints = [
        (tenant.phone || tenant.email) && {
          contact_type: 'customer service',
          telephone: tenant.phone || null,
          email: tenant.email || null,
          area_served: serviceAreaName,
        },
      ].filter(Boolean)
      return {
        id: 'compliance_ncls',
        entity_name: tenant.legalName || tenant.name,
        dba_name: 'Bull City Legal Services',
        entity_type: tenant.type || 'LegalService',
        nonprofit_status: nonprofitStatus.value,
        registration_number: null,
        service_area: config.serviceArea?.locality || 'North Carolina',
        // NCLS is a statewide legal-aid nonprofit with no single public
        // office address — service_area_type + address_visibility: hidden
        // keeps the org graph honest instead of implying a storefront.
        service_area_type: 'State',
        address_visibility: 'hidden',
        founder_name: tenant.founder || null,
        founding_date: parseSourceDate(tenant.foundingDate),
        same_as: sameAs,
        contact_points: contactPoints,
        disclaimer: htmlishToMarkdown(tenant.disclaimer),
        footer_disclaimer: htmlishToMarkdown(tenant.footerDescription, legalLinkMap),
        document_asset_ids: legalFiles.map(file => file.asset_id),
        documents: legalFiles.map(file => ({
          asset_id: file.asset_id,
          role: file.role,
          label: file.role === 'irs_determination' ? 'IRS determination letter' : file.role === 'dba_registration' ? 'DBA registration' : file.file_name,
          public_url: file.public_url,
          file_name: file.file_name,
        })),
        metadata: {
          languages: tenant.languages,
          keywords: tenant.keywords,
          logo_dark_url: assetPointer('brand_logo_dark', 'icons/logo-dark.svg')?.url || null,
          header: {
            banner_content: config.headerComponent?.bannerContent || null,
            banner_dismissible: Boolean(config.headerComponent?.bannerIsDismissible),
          },
        },
      }
    })(),
    consultation: {
      id: 'consultation_ncls',
      mode: 'external_url',
      cta_label: 'Schedule a consultation',
      external_url: externalConsultationUrl,
      schedule_path: '/schedule',
      confirmation_path: '/contact/confirmed',
      tracking_enabled: true,
      metadata: {
        header_cta_label: config.headerComponent?.content || 'Get Started',
        // NCLS's source contact page has no web form; keep it optional and off by default for parity.
        contact_form_enabled: false,
      },
      legacy_source_calendly_url_ignored: tenant.calendlyUrl || null,
    },
    donation: {
      mode: 'external_url',
      external_url: externalDonationUrl,
    },
    analyticsBridge: {
      provider: 'gtm',
      container_id: tenant.googleTagManagerId || null,
      allowed_events: ['page_view', 'book_consultation_click', 'contact_submit', 'donation_click'],
      allowed_properties: ['event', 'page_type', 'page_path', 'cta_destination', 'tenant'],
      custom_head_code_ignored: Boolean(tenant.customHeadCode),
    },
    themeTokens: {
      bg: '#fbfaf7',
      surface: '#ffffff',
      primary: '#25356c',
      primaryDark: '#161f3b',
      primary100: '#f2f5ff',
      primary200: '#b4c5e5',
      primary800: '#1d294f',
      accent: '#c19855',
      accent100: '#faf5ea',
      accent200: '#f8f0e1',
      accentButton: '#b58c4f',
      accentStrong: '#a37732',
      border: '#e5e7eb',
      ink: '#162033',
    },
    navigation: [...headerNavigation, ...footerNavigation, ...socialNavigation],
    offerings,
    tenantPages: pages,
    articles,
    redirects,
    siteQa,
    reviews,
    mediaInventory: collectMediaInventory(config, offerings, articles, legalFiles),
    routeInventory: buildRouteInventory(offerings, pages, articles, redirects),
    editSurfaceMatrix: buildEditSurfaceMatrix(),
    intentionalDifferences: [
      'React components are not copied; Blawby is rebuilt in Nuxt/Vue using KrabiClaw public components.',
      'Calendly source data is ignored for NCLS; the configured booking destination is the external Clio Grow URL.',
      'Custom head code is not imported; GTM is represented as an allowlisted analytics bridge.',
      '/thank-you is replaced by KrabiClaw native noindex confirmation pages.',
      '/conference is intentionally out of cutover scope.',
      'Donation remains an external CTA; native donation/payment processing is excluded.',
      'The native KrabiClaw contact form is available as a platform capability but left off (contact_form_enabled: false) for NCLS to match the source contact page, which has no web form; the noindex confirmation page is still used for the native contact submission endpoint.',
    ],
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function preserveVerifiedMedia(payload, outDir) {
  const existingPath = path.join(outDir, 'client-manifest.json')
  if (!fs.existsSync(existingPath)) return payload
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'))
  const verifiedBySource = new Map((existing.mediaInventory?.files || [])
    .filter(file => file.upload_status === 'verified')
    .map(file => [`${file.role || ''}:${file.source_path || file.source_name || file.file_name || ''}`, file]))
  const replacements = new Map()
  payload.mediaInventory.files = payload.mediaInventory.files.map(file => {
    const key = `${file.role || ''}:${file.source_path || file.source_name || file.file_name || ''}`
    const verified = verifiedBySource.get(key)
    if (verified?.public_url && file.public_url && verified.public_url !== file.public_url) {
      replacements.set(file.public_url, verified.public_url)
    }
    return verified ? { ...file, ...verified } : file
  })
  const replaceUrls = value => {
    if (typeof value === 'string') {
      let updated = value
      for (const [from, to] of replacements) updated = updated.replaceAll(from, to)
      return updated
    }
    if (Array.isArray(value)) return value.map(replaceUrls)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replaceUrls(nested)]))
    }
    return value
  }
  return replaceUrls(payload)
}

function generateSeedPreview(outDir) {
  const seedPath = path.join(outDir, 'seed-preview.sql')
  const outFd = fs.openSync(seedPath, 'w')
  let result
  try {
    result = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts', 'generate-ncls-blawby-seed.mjs'),
      '--stdout',
      '--manifest',
      path.join(outDir, 'client-manifest.json'),
    ], {
      cwd: repoRoot,
      stdio: ['ignore', outFd, 'pipe'],
      encoding: 'utf8',
    })
  } finally {
    fs.closeSync(outFd)
  }
  if (result.error) {
    throw new Error(`Failed to generate NCLS Blawby seed preview: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`Failed to generate NCLS Blawby seed preview:\n${result.stderr}`)
  }
}

function writeClientImportArtifacts(payload, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  payload = preserveVerifiedMedia(payload, outDir)
  writeJson(path.join(outDir, 'blawby-import.json'), payload)
  writeJson(path.join(outDir, 'client-manifest.json'), payload)
  writeJson(path.join(outDir, 'media-manifest.json'), payload.mediaInventory)
  writeJson(path.join(outDir, 'route-manifest.json'), payload.routeInventory)
  writeJson(path.join(outDir, 'missing-fields.json'), {
    missing: [],
    unresolved_media: (payload.mediaInventory?.files || []).filter(file => file.approved_storage_required && !file.public_url),
    intentional_exclusions: payload.routeInventory?.intentionalExclusions || [],
  })
  generateSeedPreview(outDir)
  writeJson(path.join(outDir, 'approved.json'), {
    approved: false,
    invalidated: true,
    invalidated_reason: 'Canonical dry-run artifacts were regenerated and require fresh human review.',
    source_commit: BLAWBY_REFERENCE_COMMIT,
    slug: 'north-carolina-legal-services',
    vertical: 'service',
    adapter: 'ncls-blawby',
  })
}

function approvalHash(outDir) {
  const manifest = fs.readFileSync(path.join(outDir, 'client-manifest.json'), 'utf8')
  const seed = fs.readFileSync(path.join(outDir, 'seed-preview.sql'), 'utf8')
  return createHash('sha256').update(manifest).update(seed).digest('hex')
}

function approveClientImport(outDir) {
  const manifestPath = path.join(outDir, 'client-manifest.json')
  const seedPath = path.join(outDir, 'seed-preview.sql')
  if (!fs.existsSync(manifestPath) || !fs.existsSync(seedPath)) {
    throw new Error('No dry-run output found. Run --dry-run first.')
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.source_commit !== BLAWBY_REFERENCE_COMMIT) {
    throw new Error(`Import source must be pinned to ${BLAWBY_REFERENCE_COMMIT}.`)
  }
  const unresolved = (manifest.mediaInventory?.files || []).filter(file =>
    file.approved_storage_required && file.upload_status !== 'verified',
  )
  if (unresolved.length) {
    throw new Error(`Cannot approve import: ${unresolved.length} required media assets are not verified in KrabiClaw storage.`)
  }
  writeJson(path.join(outDir, 'approved.json'), {
    approved: true,
    approved_by: process.env.USERNAME || process.env.USER || 'unknown',
    approved_at: new Date().toISOString(),
    manifest_hash: approvalHash(outDir),
    source_commit: BLAWBY_REFERENCE_COMMIT,
    slug: 'north-carolina-legal-services',
    vertical: 'service',
    adapter: 'ncls-blawby',
  })
}

function assertPinnedCanonicalSource(sourcePath) {
  const resolvedSource = path.resolve(sourcePath)
  if (!resolvedSource.startsWith(path.resolve(defaultReferenceRepo) + path.sep)) return
  const result = spawnSync('git', ['-C', defaultReferenceRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Unable to inspect pinned source checkout: ${result.stderr || result.stdout}`)
  const revision = result.stdout.trim()
  if (revision !== BLAWBY_REFERENCE_COMMIT) {
    throw new Error(`Canonical source checkout moved: expected ${BLAWBY_REFERENCE_COMMIT}, found ${revision}`)
  }
}

function applyClientImport(outDir) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'client-replay.mjs'), '--slug', path.basename(outDir)], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status || 1)
}

if (isCli) {
  const args = parseArgs(process.argv.slice(2))
  assertPinnedCanonicalSource(args.source)
  const payload = buildPayload(evaluateTenantConfig(args.source), args.source)
  const output = `${JSON.stringify(payload, null, 2)}\n`

  if (args.dryRun) {
    writeClientImportArtifacts(payload, args.clientImportDir)
    console.error(`Wrote Blawby client-import artifacts to ${args.clientImportDir}`)
  }

  if (args.approve) {
    approveClientImport(args.clientImportDir)
    console.error(`Approval recorded at ${path.join(args.clientImportDir, 'approved.json')}`)
  }

  if (args.apply) {
    applyClientImport(args.clientImportDir)
  }

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true })
    fs.writeFileSync(args.out, output)
  }

  if (args.stdout || (!args.out && !args.dryRun && !args.approve && !args.apply)) {
    process.stdout.write(output)
  }
}

export {
  buildPayload,
  collectLegalFiles,
  collectMediaInventory,
  consultationExternalUrl,
  donationExternalUrl,
  evaluateTenantConfig,
  loadSourceArticles,
}
