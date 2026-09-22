<template>
  <!-- A question: its rows are the three things it holds, each a leaf below. -->
  <DashboardIndexPanel id="site-qa-record" :title="isNew ? 'New question' : form.question || 'Question'" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
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

    <UAlert
      v-if="errorMessage"
      class="mb-6"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="errorMessage"
    />
    <div v-if="isNew" class="mb-6 flex justify-end">
      <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
    </div>
    <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Reactive, Ref } from 'vue'

export const SECTION_LABELS = { question: 'Question', answer: 'Answer', visibility: 'Visibility' } as const
export type SectionKey = keyof typeof SECTION_LABELS

/** The question's draft and the save walk its leaves commit through. */
export interface QaEditor {
  form: Reactive<{ question: string; answer: string; published: boolean }>
  saving: Ref<boolean>
  saveDisabled: Ref<boolean>
  saveLabel: Ref<string | undefined>
  errorMessage: Ref<string>
  revert: () => void
  save: () => Promise<void>
}

export const qaEditorKey = Symbol('qa-editor') as InjectionKey<QaEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { getErrorMessage } from '~/utils/errors'
import { isQaResponse, isQaCreated, isQaUpdated, qaCreateBlockers, type QaRow } from '~/utils/site-qa'

/** Set when this is a location's question rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const route = useRoute()
const dashboardApi = useDashboardApi()

const qaId = computed(() => String(route.params.qaId ?? ''))
const qaPath = computed(() => props.locationId
  ? `/dashboard/${String(route.params.orgSlug)}/locations/${String(route.params.locationSlug)}/qa`
  : `/dashboard/${String(route.params.orgSlug)}/qa`)
const recordPath = computed(() => `${qaPath.value}/${qaId.value}`)
const level = useRouteLevel()

const siteId = await useDashboardOrganizationId()
const isNew = computed(() => qaId.value === 'new')
const qaEndpoint = computed(() => props.locationId
  ? `/api/editor/organizations/${siteId}/locations/${props.locationId}/qa`
  : `/api/editor/organizations/${siteId}/qa`)

const detailKey = computed(() => level.child.value)
/** With nothing open the pane still shows the first section rather than empty space. */
const openKey = computed<SectionKey>(() => (detailKey.value ?? 'question') as SectionKey)

watchEffect(() => {
  // A level on its way out after a navigation elsewhere answers about a route
  // it is no longer part of, so it judges nothing.
  if (level.stale.value) return
  if (level.mode.value === 'yield' || (detailKey.value && !(detailKey.value in SECTION_LABELS))) {
    showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
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
// A question that is not there is not a page, so it 404s rather than rendering an empty editor for it.
watchEffect(() => {
  if (!isNew.value && data.value && !record.value) showError(createError({ statusCode: 404, statusMessage: 'Question not found' }))
})

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
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/settings/localization`)

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
      // The record it became, not the `new` form it was, so Back from a saved
      // question goes to the list and never to an empty Add screen.
      await navigateTo(`${qaPath.value}/${created.id}`, { replace: true })
      return
    }
    await dashboardApi(`${qaEndpoint.value}/${qaId.value}`, { method: 'PATCH', body, validate: isQaUpdated })
    await refresh()
    await level.close()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Failed to save question')
  } finally {
    saving.value = false
  }
}

/** A cancelled leaf puts the loaded question back before it closes. */
function revert() {
  if (record.value) loadForm(record.value)
}

provide(qaEditorKey, { form, saving, saveDisabled, saveLabel, errorMessage, revert, save: saveOpenSection })

useSeoMeta({ title: 'Question | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
