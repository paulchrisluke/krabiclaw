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
const value = String(route.params.category ?? '')
const category = isNotificationCategory(value) ? value : null
// Raised, not thrown: the dashboard renders on the client, where a throw in a nested page's setup leaves a blank screen (DESIGN.md).
if (!category) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))

// The switches live in the component and the Cancel/Save row in the leaf's
// footer, the way every other leaf commits.
const editor = ref<CategoryEditor | null>(null)
</script>
