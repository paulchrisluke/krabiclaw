import { computed, toValue, type MaybeRefOrGetter } from 'vue'
// truncateForSeo now lives in utils/social-metadata.ts (#259's canonical contract module) —
// both are Nuxt auto-import directories, so it must only be defined in one place.

export function resolveSeoUrl(value: string | null | undefined, origin: string) {
  const target = value?.trim()
  if (!target) throw new Error('SEO URL is required')
  try {
    return new URL(target).toString()
  } catch {
    return new URL(target, origin).toString()
  }
}

export function useSeoUrl(value: MaybeRefOrGetter<string | null | undefined>) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  return computed(() => resolveSeoUrl(toValue(value), requestURL.origin || config.public.siteUrl))
}

/**
 * Same as useSeoUrl, but for platform-only pages (blog/docs) where the
 * canonical/schema origin must always be config.public.siteUrl first — matching
 * useSocialMetadata() and useContentPageSchema() — so it doesn't disagree with
 * itself by resolving to whatever host actually served the request (e.g. a
 * staging/preview Worker). Never use this for tenant/Saya pages: those must
 * resolve against the tenant's actual request origin, which is what useSeoUrl
 * does and why its precedence is intentionally reversed from this one.
 */
export function usePlatformSeoUrl(value: MaybeRefOrGetter<string | null | undefined>) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  return computed(() => resolveSeoUrl(toValue(value), config.public.siteUrl || requestURL.origin))
}
