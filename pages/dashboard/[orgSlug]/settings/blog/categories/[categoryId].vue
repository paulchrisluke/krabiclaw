<template>
  <DashboardLeafPanel
    id="organization-blog-category"
    :title="category?.name ?? 'Category'"
    :ready="category !== null"
    :saving="saving"
    :disabled="!dirty || !name.trim()"
    :error="actionError || loadFailure"
    @cancel="reset"
    @save="save"
  >
    <template v-if="category" #right>
      <DashboardResourceLocalization
        :organization-id="organizationId"
        resource-type="article_category"
        :resource-id="category.id"
        resource-label="category"
        :fields="localizationFields"
        :language-settings-path="`/dashboard/${route.params.orgSlug}/settings/website/localization`"
      />
    </template>
    <div v-if="category" class="space-y-6">
      <UFormField label="Name" required>
        <UInput v-model="name" autofocus class="w-full" />
      </UFormField>
      <UFormField label="Description" help="Shown on the category's page and used as its search description.">
        <UTextarea v-model="description" :rows="4" autoresize class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { isCategoryResponse, type DashboardArticleCategory } from '~/composables/useArticleCategories'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()
const categoryId = computed(() => String(route.params.categoryId))

const { data, error, refresh } = await useAsyncData(
  () => `article-category:${organizationId}:${categoryId.value}`,
  async () => (await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories/${categoryId.value}`, { validate: isCategoryResponse })).category,
)
// A category the site does not have is not a page: it 404s rather than drawing an editor for it.
watchEffect(() => {
  if (level.mode.value !== 'yield' && error.value && isNotFoundError(error.value)) showError(createError({ statusCode: 404, statusMessage: 'Category not found' }))
})
const loadFailure = computed(() => error.value && !isNotFoundError(error.value) ? getErrorMessage(error.value, 'The category could not be loaded') : '')

const category = computed<DashboardArticleCategory | null>(() => data.value ?? null)
const localizationFields = computed(() => [
  { key: 'name', label: 'Name', source: category.value?.name },
  { key: 'description', label: 'Description', source: category.value?.description, multiline: true },
])
const name = ref('')
const description = ref('')
function reset() {
  name.value = category.value?.name ?? ''
  description.value = category.value?.description ?? ''
}
watch(category, reset, { immediate: true })
const dirty = computed(() => !!category.value && (name.value.trim() !== category.value.name || (description.value.trim() || null) !== category.value.description))

const saving = ref(false)
const actionError = ref('')
async function save() {
  saving.value = true
  actionError.value = ''
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/blog/categories/${categoryId.value}`, {
      method: 'PATCH', body: { name: name.value.trim(), description: description.value.trim() || null }, validate: isCategoryResponse,
    })
    await Promise.all([refresh(), refreshNuxtData(`article-categories:${organizationId}:${category.value?.collection}`)])
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'The category could not be saved')
  } finally {
    saving.value = false
  }
}
</script>
