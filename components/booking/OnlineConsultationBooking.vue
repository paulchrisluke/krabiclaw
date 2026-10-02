<template>
  <section class="py-10 sm:py-14" aria-label="Choose your consultation">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <label class="block max-w-xl text-sm font-medium text-default">
        Service
        <select v-model="selectedId" class="mt-2 w-full min-w-0 rounded-xl border border-default bg-default px-4 py-3 text-base text-default focus:outline-2 focus:-outline-offset-2 focus:outline-primary">
          <option v-for="service in items" :key="service.id" :value="service.id">{{ service.title }}</option>
        </select>
      </label>
      <div v-if="selectedService" class="mt-8 flex items-start gap-5">
        <img v-if="thumbnail" :src="thumbnail" :alt="selectedService.title" class="size-24 shrink-0 rounded-xl object-cover sm:size-32">
        <div class="max-w-3xl">
          <h2 class="blawby-display text-2xl text-default sm:text-3xl">{{ selectedService.title }}</h2>
          <p v-if="selectedService.description" class="mt-3 leading-7 text-muted">{{ selectedService.description }}</p>
          <NuxtLink :to="localePath(selectedService.url)" class="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">Full service details →</NuxtLink>
        </div>
      </div>
      <p v-else role="status" class="mt-5 text-muted">No consultation services are currently published.</p>
      <p v-if="selectedService && !selectedProduct" role="status" class="mt-6 text-muted">Online booking is unavailable for this service. <NuxtLink :to="localePath('/contact')" class="text-primary underline">Contact us to schedule.</NuxtLink></p>
    </div>
    <ProductDetailPage v-if="selectedProduct" :key="selectedProduct.id" compact :organization-id="organizationId" :organization-name="organizationName" vertical="service" :product="selectedProduct" :booking="selectedProduct.booking" :location="null" :currency="data!.currency" collection-name="Services" :presentation="presentation" :reviews="[]" :collection-siblings="[]" :metafield-definitions="[]" />
  </section>
</template>
<script setup lang="ts">
import ProductDetailPage from '~/components/products/ProductDetailPage.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import { blockRecords, blockText } from '~/utils/tenant-page-block-data'
import { requireProductPresentation } from '~/utils/product-presentation'
const { data, organizationId, organizationName } = await useOnlineConsultationProducts()
if (!data.value) throw createError({ statusCode: 500, statusMessage: 'Consultation services were not returned' })
const event = useRequestEvent()
const { locale, localePath } = useI18n()
const { data: services, error: servicesError } = await useAsyncData(`consultation-service-grid:${organizationId}:${locale.value}`, async () => {
  if (import.meta.server) {
    const { cloudflareEnv } = await import('~/server/utils/api-response')
    const { getPublicTenantPageForPath } = await import('~/server/utils/public-tenant-pages')
    const env = cloudflareEnv(event!)
    const page = await getPublicTenantPageForPath(env, env.DB, organizationId, '/services', { locale: locale.value, preview: Boolean(event!.context.previewAuthorized) })
    if (!page) throw createError({ statusCode: 404, statusMessage: 'Services page not found' })
    return { page }
  }
  return await publicApiRequest<{ page: PublicTenantPage }>('/api/public/pages', { query: { path: '/services', locale: locale.value }, validate: (value): value is { page: PublicTenantPage } => isRecord(value) && isRecord(value.page) && Array.isArray(value.page.blocks) })
})
if (servicesError.value) throw servicesError.value
if (!services.value) throw createError({ statusCode: 500, statusMessage: 'Service directory was not returned' })
const items = computed(() => services.value!.page.blocks.filter(block => block.type === 'page_grid').flatMap(block => blockRecords(block.data.items)).map(item => ({
  id: blockText(item.id), productId: blockText(item.product_id), title: blockText(item.title), description: blockText(item.description), url: blockText(item.url), media: blockRecords(item.media),
})))
// Changing the visible service remounts the shared controller so an option or
// time from another service cannot persist into the next request.
const selectedId = ref(items.value.find(item => data.value!.products.some(product => product.id === item.productId))?.id ?? items.value[0]?.id ?? null)
const selectedService = computed(() => items.value.find(item => item.id === selectedId.value) ?? null)
const selectedProduct = computed(() => data.value!.products.find(product => product.id === selectedService.value?.productId && product.active && product.booking?.online_timezone) ?? null)
const thumbnail = computed(() => blockText(selectedService.value?.media.find(media => media.slot === 'cover')?.public_url))
const presentation = requireProductPresentation('service')
</script>
