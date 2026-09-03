<template>
  <UDashboardPanel
    id="organization-settings"
    :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }"
  >
    <template #header>
      <UDashboardNavbar :title="detailTitle || 'Organization Settings'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="backTo" :label="backLabel" />
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
const { organizationPath } = useDashboardPaths()

// Up one level: out of a section back to the settings index, out of the index
// back to the menu that opened it.
const backTo = computed(() => props.detailTitle ? orgSettingsPath.value : `${organizationPath.value}/menu`)
const backLabel = computed(() => props.detailTitle ? 'Organization Settings' : 'Menu')

// Leaving a section resets the form. This used to hang off the back button's
// click handler, which meant browser back left the previous section's edits in
// the shared component instance. Watching the route covers every way out.
watch(() => route.path, (next, previous) => {
  if (previous && previous !== next) emit('cancel')
})

function closeDetail() {
  emit('cancel')
  router.push(orgSettingsPath.value)
}
</script>
