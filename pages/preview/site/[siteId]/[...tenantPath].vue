<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="tenantPagePath" :locale="localeSegment" :preview-token="previewToken" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { isBlawby } = usePublicTemplate()
const previewToken = computed(() => typeof route.query.token === 'string' ? route.query.token : null)
const rawSegments = route.params.tenantPath
const pagePath = computed(() => {
  const values = Array.isArray(rawSegments) ? rawSegments : [String(rawSegments || '')]
  return '/' + values.filter(Boolean).join('/')
})
// Mirrors pages/[...tenantPath].vue's locale-segment handling: the first path
// segment is a locale prefix (not tenant_page_variants.path, which is stored
// locale-bare) when it's a well-formed, already-canonical BCP-47 tag.
const localeSegment = computed(() => {
  const first = pagePath.value.split('/')[1]
  if (!first || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(first)) return null
  try {
    const canonical = Intl.getCanonicalLocales(first)
    return canonical.length === 1 && canonical[0] === first ? first : null
  } catch {
    return null
  }
})
const tenantPagePath = computed(() => {
  if (!localeSegment.value) return pagePath.value
  const rest = pagePath.value.slice(localeSegment.value.length + 1)
  return rest || '/'
})
</script>
