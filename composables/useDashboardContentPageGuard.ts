import { getScopedEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import type { PublicTemplateSlug } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

interface EditorSiteContext {
  vertical: SiteVertical
  template: PublicTemplateSlug
  feature_overrides?: string | null
}

interface EditorLocationContext {
  slug: string
  feature_overrides?: string | null
}

interface EditorContextResponse {
  context: {
    site: EditorSiteContext
    locations?: EditorLocationContext[]
  }
}

export async function assertDashboardContentPageAvailable(
  siteId: string,
  pageId: string,
  scope: 'site' | 'location',
  locationSlug?: string | null,
) {
  const response = await $fetch<EditorContextResponse>(`/api/editor/sites/${siteId}/context`)
  const location = scope === 'location'
    ? response.context.locations?.find(item => item.slug === locationSlug)
    : null
  if (scope === 'location' && !location) {
    throw createError({
      statusCode: 404,
      statusMessage: `Location is not available for this site: ${locationSlug ?? ''}`,
    })
  }
  const capabilities = resolveCmsCapabilities(response.context.site.vertical, response.context.site.template, {
    site: parseCmsFeatureOverrideDelta(response.context.site.feature_overrides),
    location: location ? parseCmsFeatureOverrideDelta(location.feature_overrides) : undefined,
  })
  const pages = getScopedEditablePages(response.context.site.vertical, capabilities, scope)

  if (!pages.some(page => page.id === pageId)) {
    throw createError({
      statusCode: 404,
      statusMessage: `Page is not available for this site: ${pageId}`,
    })
  }
}
