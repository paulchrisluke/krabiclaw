<template>
  <SayaFeaturedContent :data="featured" />
</template>

<script setup lang="ts">
import SayaFeaturedContent from '~/components/saya/SayaFeaturedContent.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords } from '~/utils/tenant-page-block-data'
import { resolveProductPresentation } from '~/utils/product-presentation'
import { resolveSocialImageUrl } from '~/utils/social-metadata'

// Saya's catalogue preview. The block names the products — a collection, or a
// hand-picked set — and the loader resolves each card's price and its route,
// so this draws what the block selected. It used to take the front of whatever
// the merchant's collections happened to contain, which no page could express
// and no owner could change.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { locale, t } = useI18n()
const { site } = useTenantSite()

const presentation = computed(() => resolveProductPresentation(site?.vertical))
const homeCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const brandName = computed(() => String(site?.brand_name ?? '').trim())

const items = computed(() => blockRecords(props.block.data.items).map((item) => {
  const media = blockRecords(item.media)[0] ?? null
  const url = blockText(item.url)
  const isExperience = url.startsWith('/experiences/')
  return {
    name: blockText(item.title),
    description: blockText(item.description),
    price: blockText(item.value) || null,
    compareAtPrice: blockText(item.compare_at) || null,
    // A card draws a still. A video cover is shown as its own poster frame —
    // the same asset — because an <img> cannot render an .mp4.
    image: resolveSocialImageUrl(media && {
      kind: blockText(media.kind) || null,
      public_url: blockText(media.public_url) || null,
      thumbnail_url: blockText(media.thumbnail_url) || null,
    }),
    alt: blockText(media?.alt_text) || blockText(item.title),
    // A product published at more than one location has no single page, so its
    // card is shown without a link rather than sent to a location the merchant
    // did not name.
    href: url || null,
    ctaText: isExperience ? t('saya.common.view_experience') : t('saya.common.view_dish'),
    // A product with no current offer cannot be bought today, whatever the
    // card says next to it.
    unavailable: !blockText(item.value),
    category: blockText(item.category) || null,
  }
}).filter(item => item.name))

const allExperiences = computed(() => items.value.length > 0 && items.value.every(item => item.href?.startsWith('/experiences/')))
const featured = computed(() => ({
  items: items.value,
  kicker: blockText(props.block.data.description)
    || (allExperiences.value ? homeCopy.value.experiencesPageTitle : presentation.value?.locationCollectionSegment === 'menu' ? t('saya.footer.menu') : t('saya.footer.products')),
  heading: blockText(props.block.data.title)
    || (allExperiences.value ? t('saya.experiences.collection_title', { site: brandName.value }) : presentation.value?.locationCollectionSegment === 'menu' ? t('saya.footer.menu') : t('saya.products.collection_title', { site: brandName.value })),
  linkTarget: allExperiences.value ? '/experiences' : presentation.value?.collectionPath ?? null,
}))
</script>
