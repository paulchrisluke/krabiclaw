<template>
  <div class="flex min-h-0 flex-col bg-elevated">
    <div
      v-if="!homeOnly"
      class="flex shrink-0 items-center gap-2.5 border-b border-default bg-default px-[18px] py-3"
    >
      <div class="flex gap-0.5 rounded-[11px] border border-default bg-muted p-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :disabled="!tab.enabled"
          :class="[
            'rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
            selectedPage === tab.id
              ? 'bg-default text-highlighted shadow-sm'
              : 'bg-transparent text-muted hover:text-highlighted',
            !tab.enabled && 'cursor-not-allowed opacity-35',
          ]"
          @click="tab.enabled && $emit('select-page', tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <button
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        class="inline-flex items-center gap-1.5 rounded-[10px] border border-default bg-default px-3 py-2 text-[12.5px] font-semibold text-highlighted shadow-sm transition-colors hover:border-default/80"
        @click="cycleLocation"
      >
        <UIcon name="i-lucide-map-pin" class="size-3.5 text-primary" />
        {{ selectedLocationLabel }}
      </button>

      <div class="ml-auto flex items-center gap-2">
        <UBadge
          v-if="siteStatus === 'live'"
          color="success"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Live
        </UBadge>
        <UBadge
          v-else-if="siteStatus === 'ready'"
          color="primary"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Ready to launch
        </UBadge>
        <UBadge
          v-else-if="iframeSrc"
          color="warning"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Building
        </UBadge>

        <UButton
          v-if="iframeSrc"
          :href="iframeSrc"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Open preview"
        />
      </div>
    </div>

    <div v-if="!iframeSrc && placeholderState === 'building'" class="flex flex-1 items-center justify-center p-5">
      <div class="w-full max-w-[430px] overflow-hidden rounded-2xl border border-default bg-default shadow-sm">
        <div class="relative min-h-52 overflow-hidden" :style="{ backgroundColor: previewBrandColor }">
          <img
            :src="demoPreviewImage"
            alt=""
            class="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity"
          >
          <div class="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/65" />
          <div class="relative flex min-h-52 flex-col justify-between p-5 text-white">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <div class="flex size-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">
                  {{ previewInitials }}
                </div>
                <p class="max-w-[14rem] truncate text-sm font-bold">{{ previewName }}</p>
              </div>
              <UButton color="neutral" variant="soft" size="xs">
                {{ demoPrimaryAction }}
              </UButton>
            </div>
            <div class="space-y-3">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">{{ demoEyebrow }}</p>
              <h2 class="text-2xl font-extrabold leading-tight">{{ demoHeadline }}</h2>
              <p class="max-w-[28ch] text-sm leading-relaxed text-white/85">{{ demoDescription }}</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-5">
          <div class="grid gap-2">
            <div
              v-for="item in demoSections"
              :key="item.title"
              class="rounded-xl bg-muted px-4 py-3"
            >
              <p class="text-[12px] font-bold text-highlighted">{{ item.title }}</p>
              <p class="mt-0.5 text-[11.5px] leading-5 text-muted">{{ item.body }}</p>
            </div>
          </div>
          <div class="grid gap-2 border-t border-default pt-4 text-[12px] text-muted">
            <p v-if="previewDetails?.address || previewDetails?.city" class="flex items-center gap-2">
              <UIcon name="i-lucide-map-pin" class="size-3.5 text-primary" />
              {{ previewAddress }}
            </p>
            <p v-if="previewDetails?.phone" class="flex items-center gap-2">
              <UIcon name="i-lucide-phone" class="size-3.5 text-primary" />
              {{ previewDetails.phone }}
            </p>
            <p v-if="previewDetails?.openingHours" class="flex items-center gap-2">
              <UIcon name="i-lucide-clock-3" class="size-3.5 text-primary" />
              {{ previewHoursSummary }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!iframeSrc" class="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center text-muted">
      <img
        src="/krabiclaw-login-mascot.png"
        alt=""
        class="size-32 rounded-[28px] object-contain"
      >
      <div>
        <p class="text-[15px] font-semibold text-highlighted">Let's give your business a proper home.</p>
        <p class="mt-2 max-w-[30ch] text-[12.5px] leading-relaxed">
          Pick the kind of site you need and the homepage will start taking shape here.
        </p>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-auto p-5">
      <SitePreviewFrame :iframe-src="iframeSrc" :display-url="displayUrl" :chrome="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildDisplayUrl, getEditablePages, resolvePreviewPath } from '~/config/content-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

const props = withDefaults(defineProps<{
  iframeSrc: string
  siteLocations: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
  selectedLocationId: string | null
  selectedPage: string
  siteStatus: 'setup' | 'progress' | 'ready' | 'live'
  siteDomain?: string
  vertical?: SiteVertical
  homeOnly?: boolean
  placeholderState?: 'empty' | 'building'
  previewDetails?: {
    name: string
    city: string
    address: string
    phone: string
    currency: string
    timezone: string
    openingHours: string
    brandColor: string
    logoNote: string
    heroPhotoNote: string
  }
}>(), {
  vertical: 'restaurant',
  homeOnly: false,
  placeholderState: 'empty',
})

const emit = defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()

const secondaryTab = computed(() => {
  if (props.vertical === 'professional_service') {
    const offeringsPath = resolvePublicTemplate({ vertical: props.vertical }).serviceRoutes.offeringsIndex
    if (!offeringsPath) return null
    return { id: offeringsPath.replace(/^\//, ''), label: 'Services', enabled: !!props.iframeSrc, locationScoped: false }
  }
  const template = resolvePublicTemplate({ vertical: props.vertical })
  const match = getEditablePages(props.vertical, template.slug).find(page => page.id === 'menu' || page.id === 'experiences')
  if (!match) return null
  const locationScoped = match.scope === 'location'
  const enabled = !!props.iframeSrc && (!locationScoped || props.siteLocations.length > 0)
  return { id: match.id, label: match.label, enabled, locationScoped }
})

const tabs = computed(() => {
  const list = [{ id: 'home', label: 'Home', enabled: !!props.iframeSrc, locationScoped: false }]
  if (props.homeOnly) return list
  if (secondaryTab.value) list.push(secondaryTab.value)
  list.push({ id: 'about', label: 'About', enabled: !!props.iframeSrc, locationScoped: false })
  list.push({ id: 'contact', label: 'Contact', enabled: !!props.iframeSrc, locationScoped: false })
  return list
})

const currentTabIsLocationScoped = computed(() => tabs.value.find(tab => tab.id === props.selectedPage)?.locationScoped === true)
const demoContent = computed(() => {
  if (props.vertical === 'professional_service') {
    return {
      name: 'North Carolina Legal Services',
      image: '/templates/blawby-preview.jpg',
      eyebrow: 'Professional services',
      headline: 'Clear guidance when clients need it most',
      description: 'A focused homepage for consultations, service areas, and client trust.',
      action: 'Book a consultation',
      sections: [
        { title: 'Services', body: 'Family law, estate planning, and client support pathways.' },
        { title: 'Consultation', body: 'Make the next step obvious and low-friction.' },
        { title: 'Contact', body: 'Phone, office details, and intake routing stay visible.' },
      ],
    }
  }
  if (props.vertical === 'experience') {
    return {
      name: 'Pottery House Krabi',
      image: '/templates/saya-preview.jpg',
      eyebrow: 'Experience studio',
      headline: 'Hands-on classes guests can book with confidence',
      description: 'A warm homepage for workshops, location details, photos, and reviews.',
      action: 'Book a class',
      sections: [
        { title: 'Experiences', body: 'Featured classes and sessions guests can reserve.' },
        { title: 'Visit details', body: 'Address, hours, and what to expect before arriving.' },
        { title: 'Reviews', body: 'Social proof from guests and students.' },
      ],
    }
  }
  return {
    name: 'Demo Restaurant',
    image: '/templates/saya-preview.jpg',
    eyebrow: 'Restaurant',
    headline: 'A homepage that makes the first visit easy',
    description: 'Menu highlights, reservations, hours, and contact details come together here.',
    action: 'Reserve',
    sections: [
      { title: 'Menu', body: 'Featured dishes and house recommendations.' },
      { title: 'Reservations', body: 'A clear path for guests to book a table.' },
      { title: 'Contact', body: 'Address, phone, and opening hours in one place.' },
    ],
  }
})
const previewName = computed(() => props.previewDetails?.name.trim() || demoContent.value.name)
const previewBrandColor = computed(() => props.previewDetails?.brandColor || '#1F2547')
const previewInitials = computed(() => previewName.value.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'KC')
const demoPreviewImage = computed(() => demoContent.value.image)
const demoEyebrow = computed(() => demoContent.value.eyebrow)
const demoHeadline = computed(() => props.previewDetails?.heroPhotoNote
  ? `${previewName.value} is taking shape`
  : demoContent.value.headline
)
const demoDescription = computed(() => {
  const details = props.previewDetails
  if (details?.city && details?.phone) return `${previewName.value} in ${details.city} now has the first guest-facing details in place.`
  if (details?.city) return `${previewName.value} is ready to show guests where to find you in ${details.city}.`
  return demoContent.value.description
})
const demoPrimaryAction = computed(() => demoContent.value.action)
const demoSections = computed(() => {
  const sections = [...demoContent.value.sections]
  if (props.previewDetails?.currency) {
    sections[0] = { ...sections[0]!, body: `${sections[0]!.body} Pricing will display in ${props.previewDetails.currency}.` }
  }
  return sections
})
const previewAddress = computed(() => [props.previewDetails?.address, props.previewDetails?.city].filter(Boolean).join(', '))
const previewHoursSummary = computed(() => props.previewDetails?.openingHours.split('\n').find(Boolean) ?? '')

const displayUrl = computed(() => {
  const template = resolvePublicTemplate({ vertical: props.vertical })
  if (props.vertical === 'professional_service' && props.selectedPage === secondaryTab.value?.id) {
    return buildDisplayUrl(props.siteDomain ?? '', template.serviceRoutes.offeringsIndex ?? '/')
  }
  const page = getEditablePages(props.vertical, template.slug).find(p => p.id === props.selectedPage)
  const path = page?.scope === 'location' && selectedLocation.value
    ? resolvePreviewPath(props.selectedPage, { locationSlug: selectedLocation.value.slug })
    : page?.path ?? '/'
  return buildDisplayUrl(props.siteDomain ?? '', path)
})

const selectedLocation = computed(() =>
  props.siteLocations.find(l => l.id === props.selectedLocationId) ?? props.siteLocations[0] ?? null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title ?? 'All locations')

const cycleLocation = () => {
  if (!props.siteLocations.length) return
  const idx = props.siteLocations.findIndex(l => l.id === props.selectedLocationId)
  const next = props.siteLocations[(idx + 1) % props.siteLocations.length]
  if (next) emit('select-location', next.id)
}
</script>
