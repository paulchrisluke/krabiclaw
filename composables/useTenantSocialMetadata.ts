import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSeoUrl } from '~/composables/useSeoUrls'
import { useSocialMetadata } from '~/composables/useSocialMetadata'
import { publicTemplateRegistry, type PublicTemplateSlug } from '~/utils/template-registry'
import type { SocialPageMetadataInput, SocialTemplate } from '~/utils/social-metadata'

export type TenantSocialMetadataInput = Omit<SocialPageMetadataInput, 'template' | 'canonicalUrl'> & {
  /** Root-relative path, e.g. '/' or '/services/wills'. Resolved against the tenant's request origin. */
  path: string
}

function resolveTemplate(themeId: MaybeRefOrGetter<string | null>): SocialTemplate {
  const resolvedThemeId = toValue(themeId)
  const match = (Object.values(publicTemplateRegistry) as Array<{ themeId: string; slug: PublicTemplateSlug }>)
    .find(definition => definition.themeId === resolvedThemeId)
  return match?.slug === 'blawby' ? 'blawby' : 'saya'
}

/**
 * Thin adapter over the shared #259 contract for Saya and Blawby tenant pages — the
 * tenant-side counterpart to usePlatformPageSeo. Resolves origin (request-origin-first,
 * matching useSeoUrl/useTenantOgImage's existing precedence) and render template from the
 * current tenant site context; callers supply the rest (title, description, brand, hero
 * image, explicit override) from their own data source (bootstrap config for Saya, the
 * Blawby shell payload for Blawby).
 */
export function useTenantSocialMetadata(input: MaybeRefOrGetter<TenantSocialMetadataInput>) {
  const { themeId } = useTenantSite()
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  const origin = requestURL.origin || config.public.siteUrl

  const canonicalUrl = useSeoUrl(() => toValue(input).path)
  const socialInput = computed<SocialPageMetadataInput>(() => ({
    ...toValue(input),
    template: resolveTemplate(themeId),
    canonicalUrl: canonicalUrl.value,
  }))

  return useSocialMetadata(socialInput, origin)
}
