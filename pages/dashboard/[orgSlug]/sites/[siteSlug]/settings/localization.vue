<template>
  <UDashboardPanel id="site-localization">
    <template #header>
      <UDashboardNavbar title="Localization">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8 p-5 sm:p-8">
        <div v-if="loading" class="text-sm text-muted">Loading localization settings…</div>
        <div v-else-if="errorMessage" class="rounded-xl border border-error/30 bg-error/5 p-4 text-error">{{ errorMessage }}</div>
        <template v-else-if="settings">
          <section class="rounded-xl border border-default p-5">
            <h2 class="text-lg font-semibold">Site languages</h2>
            <p class="mt-1 text-sm text-muted">
              English is the permanent source language. {{ settings.billing_enabled ? 'Each secondary language is billed on this site’s Growth subscription.' : 'Growth includes one secondary language at no extra cost.' }}
            </p>
            <div class="mt-5 space-y-3">
              <div v-for="language in settings.languages" :key="language.locale" class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
                <div>
                  <p class="font-medium">{{ language.label || language.locale }} <span class="text-sm text-muted">({{ language.locale }})</span></p>
                  <p class="mt-1 text-sm text-muted">{{ language.is_source ? 'Source · published' : `${language.license_status || 'disabled'} · ${language.locale_status}` }}</p>
                </div>
                <div v-if="!language.is_source" class="flex gap-2">
                  <button v-if="language.license_status === 'active'" class="rounded-lg border border-default px-3 py-2 text-sm" :disabled="busy" @click="disableLanguage(language.locale)">Disable</button>
                  <button v-if="language.license_status === 'disabled'" class="rounded-lg border border-error/40 px-3 py-2 text-sm text-error" :disabled="busy" @click="deleteLanguage(language.locale)">Delete content</button>
                </div>
              </div>
            </div>
            <form class="mt-5 flex flex-wrap items-end gap-3" @submit.prevent="enableLanguage">
              <label class="grid gap-1 text-sm">
                <span>Available language</span>
                <select v-model="newLocale" class="min-w-56 rounded-lg border border-default bg-default px-3 py-2">
                  <option value="">Select a language</option>
                  <option v-for="catalog in enableableCatalogs" :key="catalog.locale" :value="catalog.locale">{{ catalog.label }} ({{ catalog.locale }})</option>
                </select>
              </label>
              <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverted disabled:opacity-50" :disabled="busy || !newLocale || settings.effective_plan !== 'growth'">
                {{ settings.billing_enabled ? `Enable for ${formattedPrice}` : 'Enable' }}
              </button>
            </form>
            <p v-if="settings.effective_plan !== 'growth'" class="mt-3 text-sm text-warning">A Growth subscription is required.</p>
          </section>

          <section class="rounded-xl border border-default p-5">
            <h2 class="text-lg font-semibold">Exact resource localization</h2>
            <p class="mt-1 text-sm text-muted">Save one complete manual representation. Missing fields are rejected; English content is never used as a fallback.</p>
            <form class="mt-5 grid gap-4" @submit.prevent="saveResource">
              <div class="grid gap-4 sm:grid-cols-3">
                <label class="grid gap-1 text-sm"><span>Language</span><select v-model="resource.locale" class="rounded-lg border border-default bg-default px-3 py-2"><option v-for="item in activeSecondaryLanguages" :key="item.locale" :value="item.locale">{{ item.locale }}</option></select></label>
                <label class="grid gap-1 text-sm"><span>Resource type</span><select v-model="resource.type" class="rounded-lg border border-default bg-default px-3 py-2"><option v-for="type in resourceTypes" :key="type" :value="type">{{ type }}</option></select></label>
                <label class="grid gap-1 text-sm"><span>Resource ID</span><input v-model.trim="resource.id" class="rounded-lg border border-default bg-default px-3 py-2" required></label>
              </div>
              <label class="grid gap-1 text-sm"><span>Localized route path (when the resource has a detail route)</span><input v-model.trim="resource.routePath" class="rounded-lg border border-default bg-default px-3 py-2" placeholder="/th/products/example"></label>
              <label class="grid gap-1 text-sm"><span>Localized values JSON</span><textarea v-model="resource.valuesJson" rows="12" class="rounded-lg border border-default bg-default px-3 py-2 font-mono text-xs" required /></label>
              <div class="flex gap-3">
                <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverted disabled:opacity-50" :disabled="busy">Save exact representation</button>
                <button type="button" class="rounded-lg border border-default px-4 py-2 text-sm" :disabled="busy" @click="loadResource">Load existing</button>
                <button type="button" class="rounded-lg border border-error/40 px-4 py-2 text-sm text-error" :disabled="busy" @click="deleteResource">Delete</button>
              </div>
            </form>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Localization | Site Settings', robots: 'noindex, nofollow' })

interface LanguageRow { locale: string; label: string | null; is_source: number | boolean; locale_status: string; license_status: string | null }
interface CatalogRow { locale: string; label: string; direction: string }
interface Settings { effective_plan: string; billing_enabled: boolean; interval: 'month' | 'year' | null; unit_amount_cents: number | null; languages: LanguageRow[]; available_catalogs: CatalogRow[] }
const dashboardApi = useDashboardApi()
const toast = useToast()
const siteId = await useDashboardSiteId()
const settings = ref<Settings | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const newLocale = ref('')
const resourceTypes = ['site', 'business_location', 'product', 'experience', 'offering', 'site_post', 'tenant_blog_post', 'location_qa', 'media_asset', 'booking_policy', 'site_link_page', 'site_link_item', 'tenant_compliance', 'site_consultation_settings']
const resource = reactive({ locale: '', type: 'site', id: '', routePath: '', valuesJson: '{\n  \n}' })
const isSettings = (value: unknown): value is Settings => isRecord(value) && Array.isArray(value.languages) && Array.isArray(value.available_catalogs)
const activeSecondaryLanguages = computed(() => settings.value?.languages.filter(item => !item.is_source && item.license_status === 'active' && item.locale_status === 'published') ?? [])
const enableableCatalogs = computed(() => settings.value?.available_catalogs.filter(catalog => !settings.value?.languages.some(language => language.locale === catalog.locale && language.license_status !== 'disabled')) ?? [])
const formattedPrice = computed(() => settings.value?.unit_amount_cents == null ? '$5/month or $60/year' : `$${(settings.value.unit_amount_cents / 100).toFixed(0)}/${settings.value.interval}`)
function message(error: unknown) { return error instanceof Error ? error.message : 'Localization request failed' }
async function refresh() {
  loading.value = true
  try { settings.value = await dashboardApi<Settings>(`/api/editor/sites/${siteId}/locales`, { validate: isSettings }); errorMessage.value = null }
  catch (error) { errorMessage.value = message(error) }
  finally { loading.value = false }
}
async function mutate(path: string, method: 'POST' | 'DELETE', body?: Record<string, unknown>) {
  busy.value = true
  try { await dashboardApi(path, { method, body, validate: (value): value is Record<string, unknown> => isRecord(value) }); await refresh() }
  catch (error) { toast.add({ description: message(error), color: 'error' }) }
  finally { busy.value = false }
}
async function enableLanguage() { if (newLocale.value) { await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(newLocale.value)}/enable`, 'POST'); newLocale.value = '' } }
async function disableLanguage(locale: string) { await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/disable`, 'POST') }
async function deleteLanguage(locale: string) { if (window.confirm(`Permanently delete all ${locale} content for this site?`)) await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, 'DELETE') }
function resourcePath() { return `/api/editor/sites/${siteId}/localization/${encodeURIComponent(resource.type)}/${encodeURIComponent(resource.id)}/${encodeURIComponent(resource.locale)}` }
async function saveResource() {
  busy.value = true
  try {
    const values = JSON.parse(resource.valuesJson) as unknown
    const response = await dashboardApi<{ localization: { values: Record<string, unknown>; route_path: string | null } }>(resourcePath(), { method: 'PUT', body: { values, route_path: resource.routePath || null }, validate: (value): value is { localization: { values: Record<string, unknown>; route_path: string | null } } => isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values) })
    resource.valuesJson = JSON.stringify(response.localization.values, null, 2); resource.routePath = response.localization.route_path || ''
    toast.add({ description: 'Localization saved', color: 'success' })
  } catch (error) { toast.add({ description: message(error), color: 'error' }) } finally { busy.value = false }
}
async function loadResource() {
  busy.value = true
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown>; route_path: string | null } }>(resourcePath(), { validate: (value): value is { localization: { values: Record<string, unknown>; route_path: string | null } } => isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values) })
    resource.valuesJson = JSON.stringify(response.localization.values, null, 2); resource.routePath = response.localization.route_path || ''
  } catch (error) { toast.add({ description: message(error), color: 'error' }) } finally { busy.value = false }
}
async function deleteResource() { await mutate(resourcePath(), 'DELETE') }
await refresh()
watch(activeSecondaryLanguages, rows => { if (!rows.some(row => row.locale === resource.locale)) resource.locale = rows[0]?.locale ?? '' }, { immediate: true })
</script>
