<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <UDashboardPanel v-else id="account-notifications" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar title="Notifications" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="profilePath" label="Account" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        `show-desktop-detail` so the pair is drawn at rest, like every other
        hub in the chain. With nothing open the index route renders the first
        category rather than leaving the column empty.
      -->
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        show-desktop-detail
        :detail-title="detailTitle"
        :dismiss-to="notificationsPath"
      >
        <template #index>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" class="mb-6" />
          <EditorNavigationList :groups="groups" :active-item="activeItem" />
        </template>

        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  describeNotificationSetting,
  isNotificationCategory,
} from '~/shared/notification-categories'

const notificationsPath = computed(() => '/dashboard/account/profile/notifications')
const profilePath = '/dashboard/account/profile'
const frame = useEditorFrame(notificationsPath)

const { sessionData } = await useAuthSession()
const { preferences, error, load } = useNotificationPreferences(() => sessionData.value?.user?.id)
await load()

// Each row states what currently reaches this person, not what the category
// means. The leaf is one screen away and says it with controls instead.
const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'categories',
  items: NOTIFICATION_CATEGORIES.map(category => ({
    id: category,
    label: NOTIFICATION_CATEGORY_LABELS[category],
    summary: preferences.value ? describeNotificationSetting(preferences.value[category]) : '',
    to: `${notificationsPath.value}/${category}`,
  })),
}])

// With nothing open the first category is the one showing, so the index
// highlights it rather than looking like nothing is selected.
const openCategory = computed(() => {
  const open = frame.childSegment.value
  return open && isNotificationCategory(open) ? open : NOTIFICATION_CATEGORIES[0]
})
const activeItem = computed(() => openCategory.value)
const detailTitle = computed(() => NOTIFICATION_CATEGORY_LABELS[openCategory.value])

// An unsupported category 404s rather than opening an empty pane.
watchEffect(() => {
  const open = frame.childSegment.value
  if (frame.rest.value.length > 1 || (open && !isNotificationCategory(open))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

useSeoMeta({ title: 'Notifications | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
