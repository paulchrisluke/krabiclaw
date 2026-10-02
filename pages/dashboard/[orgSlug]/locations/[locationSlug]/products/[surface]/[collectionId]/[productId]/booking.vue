<template>
  <DashboardLeafPanel
    id="product-booking"
    :ready="p.ready.value"
    :title="p.sectionLabels['booking']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <!-- Removing booking configuration is refused while any booking history exists. -->
    <div class="space-y-4">
      <SettingRow v-model="p.form.bookable" label="Takes bookings" description="Guests choose a session and reserve a place." />
      <UAlert v-if="!p.form.bookable && p.product.value?.booking" color="warning" variant="soft" icon="i-lucide-triangle-alert" description="Saving removes this product's schedule. It is refused when any booking history exists, including cancelled bookings." />
      <template v-if="p.form.bookable">
        <UFormField label="Session length (minutes)" description="Default for new sessions. Existing sessions keep their saved times.">
          <UInput v-model="p.form.booking_duration" inputmode="numeric" placeholder="120" class="w-full" />
        </UFormField>
        <UFormField label="Places per session" description="Default for new sessions. Leave empty for no limit; zero means no places. Existing sessions keep their saved capacity.">
          <UInput v-model="p.form.booking_capacity" inputmode="numeric" placeholder="10" class="w-full" />
        </UFormField>
        <!-- The weekly schedule at this branch: each time is a slot run every week; sessions a guest can book are generated from these. -->
        <div v-if="p.product.value?.booking" class="space-y-3 border-t border-default pt-4">
          <div>
            <p class="text-sm font-medium">Weekly schedule</p>
            <p class="text-sm text-muted">Times this branch runs it, in the branch's own clock. Dropping a time cancels future sessions with no booking history. Sessions with any booking history keep their saved times, capacity and state. Re-adding an unbooked time can reopen its sessions using current defaults.</p>
          </div>
          <p v-if="p.scheduleLoading.value" class="text-sm text-muted">Loading the schedule…</p>
          <div v-else class="space-y-3">
            <div v-for="day in p.weekdays" :key="day.value" class="flex flex-col gap-2 sm:flex-row sm:items-start">
              <p class="w-24 shrink-0 pt-2 text-sm font-medium">{{ day.label }}</p>
              <div class="flex-1 space-y-2">
                <div v-for="(slot, index) in p.slotsFor(day.value)" :key="`${day.value}-${index}`" class="flex items-center gap-2">
                  <UInput v-model="slot.start_time" type="time" step="300" class="w-32" />
                  <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Remove this time" @click="p.removeSlot(slot)" />
                </div>
                <UButton icon="i-lucide-plus" color="neutral" variant="subtle" size="sm" label="Add a time" @click="p.addSlot(day.value)" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
