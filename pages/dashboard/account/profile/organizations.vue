<template>
  <!-- Every organization this account can manage. Each row opens the organization; a new one starts here. -->
  <DashboardIndexPanel id="account-organizations" title="Organizations">
    <EditorNavigationList :groups="groups" :active-item="level.child.value" />
    <UButton v-if="createAction" class="mt-6" color="neutral" variant="soft" icon="i-lucide-plus" :label="createAction.label" :to="createAction.to" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'

definePageMeta({ layout: 'dashboard' })

const level = useRouteLevel()
const model = inject(dashboardScopeHeaderModelKey)!
const organizations = computed(() => model.value.peers.filter(peer => peer.label !== 'Personal'))
// Each organization's mark, as Airbnb's listing rows carry their picture; the switcher itself does not load it.
type OrganizationMark = { id: string; imageUrl: string | null }
const isOrganizationList = (value: unknown): value is { organizations: OrganizationMark[] } => isRecord(value) && Array.isArray(value.organizations) && value.organizations.every(row => isRecord(row) && typeof row.id === 'string' && (row.imageUrl === null || typeof row.imageUrl === 'string'))
const { data: marksData } = await useAsyncData('account-organizations', () => applicationFetch<{ organizations: OrganizationMark[] }>('/api/account/organizations', { validate: isOrganizationList }), { lazy: true })
const marks = computed(() => Object.fromEntries((marksData.value?.organizations ?? []).map(row => [row.id, row.imageUrl])))
const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'organizations',
  items: organizations.value.map(organization => ({
    id: organization.id!,
    label: organization.label,
    image: marks.value[organization.id!] ?? null,
    to: `${level.path.value}/${encodeURIComponent(organization.id!)}`,
  })),
}])
const createAction = computed(() => model.value.createAction)
</script>
