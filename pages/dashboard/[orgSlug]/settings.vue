<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <template v-else>
    <UDashboardPanel
      id="organization-settings"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Organization Settings" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="menuPath" label="Menu" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <EditorNavigationList :groups="groups" :active-item="activeItem" />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open setting is the other column; the settings screens are plain
         content, so this level gives them the column and the header. -->
    <UDashboardPanel v-if="hasDetail" id="organization-settings-detail">
      <template #header>
        <UDashboardNavbar :title="detailTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="settingsPath" label="Settings" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="wideDetail ? 'max-w-5xl' : 'max-w-2xl'">
          <NuxtPage />
        </div>
      </template>
    </UDashboardPanel>
  </template>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

const { orgPaths } = useDashboardSiteLinks()
const settingsPath = computed(() => orgPaths.value.settings)
const frame = useEditorFrame(settingsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')


const { groups, activeItem } = useOrganizationSettingsNavigation()

// Built from `orgPaths`, not spelled out: a literal dashboard path here trips
// the retired-menu guard, and the helper already owns how these are composed.
const menuPath = computed(() => `${orgPaths.value.org}/menu`)

/**
 * The open section names itself from the same list the index renders, so a
 * renamed section changes in one place. A section that wants the wider pane
 * says so in its own `definePageMeta`, the way `ownsChrome` is declared, rather
 * than this level keeping a list of which sections are special.
 */
const detailTitle = computed(() => {
  const open = frame.childSegment.value
  if (!open) return undefined
  for (const group of groups.value) {
    const item = group.items.find(candidate => candidate.id === open)
    if (item) return item.label
  }
  return undefined
})

const wideDetail = computed(() => route.meta.wideDetail === true)
</script>
