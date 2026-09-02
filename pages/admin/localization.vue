<template>
  <UDashboardPanel id="admin-localization">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Localization" />
    </template>
    <template #body>
      <div class="mx-auto grid w-full max-w-6xl gap-8 p-5 lg:grid-cols-[20rem_1fr] sm:p-8">
        <aside class="space-y-4">
          <section class="rounded-xl border border-default p-4">
            <h2 class="font-semibold">Register catalog</h2>
            <form class="mt-4 grid gap-3" @submit.prevent="registerCatalog">
              <input v-model.trim="draft.locale" class="rounded-lg border border-default bg-default px-3 py-2" placeholder="Canonical locale, e.g. th" required>
              <input v-model.trim="draft.label" class="rounded-lg border border-default bg-default px-3 py-2" placeholder="Display label" required>
              <select v-model="draft.direction" class="rounded-lg border border-default bg-default px-3 py-2"><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select>
              <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverted" :disabled="busy">Register unavailable catalog</button>
            </form>
          </section>
          <button v-for="catalog in catalogs" :key="catalog.locale" class="block w-full rounded-xl border p-4 text-left" :class="selectedLocale === catalog.locale ? 'border-primary bg-primary/5' : 'border-default'" @click="selectCatalog(catalog.locale)">
            <span class="font-medium">{{ catalog.label }} ({{ catalog.locale }})</span>
            <span class="mt-1 block text-sm text-muted">{{ catalog.status }} · {{ catalog.completed_keys }}/{{ catalog.total_keys }} keys · {{ catalog.active_license_count }} active licenses</span>
          </button>
        </aside>
        <section v-if="selected" class="min-w-0 rounded-xl border border-default p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><h2 class="text-xl font-semibold">{{ selected.label }} ({{ selected.locale }})</h2><p class="mt-1 text-sm text-muted">Manifest {{ selected.source_manifest_hash === selected.current_source_manifest_hash ? 'current' : 'stale' }}</p></div>
            <div class="flex gap-2">
              <button v-if="selected.status === 'available'" class="rounded-lg border border-default px-3 py-2 text-sm" :disabled="busy || Number(selected.active_license_count) > 0" @click="saveCatalog(false)">Make unavailable</button>
              <button class="rounded-lg border border-error/40 px-3 py-2 text-sm text-error" :disabled="busy || Number(selected.active_license_count) > 0" @click="deleteCatalog">Delete</button>
            </div>
          </div>
          <p class="mt-5 text-sm text-muted">Edit the complete flat message map. Availability requires every English key, nonblank values, matching placeholders, and the current English manifest hash.</p>
          <textarea v-model="messagesJson" rows="28" class="mt-4 w-full rounded-lg border border-default bg-default p-3 font-mono text-xs" />
          <div class="mt-4 flex flex-wrap gap-3">
            <button class="rounded-lg border border-default px-4 py-2 text-sm" :disabled="busy" @click="saveMessages">Save draft</button>
            <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverted" :disabled="busy" @click="publishCatalog">Publish available catalog</button>
          </div>
        </section>
        <div v-else class="rounded-xl border border-dashed border-default p-8 text-muted">Select a locale catalog.</div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Localization | KrabiClaw Admin', robots: 'noindex, nofollow' })

interface CatalogSummary { locale: string; label: string; direction: 'ltr' | 'rtl'; status: 'available' | 'unavailable'; completed_keys: number; total_keys: number; active_license_count: number }
interface CatalogDetail extends CatalogSummary { messages: Record<string, string>; source_messages: Record<string, string>; source_manifest_hash: string | null; current_source_manifest_hash: string }
const catalogs = ref<CatalogSummary[]>([])
const selectedLocale = ref('')
const selected = ref<CatalogDetail | null>(null)
const messagesJson = ref('{}')
const busy = ref(false)
const toast = useToast()
const draft = reactive({ locale: '', label: '', direction: 'ltr' as 'ltr' | 'rtl' })
const isCatalogList = (value: unknown): value is { catalogs: CatalogSummary[] } => isRecord(value) && Array.isArray(value.catalogs)
const isCatalog = (value: unknown): value is { catalog: CatalogDetail } => isRecord(value) && isRecord(value.catalog) && isRecord(value.catalog.messages)
function message(error: unknown) { return error instanceof Error ? error.message : 'Localization request failed' }
async function refresh() {
  const response = await applicationFetch<{ catalogs: CatalogSummary[] }>('/api/admin/localization', { validate: isCatalogList })
  catalogs.value = response.catalogs
}
async function selectCatalog(locale: string) {
  selectedLocale.value = locale
  const response = await applicationFetch<{ catalog: CatalogDetail }>(`/api/admin/localization/${encodeURIComponent(locale)}`, { validate: isCatalog })
  selected.value = response.catalog
  messagesJson.value = JSON.stringify({ ...response.catalog.source_messages, ...response.catalog.messages }, null, 2)
}
async function run(action: () => Promise<void>) { busy.value = true; try { await action() } catch (error) { toast.add({ description: message(error), color: 'error' }) } finally { busy.value = false } }
async function registerCatalog() { await run(async () => { await applicationFetch('/api/admin/localization', { method: 'POST', body: draft, validate: isRecord }); await refresh(); await selectCatalog(draft.locale); draft.locale = ''; draft.label = '' }) }
async function saveMessages() { await run(async () => { const messages = JSON.parse(messagesJson.value) as unknown; await applicationFetch(`/api/admin/localization/${encodeURIComponent(selectedLocale.value)}`, { method: 'PUT', body: { messages }, validate: isCatalog }); await selectCatalog(selectedLocale.value); toast.add({ description: 'Catalog draft saved', color: 'success' }) }) }
async function publishCatalog() { await run(async () => { const messages = JSON.parse(messagesJson.value) as unknown; await applicationFetch(`/api/admin/localization/${encodeURIComponent(selectedLocale.value)}/publish`, { method: 'POST', body: { messages }, validate: isCatalog }); await refresh(); await selectCatalog(selectedLocale.value); toast.add({ description: 'Catalog is available', color: 'success' }) }) }
async function saveCatalog(available: boolean) { if (available) return; await run(async () => { await applicationFetch(`/api/admin/localization/${encodeURIComponent(selectedLocale.value)}`, { method: 'PUT', body: { status: 'unavailable' }, validate: isCatalog }); await refresh(); await selectCatalog(selectedLocale.value) }) }
async function deleteCatalog() { if (!window.confirm(`Delete ${selectedLocale.value}?`)) return; await run(async () => { await applicationFetch(`/api/admin/localization/${encodeURIComponent(selectedLocale.value)}`, { method: 'DELETE', validate: isRecord }); selected.value = null; selectedLocale.value = ''; await refresh() }) }
onMounted(refresh)
</script>
