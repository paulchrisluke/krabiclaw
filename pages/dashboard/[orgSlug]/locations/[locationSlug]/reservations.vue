<template>
  <DashboardLeafPanel
    id="location-reservations"
    title="Reservations"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UAlert
        v-if="!editor.reservationConfigExists.value"
        color="neutral"
        variant="soft"
        icon="i-lucide-calendar-off"
        description="This location does not take reservations yet. Saving a policy opens them."
      />
      <ReservationPolicyForm v-model="editor.reservationForm.value" />
      <UButton
        v-if="editor.reservationConfigExists.value"
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        :loading="editor.closingReservations.value"
        :disabled="editor.saving.value"
        @click="editor.closeReservations"
      >
        Stop taking reservations here
      </UButton>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import ReservationPolicyForm from '~/components/dashboard/ReservationPolicyForm.vue'
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
const organizationId = await useDashboardOrganizationId()
const editor = await useLocationEditor(organizationId, dashboardLocation.currentLocationId, 'reservations')
</script>
