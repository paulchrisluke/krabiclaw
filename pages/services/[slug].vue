<template>
  <NuxtLayout name="blawby">
    <BlawbyOfferingDetail :offering="offering" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { PublicOffering } from '~/types/blawby'

const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })
const { isTenant, siteId } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404 })

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const offeringEndpoint = computed(() => `/api/public/sites/${siteId}/blawby`)

const { data, error } = await useAsyncData<{ offering: PublicOffering | null }>(
  () => `blawby-offering-${siteId}-${slug.value}`,
  async () => {
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Service not found' })
      const [{ cloudflareEnv }, { getPublicOfferingBySlug }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/professional-services'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return {
        offering: await getPublicOfferingBySlug(db, siteId, slug.value),
      }
    }

    const payload = await $fetch<{ offerings: PublicOffering[] }>(offeringEndpoint.value)
    return {
      offering: payload.offerings.find((item) => item.slug === slug.value) ?? null,
    }
  },
  {
    getCachedData(key, nuxtApp) {
      return nuxtApp.payload.data[key] as { offering: PublicOffering | null } | undefined
    },
  },
)

if (error.value) throw error.value
if (!data.value?.offering) throw createError({ statusCode: 404, statusMessage: 'Service not found', fatal: true })

const offering = computed(() => data.value!.offering!)

definePageMeta({ layout: false })
</script>
