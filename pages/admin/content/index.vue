<template>
  <UDashboardPanel id="admin-content">
    <template #header>
      <UDashboardNavbar title="Content">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-3">
        <UCard>
          <template #header><p class="font-medium text-default">Social sharing image</p></template>
          <div class="space-y-3">
            <p class="text-sm text-muted">Used when a platform page has no owner-specific generated card.</p>
            <PlatformMediaPicker v-model="socialShareAssetId" />
            <div class="flex gap-2">
              <UButton :loading="savingSocialShare" @click="saveSocialShare">Save image</UButton>
              <UButton color="neutral" variant="outline" :loading="regenerating" @click="regenerateCards">Regenerate cards</UButton>
            </div>
          </div>
        </UCard>
        <div v-for="page in ['about', 'contact', 'help']" :key="page" class="flex items-center justify-between rounded-xl border border-default px-5 py-4">
          <span class="font-medium text-default capitalize">{{ page }}</span>
          <UButton size="sm" variant="outline" :to="`/admin/content/${page}`">Edit</UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Content | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()
const socialShareAssetId = ref<string | null>(null)
const savingSocialShare = ref(false)
const regenerating = ref(false)
const isAssetResponse = (value: unknown): value is { asset_id: string | null } =>
  isRecord(value) && (value.asset_id === null || typeof value.asset_id === 'string')
const isMutationResponse = (value: unknown): value is Record<string, unknown> => isRecord(value)

onMounted(async () => {
  const response = await applicationFetch<{ asset_id: string | null }>('/api/admin/platform/social-share', {
    validate: isAssetResponse,
  })
  socialShareAssetId.value = response.asset_id
})

async function saveSocialShare() {
  savingSocialShare.value = true
  try {
    await applicationFetch('/api/admin/platform/social-share', { method: 'PUT', body: { asset_id: socialShareAssetId.value }, validate: isMutationResponse })
    toast.add({ title: 'Sharing image saved', color: 'success' })
  } finally {
    savingSocialShare.value = false
  }
}

async function regenerateCards() {
  regenerating.value = true
  try {
    await applicationFetch('/api/admin/platform/social-cards/regenerate', { method: 'POST', validate: isMutationResponse })
    toast.add({ title: 'Social cards regenerated', color: 'success' })
  } finally {
    regenerating.value = false
  }
}
</script>
