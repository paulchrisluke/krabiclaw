import { computed, toValue, type MaybeRefOrGetter } from 'vue'
// truncateForSeo now lives in utils/social-metadata.ts (#259's canonical contract module) —
// both are Nuxt auto-import directories, so it must only be defined in one place.

export const SHARED_OG_IMAGE_PATH = '/og-image-v2.png'

export function resolveSeoUrl(value: string | null | undefined, origin: string) {
  const target = value?.trim() || SHARED_OG_IMAGE_PATH
  try {
    return new URL(target).toString()
  } catch {
    return new URL(target, origin).toString()
  }
}

export function useSeoUrl(value: MaybeRefOrGetter<string | null | undefined> = SHARED_OG_IMAGE_PATH) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  return computed(() => resolveSeoUrl(toValue(value), requestURL.origin || config.public.siteUrl))
}

/**
 * Same as useSeoUrl, but for platform-only pages (blog/docs) where the
 * canonical/schema origin must always be config.public.siteUrl first — matching
 * usePlatformPageSeo() and useContentPageSchema() — so it doesn't disagree with
 * itself by resolving to whatever host actually served the request (e.g. a
 * staging/preview Worker). Never use this for tenant/Saya pages: those must
 * resolve against the tenant's actual request origin, which is what useSeoUrl
 * does and why its precedence is intentionally reversed from this one.
 */
export function usePlatformSeoUrl(value: MaybeRefOrGetter<string | null | undefined> = SHARED_OG_IMAGE_PATH) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  return computed(() => resolveSeoUrl(toValue(value), config.public.siteUrl || requestURL.origin))
}

export function useSharedOgImage(value?: MaybeRefOrGetter<string | null | undefined>) {
  return useSeoUrl(() => toValue(value) || SHARED_OG_IMAGE_PATH)
}

/**
 * og:image for tenant pages that don't have a page-specific photo (About, Contact, Q&A, etc).
 * Falls back through the same chain as the saya layout: site og_image_url → first
 * location's hero photo → logo → the generic platform placeholder.
 */
export function useTenantOgImage(value?: MaybeRefOrGetter<string | null | undefined>) {
  const { config, locations } = useSiteShell()
  return useSeoUrl(() =>
    toValue(value) ||
    config.value?.og_image_url ||
    locations.value[0]?.hero_image_public_url ||
    config.value?.logo_url ||
    SHARED_OG_IMAGE_PATH
  )
}

