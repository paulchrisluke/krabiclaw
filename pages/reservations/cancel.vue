<template>
  <div class="min-h-screen bg-default text-default">
    <SayaHero
      title="Cancel Reservation"
      subtitle="We're sorry you can't make it"
      size="page"
    />

    <div class="mx-auto max-w-xl px-4 py-24 text-center">
      <template v-if="pending">
        <UIcon name="i-heroicons-arrow-path" class="mx-auto size-12 animate-spin text-muted" />
        <p class="mt-4 text-muted">Checking reservation details...</p>
      </template>

      <template v-else-if="reservation">
        <div v-if="!cancelled" class="rounded-3xl border border-default bg-elevated p-12 shadow-sm">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <UIcon name="i-heroicons-calendar-days" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">Cancel your visit?</h2>
          <div class="mt-6 space-y-2 border-y border-default py-6 text-sm">
            <p><strong>Reservation for:</strong> {{ reservation.name }}</p>
            <p><strong>Date:</strong> {{ reservation.date }}</p>
            <p><strong>Time:</strong> {{ reservation.time }}</p>
            <p><strong>Guests:</strong> {{ reservation.guests }}</p>
          </div>
          <div class="mt-10 flex flex-col gap-3">
            <UButton
              color="error"
              variant="solid"
              size="lg"
              block
              class="rounded-full"
              :loading="loading"
              @click="handleCancel"
            >
              Confirm Cancellation
            </UButton>
            <UButton
              to="/"
              variant="ghost"
              size="lg"
              block
              class="rounded-full"
            >
              Keep Reservation
            </UButton>
          </div>
        </div>

        <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-zinc-500/10 text-zinc-500">
              <UIcon name="i-heroicons-check-circle" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">Reservation Cancelled</h2>
          <p class="mt-4 text-muted">Your reservation for {{ reservation.date }} has been cancelled. We hope to see you another time!</p>
          <div class="mt-10">
            <UButton to="/" color="primary" variant="soft" class="rounded-full">Back to Home</UButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
        <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">Invalid Link</h2>
        <p class="mt-2 text-muted">We couldn't find a reservation matching this link. It may have already been cancelled or expired.</p>
        <UButton to="/reservations" color="primary" variant="soft" class="mt-10 rounded-full">Make a New Reservation</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId } = useTenantSite()
const toast = useToast()

const resId = computed(() => route.query.id as string)
const token = computed(() => route.query.token as string)

const { data: resData, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/reservations/${resId.value}?token=${encodeURIComponent(token.value || '')}`,
  {
    key: `cancel-res-${resId.value}`,
    immediate: !!resId.value && !!token.value
  }
)

const reservation = computed(() => (resData as ApiValue).value?.reservation || null)
const cancelled = ref(false)
const loading = ref(false)

async function handleCancel() {
  if (loading.value) return
  loading.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/reservations/${resId.value}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`
      }
    })
    cancelled.value = true
    toast.add({ title: 'Reservation cancelled', color: 'success' })
  } catch (err) {
    const message = (err as { data?: { error?: string } })?.data?.error
    toast.add({ title: 'Error', description: message || 'Failed to cancel reservation', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>
