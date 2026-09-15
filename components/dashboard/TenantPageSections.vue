<template>
  <!--
    With no section open, Sections is the page's detail column: the list and
    nothing else.
  -->
  <DashboardListEditor
    v-if="frame.mode.value === 'index'"
    v-model:editing="editing"
    title="Sections"
    description="What this page shows, in the order it shows it."
    :items="listItems"
    empty-title="No sections yet"
    empty-icon="i-lucide-layout-list"
    add-label="Add a section"
    reorderable
    @add="openNew"
    @open="open"
    @remove="remove"
    @move="move"
  >
    <template #item="{ item }">
      <button type="button" class="block w-full text-left" @click="open(item)">
        <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
        <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
      </button>
    </template>
  </DashboardListEditor>

  <!-- Deeper than my own child: the block owns both columns. -->
  <TenantPageBlockEditorPage
    v-else-if="frame.mode.value === 'yield'"
    :site-id="siteId"
    :page-id="pageId"
  />

  <UDashboardPanel v-else id="site-page-sections" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="openTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sectionsPath" label="Sections" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :detail-title="openTitle"
        :dismiss-to="sectionsPath"
        :show-actions="showActions"
        :saving="saving"
        :save-disabled="saveDisabled"
        @cancel="cancel"
        @save="save"
      >
        <template #index>
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <DashboardListEditor
            v-model:editing="editing"
            title="Sections"
            :items="listItems"
            empty-title="No sections yet"
            empty-icon="i-lucide-layout-list"
            add-label="Add a section"
            reorderable
            @add="openNew"
            @open="open"
            @remove="remove"
            @move="move"
          >
            <template #item="{ item }">
              <button type="button" class="block w-full text-left" @click="open(item)">
                <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
                <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
              </button>
            </template>
          </DashboardListEditor>
        </template>

        <template #detail>
          <TenantPageBlockEditorPage :site-id="siteId" :page-id="pageId" />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import TenantPageBlockEditorPage from '~/components/dashboard/TenantPageBlockEditorPage.vue'
import { getErrorMessage } from '~/utils/errors'
import { tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { tenantPageBlockIsHub, tenantPageBlockLabel } from '~/utils/tenant-page-block-sections'

const props = defineProps<{ siteId: string; pageId: string }>()

const route = useRoute()
const toast = useToast()
const recordPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages/${props.pageId}`)
const sectionsPath = computed(() => `${recordPath.value}/sections`)
const frame = useEditorFrame(sectionsPath)

const { draft, dirty, ready, revert, commit } = useTenantPageDraft(props.siteId, props.pageId)

const editing = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const openBlockId = computed(() => frame.childSegment.value ?? '')
const openBlock = computed(() => draft.value.blocks.find(block => block.id === openBlockId.value) ?? null)
const isNewBlock = computed(() => openBlockId.value === 'new')

// A section that is not there is not a page — once the page it would be in has
// actually been read.
watchEffect(() => {
  if (!ready.value) return
  if (!openBlockId.value || isNewBlock.value) return
  if (!openBlock.value) throw createError({ statusCode: 404, statusMessage: 'Section not found' })
})

const openTitle = computed(() => {
  if (isNewBlock.value) return 'New section'
  return openBlock.value ? tenantPageBlockLabel(openBlock.value.type) : 'Section'
})

const listItems = computed(() => draft.value.blocks.map(block => ({
  id: block.id,
  title: tenantPageBlockLabel(block.type),
  summary: tenantPageBlockSummary(block),
})))

/**
 * The commit bar belongs to the level that is showing a leaf. A block that
 * routes onward shows rows, and rows have nothing to save; a block that is one
 * concern shows its fields here, and those do. Adding a section carries its own
 * create control, the way every other record does.
 */
const showActions = computed(() => Boolean(openBlock.value) && !tenantPageBlockIsHub(openBlock.value!))
const saveDisabled = computed(() => !dirty.value
  || Boolean(openBlock.value && validateTenantPageBlock(openBlock.value).length))

function openNew() {
  void navigateTo(`${sectionsPath.value}/new`)
}

function open(item: { id: string }) {
  void navigateTo(`${sectionsPath.value}/${item.id}`)
}

/**
 * Reordering and removing are edits to the draft, committed once by Save —
 * never a write per press, and never a write per movement.
 */
function reindex() {
  draft.value.blocks = draft.value.blocks.map((block, position) => ({ ...block, position }))
}

function remove(item: { id: string }) {
  draft.value.blocks = draft.value.blocks.filter(block => block.id !== item.id)
  reindex()
}

function move(item: { id: string }, direction: -1 | 1) {
  const index = draft.value.blocks.findIndex(block => block.id === item.id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= draft.value.blocks.length) return
  const next = [...draft.value.blocks]
  const [moved] = next.splice(index, 1)
  if (!moved) return
  next.splice(nextIndex, 0, moved)
  draft.value.blocks = next
  reindex()
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await commit()
    toast.add({ description: 'Section saved', color: 'success' })
    await navigateTo(sectionsPath.value)
  } catch (cause) {
    errorMessage.value = getErrorMessage(cause, 'Failed to save this page')
  } finally {
    saving.value = false
  }
}

function cancel() {
  errorMessage.value = ''
  revert()
  void navigateTo(sectionsPath.value)
}
</script>
