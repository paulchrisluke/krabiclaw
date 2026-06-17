<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8 text-center">
      <h1 class="saya-display-md text-default"><em class="saya-italic">{{ t('saya.reservation_cancel.title') }}</em></h1>
    </header>

    <div class="mx-auto max-w-xl px-4 pb-24 text-center">
      <template v-if="pending">
        <UIcon name="i-heroicons-arrow-path" class="mx-auto size-12 animate-spin text-muted" />
        <p class="mt-4 text-muted">{{ t('saya.reservation_cancel.checking') }}</p>
      </template>

      <template v-else-if="reservation">
        <div v-if="!cancelled" class="rounded-3xl border border-default bg-elevated p-12 shadow-sm">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <UIcon name="i-heroicons-calendar-days" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">{{ t('saya.reservation_cancel.cancel_visit') }}</h2>
          <div class="mt-6 space-y-2 border-y border-default py-6 text-sm">
            <p><strong>{{ t('saya.reservation_cancel.reservation_for') }}</strong> {{ reservation.name }}</p>
            <p><strong>{{ t('saya.reservation_cancel.date') }}</strong> {{ reservation.date }}</p>
            <p><strong>{{ t('saya.reservation_cancel.time') }}</strong> {{ reservation.time }}</p>
            <p><strong>{{ t('saya.reservation_cancel.guests') }}</strong> {{ reservation.guests }}</p>
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
              {{ t('saya.reservation_cancel.confirm') }}
            </UButton>
            <UButton
              to="/"
              variant="ghost"
              size="lg"
              block
              class="rounded-full"
            >
              {{ t('saya.reservation_cancel.keep') }}
            </UButton>
          </div>
        </div>

        <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
          <div class="mb-6 flex justify-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-zinc-500/10 text-zinc-500">
              <UIcon name="i-heroicons-check-circle" class="size-10" />
            </div>
          </div>
          <h2 class="saya-display saya-italic text-3xl">{{ t('saya.reservation_cancel.cancelled_title') }}</h2>
          <p class="mt-4 text-muted">{{ t('saya.reservation_cancel.cancelled_desc', { date: reservation.date }) }}</p>
          <div class="mt-10">
            <UButton to="/" color="primary" variant="soft" class="rounded-full">{{ t('saya.reservation_cancel.back_home') }}</UButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12">
        <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">{{ t('saya.reservation_cancel.invalid_link') }}</h2>
        <p class="mt-2 text-muted">{{ t('saya.reservation_cancel.invalid_link_desc') }}</p>
        <UButton to="/reservations" color="primary" variant="soft" class="mt-10 rounded-full">{{ t('saya.reservation_cancel.make_new') }}</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const { t } = useI18n()

const route = useRoute()
const { siteId } = useTenantSite()
const toast = useToast()

const resId = computed(() => route.query.id as string)
const token = computed(() => route.hash ? route.hash.substring(1) : '')

const { data: resData, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/reservations/${resId.value}`,
  {
    headers: { Authorization: `Bearer ${token.value}` },
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
    toast.add({ title: t('saya.reservation_cancel.toast_cancelled'), color: 'success' })
  } catch (err) {
    const message = (err as { data?: { error?: string } })?.data?.error
    toast.add({ title: t('saya.reservation_cancel.toast_error'), description: message || t('saya.reservation_cancel.toast_cancel_failed'), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>
