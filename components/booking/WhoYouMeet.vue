<template>
  <section class="border-t border-default py-8" aria-label="Who you’ll meet with">
    <h2 class="text-xl font-semibold">Who you’ll meet with</h2>
    <div v-if="error" class="mt-4 space-y-3">
      <UAlert color="error" title="Who you’ll meet could not be loaded" :description="getErrorMessage(error, 'Please retry loading the provider profile.')" />
      <UButton color="neutral" variant="soft" @click="refresh()">Retry loading provider</UButton>
    </div>
    <p v-else-if="status !== 'success'" role="status" class="mt-4 text-muted">Loading who you’ll meet…</p>
    <div v-else class="mt-4 flex items-start gap-4">
      <img v-if="provider?.photo_url" :src="provider.photo_url" :alt="provider.name" class="size-16 rounded-full object-cover">
      <div><p class="font-medium">{{ provider?.name || organizationName }}</p><p v-if="provider?.bio" class="mt-2 whitespace-pre-line text-muted">{{ provider.bio }}</p></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { PublicProvider } from '~/shared/member-scheduling'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
const props=defineProps<{organizationId:string;organizationName:string;productId:string;slug:string;sessionId?:string}>()
const {data:provider,error,status,refresh}=await useAsyncData(`public-provider:${props.organizationId}:${props.productId}`,async()=>{
 if(import.meta.server){const event=useRequestEvent();if(!event)throw new Error('Request required');const [{cloudflareEnv},{publicProductProvider}]=await Promise.all([import('~/server/utils/api-response'),import('~/server/utils/public-provider')]);return await publicProductProvider(cloudflareEnv(event).DB,props.organizationId,props.productId,props.sessionId)}
 return (await publicApiRequest<{provider:PublicProvider|null}>(`/api/public/products/${encodeURIComponent(props.slug)}/provider`, {
  query: props.sessionId ? { session_id: props.sessionId } : {},
  validate: (value): value is { provider: PublicProvider | null } => isRecord(value) && (value.provider === null || (isRecord(value.provider) && typeof value.provider.name === 'string' && (value.provider.photo_url === null || typeof value.provider.photo_url === 'string') && (value.provider.bio === null || typeof value.provider.bio === 'string'))),
 })).provider
},{watch:[()=>props.sessionId]})
</script>
