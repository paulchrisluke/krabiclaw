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

// ─────────────────────────────────────────────────────────────────────────
// Public marketing metadata — /templates index + /templates/[slug]
// ─────────────────────────────────────────────────────────────────────────
//
// Kept separate from publicTemplateRegistry above: that record is
// routing/rendering dispatch for *tenant* sites (which layout, which content
// model, which sitemap paths a live site running this template gets).
// publicTemplateMarketing is copy/positioning for the *platform marketing*
// pages that sell the template itself — a different audience (prospective
// customers browsing krabiclaw.com/templates) reading a different shape of
// data, but keyed by the same canonical slug so there is exactly one
// template identity to keep in sync.

export interface TemplateMarketingFeature {
  icon: string
  label: string
  description: string
}

export interface TemplateMarketingSpec {
  label: string
  value: string
}

export type TemplateMarketingStatus = 'available' | 'coming_soon'

export interface TemplateMarketingSeo {
  title: string
  description: string
}

export interface TemplateMarketingMetadata {
  slug: PublicTemplateSlug
  displayName: string
  tagline: string
  /** Short positioning copy for the /templates index card. */
  summary: string
  /** Longer positioning copy for the /templates/[slug] detail page. */
  description: string
  /** Human-readable vertical labels for card/detail display (see publicTemplateRegistry.verticals for the machine-matched values). */
  supportedVerticals: string[]
  status: TemplateMarketingStatus
  /**
   * Marketing-visibility gate. False keeps a registry entry usable for
   * tenant rendering while excluding it from the public /templates index
   * and from resolving a /templates/[slug] detail route (404 instead).
   */
  published: boolean
  priceLabel: string
  priceNote: string
  /**
   * Canonical live-demo destination.
   * - Blawby: the NCLS-approved production showcase, a literal URL —
   *   `https://ncls.krabiclaw.com` — presented as an approved customer
   *   site, not a synthetic fixture.
   * - Saya: null. Saya's demo runs on an ephemeral seeded subdomain that
   *   differs between dev and production (`demo.<platformHostname>`), so
   *   the route component resolves it at runtime the same way
   *   pages/templates.vue always has, rather than this static registry
   *   hardcoding an environment-dependent host.
   */
  demoUrl: string | null
  demoLabel: string
  ctaLabel: string
  ctaTo: string
  features: TemplateMarketingFeature[]
  included: string[]
  specs: TemplateMarketingSpec[]
  /** Ascending sort order for the /templates index. */
  sortOrder: number
  /**
   * SEO copy for this template's detail page. Consumed as-is by
   * usePlatformPageSeo (the shared platform SEO composer, itself a thin
   * adapter over the #259 composeSocialMetadata contract) — this is data,
   * not a new metadata/OG pipeline.
   *
   * No `ogImage` override is set on the /templates/[slug] page, so each
   * detail page gets a real per-template 1200x630 card generated on the
   * fly by the shared `platform` renderer (server/utils/og-image/renderers/
   * platform.ts) from this title/description — see the resolveSocialOgImage
   * fallback chain in utils/social-metadata.ts. This is the same pattern
   * pages/index.vue and pages/about.vue already use for their platform
   * branch; do not build a bespoke image pipeline here.
   */
  seo: TemplateMarketingSeo
}

export const publicTemplateMarketing: Record<PublicTemplateSlug, TemplateMarketingMetadata> = {
  saya: {
    slug: 'saya',
    displayName: 'Saya',
    tagline: 'Elegant & minimal, built for local businesses',
    summary: 'Editorial restaurant and experience websites with deep Google Business integration.',
    description: 'The flagship KrabiClaw theme. Editorial typography, location-centric navigation, and deep Google Business integration — designed for local businesses that want to look as good online as they do in person.',
    supportedVerticals: ['Restaurants', 'Experiences'],
    status: 'available',
    published: true,
    priceLabel: 'Free',
    priceNote: 'No purchase needed — start building immediately',
    demoUrl: null,
    demoLabel: 'View live demo',
    ctaLabel: 'Get started free',
    ctaTo: '/signup',
    features: [
      {
        icon: 'map-pin',
        label: 'Location pages',
        description: 'Hours, map embed, address, offerings preview, reviews, photos, and Q&A — all under one location URL.',
      },
      {
        icon: 'star',
        label: 'Reviews & ratings',
        description: 'Star distribution histogram, owner replies, and a filterable review feed.',
      },
      {
        icon: 'list',
        label: 'Full offerings',
        description: 'Sections, item photos, prices, details, and availability — all editable through ChatGPT.',
      },
      {
        icon: 'sparkles',
        label: 'ChatGPT Plugin',
        description: 'Update content, generate descriptions, publish posts, and manage your site by chatting directly in ChatGPT.',
      },
    ],
    included: [
      'Homepage with hero, location grid, and review highlights',
      'Location sub-pages: offerings, reviews, photos, Q&A, contact',
      'Unified Inbox for reservations and inquiries',
      'Google Business data sync (Growth plan)',
      'ChatGPT Plugin for content management',
      'Reservation form',
      'Brand story / about page',
      'SEO-optimised with schema markup',
      'Mobile-first responsive layout',
      'Dark mode support',
      'Multi-location support (Growth plan)',
      'Custom domain (Growth plan)',
      'Starter AI credits on signup',
    ],
    specs: [
      { label: 'Price', value: 'Free' },
      { label: 'Locations', value: '1 free / unlimited Growth' },
      { label: 'Mobile', value: 'Fully responsive' },
      { label: 'Languages', value: 'EN / TH' },
    ],
    sortOrder: 1,
    seo: {
      title: 'Saya Theme',
      description: 'The Saya theme — editorial design, Google Business integration, AI content management. Free on all plans.',
    },
  },
  blawby: {
    slug: 'blawby',
    displayName: 'Blawby',
    tagline: 'Professional-service sites for firms and practices',
    summary: 'Service and practice-area pages, article publishing, and consultation-focused CTAs for professional-service businesses.',
    description: 'The Blawby theme is built for professional-service businesses — law firms, clinics, and consultancies — with dedicated service/practice-area pages, article publishing, compliance/policy content, and consultation-oriented calls to action. Approved live on North Carolina Legal Services’ production site.',
    supportedVerticals: ['Professional services', 'Legal & consulting'],
    status: 'available',
    published: true,
    priceLabel: 'Included on Growth',
    priceNote: 'Approved customer showcase: North Carolina Legal Services',
    demoUrl: 'https://ncls.krabiclaw.com',
    demoLabel: 'View live customer site',
    ctaLabel: 'Get started',
    ctaTo: '/signup',
    features: [
      {
        icon: 'briefcase',
        label: 'Service & practice-area pages',
        description: 'Dedicated pages per service or practice area, each with its own canonical URL and structured data.',
      },
      {
        icon: 'file-text',
        label: 'Article publishing',
        description: 'A full blog/article system for legal updates, guidance, and firm news, editable through ChatGPT.',
      },
      {
        icon: 'shield-check',
        label: 'Compliance & policy pages',
        description: 'Privacy policy, terms, and third-party notices ready out of the box for regulated professional services.',
      },
      {
        icon: 'calendar',
        label: 'Consultation CTAs',
        description: 'Schedule and contact flows built around booking a consultation rather than a table or tour.',
      },
    ],
    included: [
      'Homepage with services overview and firm positioning',
      'Service / practice-area detail pages',
      'Article publishing for firm news and legal guidance',
      'About, pricing, and donate pages',
      'Consultation scheduling and contact flows',
      'Privacy, terms, and third-party notices pages',
      'ChatGPT Plugin for content management',
      'Professional-service structured data (schema.org)',
      'Mobile-first responsive layout',
      'Custom domain (Growth plan)',
    ],
    specs: [
      { label: 'Price', value: 'Included on Growth' },
      { label: 'Live showcase', value: 'ncls.krabiclaw.com' },
      { label: 'Mobile', value: 'Fully responsive' },
      { label: 'Structured data', value: 'ProfessionalService' },
    ],
    sortOrder: 2,
    seo: {
      title: 'Blawby Theme',
      description: 'The Blawby theme for professional-service businesses — service pages, article publishing, and consultation CTAs. See it live on North Carolina Legal Services.',
    },
  },
}

/** Publicly listable templates, in index sort order. Excludes unpublished/internal entries. */
export function listPublishedTemplateMarketing(): TemplateMarketingMetadata[] {
  return Object.values(publicTemplateMarketing)
    .filter(template => template.published)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Resolves marketing metadata for a /templates/[slug] route, or null for unknown/unpublished slugs (caller should 404). */
export function findPublishedTemplateMarketing(slug: string | null | undefined): TemplateMarketingMetadata | null {
  const normalized = String(slug ?? '').toLowerCase()
  const match = (Object.values(publicTemplateMarketing) as TemplateMarketingMetadata[])
    .find(template => template.slug === normalized)
  return match?.published ? match : null
}
