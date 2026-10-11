<template>
  <section v-if="status !== 'success' || provider" class="border-t border-default py-8" :aria-label="t('booking.provider_title')">
    <h2 class="text-xl font-semibold">{{ t('booking.provider_title') }}</h2>
    <div v-if="error" class="mt-4 space-y-3">
      <UAlert color="error" :title="t('booking.provider_failed')" :description="getErrorMessage(error, '') || undefined" />
      <UButton color="neutral" variant="soft" @click="refresh()">{{ t('booking.provider_retry') }}</UButton>
    </div>
    <p v-else-if="status !== 'success'" role="status" class="mt-4 text-muted">{{ t('booking.provider_loading') }}</p>
    <div v-else-if="provider" class="mt-4 flex items-start gap-4">
      <img v-if="provider.photo_url" :src="provider.photo_url" :alt="provider.name" class="size-16 rounded-full object-cover">
      <div>
        <p class="font-medium">{{ provider.name }}</p>
        <p v-if="provider.bio" class="mt-2 whitespace-pre-line text-muted">{{ provider.bio }}</p>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { PublicProvider } from '~/shared/member-scheduling'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

const props = defineProps<{ organizationId: string; organizationName: string; productId: string; slug: string; sessionId?: string }>()
const { t } = useI18n()
const { data, error, status, refresh } = await useAsyncData(`public-provider:${props.organizationId}:${props.productId}`, async () => {
  if (import.meta.server) {
    const event = useRequestEvent()
    if (!event) throw new Error('Request required')
    const [{ cloudflareEnv }, { publicProductProvider }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/public-provider'),
    ])
    return { provider: await publicProductProvider(cloudflareEnv(event).DB, props.organizationId, props.productId, props.sessionId) }
  }
  return await publicApiRequest<{ provider: PublicProvider | null }>(`/api/public/products/${encodeURIComponent(props.slug)}/provider`, {
    query: props.sessionId ? { session_id: props.sessionId } : {},
    validate: (value): value is { provider: PublicProvider | null } => isRecord(value) && (value.provider === null || (isRecord(value.provider) && typeof value.provider.name === 'string' && (value.provider.photo_url === null || typeof value.provider.photo_url === 'string') && (value.provider.bio === null || typeof value.provider.bio === 'string'))),
  })
}, { watch: [() => props.sessionId] })
const provider = computed(() => data.value?.provider ?? null)
</script>
