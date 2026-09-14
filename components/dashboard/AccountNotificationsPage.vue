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
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        :detail-title="detailTitle"
        :dismiss-to="notificationsPath"
      >
        <template #index>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" class="mb-6" />
          <p class="mb-6 text-base text-muted">
            Choose what reaches you, and how. WhatsApp needs a verified phone number on your account.
          </p>
          <EditorNavigationList :groups="groups" :active-item="frame.childSegment.value" />
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
  NOTIFICATION_CATEGORY_COPY,
  describeNotificationSetting,
  isNotificationCategory,
} from '~/shared/notification-categories'

const notificationsPath = computed(() => '/dashboard/account/profile/notifications')
const profilePath = '/dashboard/account/profile'
const frame = useEditorFrame(notificationsPath)

const { preferences, error, load } = useNotificationPreferences()
await load()

// The row states what is on rather than what the category is, so the index
// answers "what reaches me" without opening anything.
const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'categories',
  items: NOTIFICATION_CATEGORIES.map(category => ({
    id: category,
    label: NOTIFICATION_CATEGORY_COPY[category].label,
    summary: preferences.value ? describeNotificationSetting(preferences.value[category]) : '—',
    to: `${notificationsPath.value}/${category}`,
  })),
}])

const detailTitle = computed(() => {
  const open = frame.childSegment.value
  return open && isNotificationCategory(open) ? NOTIFICATION_CATEGORY_COPY[open].label : undefined
})

// An unsupported category 404s rather than opening an empty pane.
watchEffect(() => {
  const open = frame.childSegment.value
  if (frame.rest.value.length > 1 || (open && !isNotificationCategory(open))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

useSeoMeta({ title: 'Notifications | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
