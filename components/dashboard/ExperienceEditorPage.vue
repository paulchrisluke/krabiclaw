<template>
  <UDashboardPanel id="location-experience-detail">
    <template #header>
      <UDashboardNavbar :title="editor.form.title || 'Experience'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="experiencesPath" label="Experiences" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Could not load this experience"
        :description="loadError"
      />

      <EditorPaneShell
        v-else
        :has-detail="hasDetail"
        show-desktop-detail
        :show-actions="showActions"
        :saving="saving"
        :save-disabled="saveDisabled"
        :detail-title="sectionLabels[editorKey]"
        :dismiss-to="experiencePath"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="detailKey" />
        </template>

        <template #detail>
          <!-- Details -->
          <div v-if="editorKey === 'details'" class="space-y-6">
            <p class="text-base text-muted">How this experience introduces itself on your site.</p>
            <UFormField label="Title" required>
              <UInput v-model="editor.form.title" size="xl" autofocus class="w-full" />
            </UFormField>
            <UFormField label="Tagline" help="One-line hook shown on the listing card.">
              <UInput v-model="editor.form.tagline" size="xl" class="w-full" />
            </UFormField>
            <UFormField label="Description">
              <UTextarea v-model="editor.form.body" :rows="8" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="editor.form.status" :items="statusOptions" class="w-full" />
            </UFormField>
            <UCheckbox
              v-model="editor.form.featured"
              label="Featured"
              description="Show on homepage and location pages when no menu exists"
            />
            <UFormField v-if="editor.form.featured" label="Featured sort order" help="Lower numbers appear first">
              <UInputNumber v-model="editor.form.featured_sort_order" :min="0" class="w-full" />
            </UFormField>
          </div>

          <!-- Location -->
          <div v-else-if="editorKey === 'location'" class="space-y-6">
            <p class="text-base text-muted">Where a guest goes when they arrive.</p>
            <UFormField label="Meeting point" help="Short arrival or check-in instruction.">
              <UTextarea
                v-model="editor.form.meeting_point"
                :rows="3"
                placeholder="Meet at the main studio reception 10 minutes before your start time."
                class="w-full"
              />
            </UFormField>
          </div>

          <!-- Photos -->
          <div v-else-if="editorKey === 'photos'">
            <DashboardPhotoManager
              :photos="managedPhotos"
              :site-id="siteId"
              title=""
              description="The first photo leads on your site."
              add-label="Add photos"
              empty-title="No photos yet"
              accept="any"
              :mutating="editor.saving.value"
              @add="addPhoto"
              @remove="removePhotos"
              @reorder="reorderPhotos"
            />
          </div>

          <!-- Pricing -->
          <div v-else-if="editorKey === 'pricing'" class="space-y-6">
            <p class="text-base text-muted">What a guest pays, and what they see when there is no fixed price.</p>
            <UFormField label="Price amount" :help="`Numeric amount in ${currency}. Leave empty for free or contact-only pricing.`">
              <UInputNumber v-model="editor.form.price_major" :min="0" :step="0.01" placeholder="1500" class="w-full" />
            </UFormField>
            <UFormField label="Inquiry pricing note" help='Used only when no active Price exists, e.g. "Ask us about monthly pricing".'>
              <UInput v-model="editor.form.pricing_note" placeholder="Ask us about pricing" class="w-full" />
            </UFormField>
          </div>

          <!-- Discounts -->
          <div v-else-if="editorKey === 'discounts'" class="space-y-6">
            <p class="text-base text-muted">
              Show a higher price struck through while a sale runs. Leave the dates empty to run it
              until you stop it.
            </p>
            <UFormField label="Compare-at price" :help="`The regular price in ${currency}, shown struck through.`">
              <UInputNumber v-model="editor.form.compare_at_major" :min="0" :step="0.01" class="w-full" />
            </UFormField>
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Sale starts" help="Optional. Leave empty to start immediately.">
                <UInput v-model="editor.form.valid_from" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Sale ends" help="Optional. Leave empty for no end date.">
                <UInput v-model="editor.form.valid_until" type="date" class="w-full" />
              </UFormField>
            </div>
          </div>

          <!-- Guests -->
          <div v-else-if="editorKey === 'guests'" class="space-y-6">
            <p class="text-base text-muted">Who can come, and how many.</p>
            <UFormField label="Max capacity" help="The most guests one session can take.">
              <UInputNumber v-model="editor.form.max_capacity" :min="1" class="w-full" />
            </UFormField>
            <BookingPolicyForm
              v-model="editor.bookingPolicyDraft.value"
              policy-type="experience"
              :only="['minimum_guest_age', 'accessibility']"
            />
          </div>

          <!-- Itinerary -->
          <div v-else-if="editorKey === 'itinerary'" class="space-y-6">
            <p class="text-base text-muted">How long it runs, and the times a guest can choose.</p>
            <UFormField label="Duration (minutes)">
              <UInputNumber v-model="editor.form.duration_minutes" :min="0" class="w-full" />
            </UFormField>
            <p class="border-t border-default pt-6 text-sm font-semibold text-highlighted">Times</p>
            <UTabs v-model="editor.slotsMode.value" :items="slotModes" :content="false" />

            <UCard :ui="{ body: 'p-4 sm:p-4' }">
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
                class="mt-3"
                color="neutral"
                variant="soft"
                :loading="generating"
                @click="runGenerator()"
              >
                Generate slots
              </UButton>
              <p v-else class="mt-3 text-xs text-muted">Set times above, then use the bolt icon on a day to apply.</p>
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

          <!-- What's included -->
          <div v-else-if="editorKey === 'included'" class="space-y-6">
            <p class="text-base text-muted">What you provide, and what a guest should bring themselves.</p>
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
          </div>

          <!-- Booking policy -->
          <div v-else-if="editorKey === 'policies'" class="space-y-6">
            <p class="text-base text-muted">What happens when a guest needs to cancel or move their booking.</p>

            <!--
              Named terms, not a minutes field: the tenant picks a position a
              guest can understand, and each card states its own consequences.
            -->
            <div class="space-y-3">
              <button
                v-for="preset in policyPresets"
                :key="preset.id"
                type="button"
                class="w-full rounded-xl border px-4 py-3 text-left transition-colors"
                :class="activePresetId === preset.id ? 'border-2 border-inverted' : 'border border-default hover:border-accented'"
                :aria-pressed="activePresetId === preset.id"
                @click="selectPreset(preset)"
              >
                <span class="block font-semibold text-highlighted">{{ preset.label }}</span>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="term in preset.terms" :key="term" class="text-sm text-muted">• {{ term }}</li>
                </ul>
              </button>

              <div
                v-if="!activePresetId"
                class="rounded-xl border-2 border-inverted px-4 py-3"
              >
                <span class="block font-semibold text-highlighted">Custom</span>
                <p class="mt-1 text-sm text-muted">
                  This experience has terms that were set before these options existed. Choosing one above replaces them.
                </p>
              </div>
            </div>


          </div>

          <!-- Availability -->
          <div v-else-if="editorKey === 'availability'" class="space-y-6">
            <p class="text-base text-muted">Close individual times or change capacity on a specific date.</p>
            <p v-if="availabilityTimezone" class="text-xs text-muted">Times shown in {{ availabilityTimezone }}.</p>
            <UFormField label="Date">
              <UInput v-model="availabilityDate" type="date" class="w-full max-w-xs" @change="loadAvailability" />
            </UFormField>

            <div v-if="availabilityLoading" class="space-y-2">
              <USkeleton class="h-12 w-full rounded-lg" />
              <USkeleton class="h-12 w-full rounded-lg" />
            </div>
            <p v-else-if="!availabilitySlots.length" class="text-sm text-muted">No effective time slots on this date.</p>
            <div v-else class="space-y-2">
              <div
                v-for="slot in availabilitySlots"
                :key="slot.time_slot"
                class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3"
              >
                <span class="w-16 shrink-0 font-medium text-highlighted">{{ slot.time_slot }}</span>
                <span class="text-xs text-muted">
                  {{ slot.booked }} booked<span v-if="slot.capacity != null"> / {{ slot.capacity }}</span>
                </span>
                <UBadge v-if="slot.is_closed" color="error" variant="soft" size="xs">Closed</UBadge>
                <UBadge v-else-if="slot.is_full" color="warning" variant="soft" size="xs">Full</UBadge>
                <UInputNumber
                  v-model="slotCapacityOverrides[slot.time_slot]"
                  :min="0"
                  placeholder="Capacity"
                  class="ml-auto w-32"
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

            <div v-if="existingOverrides.length" class="border-t border-default pt-4">
              <p class="mb-2 text-xs font-medium text-muted">Upcoming overrides</p>
              <div class="space-y-1">
                <div
                  v-for="override in existingOverrides"
                  :key="override.id"
                  class="flex items-center gap-3 rounded-lg border border-default px-3 py-2 text-sm"
                >
                  <span class="text-muted">{{ override.override_date }}</span>
                  <span class="font-medium text-highlighted">{{ override.time_slot }}</span>
                  <UBadge :color="override.status === 'closed' ? 'error' : 'success'" variant="soft" size="xs">
                    {{ override.status }}
                  </UBadge>
                  <span v-if="override.capacity_override != null" class="text-xs text-muted">cap {{ override.capacity_override }}</span>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    class="ml-auto"
                    aria-label="Delete override"
                    @click="deleteOverride(override)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Translations -->
          <div v-else-if="editorKey === 'translations'" class="space-y-6">
            <UFormField label="Language">
              <USelect v-model="translationLocale" :items="localeItems" class="w-40" aria-label="Field language" />
            </UFormField>
            <p v-if="translationLocale === 'en'" class="text-sm text-muted">
              English is the source language. Choose another language to translate this experience.
            </p>
            <template v-else>
              <p class="text-xs text-muted">Source (English): {{ editor.form.title }}</p>
              <UFormField :label="`Title (${translationLocale})`">
                <UInput v-model="translationFields.title" class="w-full" />
              </UFormField>
              <UFormField :label="`Tagline (${translationLocale})`">
                <UInput v-model="translationFields.tagline" class="w-full" />
              </UFormField>
              <UFormField :label="`Description (${translationLocale})`">
                <UTextarea v-model="translationFields.body" :rows="5" class="w-full" />
              </UFormField>
              <UFormField :label="`Price note (${translationLocale})`">
                <UInput v-model="translationFields.price" class="w-full" />
              </UFormField>
              <UFormField :label="`Included items (${translationLocale})`">
                <UInputTags v-model="translationFields.included_items" add-on-blur add-on-paste class="w-full" />
              </UFormField>
              <UFormField :label="`What to bring (${translationLocale})`">
                <UInputTags v-model="translationFields.what_to_bring" add-on-blur add-on-paste class="w-full" />
              </UFormField>
              <UFormField :label="`Meeting point (${translationLocale})`">
                <UTextarea v-model="translationFields.meeting_point" :rows="3" class="w-full" />
              </UFormField>
              <UFormField :label="`Cancellation policy (${translationLocale})`">
                <UTextarea v-model="translationFields.cancellation_policy" :rows="3" class="w-full" />
              </UFormField>
              <UFormField :label="`SEO title (${translationLocale})`">
                <UInput v-model="translationFields.seo_title" class="w-full" />
              </UFormField>
              <UFormField :label="`SEO description (${translationLocale})`">
                <UTextarea v-model="translationFields.seo_description" :rows="2" class="w-full" />
              </UFormField>
              <template v-if="editor.bookingPolicyId.value">
                <UFormField :label="`Booking policy weather note (${translationLocale})`">
                  <UTextarea v-model="policyTranslationFields.weather_policy" :rows="2" class="w-full" />
                </UFormField>
                <UFormField :label="`Booking policy notes (${translationLocale})`">
                  <UTextarea v-model="policyTranslationFields.additional_notes_html" :rows="2" class="w-full" />
                </UFormField>
              </template>
              <p v-if="translationError" class="text-sm text-error">{{ translationError }}</p>
            </template>
          </div>

        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import type { EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardPhotoManager from '~/components/dashboard/DashboardPhotoManager.vue'
import BookingPolicyForm from '~/components/dashboard/BookingPolicyForm.vue'
import type { BookingPolicyPreset } from '~/utils/booking-policy-presets'
import { BOOKING_POLICY_PRESETS, applyBookingPolicyPreset, matchBookingPolicyPreset } from '~/utils/booking-policy-presets'
import {
  WEEKDAY_NAMES,
  provideExperienceEditor,
  useExperienceEditor,
} from '~/composables/useExperienceEditor'
import type { Experience, SlotAvailability, SlotOverride, WeekdayName } from '~/server/utils/experiences'
import { formatMinorAmount, majorAmountToMinor } from '~/shared/prices'
import type { CurrencyCode } from '~/shared/currencies'
import { getErrorMessage } from '~/utils/errors'

const route = useRoute()
const dashboardApi = useDashboardApi()
const toast = useToast()
const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const experienceId = computed(() => String(route.params.experienceId ?? ''))
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const experiencesPath = computed(() => locationPaths.value?.experiences ?? '')
const experiencePath = computed(() => `${experiencesPath.value}/${experienceId.value}`)
const currency = computed(() => dashboard.site.value?.default_currency || 'USD')

const editor = provideExperienceEditor(useExperienceEditor(siteId, currentLocationId, currency))
const weekdayNames = WEEKDAY_NAMES

// ── Which leaf is open ──────────────────────────────────
const sectionLabels: Record<string, string> = {
  details: 'Details',
  location: 'Location',
  photos: 'Photos',
  itinerary: 'Itinerary',
  guests: 'Guests',
  pricing: 'Pricing',
  discounts: 'Discounts',
  included: "What's included",
  policies: 'Policies',
  availability: 'Availability',
  translations: 'Translations',
}
const validSectionKeys = new Set(Object.keys(sectionLabels))

const routeSegments = computed(() => {
  const segments = route.params.segments
  if (Array.isArray(segments)) return segments.filter(Boolean).map(String)
  return segments ? [String(segments)] : []
})
const detailKey = computed(() => routeSegments.value[0] ?? null)
const editorKey = computed(() => detailKey.value ?? 'details')
const hasDetail = computed(() => Boolean(detailKey.value))

// An unsupported route 404s rather than silently showing the first section.
if (routeSegments.value.length > 1 || (detailKey.value && !validSectionKeys.has(detailKey.value))) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

// Photos, availability and delete each commit as you act, so they have no
// pending draft for a footer to save.
const showActions = computed(() => hasDetail.value && !['photos', 'availability'].includes(editorKey.value))
const saveDisabled = computed(() => editorKey.value === 'details' && !editor.form.title.trim())
const saving = computed(() => editor.saving.value || translationSaving.value)

// ── Load ────────────────────────────────────────────────
const isExperiencesResponse = (value: unknown): value is { experiences: Experience[] } =>
  isRecord(value)
  && Array.isArray(value.experiences)
  && value.experiences.every(experience => isRecord(experience) && typeof experience.id === 'string')

// There is no single-experience GET; the collection endpoint is the only read
// path, so this selects from it the same way the product category route does.
const { data, error, refresh } = await useAsyncData(
  computed(() => `dashboard-location-experience-${siteId}-${currentLocationId.value ?? 'missing'}-${experienceId.value}`),
  async () => {
    const locationId = currentLocationId.value
    if (!locationId) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    const response = await dashboardApi(`/api/editor/sites/${siteId}/experiences`, {
      query: { location_id: locationId },
      validate: isExperiencesResponse,
    })
    const experience = response.experiences.find(row => row.id === experienceId.value)
    if (!experience) throw createError({ statusCode: 404, statusMessage: 'Experience not found' })
    return { experience }
  },
  { watch: [experienceId, currentLocationId] },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Could not load this experience') : null))

// The list validator only asserts `id`, so a slug can be missing. A localization
// route built on an empty slug would publish `/th/experiences/`.
const experienceSlug = computed(() => {
  const slug = data.value?.experience.slug
  return typeof slug === 'string' && slug.trim() ? slug : ''
})

watch(data, value => {
  if (!value) return
  editor.loadFrom(value.experience)
  void editor.loadPolicy(value.experience.id)
}, { immediate: true })

// ── Booking policy ──────────────────────────────────────
const policyPresets = BOOKING_POLICY_PRESETS
const activePresetId = computed(() => matchBookingPolicyPreset(editor.bookingPolicyDraft.value)?.id ?? null)

const policySummary = computed(() => {
  const preset = matchBookingPolicyPreset(editor.bookingPolicyDraft.value)
  if (preset) return preset.label
  return editor.bookingPolicyId.value ? 'Custom' : 'Using the location default'
})

function selectPreset(preset: BookingPolicyPreset) {
  editor.bookingPolicyDraft.value = {
    ...editor.bookingPolicyDraft.value,
    ...applyBookingPolicyPreset(preset),
  }
}

// ── Photos ──────────────────────────────────────────────
// The editor holds one ordered media list; the manager speaks in asset ids, so
// the two are mapped here rather than teaching either about the other.
const managedPhotos = computed(() => editor.form.media
  .filter(item => item.asset_id)
  .map(item => ({
    asset_id: item.asset_id!,
    url: item.thumbnail_url ?? item.url ?? null,
    alt: editor.form.title,
    kind: item.kind,
  })))

// Photo edits save as you act, so they queue: each save reads form.media and
// reconciles against originalMediaIds, and two in flight would let the older
// response remove an asset the newer one just added.
let photoWrites: Promise<unknown> = Promise.resolve()

function queuePhotoWrite(mutate: () => void) {
  photoWrites = photoWrites
    .then(() => {
      mutate()
      return editor.save(experienceId.value)
    })
    .catch(() => undefined)
}

function addPhoto(assetId: string) {
  queuePhotoWrite(() => {
    if (editor.form.media.some(item => item.asset_id === assetId)) return
    editor.addMedia()
    editor.setMediaAsset(editor.form.media.length - 1, {
      asset_id: assetId, public_url: null, thumbnail_url: null, kind: 'image',
    })
  })
}

function removePhotos(assetIds: string[]) {
  queuePhotoWrite(() => {
    const drop = new Set(assetIds)
    editor.form.media = editor.form.media.filter(item => !item.asset_id || !drop.has(item.asset_id))
  })
}

function reorderPhotos(assetIds: string[]) {
  queuePhotoWrite(() => {
    const byId = new Map(editor.form.media.map(item => [item.asset_id, item]))
    editor.form.media = assetIds.flatMap(assetId => {
      const item = byId.get(assetId)
      return item ? [item] : []
    })
  })
}

// ── Hub rows ────────────────────────────────────────────
function listSummary(values: string[], empty: string) {
  if (!values.length) return empty
  return values.length <= 2 ? values.join(', ') : `${values.slice(0, 2).join(', ')} +${values.length - 2}`
}

const priceSummary = computed(() => {
  if (editor.form.price_major !== null) {
    try {
      // Not price_major * 100: JPY and VND are zero-decimal, so the multiplier
      // is currency-dependent and majorAmountToMinor owns that rule.
      const minor = majorAmountToMinor(String(editor.form.price_major), currency.value as CurrencyCode)
      return formatMinorAmount(minor, currency.value as CurrencyCode)
    } catch {
      return String(editor.form.price_major)
    }
  }
  return editor.form.pricing_note || 'No price set'
})

const guestsSummary = computed(() => {
  const parts: string[] = []
  if (editor.form.max_capacity) parts.push(`Up to ${editor.form.max_capacity} guests`)
  const age = editor.bookingPolicyDraft.value.minimum_guest_age
  if (age) parts.push(`${age}+`)
  return parts.join(' · ') || 'No limit set'
})

const itinerarySummary = computed(() => {
  const parts: string[] = []
  if (editor.form.duration_minutes) parts.push(`${editor.form.duration_minutes} min`)
  if (editor.slotsMode.value === 'flat') {
    if (editor.timeSlots.value.length) parts.push(`${editor.timeSlots.value.length} times daily`)
  } else {
    const days = weekdayNames.filter(day => editor.recurringSlots[day].length).length
    if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'} a week`)
  }
  return parts.join(' · ') || 'No times set'
})

const discountSummary = computed(() => {
  if (editor.form.compare_at_major === null) return 'No sale running'
  const window = editor.form.valid_until ? `until ${editor.form.valid_until}` : 'no end date'
  return `Was ${editor.form.compare_at_major}, ${window}`
})

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'content',
    label: 'Content',
    items: [
      { id: 'details', label: 'Details', summary: editor.form.tagline || editor.form.title, icon: 'i-lucide-align-left', to: `${experiencePath.value}/details` },
      { id: 'photos', label: 'Photos', summary: editor.form.media.length ? `${editor.form.media.length} photos` : 'No photos yet', icon: 'i-lucide-images', to: `${experiencePath.value}/photos` },
      { id: 'location', label: 'Location', summary: editor.form.meeting_point || 'No meeting point set', icon: 'i-lucide-map-pin', to: `${experiencePath.value}/location` },
      { id: 'itinerary', label: 'Itinerary', summary: itinerarySummary.value, icon: 'i-lucide-clock-3', to: `${experiencePath.value}/itinerary` },
      { id: 'included', label: "What's included", summary: listSummary(editor.form.included_items, 'Nothing listed yet'), icon: 'i-lucide-list-checks', to: `${experiencePath.value}/included` },
    ],
  },
  {
    id: 'booking',
    label: 'Booking',
    items: [
      { id: 'guests', label: 'Guests', summary: guestsSummary.value, icon: 'i-lucide-users', to: `${experiencePath.value}/guests` },
      { id: 'pricing', label: 'Pricing', summary: priceSummary.value, icon: 'i-lucide-tag', to: `${experiencePath.value}/pricing` },
      { id: 'discounts', label: 'Discounts', summary: discountSummary.value, icon: 'i-lucide-percent', to: `${experiencePath.value}/discounts` },
      { id: 'availability', label: 'Availability', summary: 'Close times or change capacity by date', icon: 'i-lucide-calendar-days', to: `${experiencePath.value}/availability` },
      { id: 'policies', label: 'Policies', summary: policySummary.value, icon: 'i-lucide-shield-check', to: `${experiencePath.value}/policies` },
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    items: [
      { id: 'translations', label: 'Translations', summary: translationLocales.value.length ? `${translationLocales.value.length} languages` : 'No other languages', icon: 'i-lucide-languages', to: `${experiencePath.value}/translations` },
    ],
  },
])

// ── Save / cancel ───────────────────────────────────────
async function saveCurrentEditor() {
  if (editorKey.value === 'translations') {
    await saveTranslation()
    return
  }
  await editor.save(experienceId.value)
}

/** Dismissing a leaf discards its draft, matching the settings sheets. */
async function cancelEditor() {
  if (data.value) editor.loadFrom(data.value.experience)
  await navigateTo(experiencePath.value)
}

// ── Options ─────────────────────────────────────────────
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
const generator = reactive({ start: '17:00', end: '21:00', interval: 30 })
const generating = ref(false)

const isSlotsResponse = (value: unknown): value is { slots: string[] } =>
  isRecord(value) && Array.isArray(value.slots) && value.slots.every(slot => typeof slot === 'string')

async function runGenerator(day?: WeekdayName) {
  generating.value = true
  try {
    const res = await dashboardApi('/api/utils/generate-slots', {
      query: { start: generator.start, end: generator.end, interval_minutes: generator.interval },
      validate: isSlotsResponse,
    })
    if (day) editor.recurringSlots[day] = res.slots
    else editor.timeSlots.value = res.slots
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

// ── Translations ────────────────────────────────────────
const translationLocale = ref('en')
const translationLocales = ref<string[]>([])
const localeItems = computed(() => ['en', ...translationLocales.value])
const translationFields = reactive({
  title: '', tagline: '', body: '', price: '',
  included_items: [] as string[], what_to_bring: [] as string[],
  meeting_point: '', cancellation_policy: '', seo_title: '', seo_description: '',
})
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
const policyTranslationFields = reactive({ weather_policy: '', additional_notes_html: '' })

const isLocalesResponse = (value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } =>
  isRecord(value) && Array.isArray(value.languages)
const isTranslationResponse = (value: unknown): value is { localization: { values: Record<string, unknown> } } =>
  isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)

async function loadTranslationLocales() {
  try {
    const response = await dashboardApi(`/api/editor/sites/${siteId}/locales`, { validate: isLocalesResponse })
    translationLocales.value = response.languages
      .filter(item => item.locale_status === 'published' && !item.is_source)
      .map(item => item.locale)
  } catch (cause) {
    translationLocales.value = []
    translationError.value = getErrorMessage(cause, 'Failed to load site languages')
  }
}

function resetTranslationFields() {
  Object.assign(translationFields, {
    title: '', tagline: '', body: '', price: '',
    included_items: [], what_to_bring: [],
    meeting_point: '', cancellation_policy: '', seo_title: '', seo_description: '',
  })
  policyTranslationFields.weather_policy = ''
  policyTranslationFields.additional_notes_html = ''
}

async function loadTranslationFields() {
  translationError.value = null
  try {
    const response = await dashboardApi(
      `/api/editor/sites/${siteId}/localization/experience/${experienceId.value}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isTranslationResponse },
    )
    const values = response.localization.values
    const text = (key: string) => (typeof values[key] === 'string' ? values[key] : '')
    const list = (key: string) => (Array.isArray(values[key]) ? (values[key] as unknown[]).filter((item): item is string => typeof item === 'string') : [])
    Object.assign(translationFields, {
      title: text('title'),
      tagline: text('tagline'),
      body: text('body'),
      price: text('price'),
      included_items: list('included_items_json'),
      what_to_bring: list('what_to_bring'),
      meeting_point: text('meeting_point'),
      cancellation_policy: text('cancellation_policy'),
      seo_title: text('seo_title'),
      seo_description: text('seo_description'),
    })
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) translationError.value = getErrorMessage(cause, 'Failed to load translation')
    resetTranslationFields()
  }
  await loadPolicyTranslation()
}

watch(translationLocale, () => {
  if (translationLocale.value === 'en') {
    resetTranslationFields()
    return
  }
  void loadTranslationFields()
})

async function saveTranslation() {
  if (translationLocale.value === 'en') return
  if (!experienceSlug.value) {
    translationError.value = 'This experience has no slug yet, so its translated page has no address. Save it once in English first.'
    return
  }
  translationSaving.value = true
  translationError.value = null
  try {
    const values: Record<string, unknown> = {}
    for (const field of ['title', 'tagline', 'body', 'price', 'meeting_point', 'cancellation_policy', 'seo_title', 'seo_description'] as const) {
      if (translationFields[field].trim()) values[field] = translationFields[field].trim()
    }
    if (translationFields.included_items.length) values.included_items_json = translationFields.included_items
    if (translationFields.what_to_bring.length) values.what_to_bring = translationFields.what_to_bring

    await dashboardApi(`/api/editor/sites/${siteId}/localization/experience/${experienceId.value}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values, route_path: `/${translationLocale.value}/experiences/${experienceSlug.value}` },
      validate: isRecord,
    })
    await savePolicyTranslation()
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    translationError.value = getErrorMessage(cause, 'Failed to save translation')
  } finally {
    translationSaving.value = false
  }
}

async function loadPolicyTranslation() {
  const policyId = editor.bookingPolicyId.value
  if (!policyId || translationLocale.value === 'en') return
  try {
    const response = await dashboardApi(
      `/api/editor/sites/${siteId}/localization/booking_policy/${policyId}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isTranslationResponse },
    )
    const values = response.localization.values
    policyTranslationFields.weather_policy = typeof values.weather_policy === 'string' ? values.weather_policy : ''
    policyTranslationFields.additional_notes_html = typeof values.additional_notes_html === 'string' ? values.additional_notes_html : ''
  } catch {
    policyTranslationFields.weather_policy = ''
    policyTranslationFields.additional_notes_html = ''
  }
}

async function savePolicyTranslation() {
  const policyId = editor.bookingPolicyId.value
  if (!policyId || translationLocale.value === 'en') return
  const values: Record<string, string> = {}
  if (policyTranslationFields.weather_policy.trim()) values.weather_policy = policyTranslationFields.weather_policy.trim()
  if (policyTranslationFields.additional_notes_html.trim()) values.additional_notes_html = policyTranslationFields.additional_notes_html.trim()
  if (!Object.keys(values).length) return
  await dashboardApi(`/api/editor/sites/${siteId}/localization/booking_policy/${policyId}/${encodeURIComponent(translationLocale.value)}`, {
    method: 'PUT', body: { values }, validate: isRecord,
  })
}

void loadTranslationLocales()

// ── Availability ────────────────────────────────────────
const availabilityDate = ref(new Date().toISOString().slice(0, 10))
const availabilityLoading = ref(false)
const availabilitySlots = ref<SlotAvailability[]>([])
const availabilityTimezone = ref<string | null>(null)
const existingOverrides = ref<SlotOverride[]>([])
const slotCapacityOverrides = reactive<Record<string, number | null>>({})
const savingOverride = ref<string | null>(null)

const isAvailabilityResponse = (value: unknown): value is { timezone: string; dates: Array<{ date: string; slots: SlotAvailability[] }> } =>
  isRecord(value)
  && typeof value.timezone === 'string'
  && Array.isArray(value.dates)
  && value.dates.every(day => isRecord(day) && typeof day.date === 'string' && Array.isArray(day.slots) && day.slots.every(isRecord))
const isOverridesResponse = (value: unknown): value is { overrides: SlotOverride[] } =>
  isRecord(value) && Array.isArray(value.overrides) && value.overrides.every(override => isRecord(override) && typeof override.id === 'string')

function clearCapacityOverrides() {
  for (const key of Object.keys(slotCapacityOverrides)) Reflect.deleteProperty(slotCapacityOverrides, key)
}

async function loadAvailability() {
  availabilityLoading.value = true
  try {
    const [availability, overrides] = await Promise.all([
      dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId.value}/availability`, {
        query: { date: availabilityDate.value }, validate: isAvailabilityResponse,
      }),
      dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId.value}/slot-overrides`, {
        validate: isOverridesResponse,
      }),
    ])
    availabilityTimezone.value = availability.timezone
    availabilitySlots.value = availability.dates[0]?.slots ?? []
    existingOverrides.value = overrides.overrides ?? []
    clearCapacityOverrides()
  } catch {
    toast.add({ description: 'Failed to load availability.', color: 'error' })
  } finally {
    availabilityLoading.value = false
  }
}

// Availability is fetched when its leaf opens, not on every experience view.
watch(editorKey, key => {
  if (key === 'availability') void loadAvailability()
}, { immediate: true })

async function toggleSlotOverride(slot: SlotAvailability) {
  savingOverride.value = slot.time_slot
  try {
    const capacity = slotCapacityOverrides[slot.time_slot]
    await dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId.value}/slot-overrides`, {
      method: 'POST',
      body: {
        override_date: availabilityDate.value,
        time_slot: slot.time_slot,
        status: slot.is_closed ? 'open' : 'closed',
        capacity_override: capacity ?? null,
      },
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    await loadAvailability()
  } catch {
    toast.add({ description: 'Failed to update slot availability.', color: 'error' })
  } finally {
    savingOverride.value = null
  }
}

async function deleteOverride(override: SlotOverride) {
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId.value}/slot-overrides/${override.id}`, {
      method: 'DELETE',
      validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
    })
    await loadAvailability()
  } catch {
    toast.add({ description: 'Failed to delete override.', color: 'error' })
  }
}

// A save rewrites the record the hub summaries read from.
watch(() => editor.saving.value, (isSaving, wasSaving) => {
  if (wasSaving && !isSaving) void refresh()
})

useSeoMeta({ title: () => `${editor.form.title || 'Experience'} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })
</script>
