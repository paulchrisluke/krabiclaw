<template>
  <DashboardLeafPanel
    id="location-discovery"
    title="Google Business Profile"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UCard v-if="editor.location.value" variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-highlighted">Google Places</p>
            <p class="mt-1 text-sm text-muted">{{ editor.location.value.google_place_id ? `Last imported: ${editor.location.value.last_synced_at || 'never'}` : 'Not connected' }}</p>
          </div>
          <UBadge :color="editor.location.value.google_place_id ? 'success' : 'neutral'" variant="soft">{{ editor.location.value.google_place_id ? 'Connected' : 'Not connected' }}</UBadge>
        </div>
        <dl v-if="editor.location.value.google_place_id" class="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt class="text-muted">Rating</dt><dd class="mt-1 font-medium text-highlighted">{{ editor.location.value.rating ?? 'Not available' }}</dd></div>
          <div><dt class="text-muted">Reviews</dt><dd class="mt-1 font-medium text-highlighted">{{ editor.location.value.review_count ?? 'Not available' }}</dd></div>
        </dl>
        <UButton class="mt-5" icon="i-simple-icons-googlemaps" color="neutral" variant="outline" :disabled="!editor.location.value.google_place_id" :loading="editor.syncingPlace.value" block @click="editor.syncGooglePlace">Sync Google Places</UButton>
        <p v-if="editor.placeSyncResult.value" class="mt-3 text-sm text-success">{{ editor.placeSyncResult.value }}</p>
      </UCard>
      <UFormField label="Google Place ID"><UInput v-model="editor.detailsForm.google_place_id" size="xl" class="w-full" /></UFormField>
      <UFormField label="Maps URL"><UInput v-model="editor.detailsForm.maps_url" type="url" size="xl" class="w-full" /></UFormField>
      <UFormField label="Google review URL"><UInput v-model="editor.detailsForm.google_review_url" type="url" size="xl" class="w-full" /></UFormField>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const siteId = await useDashboardOrganizationId()
const editor = await useLocationEditor(siteId, dashboardLocation.currentLocationId, 'discovery')
</script>
