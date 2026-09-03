<template>
  <main class="min-h-screen bg-default px-5 py-16 text-default">
    <div class="mx-auto max-w-lg">
      <div class="mb-8 flex items-center gap-3">
        <UIcon name="i-lucide-qr-code" class="size-8 text-primary" />
        <span class="text-lg font-semibold">Ordering</span>
      </div>

      <UCard v-if="state === 'loading'" variant="subtle">
        <div class="space-y-4" aria-live="polite">
          <USkeleton class="h-7 w-56" />
          <USkeleton class="h-5 w-full" />
          <USkeleton class="h-11 w-full" />
          <p class="text-sm text-muted">Checking this Ordering QR code...</p>
        </div>
      </UCard>

      <UCard v-else-if="state === 'error'" variant="subtle">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="This Ordering QR code is unavailable"
          :description="errorMessage"
        />
      </UCard>

      <UCard v-else-if="resolved" variant="subtle">
        <p class="text-sm font-medium text-primary">Ordering for</p>
        <h1 class="mt-2 text-3xl font-semibold text-highlighted">{{ resolved.context.service_point_label }}</h1>
        <dl class="mt-6 divide-y divide-default rounded-lg border border-default">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <dt class="text-sm text-muted">Location</dt>
            <dd class="text-right font-medium text-highlighted">{{ resolved.context.location_title }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <dt class="text-sm text-muted">Site</dt>
            <dd class="text-right font-medium text-highlighted">{{ resolved.context.site_name }}</dd>
          </div>
        </dl>
        <p class="mt-5 text-sm text-muted">
          Check that this is where you want your order delivered before you open the ordering menu.
        </p>
        <UButton
          class="mt-6"
          size="xl"
          icon="i-lucide-utensils"
          trailing-icon="i-lucide-arrow-right"
          :to="resolved.continue_url"
          external
          block
        >
          Continue to ordering menu
        </UButton>
      </UCard>
    </div>
  </main>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: false })
useHead({
  title: 'Confirm ordering location',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    { name: 'referrer', content: 'no-referrer' },
  ],
})

interface OrderingQrResponse {
  context: {
    site_id: string
    site_name: string
    location_id: string
    location_slug: string
    location_title: string
    service_point_id: string
    service_point_label: string
  }
  continue_url: string
}

function isOrderingQrResponse(value: unknown): value is OrderingQrResponse {
  return isRecord(value)
    && isRecord(value.context)
    && typeof value.context.site_id === 'string'
    && typeof value.context.site_name === 'string'
    && typeof value.context.location_id === 'string'
    && typeof value.context.location_slug === 'string'
    && typeof value.context.location_title === 'string'
    && typeof value.context.service_point_id === 'string'
    && typeof value.context.service_point_label === 'string'
    && typeof value.continue_url === 'string'
}

const state = ref<'loading' | 'ready' | 'error'>('loading')
const resolved = ref<OrderingQrResponse | null>(null)
const errorMessage = ref('Ask a team member for a current QR code.')

onMounted(async () => {
  const credential = new URLSearchParams(window.location.hash.slice(1)).get('credential')
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  try {
    if (!credential) throw new Error('Missing Ordering QR credential')
    const session = await authClient.getSession()
    if (!session.data?.session) {
      const anonymous = await authClient.signIn.anonymous()
      if (anonymous.error) throw new Error(anonymous.error.message)
    }
    resolved.value = await applicationFetch<OrderingQrResponse>('/api/public/ordering/resolve', {
      method: 'POST',
      body: { credential },
      validate: isOrderingQrResponse,
    })
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>
