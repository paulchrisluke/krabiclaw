<template>
  <footer class="bg-inverted text-inverted">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-8">

      <!-- Top section: brand + locations grid -->
      <div class="grid gap-16 border-b border-inverted/10 pb-14 lg:grid-cols-[1fr_1.4fr]">
        <!-- Brand column -->
        <div>
          <NuxtLink to="/" class="block no-underline leading-none">
            <div v-if="logoUrl" class="size-14 rounded-full overflow-hidden">
              <img :src="logoUrl" :alt="restaurantName" class="h-full w-full object-cover" />
            </div>
            <div v-else class="flex size-14 items-center justify-center rounded-full bg-inverted/10 text-inverted font-bold text-2xl">
              {{ restaurantName.charAt(0).toUpperCase() }}
            </div>
          </NuxtLink>
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-inverted/60">
            {{ tagline }}
          </p>

          <!-- Social icons -->
          <div class="mt-6 flex gap-3">
            <a
              v-for="social in activeSocials"
              :key="social.name"
              :href="social.url"
              :aria-label="social.name"
              target="_blank"
              rel="noopener noreferrer"
              class="flex size-9 items-center justify-center rounded-full border border-inverted/15 text-inverted transition hover:border-inverted/50"
            >
              <svg v-if="social.name === 'Facebook'" viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              <svg v-else-if="social.name === 'Instagram'" viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M12 0C8.74 0 8.333.014 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.014 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.014-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.014 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227a3.81 3.81 0 01-.899 1.382 3.744 3.744 0 01-1.38.896c-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421a3.716 3.716 0 01-1.379-.899 3.644 3.644 0 01-.9-1.38c-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm7.846-10.405a1.441 1.441 0 11-2.883 0 1.441 1.441 0 012.883 0z"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor" class="size-4"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
            </a>
          </div>
        </div>

        <!-- Locations grid -->
        <div
          v-if="locationsError"
          class="rounded-xl border border-inverted/10 bg-inverted/5 p-6 text-sm text-inverted/60"
          role="status"
          aria-live="polite"
        >
          {{ t('saya.footer.locations_error') }}
        </div>
        <div
          v-else
          :class="[
            'grid gap-8',
            locations.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          ]"
        >
          <div v-for="loc in locations" :key="loc.id">
            <div class="saya-display text-xl text-inverted leading-none">{{ loc.title }}</div>
            <div class="mt-2 text-sm leading-relaxed text-inverted/60">{{ formatLocAddress(loc) }}</div>
            <div v-if="loc.phone" class="mt-1 text-sm text-inverted/60">{{ loc.phone }}</div>
            <div v-if="loc.hoursToday" class="mt-2 text-xs text-inverted/40">{{ loc.hoursToday }}</div>
            <NuxtLink
              :to="`/locations/${loc.slug}`"
              class="mt-3 inline-block border-b border-inverted pb-0.5 text-xs uppercase tracking-widest text-inverted transition hover:opacity-70"
            >
              {{ t('saya.footer.visit_page') }}
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Navigation links -->
      <div class="grid gap-8 border-b border-inverted/10 py-12 sm:grid-cols-3">
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_experience') }}</h4>
          <ul class="space-y-3 text-sm">
            <li v-if="hasMenu"><NuxtLink to="/menu" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.menu') }}</NuxtLink></li>
            <li v-if="hasExperiences"><NuxtLink to="/experiences" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.experiences') }}</NuxtLink></li>
            <li v-if="!isExperienceSite"><NuxtLink to="/reservations" class="text-inverted/60 no-underline transition hover:text-inverted">{{ copy.reservationPageKicker }}</NuxtLink></li>
            <li v-if="!isExperienceSite"><NuxtLink to="/photos" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.gallery') }}</NuxtLink></li>
            <li><NuxtLink to="/about" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.our_story') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_discover') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/blog" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.blog') }}</NuxtLink></li>
            <li><NuxtLink to="/reviews" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.reviews') }}</NuxtLink></li>
            <li><NuxtLink to="/posts" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.latest_updates') }}</NuxtLink></li>
            <li><NuxtLink to="/qa" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.qa') }}</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="saya-eyebrow mb-5 text-inverted/50">{{ t('saya.footer.heading_connect') }}</h4>
          <ul class="space-y-3 text-sm">
            <li><NuxtLink to="/locations" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.all_locations') }}</NuxtLink></li>
            <li><NuxtLink to="/contact" class="text-inverted/60 no-underline transition hover:text-inverted">{{ t('saya.footer.contact_us') }}</NuxtLink></li>
          </ul>
        </div>
      </div>

      <!-- Delivery partners row — only rendered when at least one link is configured AND not an experiences site -->
      <div v-if="orderLinks.length && !isExperienceSite" class="flex flex-wrap items-center gap-8 border-b border-inverted/10 py-10">
        <span class="saya-eyebrow text-inverted/50">{{ t('saya.footer.order_online') }}</span>
        <a
          v-for="link in orderLinks"
          :key="link.label"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="saya-display text-lg saya-italic text-inverted/60 transition hover:text-inverted"
        >
          {{ link.label }}
        </a>
      </div>

      <!-- Legal bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-6 text-xs text-inverted/70">
        <div>© {{ year }} {{ restaurantName }}</div>
        <div class="flex items-center gap-6">
          <SayaDropdown :items="languageItems" panel-class="saya-theme" placement="top">
            <template #default="{ open, toggle, triggerKeydown }">
              <button
                type="button"
                class="flex items-center gap-1.5 text-xs text-inverted/70 transition hover:text-inverted"
                aria-haspopup="menu"
                :aria-expanded="open"
                @click="toggle"
                @keydown="triggerKeydown"
              >
                <span>{{ getCurrentLocaleFlag() }}</span>
                <span class="hidden sm:inline">{{ currentLocale }}</span>
              </button>
            </template>
          </SayaDropdown>
          <button
            type="button"
            class="flex items-center justify-center text-inverted/70 transition hover:text-inverted"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          >
            <svg v-if="isDark" viewBox="0 0 20 20" fill="currentColor" class="size-4"><path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2ZM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15ZM10 7a3 3 0 100 6 3 3 0 000-6ZM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06ZM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10ZM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06Z"/></svg>
            <svg v-else viewBox="0 0 20 20" fill="currentColor" class="size-4"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
          </button>
          <NuxtLink to="/privacy" class="transition hover:text-inverted">{{ t('legal.privacy') }}</NuxtLink>
          <NuxtLink to="/terms" class="transition hover:text-inverted">{{ t('legal.terms') }}</NuxtLink>
          <a
            v-if="showBrandingCredit"
            href="https://krabiclaw.com"
            target="_blank"
            rel="noopener noreferrer"
            class="transition hover:text-inverted/70"
          >
            {{ t('saya.footer.powered_by') }}, {{ copy.poweredByTagline }}
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { DEFAULT_BUSINESS_NAME } from '~/config/constants'
import { getTodayGoogleHours, getActiveSpecialClosure } from '~/utils/formatters'
import { getVerticalCopy } from '~/utils/vertical-copy'

interface Site {
  brand_name?: string | null
  logo_url?: string | null
  plan?: string | null
  vertical?: string | null
  config?: { phone?: string | null } | null
}

interface I18nComposable {
  locale: Ref<string>
  locales: Ref<Array<{ code: string; name: string }>>
  setLocale: (_code: string) => void
  t: (_key: string, _named?: Record<string, unknown>) => string
}

interface PublicLocation {
  id: string
  slug: string
  title: string
  address?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
  } | string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  googleBusinessHours?: ApiValue
  special_hours?: ApiValue
  timezone?: string | null
  is_primary?: boolean
  grab_url?: string | null
  uber_eats_url?: string | null
  foodpanda_url?: string | null
}

// Data comes from layouts/saya.vue, which already owns the single shared
// bootstrap/tenant-site fetch — footer is presentation-only, not a fetcher.
const props = defineProps<{
  site: Site | null
  isPlatform: boolean
  locations: PublicLocation[]
  locales: { code: string; label: string; is_source: boolean }[]
  error: unknown
  config: Record<string, string>
  menu: ApiRecord | null
  hasExperiences: boolean
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleColorMode() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
const { locale } = useI18n()
const copy = computed(() => getVerticalCopy(props.site?.vertical, locale.value))
const isExperienceSite = computed(() => props.site?.vertical === 'experience')

const i18n = useI18n() as ApiValue as I18nComposable
const { t } = i18n
const currentLocale = computed(() => i18n.locale.value)
const getLocaleFlag = (code: string) =>
  ({ en: '🇺🇸', th: '🇹🇭', fr: '🇫🇷', ja: '🇯🇵', 'zh-CN': '🇨🇳', ko: '🇰🇷', es: '🇪🇸', de: '🇩🇪', it: '🇮🇹', ar: '🇸🇦' }[code] ?? '🌐')
const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const availableLocales = computed(() =>
  props.locales.length
    ? props.locales.map(l => ({ code: l.code, name: l.label || l.code }))
    : (i18n.locales?.value ?? []).map((l: { code: string; name: string }) => ({ code: l.code, name: l.name }))
)

const languageItems = computed(() =>
  availableLocales.value.map((l: { code: string; name: string }) => ({
    label: `${getLocaleFlag(l.code)} ${l.name}`,
    onSelect: () => i18n.setLocale(l.code)
  }))
)
const locationsError = computed(() => props.error)

const hasMenu = computed(() => (props.menu?.items?.length ?? 0) > 0)
const year = new Date().getFullYear()
const logoUrl = computed(() => props.site?.logo_url || null)
const restaurantName = computed(() => props.site?.brand_name?.trim() || DEFAULT_BUSINESS_NAME)
const tagline = computed(() => props.config?.footer_tagline || '')
const sitePlan = computed(() => props.site?.plan)
const showBrandingCredit = computed(() => !props.isPlatform && sitePlan.value === 'free')

const primaryLocation = computed<PublicLocation | null>(() =>
  props.locations.find((l: PublicLocation) => l.is_primary) ?? props.locations[0] ?? null
)

interface OrderLink { label: string; url: string }
const orderLinks = computed<OrderLink[]>(() => {
  const loc = primaryLocation.value
  if (!loc) return []
  return [
    { label: 'Grab', url: loc.grab_url ?? '' },
    { label: 'Uber Eats', url: loc.uber_eats_url ?? '' },
    { label: 'FoodPanda', url: loc.foodpanda_url ?? '' },
  ].filter(o => o.url)
})

function safeHttpUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null

  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

const facebookUrl = computed(() => safeHttpUrl(props.config?.social_facebook) || '')
const instagramUrl = computed(() => safeHttpUrl(props.config?.social_instagram) || '')
const tiktokUrl = computed(() => safeHttpUrl(props.config?.social_tiktok) || '')

interface SocialLink {
  name: string
  url: string | null
}

const allSocials = computed<SocialLink[]>(() => [
  { name: 'Facebook', url: facebookUrl.value },
  { name: 'Instagram', url: instagramUrl.value },
  { name: 'Tiktok', url: tiktokUrl.value }
])
const activeSocials = computed(() =>
  allSocials.value.filter((s: SocialLink): s is { name: string; url: string } => typeof s.url === 'string' && s.url.length > 0)
)
const locations = computed(() =>
  props.locations.map((loc: PublicLocation) => {
    let phone = loc.phone
    // Fallback if placeholder-like
    if (!phone || phone.includes('example.com')) {
      phone = props.site?.config?.phone || null
    }
    const closure = getActiveSpecialClosure(loc.special_hours, loc.timezone)
    return {
      ...loc,
      phone,
      hoursToday: closure ? 'Temporarily closed' : (loc.googleBusinessHours ? getTodayGoogleHours(loc.googleBusinessHours) : null)
    }
  })
)

function formatLocAddress(loc: PublicLocation) {
  if (!loc.address) return ''
  let addr: PublicLocation['address'] = loc.address
  if (typeof addr === 'string') {
    try {
      const parsed = JSON.parse(addr) as PublicLocation['address']
      if (parsed && typeof parsed === 'object') addr = parsed
      else return addr
    } catch {
      return addr
    }
  }
  const normalizedAddr = typeof addr === 'object' && addr !== null ? addr : null
  const line1 = Array.isArray(normalizedAddr?.addressLines) ? normalizedAddr?.addressLines?.[0] : ''
  return [line1, normalizedAddr?.locality, normalizedAddr?.administrativeArea].filter(Boolean).join(', ')
}
</script>
