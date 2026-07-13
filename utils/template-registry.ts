export type PublicTemplateSlug = 'saya' | 'blawby'

export interface PublicTemplateDefinition {
  slug: PublicTemplateSlug
  themeId: string
  layout: string
  verticals: string[]
  serviceRoutes: {
    offeringsIndex: string | null
    offeringDetailPrefix: string | null
    articleIndex: string | null
    articleDetailPrefix: string | null
  }
  sitemap: {
    exactPaths: string[]
    dynamicPrefixes: string[]
  }
}

export const publicTemplateRegistry: Record<PublicTemplateSlug, PublicTemplateDefinition> = {
  saya: {
    slug: 'saya',
    themeId: 'saya-theme-v1',
    layout: 'saya',
    verticals: ['restaurant', 'experience'],
    serviceRoutes: {
      offeringsIndex: null,
      offeringDetailPrefix: null,
      articleIndex: '/blog',
      articleDetailPrefix: '/blog',
    },
    sitemap: {
      exactPaths: ['/', '/menu', '/contact', '/blog', '/experiences', '/locations', '/reservations', '/posts', '/photos', '/qa', '/reviews'],
      dynamicPrefixes: ['/blog/', '/experiences/', '/locations/', '/posts/'],
    },
  },
  blawby: {
    slug: 'blawby',
    themeId: 'blawby-theme-v1',
    layout: 'blawby',
    verticals: ['service', 'professional_service'],
    serviceRoutes: {
      offeringsIndex: '/services',
      offeringDetailPrefix: '/services',
      articleIndex: '/blog',
      articleDetailPrefix: '/article',
    },
    sitemap: {
      exactPaths: ['/', '/about', '/services', '/pricing', '/donate', '/schedule', '/contact', '/blog', '/policies/privacy', '/policies/terms', '/third-party-notices'],
      dynamicPrefixes: ['/services/', '/article/'],
    },
  },
}

export function resolvePublicTemplate(input: {
  theme?: string | null
  themeId?: string | null
  vertical?: string | null
}): PublicTemplateDefinition {
  const theme = String(input.theme ?? '').toLowerCase()
  const themeId = String(input.themeId ?? '').toLowerCase()
  const vertical = String(input.vertical ?? '').toLowerCase()

  // Registry-driven: matches against each definition's own themeId/slug/verticals
  // instead of a hardcoded per-template if-chain, so a third template only needs
  // a new publicTemplateRegistry entry — no change here.
  const match = Object.values(publicTemplateRegistry).find((definition) =>
    definition.themeId.toLowerCase() === themeId ||
    definition.slug === theme ||
    definition.verticals.includes(vertical),
  )

  return match ?? publicTemplateRegistry.saya
}

export function isBlawbyTemplate(input: {
  theme?: string | null
  themeId?: string | null
  vertical?: string | null
}) {
  return resolvePublicTemplate(input).slug === 'blawby'
}

// Stricter than isBlawbyTemplate/resolvePublicTemplate's OR-based dispatch
// match: the public Blawby API routes are a security gate, not just a
// rendering-path decision, so they require BOTH a supported vertical AND
// the exact blawby-theme-v1 theme_id — a site with vertical='service' but
// some other theme_id should not pass. Shared here instead of duplicated
// inline across server/api/public/sites/[siteId]/blawby*.get.ts.
export function siteSupportsBlawbyTemplate(input: {
  vertical?: string | null
  themeId?: string | null
}): boolean {
  const vertical = String(input.vertical ?? '').toLowerCase()
  const themeId = String(input.themeId ?? '').toLowerCase()
  return publicTemplateRegistry.blawby.verticals.includes(vertical) && themeId === publicTemplateRegistry.blawby.themeId
}
