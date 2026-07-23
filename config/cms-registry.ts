import type { SiteVertical } from '~/utils/vertical-copy'
import type { PublicTemplateSlug } from '~/utils/template-registry'

export type CmsSectionId = 'pages' | 'collections' | 'locations' | 'media' | 'site'

// Explicit module identifiers a vertical/template/site/location can turn on. 'experience_bookings',
// 'consultations' and 'appointments' are declared (not yet wired to any catalog entry below) because
// no distinct backing page/route exists for them yet — today's 'reservations' feature already covers
// booking-policy management for both restaurant and experience verticals, and blawby's practice
// management lives entirely on the single 'services' page. Wire a real catalog entry the day a
// distinct route/data model exists instead of aliasing a fake one now.
export type ProductFeature =
  | 'contact' | 'locations' | 'settings'
  | 'menu' | 'reservations' | 'ordering'
  | 'experiences' | 'experience_bookings'
  | 'services' | 'consultations' | 'appointments'
  | 'blog' | 'qa' | 'testimonials' | 'reviews' | 'media' | 'posts' | 'photos'

export interface CmsPageCapability {
  id: string
  feature: ProductFeature
  label: string
  route: string
  scope: 'site' | 'location'
  editor: 'site_content' | 'professional_services'
}

export interface CmsManagerCapability {
  /** Unique across the whole registry, e.g. 'site.qa' vs 'location.qa' — two distinct managers
   *  that happen to share a feature id. Always `${scope}.${id}`. */
  key: string
  id: ProductFeature
  label: string
  section: Exclude<CmsSectionId, 'pages'>
  route: string
  scope: 'site' | 'location'
}

export interface CmsCapabilityDefinition {
  vertical: SiteVertical
  template: PublicTemplateSlug
  locationVocabulary: 'location' | 'office/service area'
  pages: readonly CmsPageCapability[]
  managers: readonly CmsManagerCapability[]
}

/** Explicit site/location module overrides. When present, REPLACES the vertical's default feature
 *  set entirely for that scope (not merged) — this is what lets an owner both add a feature the
 *  vertical doesn't default to (hybrid restaurant+experiences) and remove one it does (turn off
 *  ordering) from the same mechanism. `null`/omitted means "use the vertical defaults as-is". */
export interface CmsCapabilityOverrides {
  site?: readonly ProductFeature[] | null
  location?: readonly ProductFeature[] | null
}

interface CmsTemplateCatalog {
  pages: readonly CmsPageCapability[]
  managers: readonly CmsManagerCapability[]
  locationVocabularyDefault: 'location' | 'office/service area'
}

const sayaCorePages: readonly CmsPageCapability[] = [
  { id: 'home', feature: 'contact', label: 'Home', route: '/', scope: 'site', editor: 'site_content' },
  { id: 'about', feature: 'contact', label: 'About', route: '/about', scope: 'site', editor: 'site_content' },
  { id: 'contact', feature: 'contact', label: 'Contact', route: '/contact', scope: 'site', editor: 'site_content' },
  { id: 'location', feature: 'locations', label: 'Location', route: '/locations/:location', scope: 'location', editor: 'site_content' },
]

const sayaCoreManagers: readonly CmsManagerCapability[] = [
  { key: 'site.blog', id: 'blog', label: 'Blog posts', section: 'collections', route: 'blog', scope: 'site' },
  { key: 'site.reviews', id: 'reviews', label: 'Reviews', section: 'collections', route: 'reviews', scope: 'site' },
  { key: 'site.qa', id: 'qa', label: 'Q&A', section: 'collections', route: 'qa', scope: 'site' },
  { key: 'site.locations', id: 'locations', label: 'Locations', section: 'locations', route: '', scope: 'site' },
  { key: 'location.qa', id: 'qa', label: 'Q&A', section: 'collections', route: ':location/qa', scope: 'location' },
  { key: 'location.posts', id: 'posts', label: 'Posts', section: 'collections', route: ':location/posts', scope: 'location' },
  { key: 'location.photos', id: 'photos', label: 'Photos', section: 'media', route: ':location/photos', scope: 'location' },
  { key: 'location.media', id: 'media', label: 'Media library', section: 'media', route: ':location/media', scope: 'location' },
  { key: 'site.settings', id: 'settings', label: 'Brand, navigation, footer & SEO', section: 'site', route: 'settings', scope: 'site' },
  { key: 'location.settings', id: 'settings', label: 'Location settings', section: 'site', route: ':location/settings', scope: 'location' },
]

// Every feature a Saya site can EVER expose (restaurant + experience combined, plus hybrid
// overrides), tagged with its owning feature id. Vertical defaults below select which of these
// are on out of the box; site/location overrides can add or remove any of them explicitly.
const sayaTemplateCatalog: CmsTemplateCatalog = {
  pages: [
    ...sayaCorePages,
    { id: 'menu', feature: 'menu', label: 'Menu', route: '/locations/:location/menu', scope: 'location', editor: 'site_content' },
    { id: 'order', feature: 'ordering', label: 'Order online', route: '/order?location=:location', scope: 'location', editor: 'site_content' },
    { id: 'experiences', feature: 'experiences', label: 'Experiences', route: '/experiences', scope: 'site', editor: 'site_content' },
    { id: 'reservations', feature: 'reservations', label: 'Reservations', route: '/reservations', scope: 'site', editor: 'site_content' },
  ],
  managers: [
    ...sayaCoreManagers,
    { key: 'location.menu', id: 'menu', label: 'Menus', section: 'collections', route: ':location/menu', scope: 'location' },
    { key: 'site.ordering', id: 'ordering', label: 'Orders', section: 'collections', route: 'orders', scope: 'site' },
    { key: 'location.experiences', id: 'experiences', label: 'Experiences', section: 'collections', route: ':location/experiences', scope: 'location' },
    { key: 'location.reservations', id: 'reservations', label: 'Reservation policies', section: 'collections', route: ':location/reservations', scope: 'location' },
  ],
  locationVocabularyDefault: 'location',
}

// blawby has one dashboard page (professional-services.vue) covering services/practice areas,
// policies & notices, and compliance & consultation together — modeled as a single 'services'
// manager rather than three managers pointing at the same route (which the registry validator
// below now rejects as a duplicate effective route at the same scope).
const blawbyTemplateCatalog: CmsTemplateCatalog = {
  pages: [
    { id: 'home', feature: 'contact', label: 'Home', route: '/', scope: 'site', editor: 'professional_services' },
    { id: 'about', feature: 'contact', label: 'About', route: '/about', scope: 'site', editor: 'professional_services' },
    { id: 'contact', feature: 'contact', label: 'Contact', route: '/contact', scope: 'site', editor: 'professional_services' },
    { id: 'location', feature: 'locations', label: 'Office', route: '/locations/:location', scope: 'location', editor: 'professional_services' },
    { id: 'services', feature: 'services', label: 'Services', route: '/services', scope: 'site', editor: 'professional_services' },
    { id: 'pricing', feature: 'services', label: 'Pricing', route: '/pricing', scope: 'site', editor: 'professional_services' },
    { id: 'donate', feature: 'services', label: 'Donate', route: '/donate', scope: 'site', editor: 'professional_services' },
    { id: 'schedule', feature: 'services', label: 'Schedule', route: '/schedule', scope: 'site', editor: 'professional_services' },
  ],
  managers: [
    { key: 'site.blog', id: 'blog', label: 'Blog posts', section: 'collections', route: 'blog', scope: 'site' },
    { key: 'site.reviews', id: 'reviews', label: 'Testimonials', section: 'collections', route: 'reviews', scope: 'site' },
    { key: 'site.qa', id: 'qa', label: 'Q&A', section: 'collections', route: 'qa', scope: 'site' },
    { key: 'site.locations', id: 'locations', label: 'Offices / service areas', section: 'locations', route: '', scope: 'site' },
    { key: 'site.services', id: 'services', label: 'Services, policies & compliance', section: 'collections', route: 'professional-services', scope: 'site' },
    { key: 'location.qa', id: 'qa', label: 'Q&A', section: 'collections', route: ':location/qa', scope: 'location' },
    { key: 'location.posts', id: 'posts', label: 'Posts', section: 'collections', route: ':location/posts', scope: 'location' },
    { key: 'location.photos', id: 'photos', label: 'Photos', section: 'media', route: ':location/photos', scope: 'location' },
    { key: 'location.media', id: 'media', label: 'Media library', section: 'media', route: ':location/media', scope: 'location' },
    { key: 'site.settings', id: 'settings', label: 'Brand, navigation, footer & SEO', section: 'site', route: 'settings', scope: 'site' },
    { key: 'location.settings', id: 'settings', label: 'Location settings', section: 'site', route: ':location/settings', scope: 'location' },
  ],
  locationVocabularyDefault: 'office/service area',
}

export const templateCapabilityCatalog: Record<PublicTemplateSlug, CmsTemplateCatalog> = {
  saya: sayaTemplateCatalog,
  blawby: blawbyTemplateCatalog,
}

// Which (vertical, template) pairs are real products today. Not every catalog feature is
// reachable from every vertical — this plus verticalDefaultFeatures is what keeps
// resolveCmsCapabilities('restaurant', 'blawby') failing fast the way it always has.
const supportedCombinations: Record<SiteVertical, readonly PublicTemplateSlug[]> = {
  restaurant: ['saya'],
  experience: ['saya'],
  professional_service: ['blawby'],
}

// Always-on infra features ('contact', 'locations', 'settings') are included for every vertical
// deliberately — they are not user-toggleable and every override list below still gets them
// unioned in by resolveCmsCapabilities so a site/location override can never accidentally drop
// core navigation.
const ALWAYS_ON_FEATURES: readonly ProductFeature[] = ['contact', 'locations', 'settings']

const verticalDefaultFeatures: Record<SiteVertical, readonly ProductFeature[]> = {
  restaurant: ['menu', 'reservations', 'ordering', 'blog', 'qa', 'reviews', 'media', 'posts', 'photos'],
  experience: ['experiences', 'reservations', 'blog', 'qa', 'reviews', 'media', 'posts', 'photos'],
  professional_service: ['services', 'blog', 'qa', 'reviews', 'media', 'posts', 'photos'],
}

// Vocabulary/label differences that are purely cosmetic (same underlying feature, different
// wording per vertical) live here instead of duplicating whole catalog objects.
const verticalLabelOverrides: Partial<Record<SiteVertical, Partial<Record<ProductFeature, string>>>> = {
  experience: { reservations: 'Bookings' },
}

function effectiveLabel(vertical: SiteVertical, feature: ProductFeature, fallback: string): string {
  return verticalLabelOverrides[vertical]?.[feature] ?? fallback
}

function resolveFeatureSet(vertical: SiteVertical, override: readonly ProductFeature[] | null | undefined): Set<ProductFeature> {
  const base = new Set(override ?? verticalDefaultFeatures[vertical])
  for (const feature of ALWAYS_ON_FEATURES) base.add(feature)
  return base
}

export function resolveCmsCapabilities(
  vertical: SiteVertical,
  template: PublicTemplateSlug,
  overrides?: CmsCapabilityOverrides,
): CmsCapabilityDefinition {
  if (!supportedCombinations[vertical]?.includes(template)) {
    throw new Error(`Unsupported CMS capability combination: ${vertical}/${template}`)
  }
  const catalog = templateCapabilityCatalog[template]

  const siteFeatures = resolveFeatureSet(vertical, overrides?.site)

  let locationFeatures: Set<ProductFeature>
  if (overrides?.location) {
    locationFeatures = resolveFeatureSet(vertical, overrides.location)
    const unsupported = [...locationFeatures].filter(feature => !siteFeatures.has(feature))
    if (unsupported.length > 0) {
      throw new Error(`Location capability override requires parent site support (${vertical}/${template}): ${unsupported.join(', ')}`)
    }
  } else {
    locationFeatures = siteFeatures
  }

  const pages = catalog.pages
    .filter(page => (page.scope === 'site' ? siteFeatures : locationFeatures).has(page.feature))
    .map(page => ({ ...page, label: effectiveLabel(vertical, page.feature, page.label) }))

  const managers = catalog.managers
    .filter(manager => (manager.scope === 'site' ? siteFeatures : locationFeatures).has(manager.id))
    .map(manager => ({ ...manager, label: effectiveLabel(vertical, manager.id, manager.label) }))

  return {
    vertical,
    template,
    locationVocabulary: catalog.locationVocabularyDefault,
    pages,
    managers,
  }
}

/** Every ProductFeature a template's catalog can ever expose (union of its page and manager
 *  feature ids), minus the always-on infra features — the toggleable set a site/location feature
 *  checklist should offer. Used by the settings-page override UI so it never lets an owner
 *  submit a feature the template has no page/manager for at all. */
export function toggleableFeaturesForTemplate(template: PublicTemplateSlug): readonly ProductFeature[] {
  const catalog = templateCapabilityCatalog[template]
  const features = new Set<ProductFeature>()
  for (const page of catalog.pages) features.add(page.feature)
  for (const manager of catalog.managers) features.add(manager.id)
  for (const feature of ALWAYS_ON_FEATURES) features.delete(feature)
  return [...features]
}

/** Every (vertical, template) combination this product actually supports — used by tests and
 *  the settings-page feature toggle to know which catalog features are even offerable. */
export const cmsCapabilityRegistry: readonly CmsCapabilityDefinition[] = Object.entries(supportedCombinations)
  .flatMap(([vertical, templates]) => templates.map(template => resolveCmsCapabilities(vertical as SiteVertical, template)))

/** Validates one resolved definition's internal consistency — split out from
 *  validateCmsCapabilityRegistry so malformed fixtures can be exercised directly in tests instead
 *  of only ever validating the (always-valid-by-construction) real registry. */
export function validateCmsCapabilityDefinition(definition: CmsCapabilityDefinition): void {
  const combination = `${definition.vertical}/${definition.template}`

  const pageIds = new Set<string>()
  const pageRoutesByScope = { site: new Set<string>(), location: new Set<string>() }
  for (const page of definition.pages) {
    if (pageIds.has(page.id)) throw new Error(`Duplicate CMS page id in ${combination}: ${page.id}`)
    if (pageRoutesByScope[page.scope].has(page.route)) throw new Error(`Duplicate CMS page route in ${combination}/${page.scope}: ${page.route}`)
    if (page.scope === 'location' && !page.route.includes(':location')) {
      throw new Error(`Location-scoped CMS page must declare :location: ${combination}/${page.id}`)
    }
    pageIds.add(page.id)
    pageRoutesByScope[page.scope].add(page.route)
  }

  const managerKeys = new Set<string>()
  const managerRoutesByScope = { site: new Set<string>(), location: new Set<string>() }
  for (const manager of definition.managers) {
    if (managerKeys.has(manager.key)) throw new Error(`Duplicate CMS manager key in ${combination}: ${manager.key}`)
    if (manager.key !== `${manager.scope}.${manager.id}`) throw new Error(`CMS manager key must be \`\${scope}.\${id}\`: ${combination}/${manager.key}`)
    if (managerRoutesByScope[manager.scope].has(manager.route)) throw new Error(`Duplicate CMS manager route in ${combination}/${manager.scope}: ${manager.route}`)
    if (manager.scope === 'location' && !manager.route.includes(':location')) {
      throw new Error(`Location-scoped CMS manager must declare :location: ${combination}/${manager.key}`)
    }
    managerKeys.add(manager.key)
    managerRoutesByScope[manager.scope].add(manager.route)
  }
}

export function validateCmsCapabilityRegistry(): void {
  for (const [vertical, templates] of Object.entries(supportedCombinations) as [SiteVertical, readonly PublicTemplateSlug[]][]) {
    for (const template of templates) {
      validateCmsCapabilityDefinition(resolveCmsCapabilities(vertical, template))
    }
  }
}

/** All manager keys a template can ever produce across every vertical it supports — the set the
 *  route guard and the "nav entries without a matching guardable capability" check validate
 *  page-level `cmsCapabilityKey` meta against. */
export function allGuardableManagerKeys(): readonly string[] {
  const keys = new Set<string>()
  for (const catalog of Object.values(templateCapabilityCatalog)) {
    for (const manager of catalog.managers) keys.add(manager.key)
  }
  return [...keys]
}

/** Parses sites.enabled_features / business_locations.enabled_features — a JSON array of
 *  ProductFeature strings, or NULL. Universal (client + server safe) so both the dashboard's
 *  client-side resolveCmsCapabilities calls and the server's DB-backed resolver share one
 *  implementation instead of each hand-rolling their own JSON.parse. Malformed JSON is treated
 *  the same as absent (fall back to vertical defaults) rather than throwing. */
export function parseCmsFeatureOverride(raw: string | null | undefined): readonly ProductFeature[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(value => typeof value === 'string')) return null
    return parsed as ProductFeature[]
  } catch {
    return null
  }
}
