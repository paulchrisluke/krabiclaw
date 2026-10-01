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
      <ReservationPolicyForm v-model="editor.reservationForm.value" :pickers="pickers" />
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

// The numbers these rules carry are chosen on the calendar's settings leaves, for this location.
const route = useRoute()
const picker = (leaf: string) => ({ path: `/dashboard/${route.params.orgSlug}/calendar/settings/${leaf}`, query: { locationId: dashboardLocation.currentLocationId.value } })
const router = useRouter()
const pickers = computed(() => ({
  seats: router.resolve(picker('seats')).fullPath,
  notice: router.resolve(picker('notice')).fullPath,
  cancellation: router.resolve(picker('cancellation')).fullPath,
}))
</script>
