<template>
  <!--
    A collection's categories: the grouping of its public index, sidebar and
    breadcrumb, each with its own page. A list of records, so nothing opens on
    arrival; each row opens the category.
  -->
  <DashboardIndexPanel id="organization-blog-categories" title="Categories">
    <div class="space-y-6">
      <DashboardListEditor
        v-model:editing="editing"
        title="Categories"
        description="Readers browse articles by category, in this order. Every published article is in one."
        :items="listItems"
        :pending="pending"
        :error="loadError"
        empty-title="No categories yet"
        empty-icon="i-lucide-folder"
        add-label="Add a category"
        reorderable
        :removing-id="removingId"
        @add="adding = true"
        @remove="removeCategory"
        @move="moveCategory"
      >
        <template #filters>
          <UTabs v-model="collection" :items="collectionTabs" :content="false" aria-label="Collection" />
        </template>
        <template #item="{ item }">
          <span class="min-w-0 flex-1" :data-testid="`article-category-${item.id}`">
            <span class="block truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</span>
            <span class="mt-1 block text-sm text-muted">{{ item.row.article_count === 1 ? '1 article' : `${item.row.article_count} articles` }}</span>
          </span>
        </template>
      </DashboardListEditor>
      <UAlert v-if="actionError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="actionError" />
    </div>

    <!-- Adding asks for what names the category; its description is a field of the category once it exists. -->
    <DashboardListItemDialog
      v-model:open="adding"
      title="New category"
      :removable="false"
      :saving="creating"
      :save-disabled="!newName.trim()"
      save-label="Create"
      @save="createCategory"
    >
      <UFormField label="Name" required>
        <UInput v-model="newName" autofocus class="w-full" @keydown.enter.prevent="newName.trim() && createCategory()" />
      </UFormField>
    </DashboardListItemDialog>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import { isCategoryResponse, isCategoriesResponse, type DashboardArticleCategory } from '~/composables/useArticleCategories'
import { ARTICLE_COLLECTIONS, ARTICLE_COLLECTION_SLUGS, type ArticleCollection } from '~/utils/article-collections'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Categories | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()
const level = useRouteLevel()

const collectionTabs = ARTICLE_COLLECTION_SLUGS.map(slug => ({ value: slug, label: ARTICLE_COLLECTIONS[slug].label }))
const collection = ref<ArticleCollection>('blog')
const { data, pending, error, refresh } = useArticleCategories(organizationId, collection)

const editing = ref(false)
const removingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
// Reorder is a mode: the order stands locally while editing and commits whole when it closes.
const localOrder = ref<DashboardArticleCategory[] | null>(null)
const categories = computed(() => localOrder.value ?? data.value ?? [])
const listItems = computed(() => categories.value.map(row => ({ id: row.id, title: row.name, to: `${level.path.value}/${row.id}`, row })))
const loadError = computed(() => error.value ? getErrorMessage(error.value, 'Categories could not be loaded') : null)

const adding = ref(false)
const creating = ref(false)
const newName = ref('')
async function createCategory() {
  creating.value = true
  actionError.value = null
  try {
    const { category } = await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories`, {
      method: 'POST', body: { collection: collection.value, name: newName.value.trim() }, validate: isCategoryResponse,
    })
    adding.value = false
    newName.value = ''
    await refresh()
    await navigateTo(`${level.path.value}/${category.id}`)
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'The category could not be created')
  } finally {
    creating.value = false
  }
}

// A category that still has articles is refused by the server with how many; the owner moves them first.
async function removeCategory(item: { row: DashboardArticleCategory }) {
  if (!confirm(`Delete "${item.row.name}"?`)) return
  removingId.value = item.row.id
  actionError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories/${item.row.id}`, { method: 'DELETE', validate: isRecord })
    await refresh()
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'The category could not be deleted')
  } finally {
    removingId.value = null
  }
}

function moveCategory(item: { row: DashboardArticleCategory }, direction: -1 | 1) {
  const order = [...categories.value]
  const from = order.findIndex(row => row.id === item.row.id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  ;[order[from], order[to]] = [order[to]!, order[from]!]
  localOrder.value = order
}

watch(editing, async (value, previous) => {
  if (!previous || value || !localOrder.value) return
  const order = localOrder.value.map(row => row.id)
  actionError.value = null
  try {
    data.value = (await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories/order`, {
      method: 'PUT', body: { collection: collection.value, category_ids: order }, validate: isCategoriesResponse,
    })).categories
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'The new order could not be saved')
    await refresh()
  } finally {
    localOrder.value = null
  }
})

watch(collection, () => {
  editing.value = false
  localOrder.value = null
  actionError.value = null
})
</script>
