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

const { settingsPath: orgSettingsPath, groups, activeItem } = useOrganizationSettingsNavigation()
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
</script>
