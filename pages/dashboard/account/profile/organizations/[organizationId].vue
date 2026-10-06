<template>
  <!--
    One organization, from the account's side: open it, or — for whoever Better
    Auth lets — delete it. Creating, choosing and deleting an organization are
    the account's to do, so they live together here rather than inside the
    organization's own Website, the way Airbnb keeps deleting an account in
    Account settings.
  -->
  <DashboardIndexPanel id="account-organization" :title="organization?.name ?? 'Organization'">
    <UAlert v-if="listError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="listError" />
    <template v-else-if="organization">
      <UAlert v-if="permissionError" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="permissionError" />
      <EditorNavigationList :groups="groups" :active-item="level.child.value" @act="onAct" />
    </template>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'
import { authClient } from '~/lib/auth-client'
import { useOrganizationDeletePermission } from '~/composables/useOrganizationDeletePermission'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const model = inject(dashboardScopeHeaderModelKey)!
const organizationsState = authClient.useListOrganizations()
const organizationId = computed(() => String(route.params.organizationId))
const organization = computed(() => unref(organizationsState)?.data?.find(candidate => candidate.id === organizationId.value) ?? null)
const listError = computed(() => unref(organizationsState)?.error?.message ?? null)
// The switcher's own entry for this organization: a link when the session is
// already in it, otherwise the explicit selection that tells Better Auth first.
const peer = computed(() => model.value.peers.find(candidate => candidate.id === organizationId.value) ?? null)
const { canDelete, permissionError } = useOrganizationDeletePermission(organizationId)

// An organization this account is not in is not a page.
watchEffect(() => {
  if (level.mode.value === 'yield') return
  const state = unref(organizationsState)
  if (!state || state.isPending || state.error) return
  if (!organization.value) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})

const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'organization',
  items: [
    peer.value?.to
      ? { id: 'open', label: 'Open organization', to: peer.value.to }
      : { id: 'open', label: 'Open organization', action: {} },
    ...(canDelete.value
      ? [{ id: 'delete', label: 'Delete organization', summary: 'Permanently removes this organization, its locations and its content', to: `${level.path.value}/delete` }]
      : []),
  ],
}])

function onAct(id: string) {
  if (id === 'open') peer.value?.onSelect?.()
}

useSeoMeta({ title: () => `${organization.value?.name ?? 'Organization'} | Krabiclaw`, robots: 'noindex, nofollow' })
</script>
