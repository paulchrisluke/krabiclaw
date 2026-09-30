<template>
  <div
    v-if="visible"
    role="dialog"
    aria-modal="true"
    :aria-label="announcement?.headline"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    @click.self="dismiss"
  >
    <div class="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
      <button
        type="button"
        class="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-white/80 text-gray-500 hover:bg-white hover:text-gray-800"
        aria-label="Close"
        @click="dismiss"
      >
        <svg class="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
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
</template>

<script setup lang="ts">
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

if (organizationId) {
  const { data } = await useFetch('/api/public/config', {
    key: `public-announcement:${organizationId}`,
    server: true,
    // The scalar site config is used elsewhere; this component reads only its announcement.
    transform: (payload: unknown) => (isRecord(payload) && isPublicAnnouncement(payload.announcement) ? payload.announcement : null),
    getCachedData(key) {
      return useNuxtApp().payload.data[key] as PublicAnnouncement | null | undefined
    },
  })
  announcement.value = data.value ?? null
}

const storageKey = computed(() => announcement.value
  ? `announcement-dismissed:${organizationId}:${announcement.value.headline}:${announcement.value.description ?? ''}`
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
