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
    verticals: ['professional_service'],
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

  if (theme === 'blawby' || themeId === 'blawby-theme-v1' || vertical === 'professional_service') {
    return publicTemplateRegistry.blawby
  }

  return publicTemplateRegistry.saya
}

export function isBlawbyTemplate(input: {
  theme?: string | null
  themeId?: string | null
  vertical?: string | null
}) {
  return resolvePublicTemplate(input).slug === 'blawby'
}
