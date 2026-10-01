<template>
  <section id="consultations" aria-label="Choose your consultation">
    <p v-if="error || servicesError" role="alert" class="blawby-container py-16">Consultation services could not be loaded. Please try again.</p>
    <BlawbyServicesSection v-for="block in grids" v-else :key="block.id" :block="block" :page="services!.page" />
  </section>
</template>
<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import { blockRecords } from '~/utils/tenant-page-block-data'
import { selectPrice, formatMinorAmount } from '~/shared/prices'
const { data, error, organizationId } = await useOnlineConsultationProducts()
const event = useRequestEvent()
const { locale } = useI18n()
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
const grids = computed(() => (services.value?.page.blocks ?? []).filter(block => block.type === 'page_grid').map(block => ({
  ...block,
  data: { ...block.data, items: blockRecords(block.data.items).map(item => {
    const product = data.value?.products.find(product => product.id === item.product_id)
    if (!product?.booking) return { ...item, scheduling_summary: 'Contact us to schedule' }
    const prices = product.variants.filter(variant => variant.active).map(variant => selectPrice(variant.prices, { currency: data.value!.currency, location_id: null, at: new Date().toISOString() })).filter(price => price !== null)
    const amounts = [...new Set(prices.map(price => price.unit_amount))].sort((a, b) => a - b)
    const price = amounts.length ? `${amounts.length > 1 ? 'From ' : ''}${amounts[0] === 0 ? 'Free' : formatMinorAmount(amounts[0]!, data.value!.currency)}` : 'Price unavailable'
    return { ...item, scheduling_summary: `${product.booking.duration_minutes} minutes · ${price} · ${product.booking.confirmation_mode === 'review' ? 'Staff review' : 'Instant confirmation'}` }
  }) },
})))
</script>
