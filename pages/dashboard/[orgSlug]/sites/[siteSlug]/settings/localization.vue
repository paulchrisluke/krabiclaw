<template>
  <UDashboardPanel id="site-localization">
    <template #header>
      <UDashboardNavbar title="Localization">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6 p-5 sm:p-8">
        <div v-if="loading" class="space-y-4">
          <USkeleton class="h-32 rounded-xl" />
        </div>
        <UAlert v-else-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
        <UCard v-else-if="settings" title="Site languages" :description="settings.billing_enabled ? `English is the permanent source language. Each secondary language is billed on this site's Growth subscription.` : `English is the permanent source language. Growth includes one secondary language at no extra cost.`" variant="subtle">
          <div class="space-y-3">
            <div v-for="language in settings.languages" :key="language.locale" class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
              <div>
                <p class="font-medium">{{ language.label || language.locale }} <span class="text-sm text-muted">({{ language.locale }})</span></p>
                <UBadge :color="language.is_source || language.license_status === 'active' ? 'success' : 'neutral'" variant="subtle" size="sm" class="mt-1">
                  {{ language.is_source ? 'Source · published' : `${language.license_status || 'disabled'} · ${language.locale_status}` }}
                </UBadge>
              </div>
              <div v-if="!language.is_source" class="flex gap-2">
                <UButton v-if="language.license_status === 'active'" color="neutral" variant="outline" :loading="busy" @click="disableLanguage(language.locale)">Disable</UButton>
                <UButton v-if="language.license_status === 'disabled'" color="error" variant="outline" :loading="busy" @click="deleteLanguage(language.locale)">Delete content</UButton>
              </div>
            </div>

            <form class="flex flex-wrap items-end gap-3 pt-2" @submit.prevent="enableLanguage">
              <UFormField label="Available language" class="min-w-56">
                <USelect v-model="newLocale" :items="enableableCatalogOptions" placeholder="Select a language" class="w-full" />
              </UFormField>
              <UButton type="submit" :loading="busy" :disabled="!newLocale || settings.effective_plan !== 'growth'">
                {{ settings.billing_enabled ? `Enable for ${formattedPrice}` : 'Enable' }}
              </UButton>
            </form>
            <p v-if="settings.effective_plan !== 'growth'" class="text-sm text-warning">A Growth subscription is required.</p>
          </div>
        </UCard>
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
const isSettings = (value: unknown): value is Settings => isRecord(value) && Array.isArray(value.languages) && Array.isArray(value.available_catalogs)
const enableableCatalogOptions = computed(() => (settings.value?.available_catalogs ?? [])
  .filter(catalog => !settings.value?.languages.some(language => language.locale === catalog.locale && language.license_status !== 'disabled'))
  .map(catalog => ({ label: `${catalog.label} (${catalog.locale})`, value: catalog.locale })))
const formattedPrice = computed(() => settings.value?.unit_amount_cents == null ? '$5/month or $60/year' : `$${(settings.value.unit_amount_cents / 100).toFixed(0)}/${settings.value.interval}`)
function message(error: unknown) { return error instanceof Error ? error.message : 'Localization request failed' }
async function refresh() {
  loading.value = true
  try { settings.value = await dashboardApi<Settings>(`/api/editor/sites/${siteId}/locales`, { validate: isSettings }); errorMessage.value = null }
  catch (error) { errorMessage.value = message(error) }
  finally { loading.value = false }
}
async function mutate(path: string, method: 'POST' | 'DELETE') {
  busy.value = true
  try { await dashboardApi(path, { method, validate: (value): value is Record<string, unknown> => isRecord(value) }); await refresh() }
  catch (error) { toast.add({ description: message(error), color: 'error' }) }
  finally { busy.value = false }
}
async function enableLanguage() { if (newLocale.value) { await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(newLocale.value)}/enable`, 'POST'); newLocale.value = '' } }
async function disableLanguage(locale: string) { await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}/disable`, 'POST') }
async function deleteLanguage(locale: string) { if (window.confirm(`Permanently delete all ${locale} content for this site?`)) await mutate(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, 'DELETE') }
await refresh()
</script>
