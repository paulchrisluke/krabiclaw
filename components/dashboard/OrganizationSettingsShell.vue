<template>
  <UDashboardPanel
    id="organization-settings"
    :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }"
  >
    <template #header>
      <UDashboardNavbar :title="detailTitle || 'Organization Settings'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading
            :action-icon="detailTitle ? 'i-lucide-x' : 'i-lucide-arrow-left'"
            :action-label="detailTitle ? 'Close editor' : 'Back to dashboard'"
            @action="navigateBack"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="Boolean(detailTitle)"
        :show-actions="showActions"
        :saving="saving"
        :save-disabled="saveDisabled"
        :wide-detail="wideDetail"
        @cancel="closeDetail"
        @save="$emit('save')"
      >
        <template #index>
          <EditorNavigationList :groups="groups" :active-item="activeItem" />
        </template>

        <template #detail><slot /></template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

const props = defineProps<{
  detailTitle?: string
  showActions?: boolean
  saving?: boolean
  saveDisabled?: boolean
  wideDetail?: boolean
}>()

const emit = defineEmits<{ cancel: []; save: [] }>()

const route = useRoute()
const router = useRouter()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()

const organization = dashboard.organization
const orgSettingsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/settings`)
function navigateBack() {
  if (props.detailTitle) {
    closeDetail()
    return
  }
  router.push(`/dashboard/${String(route.params.orgSlug)}`)
}
function closeDetail() {
  emit('cancel')
  router.push(orgSettingsPath.value)
}
const activeItem = computed(() => {
  const segment = route.path.slice(`${orgSettingsPath.value}/`.length).split('/')[0]
  return route.path === orgSettingsPath.value ? null : segment
})
const { preference } = usePlatformTheme()

const items = computed(() => [
  { id: 'general', label: 'General', summary: organization.value?.name || 'Organization details', to: `${orgSettingsPath.value}/general` },
  { id: 'appearance', label: 'Appearance', summary: `${preference.value.charAt(0).toUpperCase()}${preference.value.slice(1)} theme`, to: `${orgSettingsPath.value}/appearance` },
  { id: 'members', label: 'Members', summary: 'People and organization access', to: `${orgSettingsPath.value}/members` },
  { id: 'billing', label: 'Billing', summary: 'Plans, payments, and credits', to: `${orgSettingsPath.value}/billing` },
  { id: 'analytics', label: 'Analytics', summary: 'Google Analytics and Search Console', to: `${orgSettingsPath.value}/analytics` },
  { id: 'chatgpt', label: 'ChatGPT', summary: 'Organization ChatGPT connection', to: `${orgSettingsPath.value}/chatgpt` },
])
const groups = computed(() => [
  { id: 'organization', label: 'Organization', items: items.value.slice(0, 3) },
  { id: 'account', label: 'Account and connections', items: items.value.slice(3) },
])
</script>
