import type { CmsCapabilityDefinition, CmsCapabilityOverrides, CmsPageCapability } from '~/config/cms-registry'
import { resolveCmsCapabilities } from '~/config/cms-registry'
import type { PublicTemplateSlug } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

export interface PreviewContext {
  locationSlug?: string
}

export interface EditablePage {
  id: string
  label: string
  path: string
  scope: 'site' | 'location'
  scopeLabelKey: 'site' | 'location' | 'office'
  editor: CmsPageCapability['editor']
}

/**
 * Registered page routes used by integrations that accept a semantic page id.
 * Page fields and components are not registered here: composition belongs to
 * the canonical tenant-page block registry and Pages manager.
 */
export const contentRegistry: Record<string, { path: string }> = {
  home: { path: '/' },
  about: { path: '/about' },
  contact: { path: '/contact' },
  location: { path: '/locations/:location' },
  products: { path: '/products' },
  order: { path: '/order' },
  experiences: { path: '/experiences' },
  reservations: { path: '/reservations' },
  services: { path: '/services' },
  pricing: { path: '/pricing' },
  donate: { path: '/donate' },
  schedule: { path: '/schedule' },
  privacy: { path: '/policies/privacy' },
  terms: { path: '/policies/terms' },
  'third-party-notices': { path: '/third-party-notices' },
}

export function getEditablePages(
  vertical: SiteVertical,
  template: PublicTemplateSlug,
  overrides?: CmsCapabilityOverrides,
): EditablePage[] {
  const capability = resolveCmsCapabilities(vertical, template, overrides)
  return capability.pages.map(page => ({
    id: page.id,
    label: page.label,
    path: page.route,
    scope: page.scope,
    scopeLabelKey: page.scope === 'site'
      ? 'site'
      : capability.locationVocabulary === 'office/service area' ? 'office' : 'location',
    editor: page.editor,
  }))
}

/**
 * The former field-editor page guard has no pages to authorize. The canonical
 * Pages manager authorizes and resolves variants through its own API.
 */
export function getScopedEditablePages(
  _vertical: SiteVertical | null,
  _capabilities: CmsCapabilityDefinition | null,
  _scope: 'site' | 'location',
): EditablePage[] {
  return []
}

export function getEditableFieldKeys(_page: string, _editor: CmsPageCapability['editor'] = 'tenant_pages'): string[] {
  return []
}

export function getEditablePageGroups(_page: string, _editor: CmsPageCapability['editor'] = 'tenant_pages'): never[] {
  return []
}

export function buildDisplayUrl(domain: string, path: string): string {
  if (!domain) return ''
  return domain + (path === '/' ? '' : path)
}

export function resolvePreviewPath(pageId: string, context: PreviewContext): string {
  const route = contentRegistry[pageId]?.path
  if (!route) throw new Error(`Unknown CMS page: ${pageId}`)
  if (route.includes(':location') && !context.locationSlug) {
    throw new Error(`CMS page "${pageId}" requires an explicit location slug`)
  }
  return route.replace(':location', context.locationSlug ?? '')
}
