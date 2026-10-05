<template>
  <!-- A transaction is a record the business already has a screen for: the visit it paid for, or the purchase itself. -->
  <div />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const api = useDashboardApi()
const paymentId = String(route.params.paymentId || '')
const detail = await api<{ booking_request_id: string | null; order: unknown }>('/api/dashboard/payments', {
  query: { payment_id: paymentId },
  validate: (value: unknown): value is { booking_request_id: string | null; order: unknown } => isRecord(value) && 'order' in value && (value.booking_request_id === null || typeof value.booking_request_id === 'string'),
})
const base = `/dashboard/${route.params.orgSlug}/bookings`
await navigateTo(detail.booking_request_id ? `${base}/booking/${encodeURIComponent(detail.booking_request_id)}` : `${base}/${detail.order ? 'order' : 'payment'}/${encodeURIComponent(paymentId)}`, { replace: true })
</script>
