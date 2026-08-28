<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="tenantPagePath" :locale="localeSegment" :preview-token="previewToken" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { splitLocalePrefix } from '~/utils/tenant-locale-path'

definePageMeta({ layout: false })

const route = useRoute()
const { isBlawby } = usePublicTemplate()
const previewToken = computed(() => typeof route.query.token === 'string' ? route.query.token : null)
const rawSegments = route.params.tenantPath
const pagePath = computed(() => {
  const values = Array.isArray(rawSegments) ? rawSegments : [String(rawSegments || '')]
  return '/' + values.filter(Boolean).join('/')
})
const localePrefix = computed(() => splitLocalePrefix(pagePath.value))
const localeSegment = computed(() => localePrefix.value.localeSegment)
const tenantPagePath = computed(() => localePrefix.value.tenantPagePath)
</script>
