<template>
  <div class="flex min-h-0 flex-col gap-6 py-6" :data-onboarding-step="step.id" data-onboarding-hydrated="true">
    <div class="flex flex-col gap-3">
      <h1 class="text-2xl font-bold leading-snug text-highlighted">{{ step.title(state) }}</h1>
      <p v-if="step.lede" class="text-[15px] leading-relaxed text-toned">{{ step.lede(state) }}</p>
    </div>

    <OnboardingChoiceGrid
      v-if="step.id === 'type'"
      :choices="VERTICAL_CHOICES"
      :model-value="state.vertical"
      @update:model-value="choose(() => { state.vertical = $event as SiteVertical })"
    />

    <OnboardingChoiceRows
      v-else-if="step.id === 'source'"
      :choices="SOURCE_CHOICES"
      :model-value="state.source"
      @update:model-value="choose(() => { state.source = $event as 'google_places' | 'manual' })"
    />

    <UFormField v-else-if="step.id === 'name'" label="Business name">
      <UInput v-model="state.details.name" class="w-full" placeholder="Your business name" autofocus />
    </UFormField>

    <UFormField v-else-if="step.id === 'maps'" label="Google Maps link">
      <UInput v-model="state.mapsUrl" class="w-full" placeholder="maps.app.goo.gl/…" autofocus />
    </UFormField>

    <div v-else-if="step.id === 'confirm' && state.place" class="rounded-xl border border-default p-4">
      <p class="font-semibold text-highlighted">{{ state.place.name }}</p>
      <p class="mt-1 text-sm text-toned">{{ state.place.address }}</p>
      <p v-if="state.place.phone" class="mt-1 text-sm text-toned">{{ state.place.phone }}</p>
      <a
        v-if="state.place.mapsUrl"
        :href="state.place.mapsUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 inline-block text-sm underline"
      >View on Google Maps</a>
    </div>

    <IntakeDetailsCard
      v-else-if="step.id === 'location'"
      v-model:form="detailsForm"
      section="location"
      :require-location-basics="true"
    />

    <IntakeDetailsCard
      v-else-if="step.id === 'contact'"
      v-model:form="detailsForm"
      section="contact"
      :require-location-basics="true"
    />

    <LocationHoursCard v-else-if="step.id === 'hours'" v-model:form="state.hours" />

    <OnboardingProductsCard v-else-if="step.id === 'products'" />

    <DraftBrandCard v-else-if="step.id === 'look'" v-model:form="state.brand" section="look" :draft-id="state.draftId" />

    <OnboardingReviewCard v-else-if="step.id === 'review'" />
  </div>
</template>

<script setup lang="ts">
import IntakeDetailsCard from '~/lib/components/workspace/onboarding/IntakeDetailsCard.vue'
import DraftBrandCard from '~/lib/components/workspace/onboarding/DraftBrandCard.vue'
import LocationHoursCard from '~/lib/components/workspace/location/LocationHoursCard.vue'
import OnboardingChoiceGrid from '~/lib/components/workspace/onboarding/OnboardingChoiceGrid.vue'
import OnboardingChoiceRows from '~/lib/components/workspace/onboarding/OnboardingChoiceRows.vue'
import OnboardingProductsCard from '~/lib/components/workspace/onboarding/OnboardingProductsCard.vue'
import OnboardingReviewCard from '~/lib/components/workspace/onboarding/OnboardingReviewCard.vue'
import { useOnboardingState, type OnboardingStep } from '~/composables/useOnboardingFlow'
import { singleTimezoneForCountry } from '~/utils/timezone'
import type { SiteVertical } from '~/utils/vertical-copy'

/**
 * One step of the flow, rendered. Both shells — the routed new-site flow and
 * the add-location column inside an existing site — draw their current step
 * with this, so a step looks and behaves the same in either.
 *
 * The screen owns the controls and nothing else: the shell owns the footer,
 * the server calls and where "next" goes.
 */
const props = defineProps<{ step: OnboardingStep }>()
const emit = defineEmits<{ advance: [] }>()

const state = useOnboardingState()

const VERTICAL_CHOICES = [
  { value: 'restaurant', label: 'Restaurant, café or bar', icon: 'i-lucide-utensils' },
  { value: 'experience', label: 'Experience or activity', icon: 'i-lucide-ticket' },
  { value: 'service', label: 'Professional services', icon: 'i-lucide-briefcase' },
]

const SOURCE_CHOICES = [
  { value: 'google_places', label: 'Import from Google Maps', description: 'Your address, hours, phone and reviews come with the listing.', icon: 'i-lucide-globe' },
  { value: 'manual', label: 'Enter the details myself', description: 'Type your address and hours — about two minutes.', icon: 'i-lucide-pencil' },
]

// A single-choice step has nothing left to confirm once the card is pressed, so
// the press is the answer and the flow moves on.
function choose(answer: () => void) {
  answer()
  emit('advance')
}

// IntakeDetailsCard owns its own form object; the flow's details are that
// object, so the card edits the answers directly rather than a copy that has to
// be synced back.
const detailsForm = computed({
  get: () => state.value.details,
  set: (value) => { state.value.details = value },
})

// The owner named their country on the location step. When that country has
// exactly one IANA zone, that is their timezone; when it has several, the field
// stays empty and they search the list. Never overwrite a zone the owner or the
// Google import already set.
watch(() => props.step.id, (id) => {
  if (id !== 'hours' || state.value.hours.timezone) return
  const zone = singleTimezoneForCountry(state.value.details.country)
  if (zone) state.value.hours.timezone = zone
}, { immediate: true })
</script>
