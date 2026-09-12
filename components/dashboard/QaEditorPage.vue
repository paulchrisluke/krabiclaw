<template>
  <!--
    With no section open this record is the list's detail column, so it renders
    its rows and nothing else. It becomes the index column only once a section
    is open and the list above yields.
  -->
  <div v-if="frame.mode.value === 'index'" class="space-y-6">
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="errorMessage"
    />
    <div class="flex justify-end gap-2">
      <UButton v-if="isNew" :label="createActionLabel" :loading="saving" @click="startOrCreate" />
      <DashboardResourceLocalization
        v-else
        :site-id="siteId"
        resource-type="content_document"
        :resource-id="qaId"
        resource-label="question"
        :fields="qaLocalizationFields"
        :language-settings-path="siteLocalizationSettingsPath"
      />
    </div>
    <EditorNavigationList :groups="navigationGroups" />
  </div>

  <UDashboardPanel v-else id="site-qa-record" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="isNew ? 'New question' : form.question || 'Question'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="qaPath" label="Q&A" />
        </template>
        <template v-if="!isNew" #right>
          <DashboardResourceLocalization
            :site-id="siteId"
            resource-type="content_document"
            :resource-id="qaId"
            resource-label="question"
            :fields="qaLocalizationFields"
            :language-settings-path="siteLocalizationSettingsPath"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        :detail-title="SECTION_LABELS[openKey]"
        :dismiss-to="recordPath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="closeDetail"
        @save="saveOpenSection"
      >
        <template #index>
          <UAlert
            v-if="errorMessage"
            class="mb-6"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="errorMessage"
          />
          <EditorNavigationList :groups="navigationGroups" :active-item="openKey" />
        </template>

        <template #detail>
          <UFormField v-if="openKey === 'question'" label="Question" required>
            <UTextarea v-model="form.question" :rows="4" autofocus class="w-full" />
          </UFormField>

          <UFormField v-else-if="openKey === 'answer'" label="Answer">
            <UTextarea v-model="form.answer" :rows="10" autofocus class="w-full" />
          </UFormField>

          <div v-else-if="openKey === 'visibility'" class="space-y-4">
            <p class="text-base text-muted">A published question appears on the page it is filed under.</p>
            <UCheckbox v-model="form.published" label="Published" />
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { getErrorMessage } from '~/utils/errors'
import { isQaResponse, isQaCreated, isQaUpdated, qaCreateBlockers, type QaRow } from '~/utils/site-qa'

/** Set when this is a location's question rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const route = useRoute()
const toast = useToast()
const dashboardApi = useDashboardApi()

const qaId = computed(() => String(route.params.qaId ?? ''))
const qaPath = computed(() => props.locationId
  ? `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}/qa`
  : `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/qa`)
const recordPath = computed(() => `${qaPath.value}/${qaId.value}`)
const frame = useEditorFrame(recordPath)

const siteId = await useDashboardSiteId()
const isNew = computed(() => qaId.value === 'new')
const qaEndpoint = computed(() => props.locationId
  ? `/api/editor/sites/${siteId}/locations/${props.locationId}/qa`
  : `/api/editor/sites/${siteId}/qa`)

const SECTION_LABELS = { question: 'Question', answer: 'Answer', visibility: 'Visibility' } as const
type SectionKey = keyof typeof SECTION_LABELS

const detailKey = computed(() => frame.childSegment.value)
/** With nothing open the pane still shows the first section rather than empty space. */
const openKey = computed<SectionKey>(() => (detailKey.value ?? 'question') as SectionKey)

watchEffect(() => {
  if (frame.rest.value.length > 1 || (detailKey.value && !(detailKey.value in SECTION_LABELS))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

function emptyDraft() {
  return { question: '', answer: '', published: true }
}

// Keyed to the record so the draft survives the remount between sections.
const form = useState(`qa-draft-${siteId}-${props.locationId ?? 'site'}-${qaId.value}`, emptyDraft).value

const saving = ref(false)
const errorMessage = ref('')

/**
 * A site record is read by id, not by scope: the page it is filed under is an
 * attribute it reports back, which the scoped PATCH needs. A location's list
 * is not scoped, so its record is found in the list.
 */
const { data, refresh } = await useAsyncData(
  () => `dashboard-qa-record-${siteId}-${props.locationId ?? 'site'}-${qaId.value}`,
  async () => isNew.value
    ? null
    : await dashboardApi<{ qa: QaRow[] }>(qaEndpoint.value, {
      query: props.locationId ? undefined : { id: qaId.value },
      validate: isQaResponse,
    }),
  { server: false },
)

const record = computed(() => data.value?.qa.find(row => row.id === qaId.value) ?? null)

function loadForm(row: QaRow) {
  form.question = row.question
  form.answer = row.answer ?? ''
  form.published = row.status === 'published'
}
watch(record, (row) => { if (row) loadForm(row) }, { immediate: true })

const blockers = computed(() => qaCreateBlockers(form))

const qaLocalizationFields = computed(() => [
  { key: 'title', label: 'Question', source: record.value?.question },
  { key: 'summary', label: 'Answer', source: record.value?.answer, multiline: true, rows: 4 },
])
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'question',
    items: [
      { id: 'question', label: 'Question', summary: form.question.trim() || 'Not written yet', icon: 'i-lucide-circle-help', to: `${recordPath.value}/question` },
      { id: 'answer', label: 'Answer', summary: form.answer.trim() || 'No answer yet', icon: 'i-lucide-message-square', to: `${recordPath.value}/answer` },
      { id: 'visibility', label: 'Visibility', summary: form.published ? 'Published' : 'Hidden', icon: 'i-lucide-eye', to: `${recordPath.value}/visibility` },
    ],
  },
])

const { createActionLabel, saveLabel, saveDisabled, save: saveOpenSection, startOrCreate } = useCreateWalk({
  recordPath,
  isNew,
  openKey,
  labels: SECTION_LABELS,
  order: ['question'],
  missing: key => blockers.value.some(section => section === key),
  noun: 'question',
  saving,
  commit,
})

async function commit() {
  // The PATCH sends the whole record, and the form holds the row it was loaded
  // from. With no row — a load that failed — it holds its own blank defaults,
  // and saving would write those over the stored question.
  if (!isNew.value && !record.value) {
    errorMessage.value = 'This question could not be loaded, so it cannot be saved.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const body = {
      // A site question is filed under the page the list was showing, and an
      // existing one keeps the page it already carries.
      ...(props.locationId
        ? {}
        : { page_path: isNew.value ? (typeof route.query.page_path === 'string' ? route.query.page_path : null) : record.value?.page_path ?? null }),
      question: form.question.trim(),
      answer: form.answer.trim() || null,
      status: form.published ? 'published' : 'hidden',
    }
    if (isNew.value) {
      const created = await dashboardApi(qaEndpoint.value, { method: 'POST', body, validate: isQaCreated })
      Object.assign(form, emptyDraft())
      toast.add({ description: 'Question created', color: 'success' })
      await navigateTo(`${qaPath.value}/${created.id}`)
      return
    }
    await dashboardApi(`${qaEndpoint.value}/${qaId.value}`, { method: 'PATCH', body, validate: isQaUpdated })
    await refresh()
    toast.add({ description: `${SECTION_LABELS[openKey.value]} saved`, color: 'success' })
    await navigateTo(recordPath.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Failed to save question')
  } finally {
    saving.value = false
  }
}

function closeDetail() {
  if (record.value) loadForm(record.value)
  void navigateTo(recordPath.value)
}

useSeoMeta({ title: 'Question | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
