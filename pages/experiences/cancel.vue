<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8 text-center">
      <h1 class="saya-display-md text-default"><em class="saya-italic">{{ t('saya.experience_cancel.title') }}</em></h1>
    </header>

    <div class="mx-auto max-w-xl px-4 pb-24 text-center">
      <template v-if="pending">
        <SayaIcon name="arrow-path" class="mx-auto size-12 animate-spin text-muted" />
        <p class="mt-4 text-muted">{{ t('saya.experience_cancel.checking') }}</p>
      </template>

      <template v-else-if="booking">
        <div v-if="!cancelled" class="rounded-3xl border border-default bg-elevated p-12 shadow-sm">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <SayaIcon name="calendar-days" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">{{ t('saya.experience_cancel.cancel_visit') }}</h2>
          <div class="mt-6 space-y-2 border-y border-default py-6 text-sm">
            <p><strong>{{ t('saya.experience_cancel.booking_for') }}</strong> {{ booking.name }}</p>
            <p><strong>{{ t('saya.experience_cancel.date') }}</strong> {{ booking.date }}</p>
            <p><strong>{{ t('saya.experience_cancel.time') }}</strong> {{ booking.time }}</p>
            <p><strong>{{ t('saya.experience_cancel.guests') }}</strong> {{ booking.guests }}</p>
          </div>
          <p v-if="cancelError" class="mt-4 text-sm text-error">{{ cancelError }}</p>
          <div class="mt-10 flex flex-col gap-3">
            <SayaButton
              color="error"
              size="lg"
              block
              :loading="loading"
              @click="handleCancel"
            >
              {{ t('saya.experience_cancel.confirm') }}
            </SayaButton>
            <SayaButton
              to="/"
              variant="ghost"
              size="lg"
              block
            >
              {{ t('saya.experience_cancel.keep') }}
            </SayaButton>
          </div>
        </div>

        <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-zinc-500/10 text-zinc-500">
              <SayaIcon name="check-circle" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">{{ t('saya.experience_cancel.cancelled_title') }}</h2>
          <p class="mt-4 text-muted">{{ t('saya.experience_cancel.cancelled_desc', { date: booking.date }) }}</p>
          <div class="mt-10">
            <SayaButton to="/" variant="soft">{{ t('saya.experience_cancel.back_home') }}</SayaButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
        <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">{{ t('saya.experience_cancel.invalid_link') }}</h2>
        <p class="mt-2 text-muted">{{ t('saya.experience_cancel.invalid_link_desc') }}</p>
        <SayaButton to="/experiences" variant="soft" class="mt-10">{{ t('saya.experience_cancel.make_new') }}</SayaButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const { t } = useI18n()

const route = useRoute()
const { siteId } = useTenantSite()

const bookingId = computed(() => route.query.id as string)
const token = computed(() => route.hash ? route.hash.substring(1) : '')

const { data: bookingData, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/experiences/bookings/${bookingId.value}`,
  {
    headers: { Authorization: `Bearer ${token.value}` },
    key: `cancel-xp-booking-${bookingId.value}`,
    immediate: !!bookingId.value && !!token.value
  }
)

const booking = computed(() => (bookingData as ApiValue).value?.booking || null)
const cancelled = ref(false)
const loading = ref(false)
const cancelError = ref('')

async function handleCancel() {
  if (loading.value) return
  loading.value = true
  cancelError.value = ''
  try {
    await $fetch(`/api/public/sites/${siteId}/experiences/bookings/${bookingId.value}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.value}`
      }
    })
    cancelled.value = true
  } catch (err) {
    const message = (err as { data?: { error?: string } })?.data?.error
    cancelError.value = message || t('saya.experience_cancel.toast_cancel_failed')
  } finally {
    loading.value = false
  }
}
</script>
