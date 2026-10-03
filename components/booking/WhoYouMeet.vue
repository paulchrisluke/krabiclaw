<template>
  <section class="border-t border-default py-8" aria-label="Who you’ll meet with">
    <h2 class="text-xl font-semibold">Who you’ll meet with</h2>
    <div class="mt-4 flex items-start gap-4">
      <img v-if="provider?.photo_url" :src="provider.photo_url" :alt="provider.name" class="size-16 rounded-full object-cover">
      <div><p class="font-medium">{{ provider?.name || organizationName }}</p><p v-if="provider?.bio" class="mt-2 whitespace-pre-line text-muted">{{ provider.bio }}</p></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { PublicProvider } from '~/shared/member-scheduling'
const props=defineProps<{organizationId:string;organizationName:string;productId:string;slug:string;sessionId?:string}>()
const {data:provider}=await useAsyncData(`public-provider:${props.organizationId}:${props.productId}`,async()=>{
 if(import.meta.server){const event=useRequestEvent();if(!event)throw new Error('Request required');const [{cloudflareEnv},{publicProductProvider}]=await Promise.all([import('~/server/utils/api-response'),import('~/server/utils/public-provider')]);return await publicProductProvider(cloudflareEnv(event).DB,props.organizationId,props.productId,props.sessionId)}
 return (await $fetch<{provider:PublicProvider|null}>(`/api/public/products/${encodeURIComponent(props.slug)}/provider`,{query:{session_id:props.sessionId}})).provider
},{watch:[()=>props.sessionId]})
</script>
