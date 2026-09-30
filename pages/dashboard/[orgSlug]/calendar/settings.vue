<template>
  <!--
    Airbnb reaches the listing's availability settings from the calendar's gear
    as well as from the listing; this is the location's reservation policy, the
    same record its own leaf edits, opened from the calendar.
  -->
  <DashboardLeafPanel
    id="calendar-settings"
    title="Reservation settings"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="mx-auto w-full max-w-md space-y-6">
      <UAlert
        v-if="!editor.reservationConfigExists.value"
        color="neutral"
        variant="soft"
        icon="i-lucide-calendar-off"
        description="This location does not take reservations yet. Saving a policy opens them."
      />
      <ReservationPolicyForm v-model="editor.reservationForm.value" />
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import ReservationPolicyForm from '~/components/dashboard/ReservationPolicyForm.vue'
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const organizationId = await useDashboardOrganizationId()
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)
const editor = await useLocationEditor(organizationId, locationId, 'reservations')
</script>
