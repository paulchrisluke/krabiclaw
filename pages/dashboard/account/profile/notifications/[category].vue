<template>
  <DashboardLeafPanel
    v-if="category"
    id="account-notification-category"
    :title="NOTIFICATION_CATEGORY_LABELS[category]"
    :saving="Boolean(editor?.saving)"
    :disabled="!editor?.dirty"
    @cancel="editor?.cancel()"
    @save="editor?.commit()"
  >
    <AccountNotificationCategoryPage :ref="(instance: unknown) => (editor = instance as CategoryEditor | null)" :key="category" :category="category" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import AccountNotificationCategoryPage from '~/components/dashboard/AccountNotificationCategoryPage.vue'
import { NOTIFICATION_CATEGORY_LABELS, isNotificationCategory } from '~/shared/notification-categories'

definePageMeta({ layout: 'dashboard' })

/** What the category component exposes; Vue unwraps its refs on the instance. */
interface CategoryEditor {
  dirty: boolean
  saving: boolean
  cancel: () => void
  commit: () => Promise<void>
}

const route = useRoute()
const level = useRouteLevel()

// Moving from one category to the next reuses this page, so the category is
// read from the route every time rather than once at setup — read once, the
// title and the switches stayed on whichever category opened first.
const category = computed(() => {
  const value = String(route.params.category ?? '')
  return isNotificationCategory(value) ? value : null
})

// Raised, not thrown: the dashboard renders on the client, where a throw in a
// nested page's setup leaves a blank screen (DESIGN.md).
watchEffect(() => {
  if (level.stale.value) return
  if (!category.value) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})

// The switches live in the component and the Cancel/Save row in the leaf's
// footer, the way every other leaf commits.
const editor = ref<CategoryEditor | null>(null)
</script>
