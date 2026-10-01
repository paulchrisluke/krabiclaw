<template>
  <article class="rounded-xl border border-default bg-default p-6 text-default">
    <h3 class="text-xl font-semibold">{{ product.name }}</h3>
    <p class="mt-2 text-sm text-muted">Online · {{ product.booking?.duration_minutes }} minutes · {{ product.booking?.confirmation_mode === 'review' ? 'Staff review' : 'Instant confirmation' }}</p>
    <ul class="my-4 space-y-1 text-sm">
      <li v-for="variant in controller.sellableVariants.value" :key="variant.id">{{ variant.name }} · {{ controller.variantPriceLabel(variant) || 'Price unavailable' }}</li>
    </ul>
    <SayaButton @click="openOnlineBooking">Choose a time</SayaButton>
    <BookingModal v-model="bookingOpen" :target-id="`consultation-${product.id}`" :title="product.name" :can-go-back="bookingStep > 1 && !submitting" @back="bookingStep = 1">
      <ProductBookingSteps :controller="controller" :confirmation-mode="product.booking?.confirmation_mode ?? 'instant'" />
    </BookingModal>
  </article>
</template>
<script setup lang="ts">
import type { Product } from '~/server/types/products'
import type { CurrencyCode } from '~/shared/currencies'
import type { PublicProductSession } from '~/server/utils/public-products'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import SayaButton from '~/components/saya/SayaButton.vue'
import BookingModal from '~/components/booking/BookingModal.vue'
import ProductBookingSteps from '~/components/booking/ProductBookingSteps.vue'
const props = defineProps<{ product: Product; currency: CurrencyCode; organizationId: string; organizationName: string }>()
const { data, error } = await useAsyncData(`online-product-sessions:${props.organizationId}:${props.product.id}`, async () => {
  if (import.meta.server) {
    const event = useRequestEvent()!
    const { cloudflareEnv } = await import('~/server/utils/api-response')
    const { listPublicBookingSessions } = await import('~/server/utils/public-session-booking')
    return await listPublicBookingSessions(cloudflareEnv(event).DB, props.organizationId, props.product.slug, 'online')
  }
  return await publicApiRequest<{ success: true; sessions: PublicProductSession[] }>(`/api/public/products/${encodeURIComponent(props.product.slug)}/sessions?location_id=online`, {
  validate: (value): value is { success: true; sessions: PublicProductSession[] } => isRecord(value) && value.success === true && Array.isArray(value.sessions),
})
})
if (error.value) throw error.value
const controller = useSessionBooking(() => ({ ...props, showPartySize: false, location: null, sessions: data.value?.sessions ?? [] }))
const { bookingOpen, bookingStep, submitting } = controller
function openOnlineBooking() {
  controller.openBooking()
  bookingOpen.value = true
}
</script>
