<template>
  <UDashboardPanel id="site-settings">
    <template #header>
      <UDashboardNavbar title="Site Settings">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #right>
          <UButton icon="i-lucide-check" :loading="saving" @click="saveSiteSettings">Save changes</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4">
        <USkeleton v-for="i in 4" :key="i" class="h-48 rounded-xl" />
      </div>
      <UAlert v-else-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />
      <div v-else class="mx-auto max-w-5xl space-y-6">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Brand</h2>
              <p class="mt-1 text-sm text-muted">Identity shared across the entire site.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Brand name"><UInput v-model="form.brand_name" /></UFormField>
            <UFormField label="Contact email"><UInput v-model="form.contact_email" type="email" /></UFormField>
            <UFormField label="Logo URL"><UInput v-model="form.logo_url" type="url" /></UFormField>
            <UFormField label="Brand color"><UInput v-model="form.brand_color" placeholder="#0f766e" /></UFormField>
            <UFormField label="Brand description" class="sm:col-span-2"><UTextarea v-model="form.brand_description" :rows="4" /></UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Navigation and Footer</h2>
              <p class="mt-1 text-sm text-muted">Site-wide URL, social, and footer defaults.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="URL structure">
              <USelect v-model="form.url_structure" :items="URL_STRUCTURE_OPTIONS" value-key="value" label-key="label" />
            </UFormField>
            <UFormField label="Footer tagline"><UInput v-model="form.footer_tagline" /></UFormField>
            <UFormField label="Facebook URL"><UInput v-model="form.social_facebook" type="url" /></UFormField>
            <UFormField label="Instagram URL"><UInput v-model="form.social_instagram" type="url" /></UFormField>
            <UFormField label="TikTok URL"><UInput v-model="form.social_tiktok" type="url" /></UFormField>
            <UFormField label="Default currency">
              <USelect v-model="form.default_currency" :items="CURRENCY_OPTIONS" value-key="value" label-key="label" />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">SEO and Analytics</h2>
              <p class="mt-1 text-sm text-muted">Defaults applied across site pages unless a page overrides them.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="SEO title"><UInput v-model="form.seo_title" /></UFormField>
            <UFormField label="Canonical URL"><UInput v-model="form.canonical_url" type="url" /></UFormField>
            <UFormField label="SEO description" class="sm:col-span-2"><UTextarea v-model="form.seo_description" :rows="3" /></UFormField>
            <UFormField label="Robots"><UInput v-model="form.robots" placeholder="index,follow" /></UFormField>
            <UFormField label="Google Analytics measurement ID"><UInput v-model="form.google_analytics_measurement_id" placeholder="G-XXXXXXXXXX" /></UFormField>
            <UFormField label="Google site verification"><UInput v-model="form.google_site_verification" /></UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Features</h2>
              <p class="mt-1 text-sm text-muted">Turn product features on or off for this site. Unchecked here won't appear in navigation or be reachable by URL.</p>
            </div>
          </template>
          <div v-if="toggleableFeatures.length" class="grid gap-3 sm:grid-cols-2">
            <UCheckbox
              v-for="feature in toggleableFeatures"
              :key="feature"
              v-model="enabledFeatureSet[feature]"
              :label="FEATURE_LABELS[feature] ?? feature"
            />
          </div>
          <p v-else class="text-sm text-muted">No toggleable features for this site's template.</p>
          <template #footer>
            <div class="flex justify-end">
              <UButton color="neutral" variant="outline" :loading="savingFeatures" @click="saveFeatures">Save features</UButton>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Site Notifications</h2>
              <p class="mt-1 text-sm text-muted">Fallback delivery for every location. A location can override this in its own settings.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Alert channels">
              <USelectMenu v-model="notificationChannels" multiple :items="CHANNEL_OPTIONS" value-key="value" label-key="label" />
            </UFormField>
            <UFormField label="Site-wide WhatsApp number"><UInput v-model="whatsappPhone" type="tel" placeholder="+66..." /></UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end">
              <UButton color="neutral" variant="outline" :loading="savingNotifications" @click="saveNotifications">Save notifications</UButton>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Facebook and Instagram Publishing</h2>
                <p class="mt-1 text-sm text-muted">Connect the Page that publishes content for this site.</p>
              </div>
              <UBadge :label="facebookConnection?.connected ? 'Connected' : hasFacebookAccess ? 'Not connected' : 'Growth+'" :color="facebookConnection?.connected ? 'success' : hasFacebookAccess ? 'neutral' : 'warning'" variant="soft" />
            </div>
          </template>
          <UAlert v-if="!hasFacebookAccess" color="warning" variant="soft" icon="i-lucide-lock" title="Growth plan required" description="Upgrade this site to connect Facebook and Instagram publishing." />
          <div v-else class="space-y-4">
            <p v-if="facebookConnection?.connected" class="text-sm text-muted">Connected to {{ facebookConnection.facebook_page_name || 'Facebook Page' }}.</p>
            <p v-else class="text-sm text-muted">No Facebook Page is connected to this site.</p>
            <UButton icon="i-simple-icons-facebook" :loading="connectingFacebook" @click="startFacebookConnect">
              {{ facebookConnection?.connected ? 'Reconnect Facebook' : 'Connect Facebook' }}
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import type { ProductFeature } from '~/config/cms-registry'

const FEATURE_LABELS: Partial<Record<ProductFeature, string>> = {
  menu: 'Menu',
  reservations: 'Reservations',
  ordering: 'Online ordering',
  experiences: 'Experiences',
  services: 'Services',
  blog: 'Blog',
  qa: 'Q&A',
  reviews: 'Reviews',
  media: 'Media library',
  posts: 'Posts',
  photos: 'Photos',
}

interface SiteSettingsResponse {
  brand_name?: string | null
  brand_description?: string | null
  logo_url?: string | null
  contact_email?: string | null
  brand_color?: string | null
  default_currency?: string | null
  url_structure?: 'location_subdirectories' | 'brand_pages'
  social_facebook?: string | null
  social_instagram?: string | null
  social_tiktok?: string | null
  footer_tagline?: string | null
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
  google_analytics_measurement_id?: string | null
  google_site_verification?: string | null
  toggleable_features?: ProductFeature[]
  effective_features?: ProductFeature[]
}

interface FacebookConnectionStatus {
  connected: boolean
  facebook_page_name?: string
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
const loading = ref(true)
const saving = ref(false)
const loadError = ref<string | null>(null)
const savingNotifications = ref(false)
const savingFeatures = ref(false)
const connectingFacebook = ref(false)
const toggleableFeatures = ref<ProductFeature[]>([])
const enabledFeatureSet = reactive<Partial<Record<ProductFeature, boolean>>>({})
const notificationChannels = ref<string[]>(['email'])
const whatsappPhone = ref('')
const facebookConnection = ref<FacebookConnectionStatus | null>(null)
let loadToken = 0

const form = reactive({
  brand_name: '', brand_description: '', logo_url: '', contact_email: '', brand_color: '',
  default_currency: DEFAULT_CURRENCY as CurrencyCode,
  url_structure: 'location_subdirectories' as 'location_subdirectories' | 'brand_pages',
  social_facebook: '', social_instagram: '', social_tiktok: '', footer_tagline: '',
  seo_title: '', seo_description: '', canonical_url: '', robots: '',
  google_analytics_measurement_id: '', google_site_verification: '',
})

const URL_STRUCTURE_OPTIONS = [
  { label: 'Location subdirectories', value: 'location_subdirectories' },
  { label: 'Brand pages', value: 'brand_pages' },
]
const CHANNEL_OPTIONS = [{ label: 'Email', value: 'email' }, { label: 'WhatsApp', value: 'whatsapp' }]
const hasFacebookAccess = computed(() => ['growth', 'managed', 'seo_accelerator'].includes(dashboard.site.value?.plan ?? ''))

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data
    if (data?.error) return data.error
  }
  return error instanceof Error ? error.message : fallback
}

function fillForm(settings: SiteSettingsResponse) {
  form.brand_name = settings.brand_name ?? ''
  form.brand_description = settings.brand_description ?? ''
  form.logo_url = settings.logo_url ?? ''
  form.contact_email = settings.contact_email ?? ''
  form.brand_color = settings.brand_color ?? ''
  form.default_currency = isCurrencyCode(settings.default_currency) ? settings.default_currency : DEFAULT_CURRENCY
  form.url_structure = settings.url_structure ?? 'location_subdirectories'
  form.social_facebook = settings.social_facebook ?? ''
  form.social_instagram = settings.social_instagram ?? ''
  form.social_tiktok = settings.social_tiktok ?? ''
  form.footer_tagline = settings.footer_tagline ?? ''
  form.seo_title = settings.seo_title ?? ''
  form.seo_description = settings.seo_description ?? ''
  form.canonical_url = settings.canonical_url ?? ''
  form.robots = settings.robots ?? ''
  form.google_analytics_measurement_id = settings.google_analytics_measurement_id ?? ''
  form.google_site_verification = settings.google_site_verification ?? ''
  toggleableFeatures.value = settings.toggleable_features ?? []
  const effective = new Set(settings.effective_features ?? [])
  // Only ever read through toggleableFeatures (see the template's v-for and saveFeatures'
  // filter), so a stale key from a previous load is harmless — no need to clear the object first.
  for (const feature of toggleableFeatures.value) enabledFeatureSet[feature] = effective.has(feature)
}

async function load() {
  const token = ++loadToken
  loading.value = true
  loadError.value = null
  try {
    await dashboard.refresh()
    const [settings, notifications, facebook] = await Promise.all([
      $fetch<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings'),
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>('/api/dashboard/editor/notifications'),
      hasFacebookAccess.value
        ? $fetch<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection')
        : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
    ])
    if (token !== loadToken) return
    fillForm(settings.settings)
    whatsappPhone.value = notifications.notifications.whatsapp_phone ?? ''
    notificationChannels.value = notifications.notifications.channels?.length ? notifications.notifications.channels : ['email']
    facebookConnection.value = facebook
  } catch (error) {
    if (token !== loadToken) return
    loadError.value = errorMessage(error, 'Failed to load site settings')
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function saveSiteSettings() {
  const requestedSiteSlug = route.params.siteSlug
  saving.value = true
  try {
    const response = await $fetch<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', {
      method: 'PATCH',
      body: { ...form },
    })
    if (route.params.siteSlug !== requestedSiteSlug) return
    fillForm(response.settings)
    toast.add({ description: 'Site settings saved', color: 'success' })
    await dashboard.refresh()
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save site settings'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function saveFeatures() {
  const requestedSiteSlug = route.params.siteSlug
  savingFeatures.value = true
  try {
    const enabled = toggleableFeatures.value.filter(feature => enabledFeatureSet[feature])
    const response = await $fetch<{ success: boolean; settings: SiteSettingsResponse }>('/api/dashboard/settings', {
      method: 'PATCH',
      body: { enabled_features: enabled },
    })
    if (route.params.siteSlug !== requestedSiteSlug) return
    fillForm(response.settings)
    toast.add({ description: 'Features saved', color: 'success' })
    await dashboard.refresh()
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save features'), color: 'error' })
  } finally {
    savingFeatures.value = false
  }
}

async function saveNotifications() {
  if (!notificationChannels.value.length) {
    toast.add({ description: 'Select at least one notification channel', color: 'error' })
    return
  }
  const requestedSiteSlug = route.params.siteSlug
  savingNotifications.value = true
  try {
    const response = await $fetch<{ notifications: { whatsapp_phone: string | null; channels: string[] } }>('/api/dashboard/editor/notifications', {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappPhone.value.trim() || null, channels: notificationChannels.value },
    })
    if (route.params.siteSlug !== requestedSiteSlug) return
    whatsappPhone.value = response.notifications.whatsapp_phone ?? ''
    notificationChannels.value = response.notifications.channels
    toast.add({ description: 'Notification settings saved', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save notification settings'), color: 'error' })
  } finally {
    savingNotifications.value = false
  }
}

async function startFacebookConnect() {
  const requestedSiteSlug = route.params.siteSlug
  connectingFacebook.value = true
  try {
    const response = await $fetch<{ authUrl?: string; error?: string }>('/api/integrations/facebook-pages/auth', { method: 'POST' })
    if (!response.authUrl) throw new Error(response.error || 'No authorization URL returned')
    if (route.params.siteSlug !== requestedSiteSlug) {
      connectingFacebook.value = false
      return
    }
    const parsed = new URL(response.authUrl)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.facebook.com') {
      throw new Error('Invalid OAuth redirect URL')
    }
    window.location.href = parsed.toString()
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to connect Facebook'), color: 'error' })
    connectingFacebook.value = false
  }
}

onMounted(async () => {
  await load()
  const fbStatus = typeof route.query.fb === 'string' ? route.query.fb : null
  if (fbStatus === 'connected') toast.add({ description: 'Facebook Page connected', color: 'success' })
  if (fbStatus) {
    const { fb: _fb, ...query } = route.query
    await router.replace({ query })
  }
})

watch(() => route.params.siteSlug, (nextSiteSlug, previousSiteSlug) => {
  if (nextSiteSlug !== previousSiteSlug) void load()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>
