<template>
  <UPage>

    <UPageBody>
      <div v-if="!loading" class="mb-4 flex items-center justify-end">
        <UButton icon="i-lucide-plus" @click="openCreate">Add experience</UButton>
      </div>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-lg" />
      </div>

      <UCard v-else-if="experiences.length === 0" :ui="{ root: 'border border-dashed border-default', body: 'py-20 sm:py-20 text-center' }">
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
    </UPageBody>

    <!-- Create / Edit slide-over -->
    <USlideover v-model:open="sliderOpen" :title="editing ? 'Edit experience' : 'New experience'" side="right">
      <template #body>
        <div class="space-y-5 p-6">
          <UFormField label="Title" required>
            <UInput v-model="form.title" placeholder="e.g. Chef's Table Omakase" class="w-full" />
          </UFormField>
          <UFormField label="Location" required help="Every experience belongs to exactly one location.">
            <USelect v-model="form.location_id" :items="locationItems" value-key="id" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Tagline" help="One-line hook shown on the listing card.">
            <UInput v-model="form.tagline" placeholder="e.g. Eight courses, one table, full attention." class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.body" :rows="5" placeholder="Describe the experience in detail." class="w-full" />
          </UFormField>
          <UFormField label="Primary image">
            <MediaPicker
              v-model="form.image_asset_id"
              :site-id="siteId"
              accept="image"
              title="Select experience image"
              @change="handleImageChange"
            />
          </UFormField>
          <UFormField label="Video (optional)">
            <MediaPicker
              v-model="form.video_asset_id"
              :site-id="siteId"
              accept="video"
              title="Select experience video"
              @change="handleVideoChange"
            />
          </UFormField>
          <UFormField label="Additional media gallery" help="Add more images or videos to show in a carousel.">
            <div class="space-y-3">
              <div v-for="(media, index) in form.images" :key="media._key" class="flex items-center gap-3">
                <div class="flex-1">
                  <MediaPicker
                    v-model="media.asset_id"
                    :site-id="siteId"
                    accept="any"
                    title="Select media"
                    @change="(asset) => handleGalleryMediaChange(index, asset)"
                  />
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-up"
                  aria-label="Move image up"
                  :disabled="index === 0"
                  @click="moveGalleryMedia(index, -1)"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-down"
                  aria-label="Move image down"
                  :disabled="index === form.images.length - 1"
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
              <UInput v-model="form.price_amount" type="number" min="0" step="any" :placeholder="`e.g. 1500`" class="w-full" />
            </UFormField>
            <UFormField label="Price display override" help='Optional. Overrides the displayed price text, e.g. "Ask us" or "Free".'>
              <UInput v-model="form.price" placeholder="Ask us" class="w-full" />
            </UFormField>
            <UFormField label="Compare-at price" :help="`Optional. Regular/pre-sale price in ${defaultCurrency}, shown struck through when running a sale. Leave empty when not on sale.`">
              <UInput v-model="form.compare_at_price_amount" type="number" min="0" step="any" class="w-full" />
            </UFormField>
            <UFormField label="Sale starts" help="Optional. Leave empty to start immediately.">
              <UInput v-model="form.sale_starts_at" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Sale ends" help="Optional. Leave empty for no end date.">
              <UInput v-model="form.sale_ends_at" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Duration (minutes)">
              <UInput v-model="form.duration_minutes" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max capacity">
              <UInput v-model="form.max_capacity" type="number" min="1" class="w-full" />
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
              <UInput v-model="form.featured_sort_order" type="number" min="0" class="w-full" />
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
          <UFormField label="Availability note" help="Short note shown when near capacity, e.g. 'Last 2 spots'.">
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
              <UInput
                v-model="slotCapacityOverrides[slot.time_slot]"
                type="number"
                min="0"
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
  </UPage>
</template>

<script setup lang="ts">
// -nocheck
import type { Experience, SlotAvailability, SlotOverride, WeekdayName } from '~/server/utils/experiences'
import type { BookingPolicyPatch, RenderedBookingPolicySummary } from '~/server/utils/booking-policies'

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const satisfies WeekdayName[]

definePageMeta({ layout: 'dashboard' })

type ApiRecord = Experience

const toast = useToast()
const route = useRoute()
const siteId = await useDashboardSiteId()

const sitePublicUrl = ref<string | null>(null)
const defaultCurrency = ref('THB')
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const _headerLinks = computed(() => buildHeaderLinks())

interface LocationRow {
  id: string
  slug: string
  title: string
  is_primary: boolean
}

// ── List ──────────────────────────────────────────────────
const loading = ref(true)
const experiences = ref<ApiRecord[]>([])
const locations = ref<LocationRow[]>([])
const locationItems = computed(() => locations.value.map(location => ({ id: location.id, label: location.title })))
const defaultLocationId = computed(() => {
  const slug = String(route.params.locationSlug ?? '')
  return locations.value.find(l => l.slug === slug)?.id
    ?? locations.value.find(l => l.is_primary)?.id
    ?? locations.value[0]?.id
    ?? ''
})

async function loadExperiences() {
  loading.value = true
  try {
    const res = await $fetch<{ experiences: ApiRecord[] }>(`/api/dashboard/editor/experiences`)
    experiences.value = res.experiences ?? []
  } catch {
    experiences.value = []
  } finally {
    loading.value = false
  }
}

async function loadLocations() {
  try {
    const res = await $fetch<{ locations: LocationRow[] }>(`/api/dashboard/locations`)
    locations.value = res.locations ?? []
  } catch {
    locations.value = []
  }
}

async function loadSitePublicUrl() {
  try {
    const response = await $fetch<{ success: boolean; settings: { public_url?: string | null; default_currency?: string } }>(`/api/dashboard/settings`)
    sitePublicUrl.value = response.settings?.public_url || null
    defaultCurrency.value = response.settings?.default_currency || 'THB'
  } catch {
    sitePublicUrl.value = null
  }
}

await Promise.all([loadExperiences(), loadLocations(), loadSitePublicUrl()])

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

async function runGenerator(target: 'flat' | 'recurring', day?: WeekdayName) {
  generating.value = true
  try {
    const res = await $fetch<{ slots: string[] }>(`/api/dashboard/editor/experiences/generate-slots`, {
      query: { start: generator.start, end: generator.end, interval_minutes: generator.interval },
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
  image_asset_id: null as string | null,
  image_url: null as string | null,
  video_asset_id: null as string | null,
  video_url: null as string | null,
  images: [] as Array<{ _key: string; asset_id: string | null; url: string | null; kind: 'image' | 'video' }>,
  price: '',
  price_amount: '',
  compare_at_price_amount: '',
  sale_starts_at: '',
  sale_ends_at: '',
  duration_minutes: '',
  max_capacity: '',
  available_note: '',
  highlights_input: '',
  included_items_input: '',
  what_to_bring_input: '',
  meeting_point: '',
  status: 'active' as 'active' | 'inactive' | 'sold_out',
  featured: false,
  featured_sort_order: 0,
})

const form = reactive(emptyForm())
const bookingPolicyDraft = ref<BookingPolicyPatch>({})
const bookingPolicySummary = ref<RenderedBookingPolicySummary | null>(null)

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  form.location_id = defaultLocationId.value
  timeSlotsInput.value = ''
  slotsMode.value = 'flat'
  for (const day of weekdayNames) recurringInputs[day] = ''
  bookingPolicyDraft.value = {}
  bookingPolicySummary.value = null
  sliderOpen.value = true
}

function handleImageChange(asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  form.image_url = asset?.publicUrl ?? asset?.thumbnailUrl ?? null
}

function handleVideoChange(asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  form.video_url = asset?.publicUrl ?? null
}

function addGalleryMedia() {
  form.images.push({ _key: crypto.randomUUID(), asset_id: null, url: null, kind: 'image' })
}

function removeGalleryMedia(index: number) {
  form.images.splice(index, 1)
}

function moveGalleryMedia(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= form.images.length) return
  const [item] = form.images.splice(index, 1)
  if (item) form.images.splice(target, 0, item)
}

function handleGalleryMediaChange(index: number, asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  const item = form.images[index]
  if (!item) return
  item.asset_id = asset?.id ?? null
  item.url = asset?.publicUrl ?? asset?.thumbnailUrl ?? null
  item.kind = asset?.kind === 'video' ? 'video' : 'image'
}

function openEdit(exp: ApiRecord) {
  editing.value = exp
  Object.assign(form, {
    title: exp.title ?? '',
    location_id: exp.location_id ?? defaultLocationId.value,
    tagline: exp.tagline ?? '',
    body: exp.body ?? '',
    image_asset_id: exp.image_asset_id ?? null,
    image_url: exp.image_url ?? null,
    video_asset_id: exp.video_asset_id ?? null,
    video_url: exp.video_url ?? null,
    images: Array.isArray(exp.images) ? exp.images.map((img: { asset_id?: string | null; url: string | null; kind: 'image' | 'video' }) => ({ _key: crypto.randomUUID(), asset_id: img.asset_id ?? null, url: img.url, kind: img.kind })) : [],
    price: exp.price ?? '',
    price_amount: exp.price_amount != null ? String(exp.price_amount) : '',
    compare_at_price_amount: exp.compare_at_price_amount != null ? String(exp.compare_at_price_amount) : '',
    sale_starts_at: exp.sale_starts_at ? String(exp.sale_starts_at).slice(0, 10) : '',
    sale_ends_at: exp.sale_ends_at ? String(exp.sale_ends_at).slice(0, 10) : '',
    duration_minutes: exp.duration_minutes != null ? String(exp.duration_minutes) : '',
    max_capacity: exp.max_capacity != null ? String(exp.max_capacity) : '',
    available_note: exp.available_note ?? '',
    highlights_input: arrayToLines(exp.highlights),
    included_items_input: arrayToLines(exp.included_items),
    what_to_bring_input: arrayToLines(exp.what_to_bring),
    meeting_point: exp.meeting_point ?? '',
    status: exp.status ?? 'active',
    featured: exp.featured ?? false,
    featured_sort_order: exp.featured_sort_order != null ? String(exp.featured_sort_order) : '0',
  })
  timeSlotsInput.value = Array.isArray(exp.time_slots) ? exp.time_slots.join(', ') : (exp.time_slots ?? '')
  for (const day of weekdayNames) recurringInputs[day] = exp.recurring_slots?.[day]?.join(', ') ?? ''
  slotsMode.value = exp.recurring_slots ? 'recurring' : 'flat'
  void loadExperiencePolicy(exp.id, exp.location_id)
  sliderOpen.value = true
}

async function loadExperiencePolicy(experienceId: string, locationId: string | null | undefined) {
  try {
    const res = await $fetch<{ policy: BookingPolicyPatch | null; summary: RenderedBookingPolicySummary | null }>(`/api/editor/sites/${siteId}/booking-policy`, {
      query: {
        policy_type: 'experience',
        scope_type: 'experience',
        experience_id: experienceId,
        location_id: locationId ?? undefined,
      },
    })
    bookingPolicyDraft.value = res.policy ?? {}
    bookingPolicySummary.value = res.summary ?? null
  } catch {
    bookingPolicyDraft.value = {}
    bookingPolicySummary.value = null
  }
}

async function save() {
  if (!form.title.trim()) {
    toast.add({ description: 'Title is required.', color: 'error' })
    return
  }
  if (!form.location_id) {
    toast.add({ description: 'Location is required.', color: 'error' })
    return
  }
  saving.value = true
  try {
    const parseNumber = (value: string | number): number | null => {
      const str = String(value)
      if (!str.trim()) return null
      const parsed = Number(str)
      return Number.isFinite(parsed) ? parsed : null
    }
    const payload = {
      ...form,
      price_amount: parseNumber(form.price_amount),
      compare_at_price_amount: parseNumber(form.compare_at_price_amount),
      sale_starts_at: form.sale_starts_at.trim() || null,
      sale_ends_at: form.sale_ends_at.trim() || null,
      duration_minutes: parseNumber(form.duration_minutes),
      max_capacity: parseNumber(form.max_capacity),
      featured_sort_order: parseNumber(form.featured_sort_order),
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
      images: form.images.filter(img => img.url).map(img => ({
        url: img.url,
        kind: img.kind,
      })),
    }
    let experienceResult: ApiRecord | null = null
    if (editing.value) {
      const response = await $fetch<{ experience: ApiRecord }>(`/api/dashboard/editor/experiences/${editing.value.id}`, { method: 'PATCH', body: payload })
      experienceResult = response.experience ?? null
      toast.add({ description: 'Experience updated.', color: 'success' })
    } else {
      const response = await $fetch<{ experience: ApiRecord }>(`/api/dashboard/editor/experiences`, { method: 'POST', body: payload })
      experienceResult = response.experience ?? null
      toast.add({ description: 'Experience created.', color: 'success' })
    }

    // Booking policy is saved separately from the experience itself — a policy failure here
    // shouldn't be reported as an experience save failure, since the experience already saved.
    if (experienceResult?.id) {
      try {
        const policyResponse = await $fetch<{ summary: RenderedBookingPolicySummary | null }>(`/api/editor/sites/${siteId}/booking-policy`, {
          method: 'PATCH',
          body: {
            ...bookingPolicyDraft.value,
            policy_type: 'experience',
            scope_type: 'experience',
            experience_id: experienceResult.id,
            location_id: experienceResult.location_id ?? form.location_id,
          },
        })
        bookingPolicySummary.value = policyResponse.summary ?? null
      } catch {
        toast.add({ description: 'Experience saved, but the booking policy failed to save.', color: 'warning' })
      }
    }
    sliderOpen.value = false
    await loadExperiences()
  } catch {
    toast.add({ description: 'Failed to save experience.', color: 'error' })
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
    await $fetch(`/api/dashboard/editor/experiences/${deletingExp.value.id}`, { method: 'DELETE' })
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
const slotCapacityOverrides = reactive<Record<string, string>>({})
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
      $fetch<{ timezone: string; dates: Array<{ date: string; slots: SlotAvailability[] }> }>(
        `/api/dashboard/editor/experiences/${availabilityExp.value.id}/availability`,
        { query: { date: availabilityDate.value } },
      ),
      $fetch<{ overrides: SlotOverride[] }>(
        `/api/dashboard/editor/experiences/${availabilityExp.value.id}/slot-overrides`,
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
    await $fetch(`/api/dashboard/editor/experiences/${availabilityExp.value.id}/slot-overrides`, {
      method: 'POST',
      body: {
        override_date: availabilityDate.value,
        time_slot: slot.time_slot,
        status: slot.is_closed ? 'open' : 'closed',
        capacity_override: capacityInput ? Number(capacityInput) : null,
      },
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
    await $fetch(`/api/dashboard/editor/experiences/${availabilityExp.value.id}/slot-overrides/${override.id}`, { method: 'DELETE' })
    await loadAvailability()
  } catch {
    toast.add({ description: 'Failed to delete override.', color: 'error' })
  }
}
</script>
