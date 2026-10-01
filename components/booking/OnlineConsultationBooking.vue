<template>
  <section id="consultations" class="blawby-container py-16" aria-labelledby="consultation-heading">
    <h2 id="consultation-heading" class="mb-6 text-3xl font-semibold">Choose your consultation</h2>
    <p v-if="error" role="alert">Consultation services could not be loaded. Please try again.</p>
    <p v-else-if="pending">Loading consultation services…</p>
    <div v-else-if="data?.products.length" class="grid gap-6 md:grid-cols-2">
      <OnlineProductBooking v-for="product in data.products" :key="product.id" :product="product" :currency="data.currency" :organization-id="organizationId!" :organization-name="organizationName" />
    </div>
    <p v-else>No online consultation services are currently offered.</p>
  </section>
</template>
<script setup lang="ts">
import type { Product } from '~/server/types/products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { isPublicProduct } from '~/utils/public-resource-contracts'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import OnlineProductBooking from '~/components/booking/OnlineProductBooking.vue'
const { organizationId, organization } = useTenantOrganization()
if (!organizationId || !organization?.name) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
const organizationName = organization.name
const { data, pending, error } = await useAsyncData(`online-consultations:${organizationId}`, async () => {
  if (import.meta.server) {
    const event = useRequestEvent()!
    const { cloudflareEnv } = await import('~/server/utils/api-response')
    const { listPublicOnlineProducts } = await import('~/server/utils/public-session-booking')
    return await listPublicOnlineProducts(cloudflareEnv(event).DB, organizationId)
  }
  return await publicApiRequest<{ products: Product[]; currency: CurrencyCode }>('/api/public/products?online=true', {
  validate: (value): value is { products: Product[]; currency: CurrencyCode } => isRecord(value) && Array.isArray(value.products) && value.products.every(isPublicProduct) && isCurrencyCode(value.currency),
})
})
</script>
