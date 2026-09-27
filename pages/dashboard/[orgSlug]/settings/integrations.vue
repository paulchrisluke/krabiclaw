<template>
  <!--
    What the business is connected to. Each row is one product with its own
    connection; the two Google products may use the same linked Google
    account, which is not a row.
  -->
  <DashboardIndexPanel id="organization-integrations" title="Integrations" :auto-open="items[0]?.to ?? null">
    <div v-if="pending && !summary" class="space-y-4">
      <USkeleton v-for="i in 5" :key="i" class="h-16 rounded-xl" />
    </div>
    <UAlert v-else-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error.message" />
    <EditorNavigationList v-else :groups="[{ id: 'integrations', items }]" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Ref } from 'vue'

export type IntegrationStatus = 'active' | 'disabled' | 'error'

export interface IntegrationsSummary {
  google_maps: Array<{
    id: string
    slug: string
    title: string
    address: string | null
    phone: string | null
    website_url: string | null
    image: string | null
    google_place_id: string | null
    rating: number | null
    review_count: number | null
    last_synced_at: string | null
  }>
  google_analytics: { account_id: string | null; property_name: string | null; measurement_id: string; status: IntegrationStatus; connected_at: string } | null
  google_search_console: { account_id: string; site_url: string; status: IntegrationStatus; connected_at: string } | null
  facebook: { account_id: string; page_name: string; status: IntegrationStatus; connected_at: string } | null
  instagram: { account_id: string; username: string; status: IntegrationStatus; connected_at: string } | null
}

/** The summary the list shows, and what a leaf refreshes after it changes a connection. */
export const integrationsKey = Symbol('integrations') as InjectionKey<{
  organizationId: string
  summary: Ref<IntegrationsSummary | undefined>
  /** Why the summary could not be read; a leaf shows it rather than waiting on it. */
  failure: Ref<string>
  refresh: () => Promise<void>
}>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Integrations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const route = useRoute()
const level = useRouteLevel()
const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()
const base = computed(() => `/dashboard/${String(route.params.orgSlug)}/settings/integrations`)

const isSummaryResponse = (value: unknown): value is { settings: { integrations: IntegrationsSummary } } =>
  isRecord(value) && isRecord(value.settings) && isRecord(value.settings.integrations)
  && Array.isArray(value.settings.integrations.google_maps)

const { data: summary, pending, error, refresh } = await useAsyncData(
  () => `dashboard-integrations:${String(route.params.orgSlug)}`,
  async () => (await dashboardApi('/api/dashboard/settings', { validate: isSummaryResponse })).settings.integrations,
  { lazy: true },
)

// A connection that exists names what it is connected to; one whose last sync
// failed says so, because that is what the tenant has to act on.
const connection = (value: { status: IntegrationStatus } | null, name: string): Pick<EditorNavigationItem, 'summary' | 'status'> =>
  !value ? { summary: 'Not connected', status: 'neutral' }
  : value.status === 'error' ? { summary: `${name} · Last sync failed`, status: 'error' }
  : value.status === 'disabled' ? { summary: `${name} · Disabled`, status: 'neutral' }
  : { summary: name, status: 'success' }

const items = computed<EditorNavigationItem[]>(() => {
  const s = summary.value
  const maps = s?.google_maps ?? []
  const connected = maps.filter(location => location.google_place_id).length
  return [
    { id: 'google-maps', label: 'Google Maps', lead: { icon: 'i-logos-google-maps' }, to: `${base.value}/google-maps`,
      ...(maps.length
        ? { summary: `${connected} of ${maps.length} ${maps.length === 1 ? 'location' : 'locations'} connected`, status: connected ? 'success' as const : 'neutral' as const }
        : { summary: 'No locations yet' }) },
    { id: 'google-analytics', label: 'Google Analytics', lead: { icon: 'i-logos-google-analytics' }, to: `${base.value}/google-analytics`,
      ...connection(s?.google_analytics ?? null, s?.google_analytics?.property_name ?? s?.google_analytics?.measurement_id ?? '') },
    { id: 'google-search-console', label: 'Google Search Console', lead: { icon: 'i-logos-google-search-console' }, to: `${base.value}/google-search-console`,
      ...connection(s?.google_search_console ?? null, s?.google_search_console?.site_url ?? '') },
    { id: 'facebook', label: 'Facebook', lead: { icon: 'i-logos-facebook' }, to: `${base.value}/facebook`,
      ...connection(s?.facebook ?? null, s?.facebook?.page_name ?? '') },
    { id: 'instagram', label: 'Instagram', lead: { icon: 'i-skill-icons-instagram' }, to: `${base.value}/instagram`,
      ...connection(s?.instagram ?? null, s?.instagram ? `@${s.instagram.username}` : '') },
  ]
})

provide(integrationsKey, {
  organizationId,
  summary,
  failure: computed(() => error.value ? getErrorMessage(error.value, 'Could not load integrations.') : ''),
  refresh: async () => { await refresh() },
})
</script>
