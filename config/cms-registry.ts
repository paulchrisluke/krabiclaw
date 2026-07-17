import type { SiteVertical } from '~/utils/vertical-copy'
import type { PublicTemplateSlug } from '~/utils/template-registry'

export type CmsSectionId = 'pages' | 'collections' | 'locations' | 'media' | 'site'
export type CmsManagerId =
  | 'menu' | 'experiences' | 'offerings' | 'reviews' | 'qa' | 'reservations'
  | 'blog' | 'tenant_pages' | 'compliance' | 'media' | 'locations' | 'settings'

export interface CmsPageCapability {
  id: string
  label: string
  route: string
  scope: 'site' | 'location'
  editor: 'site_content' | 'professional_services'
}

export interface CmsManagerCapability {
  id: CmsManagerId
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

const sharedPages: readonly CmsPageCapability[] = [
  { id: 'home', label: 'Home', route: '/', scope: 'site', editor: 'site_content' },
  { id: 'about', label: 'About', route: '/about', scope: 'site', editor: 'site_content' },
  { id: 'contact', label: 'Contact', route: '/contact', scope: 'site', editor: 'site_content' },
]

const sharedManagers: readonly CmsManagerCapability[] = [
  { id: 'blog', label: 'Blog posts', section: 'collections', route: 'blog', scope: 'site' },
  { id: 'reviews', label: 'Reviews', section: 'collections', route: 'reviews', scope: 'site' },
  { id: 'qa', label: 'Q&A', section: 'collections', route: 'qa', scope: 'site' },
  { id: 'locations', label: 'Locations', section: 'locations', route: '', scope: 'site' },
  { id: 'media', label: 'Media library', section: 'media', route: ':location/media', scope: 'location' },
  { id: 'settings', label: 'Brand, navigation, footer & SEO', section: 'site', route: 'settings', scope: 'site' },
]

export const cmsCapabilityRegistry: readonly CmsCapabilityDefinition[] = [
  {
    vertical: 'restaurant',
    template: 'saya',
    locationVocabulary: 'location',
    pages: [
      ...sharedPages,
      { id: 'location', label: 'Location', route: '/locations/:location', scope: 'location', editor: 'site_content' },
      { id: 'menu', label: 'Menu', route: '/locations/:location/menu', scope: 'location', editor: 'site_content' },
      { id: 'reservations', label: 'Reservations', route: '/reservations', scope: 'site', editor: 'site_content' },
      { id: 'order', label: 'Order online', route: '/order?location=:location', scope: 'location', editor: 'site_content' },
    ],
    managers: [
      ...sharedManagers,
      { id: 'menu', label: 'Menus', section: 'collections', route: ':location/menu', scope: 'location' },
      { id: 'reservations', label: 'Reservation policies', section: 'collections', route: ':location/reservations', scope: 'location' },
    ],
  },
  {
    vertical: 'experience',
    template: 'saya',
    locationVocabulary: 'location',
    pages: [
      ...sharedPages,
      { id: 'location', label: 'Location', route: '/locations/:location', scope: 'location', editor: 'site_content' },
      { id: 'experiences', label: 'Experiences', route: '/experiences', scope: 'site', editor: 'site_content' },
      { id: 'reservations', label: 'Bookings', route: '/reservations', scope: 'site', editor: 'site_content' },
    ],
    managers: [
      ...sharedManagers,
      { id: 'experiences', label: 'Experiences', section: 'collections', route: ':location/experiences', scope: 'location' },
      { id: 'reservations', label: 'Booking policies', section: 'collections', route: ':location/reservations', scope: 'location' },
    ],
  },
  {
    vertical: 'professional_service',
    template: 'blawby',
    locationVocabulary: 'office/service area',
    pages: [
      ...sharedPages.map(page => ({ ...page, editor: 'professional_services' as const })),
      { id: 'services', label: 'Services', route: '/services', scope: 'site', editor: 'professional_services' },
      { id: 'pricing', label: 'Pricing', route: '/pricing', scope: 'site', editor: 'professional_services' },
      { id: 'donate', label: 'Donate', route: '/donate', scope: 'site', editor: 'professional_services' },
      { id: 'schedule', label: 'Schedule', route: '/schedule', scope: 'site', editor: 'professional_services' },
    ],
    managers: [
      ...sharedManagers.filter(manager => manager.id !== 'locations'),
      { id: 'offerings', label: 'Services / practice areas', section: 'collections', route: 'professional-services', scope: 'site' },
      { id: 'tenant_pages', label: 'Policies & notices', section: 'collections', route: 'professional-services', scope: 'site' },
      { id: 'compliance', label: 'Compliance & consultation', section: 'site', route: 'professional-services', scope: 'site' },
      { id: 'locations', label: 'Offices / service areas', section: 'locations', route: '', scope: 'site' },
    ],
  },
] as const

export function resolveCmsCapabilities(vertical: SiteVertical, template: PublicTemplateSlug): CmsCapabilityDefinition {
  const match = cmsCapabilityRegistry.find(entry => entry.vertical === vertical && entry.template === template)
  if (!match) throw new Error(`Unsupported CMS capability combination: ${vertical}/${template}`)
  return match
}

export function validateCmsCapabilityRegistry(): void {
  const combinations = new Set<string>()
  for (const entry of cmsCapabilityRegistry) {
    const combination = `${entry.vertical}/${entry.template}`
    if (combinations.has(combination)) throw new Error(`Duplicate CMS capability combination: ${combination}`)
    combinations.add(combination)
    const pageIds = new Set<string>()
    const pageRoutes = new Set<string>()
    for (const page of entry.pages) {
      if (pageIds.has(page.id)) throw new Error(`Duplicate CMS page id in ${combination}: ${page.id}`)
      if (pageRoutes.has(page.route)) throw new Error(`Duplicate CMS page route in ${combination}: ${page.route}`)
      if (page.scope === 'location' && !page.route.includes(':location')) {
        throw new Error(`Location-scoped CMS page must declare :location: ${combination}/${page.id}`)
      }
      pageIds.add(page.id)
      pageRoutes.add(page.route)
    }
    const managerIds = new Set<CmsManagerId>()
    for (const manager of entry.managers) {
      if (managerIds.has(manager.id)) throw new Error(`Duplicate CMS manager in ${combination}: ${manager.id}`)
      if (manager.scope === 'location' && !manager.route.includes(':location')) {
        throw new Error(`Location-scoped CMS manager must declare :location: ${combination}/${manager.id}`)
      }
      managerIds.add(manager.id)
    }
  }
}
