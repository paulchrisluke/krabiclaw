<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <template v-else>
    <UDashboardPanel
      id="account-notifications"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="32"
    >
      <template #header>
        <UDashboardNavbar title="Notifications" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-xl">
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" class="mb-6" />
          <EditorNavigationList :groups="groups" :active-item="activeItem" />
        </div>
      </template>
    </UDashboardPanel>

    <!--
      Drawn at `lg` even with nothing open, so the pair is there at rest like
      every other hub in the chain. The category screen is plain content, so
      this level gives it the column and the header.
    -->
    <UDashboardPanel id="account-notifications-detail" :class="hasDetail ? undefined : 'hidden lg:flex'">
      <template #header>
        <UDashboardNavbar :title="detailTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-2xl">
          <NuxtPage />
        </div>
      </template>
    </UDashboardPanel>
  </template>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  describeNotificationSetting,
  isNotificationCategory,
} from '~/shared/notification-categories'

const notificationsPath = computed(() => '/dashboard/account/profile/notifications')
const frame = useEditorFrame(notificationsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

const session = authClient.useSession()
const sessionData = computed(() => session.value.data)
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
