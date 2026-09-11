import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'

export interface PublicDraftSiteContent {
  id: string
  organization_id: string
  site_id: string
  location_id?: string
  page: string
  field: string
  value?: string
  type: string
  source: string
  content?: string
  hero_title?: string | null
  hero_subtitle?: string | null
  media?: Array<{ asset_id: string; slot: string; public_url?: string | null; thumbnail_url?: string | null; kind?: string | null }>
  updated_at: string
}

export function groupContentBlocks(rows: PublicDraftSiteContent[]): Array<PublicDraftSiteContent & { _section: string }> {
  const groups = Object.create(null) as Record<string, PublicDraftSiteContent & { _section: string }>
  for (const row of rows) {
    const section = row.field?.split('.')[0] || 'unknown'
    if (!groups[section]) {
      groups[section] = { ...row, field: section, _section: section }
    } else {
      for (const key of Object.keys(row) as Array<keyof PublicDraftSiteContent>) {
        if (groups[section][key] == null) (groups[section] as unknown as Record<string, unknown>)[key] = row[key]
      }
    }
  }
  return Object.values(groups)
}

export function tenantPageToContentRows(page: PublicTenantPage): PublicDraftSiteContent[] {
  const rows: PublicDraftSiteContent[] = []
  for (const block of page.blocks) {
    const data = block.data
    const field = typeof data.field === 'string' && data.field.trim()
      ? data.field.trim()
      : `${block.type}.${block.position}`
    const base = {
      id: block.id,
      organization_id: '',
      site_id: '',
      page: page.path === '/' ? 'home' : page.path.slice(1).replaceAll('/', '-'),
      field,
      type: block.type === 'image' || block.type === 'gallery' ? 'media' : 'text',
      source: 'tenant-pages',
      updated_at: page.updated_at,
      media: block.media,
    } satisfies PublicDraftSiteContent
    if (block.type === 'hero') {
      rows.push({
        ...base,
        field: 'hero',
        content: typeof data.eyebrow === 'string' ? data.eyebrow : undefined,
        hero_title: typeof data.title === 'string' ? data.title : null,
        hero_subtitle: typeof data.subtitle === 'string' ? data.subtitle : null,
      })
      if (typeof data.eyebrow === 'string' && data.eyebrow.trim()) rows.push({ ...base, field: 'hero.kicker', content: data.eyebrow })
      continue
    }
    if (block.type === 'heading') {
      rows.push({ ...base, field, content: typeof data.text === 'string' ? data.text : undefined })
      continue
    }
    if (block.type === 'markdown') {
      rows.push({ ...base, content: typeof data.markdown === 'string' ? data.markdown : typeof data.content === 'string' ? data.content : undefined })
      continue
    }
    rows.push({ ...base, content: typeof data.title === 'string' ? data.title : undefined })
  }
  return rows
}
