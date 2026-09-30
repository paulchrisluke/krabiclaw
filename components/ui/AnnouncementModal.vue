<template>
  <template v-if="visible">
    <Transition
      appear
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div class="fixed inset-0 z-[60] bg-black/50" @click="dismiss" />
    </Transition>
    <Transition
      appear
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="announcement?.headline"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
      >
        <div class="relative w-full max-w-sm">
          <button
            type="button"
            class="absolute -right-3 -top-3 z-10 flex size-8 items-center justify-center rounded-full bg-white text-gray-500 shadow-lg ring-1 ring-black/5 hover:bg-gray-50 hover:text-gray-800"
            aria-label="Close"
            @click="dismiss"
          >
            <svg class="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
          <div class="overflow-hidden rounded-2xl bg-white shadow-xl">
            <img
              v-if="announcement?.image_url"
              :src="announcement.image_url"
              alt=""
              class="h-48 w-full object-cover"
            >
            <div class="space-y-3 p-6">
              <h2 class="text-lg font-semibold text-gray-900">{{ announcement?.headline }}</h2>
              <p v-if="announcement?.description" class="text-sm leading-6 text-gray-600">{{ announcement.description }}</p>
              <a
                v-if="announcement?.cta_label && announcement?.cta_url"
                :href="announcement.cta_url"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:opacity-90"
                @click="trackCtaClick"
              >
                {{ announcement.cta_label }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </template>
</template>

<script setup lang="ts">
import { applicationFetch } from '~/composables/dashboardFetch'

interface PublicAnnouncement {
  headline: string
  description: string | null
  cta_label: string | null
  cta_url: string | null
  dismissible: boolean
  enabled: boolean
  image_url: string | null
}

const isPublicAnnouncement = (value: unknown): value is PublicAnnouncement =>
  isRecord(value) && typeof value.headline === 'string'
  && (value.description === null || typeof value.description === 'string')
  && (value.cta_label === null || typeof value.cta_label === 'string')
  && (value.cta_url === null || typeof value.cta_url === 'string')
  && typeof value.dismissible === 'boolean'
  && (value.image_url === null || typeof value.image_url === 'string')

const { organizationId } = useTenantOrganization()
const route = useRoute()
const { trackAnnouncementView, trackAnnouncementCtaClick } = useOrganizationConversionTracking()

const dismissed = ref(false)
const announcement = ref<PublicAnnouncement | null>(null)

// The dashboard, auth and onboarding surfaces render inside this same app shell but are never the
// public site a visitor reads — mounting globally in app.vue must not make this component the
// thing that can break them, so it fetches nothing there.
const isPublicSurface = !route.path.startsWith('/dashboard') && !route.path.startsWith('/api')

if (organizationId && isPublicSurface) {
  // Nuxt's own useFetch dispatches its SSR request through Nitro's internal self-fetch, which
  // does not carry the tenant's Host header — applicationFetch is this codebase's established
  // fix (see composables/dashboardFetch.ts): an explicit baseURL from the real request URL.
  // useAsyncData never throws to the caller; it captures a failed request into its own `error`
  // ref instead, which is the state this reads rather than masking failure with a try/catch.
  const { data, error } = await useAsyncData(
    `public-announcement:${organizationId}`,
    () => applicationFetch<{ announcement: unknown }>('/api/public/config', {
      validate: (value): value is { announcement: unknown } => isRecord(value),
    }),
    { server: true },
  )
  if (error.value) console.error('[announcement-modal] failed to load public config', error.value)
  announcement.value = isPublicAnnouncement(data.value?.announcement) ? data.value.announcement : null
}

const storageKey = computed(() => announcement.value
  ? `announcement-dismissed:${organizationId}:${JSON.stringify(announcement.value)}`
  : null)

const visible = computed(() => !!announcement.value && !dismissed.value)

function dismiss() {
  if (announcement.value?.dismissible && storageKey.value) {
    try { localStorage.setItem(storageKey.value, '1') } catch { /* private browsing or blocked storage: closes for this view only */ }
  }
  dismissed.value = true
}

function trackCtaClick() {
  trackAnnouncementCtaClick(route.path)
}

onMounted(() => {
  if (!announcement.value || !storageKey.value) return
  try {
    if (localStorage.getItem(storageKey.value) === '1') { dismissed.value = true; return }
  } catch { /* private browsing or blocked storage: never previously dismissed */ }
  trackAnnouncementView(route.path)
})
</script>
