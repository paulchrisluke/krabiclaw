<template>
  <UDashboardPanel id="location-experiences">
    <template #header>
      <UDashboardNavbar title="Experiences">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
        <template #trailing>
          <UButton v-if="!loading" icon="i-lucide-plus" size="sm" @click="openCreate">Add experience</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-lg" />
      </div>

      <UCard v-else-if="!currentLocationId" class="border border-dashed border-default" :ui="{ body: 'py-20 sm:py-20 text-center' }">
        <UIcon name="i-lucide-map-pin" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-semibold text-highlighted">Choose a location first</p>
        <p class="mt-1 text-sm text-muted">Experiences are managed per location.</p>
      </UCard>

      <UCard v-else-if="loadError" class="border border-error/40" :ui="{ body: 'py-20 sm:py-20 text-center' }">
        <UIcon name="i-lucide-circle-alert" class="mx-auto size-10 text-error" />
        <p class="mt-4 text-sm font-semibold text-highlighted">Could not load experiences</p>
        <p class="mt-1 text-sm text-muted">{{ loadError }}</p>
        <UButton class="mt-6" color="neutral" variant="soft" icon="i-lucide-refresh-cw" @click="loadExperiences">Try again</UButton>
      </UCard>

      <UCard v-else-if="experiences.length === 0" class="border border-dashed border-default" :ui="{ body: 'py-20 sm:py-20 text-center' }">
        <UIcon name="i-lucide-ticket" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-semibold text-highlighted">No experiences yet</p>
        <p class="mt-1 text-sm text-muted">Create your first bookable experience — a tasting menu, a chef's table, a cooking class.</p>
        <UButton class="mt-6" icon="i-lucide-plus" @click="openCreate">Add experience</UButton>
      </UCard>

      <div v-else class="space-y-3">
        <UCard
          v-for="exp in experiences"
          :key="exp.id"
          :ui="{ body: 'p-5 sm:p-5' }"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-3">
                <p class="truncate font-semibold text-highlighted">{{ exp.title }}</p>
                <UBadge
                  :color="exp.status === 'active' ? 'success' : exp.status === 'sold_out' ? 'warning' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ exp.status === 'sold_out' ? 'Sold out' : exp.status }}
                </UBadge>
              </div>
              <p v-if="exp.tagline" class="mt-0.5 truncate text-sm text-muted">{{ exp.tagline }}</p>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span v-if="exp.price">{{ exp.price }}</span>
                <span v-if="exp.duration_minutes">{{ exp.duration_minutes }} min</span>
                <span v-if="exp.max_capacity">{{ exp.max_capacity }} max guests</span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-calendar-days" aria-label="Manage availability" @click="openAvailability(exp)" />
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-square-pen" aria-label="Edit experience" @click="openEdit(exp)" />
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete experience" @click="confirmDelete(exp)" />
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

    <!-- Create / Edit slide-over -->
    <USlideover v-model:open="sliderOpen" :title="editing ? 'Edit experience' : 'New experience'" side="right">
      <template #body>
        <div class="space-y-5 p-6">
          <UFormField label="Title" required>
            <UInput v-model="form.title" placeholder="e.g. Chef's Table Omakase" class="w-full" />
          </UFormField>
          <UFormField label="Tagline" help="One-line hook shown on the listing card.">
            <UInput v-model="form.tagline" placeholder="e.g. Eight courses, one table, full attention." class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.body" :rows="5" placeholder="Describe the experience in detail." class="w-full" />
          </UFormField>
          <UFormField label="Media gallery" help="Order images and videos exactly as they should appear publicly. The first item is the cover.">
            <div class="space-y-3">
              <div
                v-for="(media, index) in form.media"
                :key="media._key"
                class="flex items-center gap-3 rounded-lg border border-default p-2"
                draggable="true"
                @dragstart="startGalleryMediaDrag(index)"
                @dragover.prevent
                @drop.prevent="dropGalleryMedia(index)"
                @dragend="endGalleryMediaDrag"
              >
                <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-muted" />
                <UBadge v-if="index === 0" color="primary" variant="soft" size="xs" class="shrink-0">Cover</UBadge>
                <span v-else class="w-11 shrink-0 text-center text-xs text-muted">{{ index + 1 }}</span>
                <div class="flex-1">
                  <MediaPicker
                    v-model="media.asset_id"
                    :site-id="siteId"
                    accept="any"
                    title="Select media"
                    @change="handleGalleryMediaChange(index, $event)"
                  />
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-up"
                  aria-label="Move media up"
                  :disabled="index === 0"
                  @click="moveGalleryMedia(index, -1)"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-down"
                  aria-label="Move media down"
                  :disabled="index === form.media.length - 1"
                  @click="moveGalleryMedia(index, 1)"
                />
                <UButton size="sm" color="error" variant="ghost" icon="i-lucide-x" @click="removeGalleryMedia(index)" />
              </div>
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" @click="addGalleryMedia">
                Add media
              </UButton>
            </div>
          </UFormField>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Price amount" :help="`Numeric amount in ${defaultCurrency}. Leave empty for free or contact-only pricing.`">
              <UInputNumber v-model="form.price_amount" :min="0" :step="0.01" :placeholder="`e.g. 1500`" class="w-full" />
            </UFormField>
            <UFormField label="Price display override" help='Optional. Overrides the displayed price text, e.g. "Ask us" or "Free".'>
              <UInput v-model="form.price" placeholder="Ask us" class="w-full" />
            </UFormField>
            <UFormField label="Compare-at price" :help="`Optional. Regular/pre-sale price in ${defaultCurrency}, shown struck through when running a sale. Leave empty when not on sale.`">
              <UInputNumber v-model="form.compare_at_price_amount" :min="0" :step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Sale starts" help="Optional. Leave empty to start immediately.">
              <UInput v-model="form.sale_starts_at" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Sale ends" help="Optional. Leave empty for no end date.">
              <UInput v-model="form.sale_ends_at" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Duration (minutes)">
              <UInputNumber v-model="form.duration_minutes" :min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max capacity">
              <UInputNumber v-model="form.max_capacity" :min="1" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect
                v-model="form.status"
                :items="[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'Sold out', value: 'sold_out' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Featured" help="Show on homepage/location pages when no menu exists">
              <UCheckbox v-model="form.featured" />
            </UFormField>
            <UFormField label="Featured sort order" help="Lower numbers appear first">
              <UInputNumber v-model="form.featured_sort_order" :min="0" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Time slots">
            <UTabs v-model="slotsMode" :items="[{ label: 'Same times every day', value: 'flat' }, { label: 'Different times per day', value: 'recurring' }]" class="mb-3" />

            <div v-if="slotsMode === 'flat'" class="space-y-3">
              <UCard :ui="{ body: 'p-3 sm:p-3' }">
                <div class="grid grid-cols-3 gap-2 items-end">
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
                <UButton size="xs" class="mt-2" color="neutral" variant="soft" :loading="generating" @click="runGenerator('flat')">
                  Generate slots
                </UButton>
              </UCard>
              <UInput v-model="timeSlotsInput" placeholder="18:00, 20:30" class="w-full" />
              <p class="text-xs text-muted">Comma-separated times, applied every day.</p>
            </div>

            <div v-else class="space-y-3">
              <UCard :ui="{ body: 'p-3 sm:p-3' }">
                <div class="grid grid-cols-3 gap-2 items-end">
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
                <p class="mt-2 text-xs text-muted">Set times above, then use the bolt icon on a day to apply.</p>
              </UCard>
              <div class="flex flex-wrap gap-2">
                <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('all')">Copy first day to all</UButton>
                <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('weekdays')">Copy to Mon–Fri</UButton>
                <UButton size="xs" color="neutral" variant="soft" @click="copyRecurring('weekend')">Copy to Fri–Sat</UButton>
              </div>
              <div v-for="day in weekdayNames" :key="day" class="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                <span class="text-sm font-medium text-highlighted">{{ day }}</span>
                <UInput v-model="recurringInputs[day]" placeholder="18:00, 20:30" class="w-full" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-zap" :loading="generating" :aria-label="`Generate for ${day}`" @click="runGenerator('recurring', day)" />
              </div>
            </div>
          </UFormField>
          <UFormField label="Availability note" help="Stable note shown on the listing, e.g. 'Runs weekends' or 'Seasonal class'. Avoid claims like 'Last 2 spots' — remaining capacity is now shown automatically from real bookings.">
            <UInput v-model="form.available_note" class="w-full" />
          </UFormField>
          <UFormField label="Highlights" help="One highlight per line.">
            <UTextarea v-model="form.highlights_input" :rows="4" placeholder="Hands-on clay shaping&#10;Small-group instruction&#10;Tea and snacks included" class="w-full" />
          </UFormField>
          <UFormField label="What's included" help="One included item per line.">
            <UTextarea v-model="form.included_items_input" :rows="4" placeholder="Materials and tools&#10;Apron&#10;Welcome drink" class="w-full" />
          </UFormField>
          <UFormField label="What to bring" help="One item per line.">
            <UTextarea v-model="form.what_to_bring_input" :rows="4" placeholder="Comfortable clothes&#10;Closed-toe shoes&#10;Booking confirmation" class="w-full" />
          </UFormField>
          <UFormField label="Meeting point" help="Short arrival or check-in instruction.">
            <UTextarea v-model="form.meeting_point" :rows="3" placeholder="Meet at the main studio reception 10 minutes before your start time." class="w-full" />
          </UFormField>
          <UFormField label="Booking policy" help="Structured guest-facing policy shared with the public experience and confirmation pages.">
            <BookingPolicyForm
              v-model="bookingPolicyDraft"
              policy-type="experience"
              :summary="bookingPolicySummary"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" @click="sliderOpen = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save changes' : 'Create' }}</UButton>
        </div>
      </template>
    </USlideover>

    <!-- Delete confirm -->
    <UModal v-model:open="deleteOpen" title="Delete experience">
      <template #body>
        <p class="text-sm text-muted px-6 py-4">
          Delete <strong>{{ deletingExp?.title }}</strong>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="doDelete">Delete</UButton>
        </div>
      </template>
    </UModal>

    <!-- Manage availability -->
    <UModal v-model:open="availabilityOpen" :title="`Manage availability — ${availabilityExp?.title ?? ''}`" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4 px-6 py-4">
          <p v-if="availabilityTimezone" class="text-xs text-muted">Times shown in {{ availabilityTimezone }}.</p>
          <UFormField label="Date">
            <UInput v-model="availabilityDate" type="date" class="w-full max-w-xs" @change="loadAvailability" />
          </UFormField>

          <div v-if="availabilityLoading" class="space-y-2">
            <USkeleton class="h-10 w-full rounded-lg" />
            <USkeleton class="h-10 w-full rounded-lg" />
          </div>
          <p v-else-if="availabilitySlots.length === 0" class="text-sm text-muted">No effective time slots on this date.</p>
          <div v-else class="space-y-2">
            <div v-for="slot in availabilitySlots" :key="slot.time_slot" class="flex items-center gap-3 rounded-lg border border-default p-3">
              <span class="w-16 shrink-0 font-medium text-highlighted">{{ slot.time_slot }}</span>
              <span class="text-xs text-muted">
                {{ slot.booked }} booked<span v-if="slot.capacity != null"> / {{ slot.capacity }}</span>
              </span>
              <UBadge v-if="slot.is_closed" color="error" variant="soft" size="xs">Closed</UBadge>
              <UBadge v-else-if="slot.is_full" color="warning" variant="soft" size="xs">Full</UBadge>
              <UInputNumber
                v-model="slotCapacityOverrides[slot.time_slot]"
                :min="0"
                placeholder="Capacity override"
                class="ml-auto w-36"
              />
              <UButton
                size="xs"
                :color="slot.is_closed ? 'success' : 'error'"
                variant="soft"
                :loading="savingOverride === slot.time_slot"
                @click="toggleSlotOverride(slot)"
              >
                {{ slot.is_closed ? 'Reopen' : 'Close' }}
              </UButton>
            </div>
          </div>

          <div v-if="existingOverrides.length" class="pt-2">
            <p class="text-xs font-medium text-muted mb-2">Upcoming overrides</p>
            <div class="space-y-1">
              <div v-for="ov in existingOverrides" :key="ov.id" class="flex items-center gap-3 rounded-lg border border-default px-3 py-2 text-sm">
                <span class="text-muted">{{ ov.override_date }}</span>
                <span class="font-medium text-highlighted">{{ ov.time_slot }}</span>
                <UBadge :color="ov.status === 'closed' ? 'error' : 'success'" variant="soft" size="xs">{{ ov.status }}</UBadge>
                <span v-if="ov.capacity_override != null" class="text-xs text-muted">cap {{ ov.capacity_override }}</span>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" class="ml-auto" aria-label="Delete override" @click="deleteOverride(ov)" />
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" @click="availabilityOpen = false">Close</UButton>
        </div>
      </template>
    </UModal>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import type { Experience, SlotAvailability, SlotOverride, WeekdayName } from '~/server/utils/experiences'
import type { BookingPolicyPatch, RenderedBookingPolicySummary } from '~/server/utils/booking-policies'
import BookingPolicyForm from '~/components/dashboard/BookingPolicyForm.vue'
import { getErrorMessage } from '~/utils/errors'

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const satisfies WeekdayName[]

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.experiences' })

type ApiRecord = Experience

const isSlotsResponse = (value: unknown): value is { slots: string[] } =>
  isRecord(value)
  && Array.isArray(value.slots)
  && value.slots.every(slot => typeof slot === 'string')
const isExperienceResponse = (value: unknown): value is { experience: ApiRecord } =>
  isRecord(value)
  && isRecord(value.experience)
  && typeof value.experience.id === 'string'
  && typeof value.experience.title === 'string'
const isPolicyResponse = (
  value: unknown,
): value is { policy: BookingPolicyPatch | null; summary: RenderedBookingPolicySummary | null } =>
  isRecord(value)
  && (value.policy === null || isRecord(value.policy))
  && (value.summary === null || isRecord(value.summary))
const isPolicySummaryResponse = (
  value: unknown,
): value is { summary: RenderedBookingPolicySummary | null } =>
  isRecord(value) && (value.summary === null || isRecord(value.summary))
const isAvailabilityResponse = (
  value: unknown,
): value is { timezone: string; dates: Array<{ date: string; slots: SlotAvailability[] }> } =>
  isRecord(value)
  && typeof value.timezone === 'string'
  && Array.isArray(value.dates)
  && value.dates.every(day =>
    isRecord(day)
    && typeof day.date === 'string'
    && Array.isArray(day.slots)
    && day.slots.every(isRecord),
  )
const isOverridesResponse = (value: unknown): value is { overrides: SlotOverride[] } =>
  isRecord(value)
  && Array.isArray(value.overrides)
  && value.overrides.every(override => isRecord(override) && typeof override.id === 'string')

const toast = useToast()
const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()

const dashboard = useDashboardSite()
const defaultCurrency = computed(() => dashboard.site.value?.default_currency || 'USD')

// ── List ──────────────────────────────────────────────────
const loading = ref(true)
const loadError = ref<string | null>(null)
const experiences = ref<ApiRecord[]>([])
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const requestEvent = useRequestEvent()
const {
  data: experiencesResource,
  error: experiencesResourceError,
  pending: experiencesPending,
  refresh: refreshExperiences,
} = await useAsyncData(
  computed(() => `dashboard-location-experiences-${siteId}-${currentLocationId.value ?? 'missing'}`),
  async () => {
    const locationId = currentLocationId.value
    if (!locationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardLocationExperiences } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardLocationExperiences(requestEvent, siteId, locationId)
    }
    return await dashboardApi<{ experiences: ApiRecord[] }>(
      `/api/editor/sites/${siteId}/experiences`,
      {
        query: { location_id: locationId },
        validate: (value): value is { experiences: ApiRecord[] } =>
          isRecord(value)
          && Array.isArray(value.experiences)
          && value.experiences.every(experience =>
            isRecord(experience) && typeof experience.id === 'string',
          ),
      },
    )
  },
)
watch(experiencesResource, value => {
  if (value) experiences.value = value.experiences
}, { immediate: true })
watch([experiencesPending, experiencesResourceError], () => {
  loading.value = experiencesPending.value
  loadError.value = experiencesResourceError.value?.message ?? null
}, { immediate: true })

async function loadExperiences() {
  if (!currentLocationId.value) {
    experiences.value = []
    loadError.value = null
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = null
  try {
    await refreshExperiences()
    if (experiencesResourceError.value) throw experiencesResourceError.value
    if (!experiencesResource.value) throw new Error('Experiences response unavailable')
    experiences.value = experiencesResource.value.experiences
  } catch (error) {
    loadError.value = error instanceof Error && error.message ? error.message : 'The server did not return the experiences list.'
  } finally {
    loading.value = false
  }
}

// ── Form ──────────────────────────────────────────────────
const sliderOpen = ref(false)
const editing = ref<ApiRecord | null>(null)
const saving = ref(false)
const timeSlotsInput = ref('')
const slotsMode = ref<'flat' | 'recurring'>('flat')
const recurringInputs = reactive<Record<WeekdayName, string>>({
  Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '', Sunday: '',
})
const generator = reactive({ start: '17:00', end: '21:00', interval: 30 })
const intervalOptions = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
]
const generating = ref(false)
const draggingMediaIndex = ref<number | null>(null)

async function runGenerator(target: 'flat' | 'recurring', day?: WeekdayName) {
  generating.value = true
  try {
    const res = await dashboardApi<{ slots: string[] }>(`/api/utils/generate-slots`, {
      query: { start: generator.start, end: generator.end, interval_minutes: generator.interval },
      validate: isSlotsResponse,
    })
    if (target === 'flat') {
      timeSlotsInput.value = res.slots.join(', ')
    } else if (day) {
      recurringInputs[day] = res.slots.join(', ')
    }
  } catch {
    toast.add({ description: 'Could not generate slots — check start/end/interval.', color: 'error' })
  } finally {
    generating.value = false
  }
}

function copyRecurring(mode: 'all' | 'weekdays' | 'weekend') {
  if (mode === 'all') {
    const first = recurringInputs[weekdayNames[0]]
    for (const day of weekdayNames) recurringInputs[day] = first
  } else if (mode === 'weekdays') {
    const monday = recurringInputs.Monday
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as WeekdayName[]) recurringInputs[day] = monday
  } else {
    const friday = recurringInputs.Friday
    for (const day of ['Friday', 'Saturday'] as WeekdayName[]) recurringInputs[day] = friday
  }
}

function linesToArray(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function arrayToLines(value: string[] | null | undefined): string {
  return Array.isArray(value) ? value.join('\n') : ''
}

const emptyForm = () => ({
  title: '',
  location_id: '',
  tagline: '',
  body: '',
  media: [] as Array<{ _key: string; asset_id: string | null; url: string | null; thumbnail_url: string | null; kind: 'image' | 'video' }>,
  price: '',
  price_amount: null as number | null,
  compare_at_price_amount: null as number | null,
  sale_starts_at: '',
  sale_ends_at: '',
  duration_minutes: null as number | null,
  max_capacity: null as number | null,
  available_note: '',
  highlights_input: '',
  included_items_input: '',
  what_to_bring_input: '',
  meeting_point: '',
  status: 'active' as 'active' | 'inactive' | 'sold_out',
  featured: false,
  featured_sort_order: 0 as number,
})

const form = reactive(emptyForm())
const originalExperienceMediaIds = ref<string[]>([])
const bookingPolicyDraft = ref<BookingPolicyPatch>({})
const bookingPolicySummary = ref<RenderedBookingPolicySummary | null>(null)

watch(currentLocationId, () => {
  sliderOpen.value = false
  editing.value = null
})

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  form.location_id = currentLocationId.value ?? ''
  timeSlotsInput.value = ''
  slotsMode.value = 'flat'
  for (const day of weekdayNames) recurringInputs[day] = ''
  bookingPolicyDraft.value = {}
  bookingPolicySummary.value = null
  originalExperienceMediaIds.value = []
  sliderOpen.value = true
}

function addGalleryMedia() {
  form.media.push({ _key: crypto.randomUUID(), asset_id: null, url: null, thumbnail_url: null, kind: 'image' })
}

function removeGalleryMedia(index: number) {
  form.media.splice(index, 1)
}

function moveGalleryMedia(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= form.media.length) return
  const [item] = form.media.splice(index, 1)
  if (item) form.media.splice(target, 0, item)
}

function startGalleryMediaDrag(index: number) {
  draggingMediaIndex.value = index
}

function endGalleryMediaDrag() {
  draggingMediaIndex.value = null
}

function dropGalleryMedia(targetIndex: number) {
  const sourceIndex = draggingMediaIndex.value
  draggingMediaIndex.value = null
  if (sourceIndex === null || sourceIndex === targetIndex) return
  if (sourceIndex < 0 || sourceIndex >= form.media.length || targetIndex < 0 || targetIndex >= form.media.length) return
  const [item] = form.media.splice(sourceIndex, 1)
  if (item) form.media.splice(targetIndex, 0, item)
}

function handleGalleryMediaChange(index: number, asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null) {
  const item = form.media[index]
  if (!item) return
  item.asset_id = asset?.asset_id ?? null
  item.url = asset?.public_url ?? asset?.thumbnail_url ?? null
  item.thumbnail_url = asset?.thumbnail_url ?? null
  item.kind = asset?.kind === 'video' ? 'video' : 'image'
}

function openEdit(exp: ApiRecord) {
  editing.value = exp
  Object.assign(form, {
    title: exp.title ?? '',
    location_id: currentLocationId.value ?? exp.location_id ?? '',
    tagline: exp.tagline ?? '',
    body: exp.body ?? '',
    media: (Array.isArray(exp.media) ? exp.media : []).map(asset => ({
      _key: crypto.randomUUID(),
      asset_id: asset.asset_id,
      url: asset.public_url ?? asset.thumbnail_url ?? null,
      thumbnail_url: asset.thumbnail_url ?? null,
      kind: asset.kind === 'video' ? 'video' : 'image',
    })),
    price: exp.price ?? '',
    price_amount: exp.price_amount ?? null,
    compare_at_price_amount: exp.compare_at_price_amount ?? null,
    sale_starts_at: exp.sale_starts_at ? String(exp.sale_starts_at).slice(0, 10) : '',
    sale_ends_at: exp.sale_ends_at ? String(exp.sale_ends_at).slice(0, 10) : '',
    duration_minutes: exp.duration_minutes ?? null,
    max_capacity: exp.max_capacity ?? null,
    available_note: exp.available_note ?? '',
    highlights_input: arrayToLines(exp.highlights),
    included_items_input: arrayToLines(exp.included_items),
    what_to_bring_input: arrayToLines(exp.what_to_bring),
    meeting_point: exp.meeting_point ?? '',
    status: exp.status ?? 'active',
    featured: exp.featured ?? false,
    featured_sort_order: exp.featured_sort_order ?? 0,
  })
  originalExperienceMediaIds.value = form.media.flatMap(item => item.asset_id ? [item.asset_id] : [])
  timeSlotsInput.value = Array.isArray(exp.time_slots) ? exp.time_slots.join(', ') : (exp.time_slots ?? '')
  for (const day of weekdayNames) recurringInputs[day] = exp.recurring_slots?.[day]?.join(', ') ?? ''
  slotsMode.value = exp.recurring_slots ? 'recurring' : 'flat'
  void loadExperiencePolicy(exp.id, currentLocationId.value ?? exp.location_id)
  sliderOpen.value = true
}

async function loadExperiencePolicy(experienceId: string, locationId: string | null | undefined) {
  try {
    const res = await dashboardApi<{ policy: BookingPolicyPatch | null; summary: RenderedBookingPolicySummary | null }>(`/api/editor/sites/${siteId}/booking-policy`, {
      query: {
        policy_type: 'experience',
        scope_type: 'experience',
        experience_id: experienceId,
        location_id: locationId ?? undefined,
      },
      validate: isPolicyResponse,
    })
    if (currentLocationId.value !== locationId || editing.value?.id !== experienceId) return
    bookingPolicyDraft.value = res.policy ?? {}
    bookingPolicySummary.value = res.summary ?? null
  } catch {
    if (currentLocationId.value !== locationId || editing.value?.id !== experienceId) return
    bookingPolicyDraft.value = {}
    bookingPolicySummary.value = null
  }
}

async function syncExperienceMedia(experienceId: string, nextIds: string[]) {
  const placement = { owner_type: 'experience', owner_id: experienceId, slot: 'gallery' }
  const previousIds = originalExperienceMediaIds.value
  const previousSet = new Set(previousIds)
  const nextSet = new Set(nextIds)
  const validate = (value: unknown): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids)

  // Track the canonical asset_ids from each response as it lands, not just once
  // at the end — if a later call in this sequence throws, whatever already
  // committed server-side stays reflected here instead of leaving this ref
  // stale relative to the DB, which would otherwise 409 on retry.
  for (const assetId of nextIds) {
    if (previousSet.has(assetId)) continue
    const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/attach`, {
      method: 'POST', body: { placement, asset_id: assetId }, validate,
    })
    originalExperienceMediaIds.value = result.asset_ids
  }
  for (const assetId of previousIds) {
    if (nextSet.has(assetId)) continue
    const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/remove`, {
      method: 'POST', body: { placement, asset_id: assetId }, validate,
    })
    originalExperienceMediaIds.value = result.asset_ids
  }
  if (nextIds.length > 1) {
    const moves = nextIds.map((assetId, index) => index === nextIds.length - 1
      ? { asset_id: assetId }
      : { asset_id: assetId, before_asset_id: nextIds[index + 1]! })
    const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/reorder`, {
      method: 'POST', body: { placement, moves: moves.reverse() }, validate,
    })
    originalExperienceMediaIds.value = result.asset_ids
  }
}

async function save() {
  if (!form.title.trim()) {
    toast.add({ description: 'Title is required.', color: 'error' })
    return
  }
  const locationId = currentLocationId.value
  if (!locationId) {
    toast.add({ description: 'Location is required.', color: 'error' })
    return
  }
  saving.value = true
  try {
    const parseNumber = (value: string | number | null | undefined): number | null => {
      if (value == null) return null
      const str = String(value)
      if (!str.trim()) return null
      const parsed = Number(str)
      return Number.isFinite(parsed) ? parsed : null
    }
    const mediaIds = form.media.flatMap(item => item.asset_id ? [item.asset_id] : [])
    const { media: _media, ...formFields } = form
    const payload = {
      ...formFields,
      location_id: locationId,
      price_amount: parseNumber(form.price_amount),
      compare_at_price_amount: parseNumber(form.compare_at_price_amount),
      sale_starts_at: form.sale_starts_at.trim() || null,
      sale_ends_at: form.sale_ends_at.trim() || null,
      duration_minutes: parseNumber(form.duration_minutes),
      max_capacity: parseNumber(form.max_capacity),
      featured_sort_order: parseNumber(form.featured_sort_order) ?? 0,
      time_slots: slotsMode.value === 'flat' && timeSlotsInput.value
        ? timeSlotsInput.value.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      recurring_slots: slotsMode.value === 'recurring'
        ? Object.fromEntries(
            weekdayNames
              .map((day) => [day, recurringInputs[day].split(',').map(s => s.trim()).filter(Boolean)])
              .filter(([, slots]) => (slots as string[]).length > 0),
          )
        : null,
      highlights: linesToArray(form.highlights_input),
      included_items: linesToArray(form.included_items_input),
      what_to_bring: linesToArray(form.what_to_bring_input),
      ...(!editing.value ? { media: mediaIds.map(asset_id => ({ asset_id })) } : {}),
    }
    let experienceResult: ApiRecord | null = null
    if (editing.value) {
      const response = await dashboardApi<{ experience: ApiRecord }>(
        `/api/editor/sites/${siteId}/experiences/${editing.value.id}`,
        { method: 'PATCH', body: payload, validate: isExperienceResponse },
      )
      if (currentLocationId.value !== locationId) return
      experienceResult = response.experience ?? null
      try {
        await syncExperienceMedia(String(editing.value.id), mediaIds)
        toast.add({ description: 'Experience updated.', color: 'success' })
      } catch {
        if (currentLocationId.value !== locationId) return
        toast.add({ description: 'Experience saved, but its gallery failed to fully update. Reopen it to retry.', color: 'warning' })
      }
    } else {
      const response = await dashboardApi<{ experience: ApiRecord }>(
        `/api/editor/sites/${siteId}/experiences`,
        { method: 'POST', body: payload, validate: isExperienceResponse },
      )
      if (currentLocationId.value !== locationId) return
      experienceResult = response.experience ?? null
      toast.add({ description: 'Experience created.', color: 'success' })
    }

    // Booking policy is saved separately from the experience itself — a policy failure here
    // shouldn't be reported as an experience save failure, since the experience already saved.
    if (experienceResult?.id) {
      try {
        const policyResponse = await dashboardApi<{ summary: RenderedBookingPolicySummary | null }>(`/api/editor/sites/${siteId}/booking-policy`, {
          method: 'PATCH',
          body: {
            ...bookingPolicyDraft.value,
            policy_type: 'experience',
            scope_type: 'experience',
            experience_id: experienceResult.id,
            location_id: locationId,
          },
          validate: isPolicySummaryResponse,
        })
        if (currentLocationId.value !== locationId) return
        bookingPolicySummary.value = policyResponse.summary ?? null
      } catch {
        if (currentLocationId.value !== locationId) return
        toast.add({ description: 'Experience saved, but the booking policy failed to save.', color: 'warning' })
      }
    }
    if (currentLocationId.value !== locationId) return
    sliderOpen.value = false
    await loadExperiences()
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to save experience.')
    toast.add({ description: message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────
const deleteOpen = ref(false)
const deletingExp = ref<ApiRecord | null>(null)
const deleting = ref(false)

function confirmDelete(exp: ApiRecord) {
  deletingExp.value = exp
  deleteOpen.value = true
}

async function doDelete() {
  if (!deletingExp.value) return
  deleting.value = true
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/experiences/${deletingExp.value.id}`, {
      method: 'DELETE',
      validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
    })
    toast.add({ description: 'Experience deleted.', color: 'success' })
    deleteOpen.value = false
    await loadExperiences()
  } catch {
    toast.add({ description: 'Failed to delete experience.', color: 'error' })
  } finally {
    deleting.value = false
  }
}

// ── Manage availability ──────────────────────────────────────
const availabilityOpen = ref(false)
const availabilityExp = ref<ApiRecord | null>(null)
const availabilityDate = ref(new Date().toISOString().slice(0, 10))
const availabilityLoading = ref(false)
const availabilitySlots = ref<SlotAvailability[]>([])
const availabilityTimezone = ref<string | null>(null)
const existingOverrides = ref<SlotOverride[]>([])
const slotCapacityOverrides = reactive<Record<string, number | null>>({})
const savingOverride = ref<string | null>(null)

function openAvailability(exp: ApiRecord) {
  availabilityExp.value = exp
  availabilityDate.value = new Date().toISOString().slice(0, 10)
  Object.keys(slotCapacityOverrides).forEach((key) => {
    Reflect.deleteProperty(slotCapacityOverrides, key)
  })
  availabilityOpen.value = true
  loadAvailability()
}

async function loadAvailability() {
  if (!availabilityExp.value) return
  availabilityLoading.value = true
  try {
    const [avail, overrides] = await Promise.all([
      dashboardApi<{ timezone: string; dates: Array<{ date: string; slots: SlotAvailability[] }> }>(
        `/api/editor/sites/${siteId}/experiences/${availabilityExp.value.id}/availability`,
        { query: { date: availabilityDate.value }, validate: isAvailabilityResponse },
      ),
      dashboardApi<{ overrides: SlotOverride[] }>(
        `/api/editor/sites/${siteId}/experiences/${availabilityExp.value.id}/slot-overrides`,
        { validate: isOverridesResponse },
      ),
    ])
    availabilityTimezone.value = avail.timezone
    availabilitySlots.value = avail.dates[0]?.slots ?? []
    existingOverrides.value = overrides.overrides ?? []
    Object.keys(slotCapacityOverrides).forEach((key) => {
      Reflect.deleteProperty(slotCapacityOverrides, key)
    })
  } catch {
    toast.add({ description: 'Failed to load availability.', color: 'error' })
  } finally {
    availabilityLoading.value = false
  }
}

async function toggleSlotOverride(slot: SlotAvailability) {
  if (!availabilityExp.value) return
  savingOverride.value = slot.time_slot
  try {
    const capacityInput = slotCapacityOverrides[slot.time_slot]
    await dashboardApi(`/api/editor/sites/${siteId}/experiences/${availabilityExp.value.id}/slot-overrides`, {
      method: 'POST',
      body: {
        override_date: availabilityDate.value,
        time_slot: slot.time_slot,
        status: slot.is_closed ? 'open' : 'closed',
        capacity_override: capacityInput != null ? capacityInput : null,
      },
      validate: (value): value is { success: true; override: ApiRecord } =>
        isRecord(value) && value.success === true && isRecord(value.override),
    })
    await loadAvailability()
  } catch {
    toast.add({ description: 'Failed to update slot availability.', color: 'error' })
  } finally {
    savingOverride.value = null
  }
}

async function deleteOverride(override: SlotOverride) {
  if (!availabilityExp.value) return
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/experiences/${availabilityExp.value.id}/slot-overrides/${override.id}`, {
      method: 'DELETE',
      validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
    })
    await loadAvailability()
  } catch {
    toast.add({ description: 'Failed to delete override.', color: 'error' })
  }
}
</script>
