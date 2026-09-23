<template>
  <!--
    A link is a record of its own, at `links/items/<id>`, with one leaf per
    field. Adding is the same screen at `links/items/new`, so there is nothing
    a sheet did that a URL does not.
  -->
  <DashboardIndexPanel id="site-links-item" :title="isNew ? 'New link' : itemForm.label || 'Link'" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
    <template v-if="record" #right>
      <DashboardResourceLocalization
        :organization-id="editor.organizationId"
        resource-type="content_block"
        :resource-id="record.id"
        resource-label="link"
        :fields="localizationFields"
        :load-values="locale => editor.loadLinksLocalization(locale, itemId)"
        :save-values="(locale, values) => editor.saveLinksLocalization(locale, values, itemId)"
        :language-settings-path="editor.siteLocalizationSettingsPath.value"
      />
    </template>

    <UAlert
      v-if="editor.errorMessage.value"
      class="mb-6"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="editor.errorMessage.value"
    />
    <div v-if="!editor.editorReady.value" class="space-y-3">
      <USkeleton v-for="index in 3" :key="index" class="h-20 rounded-2xl" />
    </div>
    <template v-else>
      <div v-if="isNew" class="mb-6 flex justify-end">
        <UButton :label="createActionLabel" :loading="editor.saving.value" @click="startOrCreate" />
      </div>
      <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
    </template>
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Reactive, Ref } from 'vue'
import type { LinkItemStatus } from '~/server/utils/links-page'

export interface LinkItemDraft {
  label: string
  destination: string
  status: LinkItemStatus
}

/** One link's draft and the Save that walks the fields a new one still needs. */
export interface LinkRecordEditor {
  itemForm: Reactive<LinkItemDraft>
  saveLabel: Ref<string | undefined>
  saveDisabled: Ref<boolean>
  save: () => Promise<void>
  revert: () => void
}

export const linkRecordKey = Symbol('link-record') as InjectionKey<LinkRecordEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { linksEditorKey } from '~/components/dashboard/LinksPageEditor.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const editor = inject(linksEditorKey)!
const level = useRouteLevel()

const SECTION_LABELS = { label: 'Label', destination: 'Destination', status: 'Status' } as const
type SectionKey = keyof typeof SECTION_LABELS

const itemId = computed(() => String(route.params.itemId))
const isNew = computed(() => itemId.value === 'new')
const record = computed(() => editor.items.value.find(item => item.id === itemId.value) ?? null)
// A link that is not in the page is not a page of its own: it 404s rather than rendering an empty editor for it.
watchEffect(() => {
  if (!isNew.value && editor.editorReady.value && !record.value) showError(createError({ statusCode: 404, statusMessage: 'Link not found' }))
})
/** The open field, for the create walk; with nothing open the walk starts at Label. */
const openKey = computed<SectionKey>(() => ((level.child.value ?? 'label') in SECTION_LABELS ? level.child.value ?? 'label' : 'label') as SectionKey)

const localizationFields = computed(() => [
  { key: 'label', label: 'Label', source: record.value?.label },
])

/**
 * The record's draft outlives any one leaf: moving between leaves remounts the
 * leaf beside it, so a plain `reactive` would lose the label on the way to the
 * destination — which is the whole of the create walk. One draft per record,
 * because a shared one carried an unsaved edit from one link into the next.
 */
const emptyDraft = (): LinkItemDraft => ({ label: '', destination: '', status: 'active' })
const itemForm = useState(`links-item-draft-${editor.organizationId}-${itemId.value}`, emptyDraft).value

/**
 * `new` is one key for every link ever added here, so leaving that screen has
 * to empty it. Left behind, the next Add opened pre-filled with the last link
 * and reported nothing outstanding, which created a duplicate on one click.
 */
function clearDraft() {
  Object.assign(itemForm, emptyDraft())
}

/**
 * Leaving the record empties it. Moving between its leaves is what the draft
 * outlives; the list and the page above it are not part of that walk.
 */
onBeforeRouteLeave((to) => {
  if (to.path === level.path.value || to.path.startsWith(`${level.path.value}/`)) return
  clearDraft()
})

function loadDraft() {
  const row = record.value
  if (!row) return
  itemForm.label = row.label
  itemForm.destination = row.destination
  itemForm.status = row.status
}
watch(record, loadDraft, { immediate: true })

/**
 * The page and its links are one document, so a link's Save sends the whole
 * list with this record's values folded in.
 */
async function commit() {
  editor.saving.value = true
  editor.errorMessage.value = ''
  try {
    const nextItems = isNew.value
      ? [...editor.items.value, {
          label: itemForm.label,
          destination: itemForm.destination,
          sort_order: editor.items.value.length,
          status: itemForm.status,
        }]
      : editor.items.value.map(item => item.id === itemId.value
        ? { ...item, label: itemForm.label, destination: itemForm.destination, status: itemForm.status }
        : item)
    const response = await editor.persist(nextItems)
    if (isNew.value) {
      const [createdId] = response.created_item_ids
      if (!createdId) throw new Error('The link was not created.')
      clearDraft()
      // The record it became, not the `new` form it was: Back from the created
      // link goes to the list, never to an empty Add screen.
      await navigateTo(`${level.to.value}/${createdId}`, { replace: true })
      return
    }
    await navigateTo(level.path.value)
  } catch (error) {
    editor.errorMessage.value = error instanceof ApiClientError
      ? error.message
      : error instanceof Error ? error.message : 'Unable to save link'
  } finally {
    editor.saving.value = false
  }
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'link',
    items: [
      { id: 'label', label: 'Label', summary: itemForm.label.trim() || 'Not named yet', placeholder: !itemForm.label.trim(), to: `${level.path.value}/label` },
      { id: 'destination', label: 'Destination', summary: itemForm.destination.trim() || 'No destination yet', placeholder: !itemForm.destination.trim(), to: `${level.path.value}/destination` },
      { id: 'status', label: 'Status', summary: itemForm.status === 'hidden' ? 'Hidden' : 'Active', to: `${level.path.value}/status` },
    ],
  },
])

const { createActionLabel, saveLabel, saveDisabled, save, startOrCreate } = useCreateWalk({
  recordPath: level.path,
  isNew,
  openKey,
  labels: SECTION_LABELS,
  order: ['label', 'destination'],
  missing: key => !String(itemForm[key]).trim(),
  noun: 'link',
  saving: computed(() => editor.saving.value || !editor.editorReady.value),
  // A required field cleared on another leaf would otherwise go back empty.
  existingBlocked: outstanding => outstanding.length > 0,
  commit,
})

provide(linkRecordKey, { itemForm, saveLabel, saveDisabled, save, revert: loadDraft })
</script>
