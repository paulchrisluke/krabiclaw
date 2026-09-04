<template>
  <UDashboardPanel
    id="organization-settings"
    :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }"
  >
    <template #header>
      <UDashboardNavbar title="Organization Settings" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="levelBackTo" label="Menu" />
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
        :detail-title="detailTitle"
        :dismiss-to="orgSettingsPath"
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

defineProps<{
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
const { paths } = useDashboardSiteLinks()

// The navbar's back leaves settings for the menu that opened it. The open
// section's own way out is the sheet's close control, which lands on the index
// beside it — at `lg` that index is already on screen, so the navbar has no
// reason to point at it.
const levelBackTo = computed(() => `${paths.value.org}/menu`)

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
