import type { SiteVertical } from '~/utils/vertical-copy'
import type { PublicTemplateSlug } from '~/utils/template-registry'

export type CmsSectionId = 'pages' | 'collections' | 'locations' | 'media' | 'site'

// Explicit module identifiers a vertical/template/site/location can turn on. 'experience_bookings',
// 'consultations' and 'appointments' are declared (not yet wired to any catalog entry below) because
// no distinct manager/route exists for them yet — today's single 'reservations' feature covers both
// table-reservation and experience-booking policy management, and blawby's practice management lives
// entirely on the single 'services' page. A `booking_policies` table (server/db/schema.ts) already
// models a real reservation/experience policy_type split at site/location/experience scope, so the
// backing data model exists — building the distinct location.reservation_policies/
// location.booking_policies managers on top of it is manager-page UX (issue #342's own "Do not
// implement manager page UX in this issue; that is issue 3/5" boundary), not a capability-model
// change. Wire real catalog entries when that page work happens instead of aliasing fake ones now.
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

/** Explicit site/location module override, as an ADDITIVE/SUBTRACTIVE DELTA on top of the
 *  underlying default set (never a full-replacement snapshot) — this is what lets a future
 *  default addition still reach a site that already has an override, and lets an owner add a
 *  module the vertical doesn't default to (hybrid restaurant+experiences) independently of
 *  removing one it does (turn off ordering), without either action clobbering the other. */
export interface CmsCapabilityOverrideDelta {
  enabled?: readonly ProductFeature[]
  disabled?: readonly ProductFeature[]
}

/**
 * - `site`: applied on top of the vertical's own module defaults. `null`/omitted means "use the
 *   vertical defaults as-is".
 * - `location`: applied on top of the site's EFFECTIVE feature set (the site's own delta already
 *   resolved, if any) — never the vertical defaults directly. `null`/omitted means "inherit the
 *   site's effective set exactly". An `enabled` entry must name a feature already present in that
 *   effective site set (enforced below) — `disabled` entries are always safe, since a location can
 *   always turn off something it inherited.
 */
export interface CmsCapabilityOverrides {
  site?: CmsCapabilityOverrideDelta | null
  location?: CmsCapabilityOverrideDelta | null
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

/** Where a business module can be toggled. Deliberately explicit rather than inferred from
 *  CmsManagerCapability.scope — issue #342 is explicit that "scope" there means WHERE a feature is
 *  MANAGED, which doesn't necessarily match where it can be turned on/off (e.g. ordering's URLs
 *  live on business_locations rows, but that doesn't by itself say whether ordering is a
 *  site-only decision or can vary per location — that's a product decision, stated here). */
export interface ProductModuleDefinition {
  feature: ProductFeature
  configurableAt: readonly ('site' | 'location')[]
}

const sayaModules: readonly ProductModuleDefinition[] = [
  { feature: 'menu', configurableAt: ['site', 'location'] },
  { feature: 'ordering', configurableAt: ['site', 'location'] },
  { feature: 'reservations', configurableAt: ['site', 'location'] },
  { feature: 'experiences', configurableAt: ['site', 'location'] },
]
const blawbyModules: readonly ProductModuleDefinition[] = [
  { feature: 'services', configurableAt: ['site'] },
]
const templateModules: Record<PublicTemplateSlug, readonly ProductModuleDefinition[]> = {
  saya: sayaModules,
  blawby: blawbyModules,
}

/** The real, customer-facing business modules a template offers, filtered to where they can
 *  actually be toggled from ('site' vs 'location') — what the site and location settings pages'
 *  module cards each list. Distinct from toggleableFeaturesForTemplate, which answers "every
 *  toggleable id regardless of scope" (used for registry-wide validation). */
export function toggleableModulesForScope(template: PublicTemplateSlug, scope: 'site' | 'location'): readonly ProductFeature[] {
  return templateModules[template].filter(module => module.configurableAt.includes(scope)).map(module => module.feature)
}

// Which (vertical, template) pairs are real products today. Not every catalog feature is
// reachable from every vertical — this plus verticalDefaultFeatures is what keeps
// resolveCmsCapabilities('restaurant', 'blawby') failing fast the way it always has.
const supportedCombinations: Record<SiteVertical, readonly PublicTemplateSlug[]> = {
  restaurant: ['saya'],
  experience: ['saya'],
  professional_service: ['blawby'],
}

// Always-on features: 'contact'/'locations'/'settings' are infra; 'blog'/'qa'/'reviews'/'posts'/
// 'photos'/'media' are content managers — never business modules. An empty content manager still
// needs to be reachable so an owner can create the first item (turning it off because it's empty
// creates a circular UX problem), and public-side empty-state behavior for these is governed
// separately by config/saya-empty-states.ts, not by this override model. None of these are
// user-toggleable, and every delta below still gets them unioned in by resolveCmsCapabilities —
// including surviving an explicit `disabled` entry — so an override can never drop them.
export const ALWAYS_ON_FEATURES: readonly ProductFeature[] = [
  'contact', 'locations', 'settings',
  'blog', 'qa', 'reviews', 'posts', 'photos', 'media',
]

// Real business-module defaults only — content managers are handled uniformly via
// ALWAYS_ON_FEATURES above, not per-vertical here.
const verticalDefaultFeatures: Record<SiteVertical, readonly ProductFeature[]> = {
  restaurant: ['menu', 'reservations', 'ordering'],
  experience: ['experiences', 'reservations'],
  professional_service: ['services'],
}

// Vocabulary/label differences that are purely cosmetic (same underlying feature, different
// wording per vertical) live here instead of duplicating whole catalog objects.
const verticalLabelOverrides: Partial<Record<SiteVertical, Partial<Record<ProductFeature, string>>>> = {
  experience: { reservations: 'Bookings' },
}

/** The vertical's own module defaults (real business modules only, before any site/location
 *  delta is applied) — exposed so a settings-page client can diff its checked state against the
 *  true baseline without duplicating verticalDefaultFeatures' table. */
export function defaultModuleFeaturesForVertical(vertical: SiteVertical): readonly ProductFeature[] {
  return verticalDefaultFeatures[vertical]
}

function effectiveLabel(vertical: SiteVertical, feature: ProductFeature, fallback: string): string {
  return verticalLabelOverrides[vertical]?.[feature] ?? fallback
}

function applyDelta(base: Iterable<ProductFeature>, delta: CmsCapabilityOverrideDelta | null | undefined): Set<ProductFeature> {
  const result = new Set(base)
  for (const feature of delta?.enabled ?? []) result.add(feature)
  for (const feature of delta?.disabled ?? []) result.delete(feature)
  // Always wins, even over an explicit disable — see ALWAYS_ON_FEATURES' comment.
  for (const feature of ALWAYS_ON_FEATURES) result.add(feature)
  return result
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

  const siteFeatures = applyDelta(verticalDefaultFeatures[vertical], overrides?.site)

  let locationFeatures: Set<ProductFeature>
  if (overrides?.location) {
    locationFeatures = applyDelta(siteFeatures, overrides.location)
    const invalidEnables = (overrides.location.enabled ?? []).filter(feature => !siteFeatures.has(feature))
    if (invalidEnables.length > 0) {
      throw new Error(`Location capability override requires parent site support (${vertical}/${template}): ${invalidEnables.join(', ')}`)
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

function isProductFeatureArray(value: unknown): value is ProductFeature[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/** Parses sites.feature_overrides / business_locations.feature_overrides — a JSON
 *  { enabled?: ProductFeature[]; disabled?: ProductFeature[] } delta object, or NULL. Universal
 *  (client + server safe) so both the dashboard's client-side resolveCmsCapabilities calls and
 *  the server's DB-backed resolver share one implementation instead of each hand-rolling their
 *  own JSON.parse. Malformed JSON, a non-object, or a malformed sub-array is treated the same as
 *  absent (fall back to defaults) rather than throwing — a corrupt override column must never
 *  500 the dashboard. */
export function parseCmsFeatureOverrideDelta(raw: string | null | undefined): CmsCapabilityOverrideDelta | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    return {
      enabled: isProductFeatureArray(record.enabled) ? record.enabled : [],
      disabled: isProductFeatureArray(record.disabled) ? record.disabled : [],
    }
  } catch {
    return null
  }
}
