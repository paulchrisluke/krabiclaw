<template>
  <!--
    What the business is connected to. Each row is one product with its own
    connection; the two Google products share an account underneath, which is
    not the tenant's concern and is not a row.
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
    google_place_id: string | null
    rating: number | null
    review_count: number | null
    last_synced_at: string | null
  }>
  google_analytics: { property_name: string | null; measurement_id: string; status: IntegrationStatus } | null
  google_search_console: { site_url: string; status: IntegrationStatus } | null
  google_account: string | null
  facebook: { page_name: string; status: IntegrationStatus } | null
  instagram: { username: string; status: IntegrationStatus } | null
}

/** The summary the list shows, and what a leaf refreshes after it changes a connection. */
export const integrationsKey = Symbol('integrations') as InjectionKey<{
  organizationId: string
  summary: Ref<IntegrationsSummary | undefined>
  refresh: () => Promise<void>
}>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'

definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-settings' })
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

const failing = (status: IntegrationStatus) => status === 'error' ? ' · Last sync failed' : ''
const items = computed<EditorNavigationItem[]>(() => {
  const s = summary.value
  const maps = s?.google_maps ?? []
  const connected = maps.filter(location => location.google_place_id).length
  return [
    { id: 'google-maps', label: 'Google Maps', icon: 'i-simple-icons-googlemaps', to: `${base.value}/google-maps`,
      summary: maps.length ? `${connected} of ${maps.length} ${maps.length === 1 ? 'location' : 'locations'} connected` : 'No locations yet' },
    { id: 'google-analytics', label: 'Google Analytics', icon: 'i-lucide-chart-no-axes-combined', to: `${base.value}/google-analytics`,
      summary: s?.google_analytics ? `Connected · ${s.google_analytics.property_name ?? s.google_analytics.measurement_id}` : 'Not connected' },
    { id: 'google-search-console', label: 'Google Search Console', icon: 'i-lucide-scan-search', to: `${base.value}/google-search-console`,
      summary: s?.google_search_console ? `Connected · ${s.google_search_console.site_url}` : 'Not connected' },
    { id: 'facebook', label: 'Facebook', icon: 'i-simple-icons-facebook', to: `${base.value}/facebook`,
      summary: s?.facebook ? `Connected · ${s.facebook.page_name}${failing(s.facebook.status)}` : 'Not connected' },
    { id: 'instagram', label: 'Instagram', icon: 'i-lucide-instagram', to: `${base.value}/instagram`,
      summary: s?.instagram ? `Connected · @${s.instagram.username}${failing(s.instagram.status)}` : 'Not connected' },
  ]
})

provide(integrationsKey, {
  organizationId,
  summary,
  refresh: async () => { await refresh() },
})
</script>
