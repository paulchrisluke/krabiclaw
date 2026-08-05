export interface SeedTenantPageRow {
  id: string
  page: string
  field: string
  content: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
  heroImageAssetId?: string | null
  heroVideoAssetId?: string | null
}

export interface SeedTenantPageTranslation {
  locale: string
  page: string
  field: string
  content: string | null
  value?: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
}

type SqlValue = (_value: string | number | boolean | null) => string
type SqlJson = (_value: unknown) => string

function pathForPage(page: string) {
  if (page === 'home') return '/'
  if (page === 'privacy') return '/policies/privacy'
  if (page === 'terms') return '/policies/terms'
  return `/${page}`
}

function pageTypeForPage(page: string) {
  if (page === 'home' || page === 'about' || page === 'contact') return 'system'
  if (page === 'privacy' || page === 'terms') return 'legal'
  return 'recipe'
}

function blockData(page: string, rows: SeedTenantPageRow[]) {
  const blocks: Array<{ id: string; type: string; position: number; data: Record<string, unknown> }> = []
  const hero = rows.find(row => row.field === 'hero')
  if (hero) {
    blocks.push({
      id: `${hero.id}-block-hero`,
      type: 'hero',
      position: 0,
      data: {
        title: hero.heroTitle ?? hero.content,
        subtitle: hero.heroSubtitle ?? null,
        asset_id: hero.heroImageAssetId ?? hero.heroVideoAssetId ?? null,
      },
    })
  }

  const cta = rows.filter(row => row.field.startsWith('cta.'))
  if (cta.length) {
    blocks.push({
      id: `${cta[0]!.id}-block-cta`,
      type: 'cta',
      position: blocks.length,
      data: {
        title: cta.find(row => row.field === 'cta.title')?.content ?? null,
        description: cta.find(row => row.field === 'cta.description')?.content ?? null,
        label: cta.find(row => row.field === 'cta.label')?.content ?? null,
        url: cta.find(row => row.field === 'cta.url')?.content ?? null,
      },
    })
  }

  for (const row of rows) {
    if (row.field === 'hero' || row.field.startsWith('cta.')) continue
    if (row.heroImageAssetId || row.heroVideoAssetId) {
      blocks.push({ id: `${row.id}-block-image`, type: 'image', position: blocks.length, data: { asset_id: row.heroImageAssetId ?? row.heroVideoAssetId, alt: row.field, field: row.field } })
      continue
    }
    if (!row.content?.trim()) continue
    const isHeading = row.field.endsWith('.title') || row.field.endsWith('.headline') || row.field.endsWith('.kicker')
    blocks.push({
      id: `${row.id}-block-content`,
      type: isHeading ? 'heading' : 'markdown',
      position: blocks.length,
      data: isHeading ? { text: row.content, level: 2, field: row.field } : { markdown: row.content, field: row.field },
    })
  }
  if (!blocks.length) blocks.push({ id: `${page}-empty-page-hero`, type: 'hero', position: 0, data: { title: 'Page', subtitle: null } })
  return blocks
}

function renderPage(
  siteId: string,
  organizationId: string,
  page: string,
  locale: string,
  rows: SeedTenantPageRow[],
  sqlValue: SqlValue,
  sqlJson: SqlJson,
) {
  const path = pathForPage(page)
  const pageKey = path.replaceAll('/', '-').replace(/^-/, '') || 'home'
  const pageId = `tenant-page-${siteId}-${pageKey}`
  const variantId = `${pageId}-${locale}`
  const documentId = `${variantId}-document`
  const revisionId = `${variantId}-revision`
  const blocks = blockData(page, rows)
  const hero = rows.find(row => row.field === 'hero')
  const title = hero?.heroTitle ?? hero?.content ?? (page === 'home' ? 'Home' : page[0]!.toUpperCase() + page.slice(1))
  const metadata = { schemaVersion: 1, metadata: { locale, path, title, summary: null, seoTitle: null, seoDescription: null, canonicalUrl: null, robots: null, pageType: pageTypeForPage(page), recipe: page }, blocks }
  const body = blocks.map(block => block.type === 'markdown' ? String(block.data.markdown ?? '') : block.type === 'heading' ? `# ${String(block.data.text ?? '')}` : '').filter(Boolean).join('\n\n')
  const blockSql = blocks.map(block => `INSERT OR REPLACE INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at) VALUES (${sqlValue(block.id)}, ${sqlValue(documentId)}, NULL, ${sqlValue(block.type)}, ${block.position}, ${block.type === 'heading' ? 2 : 'NULL'}, ${sqlJson(block.data)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`).join('\n')
  return `INSERT OR REPLACE INTO tenant_pages (id, organization_id, site_id, path, title, slug, page_type, recipe, summary, status, sort_order, source, updated_at)
VALUES (${sqlValue(pageId)}, ${sqlValue(organizationId)}, ${sqlValue(siteId)}, ${sqlValue(path)}, ${sqlValue(title)}, ${sqlValue(pageKey)}, ${sqlValue(pageTypeForPage(page))}, ${sqlValue(page)}, NULL, 'published', 0, 'fixture', CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO content_documents (id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at)
VALUES (${sqlValue(documentId)}, 'tenant_page', ${sqlValue(variantId)}, ${sqlValue(revisionId)}, ${sqlValue(revisionId)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
DELETE FROM content_blocks WHERE document_id = ${sqlValue(documentId)};
DELETE FROM content_revisions WHERE document_id = ${sqlValue(documentId)};
INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, created_by, label, created_at)
VALUES (${sqlValue(revisionId)}, ${sqlValue(documentId)}, ${sqlJson(metadata)}, ${sqlValue(body)}, NULL, 'Fixture tenant page', CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO tenant_page_variants (id, organization_id, site_id, page_id, locale, draft_document_id, published_revision_id, published_path, draft_path, title, summary, seo_title, seo_description, canonical_url, robots, status, created_at, updated_at)
VALUES (${sqlValue(variantId)}, ${sqlValue(organizationId)}, ${sqlValue(siteId)}, ${sqlValue(pageId)}, ${sqlValue(locale)}, ${sqlValue(documentId)}, ${sqlValue(revisionId)}, ${sqlValue(path)}, ${sqlValue(path)}, ${sqlValue(title)}, NULL, NULL, NULL, NULL, NULL, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
${blockSql}`
}

export function renderTenantPagesSeedSql(input: {
  siteId: string
  organizationId: string
  locales: string[]
  rows: SeedTenantPageRow[]
  translations?: SeedTenantPageTranslation[]
  sqlValue: SqlValue
  sqlJson: SqlJson
}) {
  const pages = Array.from(new Set([...input.rows.map(row => row.page), 'home', 'about', 'contact']))
  const chunks: string[] = []
  for (const locale of input.locales) {
    for (const page of pages) {
      const sourceRows = input.rows.filter(row => row.page === page)
      const translatedRows = locale === input.locales[0]
        ? sourceRows
        : sourceRows.map(row => {
            const translated = input.translations?.find(item => item.locale === locale && item.page === page && item.field === row.field)
            return translated ? { ...row, content: translated.content ?? translated.value ?? row.content, heroTitle: translated.heroTitle ?? row.heroTitle, heroSubtitle: translated.heroSubtitle ?? row.heroSubtitle } : row
          })
      chunks.push(renderPage(input.siteId, input.organizationId, page, locale, translatedRows, input.sqlValue, input.sqlJson))
    }
  }
  return `-- BEGIN GENERATED: tenant_pages\n${chunks.join('\n')}\n-- END GENERATED: tenant_pages`
}
