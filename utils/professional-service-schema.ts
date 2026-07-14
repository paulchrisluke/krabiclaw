/**
 * Canonical, template-driven schema.org graph builder for professional-service
 * tenants (Blawby template, NCLS being the first proof tenant).
 *
 * This module is intentionally framework-free (no Nuxt composables, no DOM):
 * - `composables/useProfessionalServiceSchema.ts` wraps it for Vue rendering.
 * - `server/utils/professional-services-editor.ts` uses `normalizeNonprofitStatus`
 *   to reject/normalize invalid values at the canonical write layer.
 * - `tests/unit/professional-service-schema.test.ts` exercises it directly.
 *
 * Every page recipe below produces one linked `@graph` containing stable-ID
 * `Organization`/`WebSite` nodes plus recipe-specific nodes (WebPage variant,
 * breadcrumbs, FAQ, LegalService/offer, article, etc.) so the graph never
 * drifts between dashboard/ChowBot/MCP/import-authored data and what public
 * rendering emits — they all read the same canonical fields and call the same
 * builder.
 */

export interface ProfessionalServiceContactPoint {
  contact_type?: string | null
  telephone?: string | null
  email?: string | null
  area_served?: string | null
  available_language?: string[] | string | null
  url?: string | null
}

export interface ProfessionalServiceAddress {
  street_address?: string | null
  locality?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
}

export interface ProfessionalServiceOrgIdentity {
  /** Business/brand name. */
  name: string | null
  description?: string | null
  logoUrl?: string | null
  /** e.g. 'LegalService' — selects the org's schema.org @type alongside Organization/ProfessionalService. */
  entityType?: string | null
  /** Pre-normalized schema.org nonprofit enum URL (see normalizeNonprofitStatus), or null. */
  nonprofitStatus?: string | null
  serviceArea?: string | null
  /** schema.org areaServed @type, e.g. 'State', 'City', 'Country', 'AdministrativeArea'. */
  serviceAreaType?: string | null
  sameAs?: string[] | null
  founderName?: string | null
  /** ISO date string. */
  foundingDate?: string | null
  contactPoints?: ProfessionalServiceContactPoint[] | null
  address?: ProfessionalServiceAddress | null
  /** Whether the street address should be included in the public graph. Defaults to false (service-area-only orgs commonly withhold a street address). */
  addressVisible?: boolean | null
}

export interface ProfessionalServiceBreadcrumbItem {
  name: string
  url: string
}

export interface ProfessionalServiceFaqItem {
  question?: string | null
  answer?: string | null
}

export interface ProfessionalServiceListItem {
  name: string
  url: string
  description?: string | null
}

export interface ProfessionalServiceOffer {
  name?: string | null
  price?: string | number | null
  priceCurrency?: string | null
  description?: string | null
  url?: string | null
}

export interface ProfessionalServicePerson {
  name: string
  jobTitle?: string | null
  imageUrl?: string | null
}

export type ProfessionalServiceRecipe =
  | 'home'
  | 'services-index'
  | 'service-detail'
  | 'about'
  | 'contact'
  | 'schedule'
  | 'pricing'
  | 'donate'
  | 'blog-index'
  | 'article'
  | 'tenant-page'

export interface ProfessionalServiceSchemaInput {
  recipe: ProfessionalServiceRecipe
  /** Canonical origin, e.g. https://ncls.krabiclaw.com — must be the tenant's own canonical origin, not the platform's. */
  origin: string
  org: ProfessionalServiceOrgIdentity
  /** Absolute or site-relative URL of the current page. */
  pageUrl: string
  pageTitle: string
  pageDescription?: string | null
  breadcrumbs?: ProfessionalServiceBreadcrumbItem[] | null
  /** Only questions/answers that are actually visibly rendered on this route belong here. */
  faqs?: ProfessionalServiceFaqItem[] | null
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null

  /** service-detail */
  offering?: {
    name: string
    description?: string | null
    schemaType?: string | null
    offers?: ProfessionalServiceOffer[] | null
    /**
     * Real business_locations data for this offering's own location
     * (offerings.location_id), when one is set and distinct from the org's
     * primary location. LegalService/ProfessionalService types are valid
     * schema.org LocalBusiness subtypes, so an offering-level `address` is
     * legitimate — this does not touch the shared Organization node's address.
     */
    address?: ProfessionalServiceAddress | null
    /** Same visibility contract as org.addressVisible — an offering's own location address must still be explicitly visible. Defaults to the org's addressVisible when omitted. */
    addressVisible?: boolean | null
  } | null

  /** services-index / blog-index */
  items?: ProfessionalServiceListItem[] | null

  /** about */
  people?: ProfessionalServicePerson[] | null

  /** article */
  article?: {
    headline: string
    datePublished?: string | null
    dateModified?: string | null
    authorName?: string | null
  } | null

  /** pricing */
  offerCatalog?: ProfessionalServiceOffer[] | null

  /** donate */
  donationUrl?: string | null

  /** schedule */
  consultationUrl?: string | null
}

type SchemaNode = Record<string, unknown>

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function resolveUrl(value: string, origin: string) {
  try {
    return new URL(value).toString()
  } catch {
    return new URL(value, origin).toString()
  }
}

// --- nonprofit status normalization ---------------------------------------

const NONPROFIT_501C_MAX = 28
const NONPROFIT_STATUS_CANONICAL = new Set<string>([
  ...Array.from({ length: NONPROFIT_501C_MAX }, (_, index) => `https://schema.org/Nonprofit501c${index + 1}`),
  'https://schema.org/NonprofitANBI',
  'https://schema.org/NonprofitSBBI',
])

export interface NonprofitStatusNormalization {
  /** Canonical schema.org enum URL, or null if no status was provided. */
  value: string | null
  /** False when the input could not be mapped to a recognized schema.org nonprofit enum value. */
  valid: boolean
}

/**
 * Normalizes free-text nonprofit status values (e.g. "501(c)(3)", "501c3")
 * into schema.org's canonical enum URLs (e.g. https://schema.org/Nonprofit501c3).
 * This is the single source of truth for the canonical write layer
 * (server/utils/professional-services-editor.ts) and public rendering — both
 * must call this rather than storing/emitting free text.
 */
export function normalizeNonprofitStatus(raw: string | null | undefined): NonprofitStatusNormalization {
  const trimmed = trimOrNull(raw ?? null)
  if (!trimmed) return { value: null, valid: true }

  if (/^https:\/\/schema\.org\//i.test(trimmed)) {
    return { value: trimmed, valid: NONPROFIT_STATUS_CANONICAL.has(trimmed) }
  }
  // Any other absolute URL is not a recognized schema.org enum member —
  // don't fall through to the free-text 501(c) extraction below, or a wrong
  // domain that happens to contain "501c3" in its path would be misread as
  // a valid canonical value.
  if (/^https?:\/\//i.test(trimmed)) {
    return { value: trimmed, valid: false }
  }

  const match = trimmed.match(/501\s*\(?\s*c\s*\)?\s*\(?\s*(\d{1,2})\s*\)?/i)
  if (match) {
    const canonical = `https://schema.org/Nonprofit501c${Number(match[1])}`
    return { value: canonical, valid: NONPROFIT_STATUS_CANONICAL.has(canonical) }
  }

  return { value: trimmed, valid: false }
}

// --- node builders ----------------------------------------------------------

function buildContactPointNodes(contactPoints: ProfessionalServiceContactPoint[] | null | undefined) {
  if (!contactPoints?.length) return undefined
  const nodes = contactPoints
    .filter(point => point.telephone || point.email || point.url)
    .map((point) => {
      const node: SchemaNode = { '@type': 'ContactPoint' }
      if (point.contact_type) node.contactType = point.contact_type
      if (point.telephone) node.telephone = point.telephone
      if (point.email) node.email = point.email
      if (point.area_served) node.areaServed = point.area_served
      if (point.available_language) node.availableLanguage = point.available_language
      if (point.url) node.url = point.url
      return node
    })
  return nodes.length ? nodes : undefined
}

/**
 * Builds a PostalAddress node from real business_locations data. Exported so
 * both the shared Organization node (org-level primary location) and a
 * service-detail offering's own node (offering-specific location) can turn a
 * resolved address into schema.org markup without duplicating field mapping.
 * Returns undefined when there's no address data at all — callers are
 * responsible for the address-visibility check (see buildAddressNode below
 * and the `offering.addressVisible` handling in buildProfessionalServiceGraph)
 * so an org that has withheld its address never leaks one through a side door.
 */
export function buildPostalAddressNode(address: ProfessionalServiceAddress | null | undefined) {
  if (!address) return undefined
  const hasAny = address.street_address || address.locality || address.region || address.postal_code || address.country
  if (!hasAny) return undefined
  const node: SchemaNode = { '@type': 'PostalAddress' }
  if (address.street_address) node.streetAddress = address.street_address
  if (address.locality) node.addressLocality = address.locality
  if (address.region) node.addressRegion = address.region
  if (address.postal_code) node.postalCode = address.postal_code
  if (address.country) node.addressCountry = address.country
  return node
}

function buildAddressNode(org: ProfessionalServiceOrgIdentity) {
  if (!org.addressVisible) return undefined
  return buildPostalAddressNode(org.address)
}

/** Builds the shared Organization node. `@id` is stable per-origin (`${origin}/#organization`). */
export function buildOrganizationNode(org: ProfessionalServiceOrgIdentity, origin: string): SchemaNode {
  const siteRoot = origin.replace(/\/$/, '')
  const orgTypes = ['Organization']
  if (org.entityType) orgTypes.push(org.entityType)
  else orgTypes.push('ProfessionalService')

  const node: SchemaNode = {
    '@type': Array.from(new Set(orgTypes)),
    '@id': `${siteRoot}/#organization`,
    name: org.name || undefined,
    url: siteRoot,
  }
  if (org.description) node.description = org.description
  if (org.logoUrl) node.logo = resolveUrl(org.logoUrl, origin)
  if (org.serviceArea) {
    node.areaServed = org.serviceAreaType
      ? { '@type': org.serviceAreaType, name: org.serviceArea }
      : org.serviceArea
  }
  const nonprofitStatus = normalizeNonprofitStatus(org.nonprofitStatus)
  if (nonprofitStatus.value && nonprofitStatus.valid) node.nonprofitStatus = nonprofitStatus.value
  if (org.sameAs?.length) node.sameAs = org.sameAs.filter(Boolean)
  if (org.founderName) node.founder = { '@type': 'Person', name: org.founderName }
  if (org.foundingDate) node.foundingDate = org.foundingDate
  const contactPoints = buildContactPointNodes(org.contactPoints)
  if (contactPoints) node.contactPoint = contactPoints
  const address = buildAddressNode(org)
  if (address) node.address = address

  return node
}

export function buildWebsiteNode(org: ProfessionalServiceOrgIdentity, origin: string): SchemaNode {
  const siteRoot = origin.replace(/\/$/, '')
  return {
    '@type': 'WebSite',
    '@id': `${siteRoot}/#website`,
    url: siteRoot,
    name: org.name || undefined,
    ...(org.description ? { description: org.description } : {}),
    publisher: { '@id': `${siteRoot}/#organization` },
  }
}

function buildBreadcrumbNode(pageUrl: string, items: ProfessionalServiceBreadcrumbItem[] | null | undefined, origin: string) {
  if (!items?.length) return null
  const filtered = items.filter(item => item?.name && item?.url)
  if (!filtered.length) return null
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: filtered.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: resolveUrl(item.url, origin),
    })),
  }
}

/** Only emits a node when at least one question/answer pair is present — callers must only pass FAQ items that are actually visibly rendered on the page. */
function buildFaqNode(pageUrl: string, faqs: ProfessionalServiceFaqItem[] | null | undefined) {
  const valid = (faqs ?? []).flatMap((faq) => {
    const question = trimOrNull(faq.question)
    const answer = trimOrNull(faq.answer)
    return question && answer ? [{ question, answer }] : []
  })
  if (!valid.length) return null
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: valid.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

const RECIPE_WEBPAGE_TYPE: Record<ProfessionalServiceRecipe, string> = {
  home: 'WebPage',
  'services-index': 'CollectionPage',
  'service-detail': 'WebPage',
  about: 'AboutPage',
  contact: 'ContactPage',
  schedule: 'WebPage',
  pricing: 'WebPage',
  donate: 'WebPage',
  'blog-index': 'CollectionPage',
  article: 'WebPage',
  'tenant-page': 'WebPage',
}

/**
 * Builds one linked `@graph` for a professional-service page: Organization +
 * WebSite (stable IDs) plus recipe-specific nodes. Every recipe returns a
 * full, self-contained graph so any single page's JSON-LD is valid on its own.
 */
export function buildProfessionalServiceGraph(input: ProfessionalServiceSchemaInput) {
  const origin = input.origin.replace(/\/$/, '')
  const pageUrl = resolveUrl(input.pageUrl, origin)
  const webpageId = `${pageUrl}#webpage`
  const organizationNode = buildOrganizationNode(input.org, origin)
  const websiteNode = buildWebsiteNode(input.org, origin)
  const organizationId = organizationNode['@id'] as string
  const websiteId = websiteNode['@id'] as string

  const graph: SchemaNode[] = [organizationNode, websiteNode]

  const webpageNode: SchemaNode = {
    '@type': RECIPE_WEBPAGE_TYPE[input.recipe],
    '@id': webpageId,
    url: pageUrl,
    name: input.pageTitle,
    isPartOf: { '@id': websiteId },
  }
  if (input.pageDescription) webpageNode.description = input.pageDescription
  if (input.imageUrl) {
    webpageNode.primaryImageOfPage = input.imageWidth && input.imageHeight
      ? { '@type': 'ImageObject', url: resolveUrl(input.imageUrl, origin), width: input.imageWidth, height: input.imageHeight }
      : resolveUrl(input.imageUrl, origin)
  }

  const breadcrumbNode = buildBreadcrumbNode(pageUrl, input.breadcrumbs, origin)
  if (breadcrumbNode) {
    webpageNode.breadcrumb = { '@id': breadcrumbNode['@id'] }
  }

  const hasPart: Array<{ '@id': string }> = []

  const faqNode = buildFaqNode(pageUrl, input.faqs)
  if (faqNode) hasPart.push({ '@id': faqNode['@id'] as string })

  let mainEntityNode: SchemaNode | null = null

  if (input.recipe === 'service-detail' && input.offering) {
    const offeringId = `${pageUrl}#service`
    mainEntityNode = {
      '@type': input.offering.schemaType || 'Service',
      '@id': offeringId,
      name: input.offering.name,
      url: pageUrl,
      provider: { '@id': organizationId },
    }
    if (input.offering.description) mainEntityNode.description = input.offering.description
    const offeringAddressVisible = input.offering.addressVisible ?? input.org.addressVisible ?? false
    if (offeringAddressVisible) {
      const offeringAddress = buildPostalAddressNode(input.offering.address)
      if (offeringAddress) mainEntityNode.address = offeringAddress
    }
    if (input.offering.offers?.length) {
      mainEntityNode.offers = input.offering.offers.map(offer => ({
        '@type': 'Offer',
        ...(offer.name ? { name: offer.name } : {}),
        ...(offer.price != null ? { price: offer.price } : {}),
        ...(offer.priceCurrency ? { priceCurrency: offer.priceCurrency } : {}),
        ...(offer.description ? { description: offer.description } : {}),
        ...(offer.url ? { url: resolveUrl(offer.url, origin) } : {}),
      }))
    }
    webpageNode.mainEntity = { '@id': offeringId }
  }

  if (input.recipe === 'home') webpageNode.mainEntity = { '@id': organizationId }

  if ((input.recipe === 'services-index' || input.recipe === 'blog-index' || input.recipe === 'home') && input.items?.length) {
    const listId = `${pageUrl}#itemlist`
    mainEntityNode = {
      '@type': 'ItemList',
      '@id': listId,
      itemListElement: input.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: resolveUrl(item.url, origin),
        ...(item.description ? { description: item.description } : {}),
      })),
    }
    // On the homepage the ItemList of offerings is supplementary — the page's
    // own mainEntity stays the Organization so home's WebPage node still
    // reads as "this page is about the org", matching recipe expectations.
    if (input.recipe !== 'home') {
      webpageNode.mainEntity = { '@id': listId }
    }
  }

  if (input.recipe === 'contact') {
    webpageNode.mainEntity = { '@id': organizationId }
  }

  if (input.recipe === 'about' && input.people?.length) {
    const peopleId = `${pageUrl}#people`
    mainEntityNode = {
      '@type': 'ItemList',
      '@id': peopleId,
      itemListElement: input.people.map((person, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Person',
          name: person.name,
          ...(person.jobTitle ? { jobTitle: person.jobTitle } : {}),
          ...(person.imageUrl ? { image: resolveUrl(person.imageUrl, origin) } : {}),
        },
      })),
    }
    webpageNode.mainEntity = { '@id': peopleId }
  }

  if (input.recipe === 'pricing' && input.offerCatalog?.length) {
    const catalogId = `${pageUrl}#offercatalog`
    mainEntityNode = {
      '@type': 'OfferCatalog',
      '@id': catalogId,
      name: input.pageTitle,
      itemListElement: input.offerCatalog.map(offer => ({
        '@type': 'Offer',
        ...(offer.name ? { name: offer.name } : {}),
        ...(offer.price != null ? { price: offer.price } : {}),
        ...(offer.priceCurrency ? { priceCurrency: offer.priceCurrency } : {}),
        ...(offer.description ? { description: offer.description } : {}),
      })),
      provider: { '@id': organizationId },
    }
    webpageNode.mainEntity = { '@id': catalogId }
  }

  if (input.recipe === 'donate' && input.donationUrl) {
    webpageNode.potentialAction = {
      '@type': 'DonateAction',
      target: resolveUrl(input.donationUrl, origin),
      recipient: { '@id': organizationId },
    }
  }

  if (input.recipe === 'schedule' && input.consultationUrl) {
    webpageNode.potentialAction = {
      '@type': 'ScheduleAction',
      target: resolveUrl(input.consultationUrl, origin),
    }
  }

  if (input.recipe === 'article' && input.article) {
    const articleId = `${pageUrl}#article`
    mainEntityNode = {
      '@type': 'BlogPosting',
      '@id': articleId,
      headline: input.article.headline,
      url: pageUrl,
      mainEntityOfPage: { '@id': webpageId },
      publisher: { '@id': organizationId },
      isPartOf: { '@id': websiteId },
    }
    if (input.pageDescription) mainEntityNode.description = input.pageDescription
    if (input.article.authorName) mainEntityNode.author = { '@type': 'Person', name: input.article.authorName }
    if (input.article.datePublished) mainEntityNode.datePublished = input.article.datePublished
    if (input.article.dateModified) mainEntityNode.dateModified = input.article.dateModified
    if (input.imageUrl) {
      mainEntityNode.image = input.imageWidth && input.imageHeight
        ? { '@type': 'ImageObject', url: resolveUrl(input.imageUrl, origin), width: input.imageWidth, height: input.imageHeight }
        : resolveUrl(input.imageUrl, origin)
    }
    webpageNode.mainEntity = { '@id': articleId }
  }

  if (hasPart.length) {
    webpageNode.hasPart = hasPart.length === 1 ? hasPart[0] : hasPart
  }

  graph.push(webpageNode)
  if (breadcrumbNode) graph.push(breadcrumbNode)
  if (mainEntityNode) graph.push(mainEntityNode)
  if (faqNode) graph.push(faqNode)

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
