<template>
  <div class="space-y-5">
    <UFormField label="Title" required>
      <UInput v-model="editor.form.title" autofocus class="w-full" />
    </UFormField>
    <UFormField label="Tagline" help="One-line hook shown on the listing card.">
      <UInput v-model="editor.form.tagline" class="w-full" />
    </UFormField>
    <UFormField label="Description">
      <UTextarea v-model="editor.form.body" :rows="5" class="w-full" />
    </UFormField>

    <UFormField
      label="Media gallery"
      help="Order images and videos exactly as they should appear publicly. The first item is the cover."
    >
      <DashboardMediaGalleryField
        :items="editor.form.media"
        :site-id="siteId"
        @add="editor.addMedia()"
        @remove="(index: number) => editor.removeMedia(index)"
        @move="(index: number, direction: -1 | 1) => editor.moveMedia(index, direction)"
        @reorder="(from: number, to: number) => editor.reorderMedia(from, to)"
        @asset-change="(index: number, asset) => editor.setMediaAsset(index, asset)"
      />
    </UFormField>

    <div class="grid gap-5 sm:grid-cols-2">
      <UFormField label="Price amount" :help="`Numeric amount in ${currency}. Leave empty for free or contact-only pricing.`">
        <UInputNumber v-model="editor.form.price_major" :min="0" :step="0.01" placeholder="e.g. 1500" class="w-full" />
      </UFormField>
      <UFormField label="Inquiry pricing note" help='Used only when no active Price exists, e.g. "Ask us about monthly pricing".'>
        <UInput v-model="editor.form.pricing_note" placeholder="Ask us about pricing" class="w-full" />
      </UFormField>
      <UFormField label="Compare-at price" :help="`Optional. Regular/pre-sale price in ${currency}, shown struck through when running a sale.`">
        <UInputNumber v-model="editor.form.compare_at_major" :min="0" :step="0.01" class="w-full" />
      </UFormField>
      <div />
      <UFormField label="Sale starts" help="Optional. Leave empty to start immediately.">
        <UInput v-model="editor.form.valid_from" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Sale ends" help="Optional. Leave empty for no end date.">
        <UInput v-model="editor.form.valid_until" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Duration (minutes)">
        <UInputNumber v-model="editor.form.duration_minutes" :min="0" class="w-full" />
      </UFormField>
      <UFormField label="Max capacity">
        <UInputNumber v-model="editor.form.max_capacity" :min="1" class="w-full" />
      </UFormField>
      <UFormField label="Status">
        <USelect v-model="editor.form.status" :items="statusOptions" class="w-full" />
      </UFormField>
      <UFormField label="Featured sort order" help="Lower numbers appear first">
        <UInputNumber v-model="editor.form.featured_sort_order" :min="0" class="w-full" />
      </UFormField>
    </div>

    <UCheckbox v-model="editor.form.featured" label="Featured" description="Show on homepage and location pages when no menu exists" />

    <UFormField label="Time slots">
      <UTabs v-model="editor.slotsMode.value" :items="slotModes" :content="false" class="mb-3" />

      <div class="space-y-3">
        <UCard :ui="{ body: 'p-3 sm:p-3' }">
          <div class="grid grid-cols-3 items-end gap-2">
            <UFormField label="Start" size="xs">
              <UInput v-model="generator.start" type="time" class="w-full" />
            </UFormField>
            <UFormField label="End" size="xs">
              <UInput v-model="generator.end" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Every" size="xs">
              <USelect v-model="generator.interval" :items="intervalOptions" class="w-full" />
            </UFormField>
          </div>
          <UButton
            v-if="editor.slotsMode.value === 'flat'"
            size="xs"
            class="mt-2"
            color="neutral"
            variant="soft"
            :loading="generating"
            @click="runGenerator()"
          >
            Generate slots
          </UButton>
          <p v-else class="mt-2 text-xs text-muted">Set times above, then use the bolt icon on a day to apply.</p>
        </UCard>

        <UInputTags
          v-if="editor.slotsMode.value === 'flat'"
          v-model="editor.timeSlots.value"
          placeholder="18:00"
          delimiter=","
          add-on-blur
          add-on-paste
          class="w-full"
          aria-label="Time slots"
        />

        <template v-else>
          <div class="flex flex-wrap gap-2">
            <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('all')">Copy first day to all</UButton>
            <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('weekdays')">Copy to Mon–Fri</UButton>
            <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('weekend')">Copy to Fri–Sat</UButton>
          </div>
          <div v-for="day in weekdayNames" :key="day" class="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
            <span class="text-sm font-medium text-highlighted">{{ day }}</span>
            <UInputTags
              v-model="editor.recurringSlots[day]"
              placeholder="18:00"
              delimiter=","
              add-on-blur
              add-on-paste
              class="w-full"
              :aria-label="`Time slots for ${day}`"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-zap"
              :loading="generating"
              :aria-label="`Generate for ${day}`"
              @click="runGenerator(day)"
            />
          </div>
        </template>
      </div>
    </UFormField>

    <UFormField
      label="Availability note"
      help="Stable note shown on the listing, e.g. 'Runs weekends' or 'Seasonal class'. Avoid claims like 'Last 2 spots' — remaining capacity is shown automatically from real bookings."
    >
      <UInput v-model="editor.form.available_note" class="w-full" />
    </UFormField>

    <UFormField label="Highlights">
      <UInputTags
        v-model="editor.form.highlights"
        placeholder="Hands-on clay shaping"
        add-on-blur
        add-on-paste
        class="w-full"
      />
    </UFormField>
    <UFormField label="What's included">
      <UInputTags
        v-model="editor.form.included_items"
        placeholder="Materials and tools"
        add-on-blur
        add-on-paste
        class="w-full"
      />
    </UFormField>
    <UFormField label="What to bring">
      <UInputTags
        v-model="editor.form.what_to_bring"
        placeholder="Comfortable clothes"
        add-on-blur
        add-on-paste
        class="w-full"
      />
    </UFormField>

    <UFormField label="Meeting point" help="Short arrival or check-in instruction.">
      <UTextarea
        v-model="editor.form.meeting_point"
        :rows="3"
        placeholder="Meet at the main studio reception 10 minutes before your start time."
        class="w-full"
      />
    </UFormField>

    <UFormField label="Booking policy" help="Structured guest-facing policy shared with the public experience and confirmation pages.">
      <BookingPolicyForm
        v-model="editor.bookingPolicyDraft.value"
        policy-type="experience"
        :summary="editor.bookingPolicySummary.value"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { WeekdayName } from '~/server/utils/experiences'
import { WEEKDAY_NAMES, useInjectedExperienceEditor } from '~/composables/useExperienceEditor'
import BookingPolicyForm from '~/components/dashboard/BookingPolicyForm.vue'
import DashboardMediaGalleryField from '~/components/dashboard/DashboardMediaGalleryField.vue'

// The form writes to the editor (slot times, gallery order, every field), so the
// editor is injected from the route rather than passed as a prop a child must
// not mutate. Both the create route and the edit route provide the same shape.
defineProps<{
  siteId: string
  currency: string
}>()

const editor = useInjectedExperienceEditor()

const dashboardApi = useDashboardApi()
const toast = useToast()

const weekdayNames = WEEKDAY_NAMES
const generating = ref(false)
const generator = reactive({ start: '17:00', end: '21:00', interval: 30 })

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Sold out', value: 'sold_out' },
]
const slotModes = [
  { label: 'Same times every day', value: 'flat' },
  { label: 'Different times per day', value: 'recurring' },
]
const intervalOptions = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
]

const isSlotsResponse = (value: unknown): value is { slots: string[] } =>
  isRecord(value) && Array.isArray(value.slots) && value.slots.every(slot => typeof slot === 'string')

async function runGenerator(day?: WeekdayName) {
  generating.value = true
  try {
    const res = await dashboardApi('/api/utils/generate-slots', {
      query: { start: generator.start, end: generator.end, interval_minutes: generator.interval },
      validate: isSlotsResponse,
    })
    if (day) {
      editor.recurringSlots[day] = res.slots
    } else {
      editor.timeSlots.value = res.slots
    }
  } catch {
    toast.add({ description: 'Could not generate slots — check start/end/interval.', color: 'error' })
  } finally {
    generating.value = false
  }
}

function copyRecurring(mode: 'all' | 'weekdays' | 'weekend') {
  const slots = editor.recurringSlots
  if (mode === 'all') {
    const first = [...slots[weekdayNames[0]]]
    for (const day of weekdayNames) slots[day] = [...first]
  } else if (mode === 'weekdays') {
    const monday = [...slots.Monday]
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as WeekdayName[]) slots[day] = [...monday]
  } else {
    const friday = [...slots.Friday]
    for (const day of ['Friday', 'Saturday'] as WeekdayName[]) slots[day] = [...friday]
  }
}
</script>
