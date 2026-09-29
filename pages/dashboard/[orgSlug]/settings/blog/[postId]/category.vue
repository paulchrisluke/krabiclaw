<template>
  <DashboardLeafPanel
    id="organization-blog-post-category"
    title="Category"
    :ready="!editor.loadPending.value && !editor.loadError.value && editor.categories.value !== undefined"
    :saving="editor.saving.value"
    :error="editor.actionError.value || editor.loadError.value || categoriesFailure"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <!-- A category belongs to one collection, so choosing the collection is choosing whose categories are offered. -->
      <UFormField label="Collection">
        <USelect v-model="editor.form.collection" :items="editor.collectionOptions" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Category" required>
        <USelect
          v-model="editor.form.category_id"
          :items="categoryOptions"
          value-key="value"
          :placeholder="categoryOptions.length ? 'Choose a category' : 'No categories yet'"
          class="w-full"
        />
        <template #hint>
          <ULink :to="categoriesPath" class="text-sm">Manage categories</ULink>
        </template>
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { blogEditorKey } from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })

const editor = inject(blogEditorKey)!
const route = useRoute()
const categoriesPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/blog/categories`)
const categoryOptions = computed(() => (editor.categories.value ?? []).map(category => ({ label: category.name, value: category.id })))
const categoriesFailure = computed(() => editor.categoriesError.value ? getErrorMessage(editor.categoriesError.value, 'Categories could not be loaded') : '')

// A category of the other collection is not a choice here: switching the
// collection clears it, and the owner picks one of the new collection's.
watch(editor.categories, (categories) => {
  if (categories && editor.form.category_id && !categories.some(category => category.id === editor.form.category_id)) editor.form.category_id = ''
})
</script>
