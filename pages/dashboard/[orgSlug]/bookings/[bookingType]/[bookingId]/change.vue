<template>
  <!--
    Change is a request the guest confirms: every row edits one staged draft
    and nothing persists until Send. That is why the field leaves have no Save
    of their own — the commit is this level's footer.
  -->
  <DashboardIndexPanel id="booking-change" :title="`Change ${b.noun.value}`">
    <div v-if="b.booking.value" class="mx-auto w-full max-w-md">
      <UAlert v-if="b.changeError.value" class="mb-6" color="error" variant="soft" icon="i-lucide-circle-alert" :description="b.changeError.value" />
      <h1 class="text-[32px] font-semibold leading-tight text-highlighted">What do you want to change?</h1>
      <p class="mt-2 text-base text-muted">
        {{ b.firstName(b.booking.value.guestName) }} confirms the change before anything moves.
      </p>

      <div class="mt-6 flex items-center gap-4 border-t border-default pt-6">
        <img v-if="b.changeLocation.value?.imageUrl" :src="b.changeLocation.value.imageUrl" alt="" class="size-14 shrink-0 rounded-xl object-cover">
        <p class="min-w-0 flex-1 text-base font-medium text-highlighted">{{ b.changeLocation.value?.title }}</p>
        <UButton
          v-if="b.bookingType === 'reservation'"
          :to="`${level.path.value}/location`"
          icon="i-lucide-pencil"
          aria-label="Change location"
          color="neutral"
          variant="soft"
          square
          class="shrink-0 rounded-full"
        />
      </div>

      <div class="mt-2 border-t border-default">
        <NuxtLink
          v-for="field in b.changeFields.value"
          :key="field.key"
          :to="`${level.path.value}/${field.key}`"
          class="flex items-center gap-4 border-b border-default py-4"
          :aria-label="`Change ${field.label.toLowerCase()}`"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium text-highlighted">{{ field.label }}</span>
            <span class="block text-sm text-muted">{{ field.summary }}</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
        </NuxtLink>
      </div>
    </div>

    <template #footer>
      <DashboardPanelFooter
        save-label="Send request"
        :loading="b.changeSaving.value"
        :disabled="!b.changeValid.value || !b.changeDirty.value"
        @cancel="cancel"
        @save="b.sendChangeRequest"
      />
    </template>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { bookingEditorKey } from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard' })

const level = useRouteLevel()
const b = inject(bookingEditorKey)!

// Entering the request afresh: the tenant should not inherit edits they abandoned last time.
b.resetChangeDraft()

function cancel() {
  b.resetChangeDraft()
  return navigateTo(level.to.value ?? '/dashboard')
}
</script>
