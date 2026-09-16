<template>
  <!--
    With nothing below it open, the block is the Sections list's detail column:
    its rows if it routes onward, its fields if it is one concern.
  -->
  <div v-if="frame.mode.value === 'index'" class="space-y-6">
    <template v-if="isNew">
      <UFormField label="Section type" required>
        <USelect
          :model-value="newType"
          :items="typeOptions"
          value-key="value"
          label-key="label"
          size="xl"
          class="w-full"
          placeholder="Choose a section type"
          @update:model-value="chooseType($event)"
        />
      </UFormField>
      <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
      <EditorNavigationList v-if="newBlock && navigationGroups.length" :groups="navigationGroups" />
      <div v-if="newBlock" class="flex justify-end">
        <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
      </div>
    </template>

    <!--
      A divider is the one block with nothing to edit. `block` has to be there
      to say so: without it this branch described whatever the route pointed at
      as a divider, including a section id that does not exist.
    -->
    <UAlert
      v-else-if="block && !sections.length"
      color="neutral"
      variant="soft"
      icon="i-lucide-minus"
      title="Divider"
      description="This section draws a line between the sections around it. Reorder or remove it from the Sections list."
    />

    <TenantPageBlockItemEditor
      v-else-if="singleSection?.kind === 'list'"
      :site-id="siteId"
      :page-id="pageId"
      :block-id="blockId"
      :collection="singleSection.collection!"
    />

    <TenantPageBlockFields
      v-else-if="singleSection && block"
      :site-id="siteId"
      :page-id="pageId"
      :block-id="blockId"
      :section-key="singleSection.key"
      @split-insert="splitMarkdown"
    />

    <EditorNavigationList v-else :groups="navigationGroups" />

  </div>

  <!-- Deeper than my own child: the record below owns both columns. -->
  <TenantPageBlockItemEditor
    v-else-if="frame.mode.value === 'yield'"
    :site-id="siteId"
    :page-id="pageId"
    :block-id="blockId"
    :collection="openCollection!"
  />

  <UDashboardPanel v-else id="site-page-block" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="blockLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sectionsPath" label="Sections" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :detail-title="openSection?.label"
        :dismiss-to="blockPath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="cancel"
        @save="saveOpenSection"
      >
        <template #index>
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <EditorNavigationList :groups="navigationGroups" :active-item="openSection?.key" />
        </template>

        <template #detail>
          <TenantPageBlockItemEditor
            v-if="openSection?.kind === 'list'"
            :site-id="siteId"
            :page-id="pageId"
            :block-id="blockId"
            :collection="openSection.collection!"
          />
          <TenantPageBlockFields
            v-else-if="openSection && block"
            :site-id="siteId"
            :page-id="pageId"
            :block-id="blockId"
            :section-key="openSection.key"
            @split-insert="splitMarkdown"
          />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import TenantPageBlockFields from '~/components/dashboard/TenantPageBlockFields.vue'
import TenantPageBlockItemEditor from '~/components/dashboard/TenantPageBlockItemEditor.vue'
import { getErrorMessage, showNotFound } from '~/utils/errors'
import { createTenantPageEditorData, tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import {
  TENANT_PAGE_BLOCK_REGISTRY,
  createTenantPageBlock,
  isTenantPageBlockAllowed,
  type TenantPageBlock,
  type TenantPageBlockType,
} from '~/utils/tenant-page-blocks'
import {
  TENANT_PAGE_RECORD_NOUNS,
  tenantPageBlockLabel,
  tenantPageBlockSections,
  type TenantPageBlockSection,
} from '~/utils/tenant-page-block-sections'

const props = defineProps<{ siteId: string; pageId: string }>()

const route = useRoute()
const toast = useToast()
const sectionsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages/${props.pageId}/sections`)
/** The path segment naming this block — its id, or `new` while it is being added. */
const blockId = computed(() => {
  const rest = route.path.startsWith(sectionsPath.value)
    ? route.path.slice(sectionsPath.value.length).replace(/^\//, '').split('/').filter(Boolean)
    : []
  return rest[0] ?? ''
})
const blockPath = computed(() => `${sectionsPath.value}/${blockId.value}`)
const frame = useEditorFrame(blockPath)

const { draft, dirty, ready, revert, commit } = useTenantPageDraft(props.siteId, props.pageId)
const newBlock = useTenantPageNewBlock(props.siteId, props.pageId)

const isNew = computed(() => blockId.value === 'new')
const saving = ref(false)
const errorMessage = ref('')

const block = computed<TenantPageBlock | null>(() => (isNew.value
  ? newBlock.value
  : draft.value.blocks.find(candidate => candidate.id === blockId.value) ?? null))

const blockLabel = computed(() => (isNew.value ? 'New section' : block.value ? tenantPageBlockLabel(block.value.type) : 'Section'))
const sections = computed<readonly TenantPageBlockSection[]>(() => (block.value ? tenantPageBlockSections(block.value) : []))
/** A block with one section is that section; there is no row to open it with. */
const singleSection = computed(() => (sections.value.length === 1 ? sections.value[0]! : null))


const openSegment = computed(() => frame.childSegment.value)
const openSection = computed(() => sections.value.find(section => section.key === openSegment.value) ?? null)
/** Which nested collection the route is inside, for the levels below this one. */
const openCollection = computed(() => {
  const segment = openSegment.value
  if (!segment) return null
  const asSection = sections.value.find(section => section.key === segment && section.kind === 'list')
  if (asSection) return asSection.collection ?? null
  // A single-section block is its own section, so its records hang directly off it.
  return singleSection.value?.kind === 'list' && singleSection.value.collection === segment
    ? singleSection.value.collection
    : null
})

// An unsupported route 404s rather than quietly showing something else. A block
// that is one section has no address for that section: the block is it — except
// while it is being created, when that address is the step the walk sends the
// author to, because the block's own level is still asking for a type.
watchEffect(() => {
  if (!ready.value && !isNew.value) return
  const segment = openSegment.value
  if (!segment) return
  if (openCollection.value) return
  if (!openSection.value) return showNotFound()
  if (singleSection.value && !isNew.value) return showNotFound()
  if (frame.rest.value.length > 1) showNotFound()
})

const typeOptions = computed(() => Object.values(TENANT_PAGE_BLOCK_REGISTRY)
  .filter(definition => isTenantPageBlockAllowed(definition, draft.value.recipe, draft.value.page_type))
  .map(definition => ({ label: definition.label, value: definition.type })))

const newType = computed(() => newBlock.value?.type)

function chooseType(value: unknown) {
  const type = String(value) as TenantPageBlockType
  if (!isTenantPageBlockAllowed(type, draft.value.recipe, draft.value.page_type)) return
  newBlock.value = createTenantPageBlock(type, createTenantPageEditorData(type), draft.value.blocks.length)
}

function sectionSummary(section: TenantPageBlockSection): { summary: string; placeholder: boolean } {
  const current = block.value
  if (!current) return { summary: 'Nothing yet', placeholder: true }
  if (section.kind === 'list') {
    const records = Array.isArray(current.data[section.collection!]) ? (current.data[section.collection!] as unknown[]).length : 0
    const noun = TENANT_PAGE_RECORD_NOUNS[section.collection!].one.toLowerCase()
    if (!records) return { summary: `No ${noun}s yet`, placeholder: true }
    return { summary: records === 1 ? `1 ${noun}` : `${records} ${noun}s`, placeholder: false }
  }
  if (section.key === 'image') {
    const has = current.media.some(item => item.slot === 'media')
    return { summary: has ? 'Chosen' : 'No image yet', placeholder: !has }
  }
  const summary = tenantPageBlockSummary({ ...current, data: sectionData(current, section) })
  return { summary: summary || 'Nothing yet', placeholder: !summary }
}

/** The fields this row stands for, so its preview reads that row rather than the block. */
function sectionData(current: TenantPageBlock, section: TenantPageBlockSection): Record<string, unknown> {
  const keys: Record<string, string[]> = {
    title: ['title'],
    copy: current.type === 'hero' ? ['eyebrow', 'title', 'subtitle'] : ['title', 'description'],
    message: ['title', 'body'],
    settings: ['title'],
    button: current.type === 'hero' ? ['cta_label', 'cta_url'] : ['label', 'url'],
    destination: ['destination'],
    locations: ['location_ids'],
    calculator: ['calculator'],
  }
  const picked: Record<string, unknown> = {}
  for (const key of keys[section.key] ?? []) picked[key] = current.data[key]
  return picked
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => {
  if (!sections.value.length) return []
  return [{
    id: 'block',
    items: sections.value.map((section) => {
      const { summary, placeholder } = sectionSummary(section)
      return { id: section.key, label: section.label, summary, placeholder, to: `${blockPath.value}/${section.key}` }
    }),
  }]
})

// ── Adding a section ────────────────────────────────────
// The type, then whatever the block will not be accepted without. What "will not
// be accepted" means is `validateTenantPageBlock` and nothing else.
type WalkKey = string
const walkLabels = computed<Record<WalkKey, string>>(() => {
  const labels: Record<WalkKey, string> = { type: 'Type' }
  for (const section of sections.value) labels[section.key] = section.label
  return labels
})
const walkOrder = computed<WalkKey[]>(() => ['type', ...sections.value.map(section => section.key)])
const newBlockInvalid = computed(() => Boolean(newBlock.value && validateTenantPageBlock(newBlock.value).length))
const openWalkKey = computed<WalkKey>(() => openSegment.value ?? 'type')

const { createActionLabel, saveLabel, saveDisabled: walkSaveDisabled, save: saveWalk, startOrCreate } = useCreateWalk({
  recordPath: blockPath,
  isNew,
  openKey: openWalkKey,
  labels: walkLabels,
  order: walkOrder,
  missing: (key) => {
    if (key === 'type') return !newBlock.value
    // Only the first section blocks creating: the rest of what a block can hold
    // is edited once it exists, like every other record.
    return newBlockInvalid.value && key === sections.value[0]?.key
  },
  noun: 'section',
  saving,
  commit: create,
})

const saveDisabled = computed(() => (isNew.value
  ? walkSaveDisabled.value
  : !dirty.value || Boolean(block.value && validateTenantPageBlock(block.value).length)))

function saveOpenSection() {
  if (isNew.value) return void saveWalk()
  void save()
}

async function create() {
  const pending = newBlock.value
  if (!pending) return
  saving.value = true
  errorMessage.value = ''
  try {
    draft.value.blocks = [...draft.value.blocks, { ...pending, position: draft.value.blocks.length }]
    const page = await commit()
    const created = page.blocks.find(candidate => candidate.id === pending.id)
    if (!created) throw new Error('The section was not created.')
    newBlock.value = null
    toast.add({ description: 'Section created', color: 'success' })
    await navigateTo(`${sectionsPath.value}/${created.id}`)
  } catch (cause) {
    // The page was not written, so the draft must not keep pretending it was.
    revert()
    errorMessage.value = getErrorMessage(cause, 'Failed to add this section')
  } finally {
    saving.value = false
  }
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await commit()
    toast.add({ description: `${openSection.value?.label ?? 'Section'} saved`, color: 'success' })
    await navigateTo(blockPath.value)
  } catch (cause) {
    errorMessage.value = getErrorMessage(cause, 'Failed to save this page')
  } finally {
    saving.value = false
  }
}

function cancel() {
  errorMessage.value = ''
  if (isNew.value) {
    newBlock.value = null
    void navigateTo(sectionsPath.value)
    return
  }
  revert()
  void navigateTo(blockPath.value)
}

/**
 * The rich editor can split the text it is holding and ask for another section
 * after it. The page already knows how to hold one more block, so that is all
 * this does — no second insertion path, and the same single save.
 */
function splitMarkdown(payload: { after: string; blockType: 'image' | 'faq' | 'how_to' }) {
  const current = block.value
  if (!current) return
  const index = draft.value.blocks.findIndex(candidate => candidate.id === current.id)
  if (index < 0) return
  const inserted = createTenantPageBlock(payload.blockType, createTenantPageEditorData(payload.blockType), index + 1)
  const next = [...draft.value.blocks]
  next.splice(index + 1, 0, inserted)
  if (payload.after.trim()) {
    next.splice(index + 2, 0, createTenantPageBlock('markdown', { ...createTenantPageEditorData('markdown'), markdown: payload.after }, index + 2))
  }
  draft.value.blocks = next.map((candidate, position) => ({ ...candidate, position }))
}

/** Leaving the add flow empties its draft, so the next Add starts blank. */
onBeforeRouteLeave((to) => {
  if (!isNew.value) return
  if (to.path === blockPath.value || to.path.startsWith(`${blockPath.value}/`)) return
  newBlock.value = null
})
</script>
