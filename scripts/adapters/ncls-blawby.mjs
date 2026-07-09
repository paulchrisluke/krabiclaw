#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const defaultSource = path.join(repoRoot, '.tmp', 'react-next-marketing-site-template', 'tenants', 'northcarolinalegalservices', 'northcarolinalegalservices.ts')
const defaultClientImportDir = path.join(repoRoot, 'client-imports', 'north-carolina-legal-services')
const siteId = 'site-ncls-blawby'
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

function evaluateTenantConfig(sourcePath) {
  let source = fs.readFileSync(sourcePath, 'utf8')
  source = source
    .replace(/^import[\s\S]*?^const domain/m, 'const domain')
    .replace(/export const northcarolinalegalservices\s*:\s*ISeedTenant\s*=/, 'const northcarolinalegalservices =')
    .replace(/DateTime\.fromObject\((\{[\s\S]*?\})\)\.toJSDate\(\)/g, 'new Date($1)')
    .replace(/\bE(AccountRole|MediaType|SocialPlatform)\.([A-Za-z0-9_]+)/g, (_, _enumName, value) => JSON.stringify(value))
    .replace(/\bCONSULTATION_PRICE_USD\b/g, '45')

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
  const hash = createHash('sha1').update(`${entry.role || entry.kind}:${source}`).digest('hex').slice(0, 10)
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const mimeType = mimeTypeFor(fileName)
  const isR2 = mimeType === 'application/pdf' || mimeType === 'image/svg+xml'
  const storagePath = `sites/${siteId}/media/${isR2 ? 'files' : 'images'}/${fileName}`
  return {
    asset_id: `asset_ncls_${(entry.role || entry.kind || 'media').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${base || hash}`,
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
    .trim()
}

function metadataFor(config, type) {
  return (config.pagesMetadata || []).find((page) => page.type === type) || {}
}

function pagePathForVariant(variant) {
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
  return config.tenant.paymentBaseUrl ? `${config.tenant.paymentBaseUrl}/donate` : null
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
    components: variant === 'pricing'
      ? [{
          type: 'pricing_calculator',
          title: 'Sliding-scale fee estimator',
          note: config.priceTableComponent?.notice || config.priceTableComponent?.description || '',
          baseAmount: 0,
          perPersonAmount: 0,
          complexityStep: 0,
          source: 'React NCLS priceTableComponent normalized by Blawby adapter',
          effectiveDate: config.priceTableComponent?.effectiveDate || null,
          table: config.priceTableComponent || null,
        }]
      : page.components || [],
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
      asset_id: null,
      public_url: null,
      ...normalized,
    })
  }

  if (config.tenant.logo) {
    add({ kind: 'logo', role: 'brand_logo', source_path: config.tenant.logo })
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
  }

  for (const legalFile of legalFiles) add(legalFile)

  return {
    source: 'react-next-marketing-site-template/tenants/northcarolinalegalservices',
    approved_hosts: ['media.krabiclaw.com', 'images.krabiclaw.com', 'imagedelivery.net'],
    disallowed_hosts: ['vercel.app', 'vercel-storage.com', 'blob.vercel-storage.com'],
    files,
  }
}

function buildRouteInventory(offerings, pages, articles) {
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
        handling: 'Out of cutover scope for the first Blawby/NCLS PR.',
      },
    ],
    redirects: [],
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

function buildPayload(config) {
  const tenant = config.tenant
  const legalFiles = collectLegalFiles(config)
  const legalLinkMap = new Map(legalFiles.map(file => [file.source_path, file.public_url]))
  const staticPageSources = [
    {
      variant: 'about',
      title: `About ${tenant.name}`,
      description: [
        tenant.description,
        ...(tenant.features || []).map((feature) => `## ${feature.title}\n\n${feature.desc}`),
        config.impactStats ? `## ${config.impactStats.title}\n\n${config.impactStats.description}\n\n${config.impactStats.additionalDescription || ''}` : '',
      ].filter(Boolean),
    },
    {
      variant: 'pricing',
      title: 'Pricing and Fees',
      description: [
        metadataFor(config, 'pricing').description,
        config.priceTableComponent?.description,
      ].filter(Boolean),
      components: [{
        type: 'pricing_calculator',
        title: 'Sliding-scale fee estimator',
        note: config.priceTableComponent?.notice || config.priceTableComponent?.description || '',
        baseAmount: 0,
        perPersonAmount: 0,
        complexityStep: 0,
        source: 'React NCLS priceTableComponent normalized by Blawby adapter',
        effectiveDate: config.priceTableComponent?.effectiveDate || null,
        table: config.priceTableComponent || null,
        pricePlans: config.pricePlans || [],
      }],
    },
    {
      variant: 'donate',
      title: 'Support Equal Access to Justice',
      description: [
        config.impactStats?.additionalDescription,
        metadataFor(config, 'donate').description,
      ].filter(Boolean),
    },
    {
      variant: 'privacy',
      title: 'Privacy Policy',
      description: config.privacy?.content || metadataFor(config, 'privacy').description,
    },
    {
      variant: 'terms',
      title: 'Terms of Use',
      description: config.terms?.content || metadataFor(config, 'terms').description,
    },
    {
      variant: 'third-party',
      title: 'Third-Party Notices',
      description: config.thirdPartyNotice?.content || metadataFor(config, 'third-party').description,
    },
  ]
  const pages = staticPageSources.map((page) => tenantPageFromVariant(page, config, legalLinkMap))

  const offerings = (config.services || []).map((service) => ({
    id: `offering_ncls_${service.slug}`,
    name: service.name,
    slug: service.slug,
    label: service.serviceType || null,
    summary: service.summary || service.description || null,
    short_description: service.description || service.summary || null,
    body: service.content || service.description || null,
    features: (service.features || []).map((feature) => `${feature.title}: ${feature.description}`),
    faqs: (service.faqs || []).map((faq) => ({ question: faq.question, answer: faq.answer })),
    cta_label: 'Schedule a consultation',
    cta_url: '/schedule',
    thumbnail_asset_id: null,
    hero_image_asset_id: null,
    media_asset_ids: [],
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
  }))

  const articles = (config.articles || []).map((article) => ({
    title: article.title,
    slug: article.slug,
    excerpt: article.description || null,
    body: article.content || '',
    category: Array.isArray(article.tags) ? article.tags[0] : null,
    seo_description: article.description || null,
    seo_keywords: Array.isArray(article.keywords) ? article.keywords.join(', ') : null,
    canonical_url: `/article/${article.slug}`,
    source_image: article.imageName || null,
  }))
  const externalConsultationUrl = consultationExternalUrl(config)

  return {
    source: 'react-next-marketing-site-template/northcarolinalegalservices',
    site: {
      brand_name: tenant.name,
      brand_description: tenant.description,
      vertical: 'professional_service',
      theme_id: 'blawby-theme-v1',
      domain: tenant.domain,
      email: tenant.email,
      phone: tenant.phone,
      service_area: config.serviceArea || null,
    },
    compliance: {
      id: 'compliance_ncls',
      entity_name: tenant.legalName || tenant.name,
      dba_name: 'Bull City Legal Services',
      entity_type: tenant.type || 'LegalService',
      nonprofit_status: tenant.nonProfitStatus || null,
      registration_number: null,
      service_area: config.serviceArea?.locality || 'North Carolina',
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
        founder: tenant.founder,
        foundingDate: tenant.foundingDate,
        languages: tenant.languages,
        keywords: tenant.keywords,
      },
    },
    consultation: {
      id: 'consultation_ncls',
      mode: 'external_url',
      cta_label: 'Schedule a consultation',
      external_url: externalConsultationUrl,
      schedule_path: '/schedule',
      confirmation_path: '/contact/confirmed',
      tracking_enabled: true,
      legacy_source_calendly_url_ignored: tenant.calendlyUrl || null,
    },
    analyticsBridge: {
      provider: 'gtm',
      container_id: tenant.googleTagManagerId || null,
      allowed_events: ['page_view', 'book_consultation_click', 'contact_submit'],
      allowed_properties: ['event', 'page_type', 'page_path', 'cta_destination', 'tenant'],
      custom_head_code_ignored: Boolean(tenant.customHeadCode),
    },
    themeTokens: {
      bg: '#fbfaf7',
      surface: '#ffffff',
      primary: '#25356c',
      primaryDark: '#161f3b',
      accent: '#c19855',
      accentStrong: '#a37732',
      border: '#e7ddcc',
      ink: '#162033',
      fonts: tenant.fonts || [],
    },
    navigation: [
      ['header', 'Services', '/services'],
      ['header', 'Pricing', '/pricing'],
      ['header', 'Articles', '/blog'],
      ['header', 'Donate', '/donate'],
      ['header', 'Contact', '/contact'],
      ['legal', 'Privacy', '/policies/privacy'],
      ['legal', 'Terms', '/policies/terms'],
      ['legal', 'Third-Party Notices', '/third-party-notices'],
    ].map(([area, label, url], index) => ({
      id: `nav_ncls_${area}_${index}`,
      area,
      label,
      url,
      item_type: 'internal',
      sort_order: index,
      status: 'active',
      metadata: {},
    })),
    offerings,
    tenantPages: pages,
    articles,
    mediaInventory: collectMediaInventory(config, offerings, articles, legalFiles),
    routeInventory: buildRouteInventory(offerings, pages, articles),
    editSurfaceMatrix: buildEditSurfaceMatrix(),
    intentionalDifferences: [
      'React components are not copied; Blawby is rebuilt in Nuxt/Vue using KrabiClaw public components.',
      'Calendly source data is ignored for NCLS; the configured booking destination is the external Clio Grow URL.',
      'Custom head code is not imported; GTM is represented as an allowlisted analytics bridge.',
      '/thank-you is replaced by KrabiClaw native noindex confirmation pages.',
      '/conference is intentionally out of cutover scope.',
      'Donation remains an external CTA; native donation/payment processing is excluded.',
    ],
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function generateSeedPreview(outDir) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'generate-ncls-blawby-seed.mjs'), '--stdout'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to generate NCLS Blawby seed preview:\n${result.stderr || result.stdout}`)
  }
  fs.writeFileSync(path.join(outDir, 'seed-preview.sql'), result.stdout, 'utf8')
}

function writeClientImportArtifacts(payload, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
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
  writeJson(path.join(outDir, 'approved.json'), {
    approved: true,
    approved_by: process.env.USERNAME || process.env.USER || 'unknown',
    approved_at: new Date().toISOString(),
    manifest_hash: approvalHash(outDir),
    slug: 'north-carolina-legal-services',
    vertical: 'professional_service',
    adapter: 'ncls-blawby',
  })
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
  const payload = buildPayload(evaluateTenantConfig(args.source))
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
}
