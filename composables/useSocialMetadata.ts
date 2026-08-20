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

  useHead(() => ({
    title: tags.value.title,
    meta: [
      { name: 'description', content: tags.value.description },
      { property: 'og:title', content: tags.value.ogTitle },
      { property: 'og:description', content: tags.value.ogDescription },
      { property: 'og:type', content: tags.value.ogType },
      { property: 'og:url', content: tags.value.ogUrl },
      { property: 'og:site_name', content: tags.value.ogSiteName },
      { property: 'og:image', content: tags.value.ogImage },
      { property: 'og:image:width', content: tags.value.ogImageWidth },
      { property: 'og:image:height', content: tags.value.ogImageHeight },
      { property: 'og:image:type', content: tags.value.ogImageType },
      { property: 'og:image:alt', content: tags.value.ogImageAlt },
      { name: 'twitter:card', content: tags.value.twitterCard },
      { name: 'twitter:title', content: tags.value.twitterTitle },
      { name: 'twitter:description', content: tags.value.twitterDescription },
      { name: 'twitter:image', content: tags.value.twitterImage },
      { name: 'twitter:image:alt', content: tags.value.twitterImageAlt },
      { property: 'article:author', content: tags.value.articleAuthor },
      { property: 'article:published_time', content: tags.value.articlePublishedTime },
      ...(tags.value.robots ? [{ name: 'robots', content: tags.value.robots }] : []),
    ].filter(item => item.content !== undefined),
    link: [{ rel: 'canonical', href: tags.value.canonicalUrl }],
  }))

  return {
    canonicalUrl: computed(() => tags.value.canonicalUrl),
    ogImageUrl: computed(() => tags.value.ogImage),
  }
}
