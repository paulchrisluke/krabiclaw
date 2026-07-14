import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  composeSocialMetadata,
  resolveSocialOgImage,
  type SocialPageMetadataInput,
} from '~/utils/social-metadata'

/**
 * The one shared composer every page — platform, Saya, Blawby, and future templates —
 * applies to emit `<title>`, meta description, canonical link, robots, Open Graph, and
 * Twitter tags. Pages/adapters provide data via `SocialPageMetadataInput`; they must not
 * call useSeoMeta directly for these fields (see usePlatformPageSeo.ts and
 * useTenantSocialMetadata.ts, the two supported thin adapters over this composable).
 *
 * `origin` must already reflect the correct precedence for the calling surface — platform
 * pages resolve config.public.siteUrl first, tenant pages resolve the request origin first
 * (see composables/useSeoUrls.ts's useSeoUrl vs usePlatformSeoUrl for why these differ).
 */
export function useSocialMetadata(
  input: MaybeRefOrGetter<SocialPageMetadataInput>,
  origin: MaybeRefOrGetter<string>,
) {
  const tags = computed(() => {
    const value = toValue(input)
    const resolvedImage = resolveSocialOgImage(value, toValue(origin))
    return composeSocialMetadata(value, resolvedImage)
  })

  useSeoMeta({
    title: computed(() => tags.value.title),
    description: computed(() => tags.value.description),
    ogTitle: computed(() => tags.value.ogTitle),
    ogDescription: computed(() => tags.value.ogDescription),
    ogType: computed(() => tags.value.ogType),
    ogUrl: computed(() => tags.value.ogUrl),
    ogSiteName: computed(() => tags.value.ogSiteName),
    ogImage: computed(() => tags.value.ogImage),
    ogImageWidth: computed(() => tags.value.ogImageWidth),
    ogImageHeight: computed(() => tags.value.ogImageHeight),
    ogImageType: computed(() => tags.value.ogImageType),
    ogImageAlt: computed(() => tags.value.ogImageAlt),
    twitterCard: computed(() => tags.value.twitterCard),
    twitterTitle: computed(() => tags.value.twitterTitle),
    twitterDescription: computed(() => tags.value.twitterDescription),
    twitterImage: computed(() => tags.value.twitterImage),
    twitterImageAlt: computed(() => tags.value.twitterImageAlt),
    articleAuthor: computed(() => tags.value.articleAuthor),
    articlePublishedTime: computed(() => tags.value.articlePublishedTime),
  })

  useHead(() => ({
    link: [{ rel: 'canonical', href: tags.value.canonicalUrl }],
    meta: tags.value.robots ? [{ name: 'robots', content: tags.value.robots }] : [],
  }))

  return {
    canonicalUrl: computed(() => tags.value.canonicalUrl),
    ogImageUrl: computed(() => tags.value.ogImage),
  }
}
