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

  <template v-else>
    <UDashboardPanel
      id="site-page-sections"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar :title="openTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sectionsPath" label="Sections" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
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
        </div>
      </template>
    </UDashboardPanel>

    <!--
      The open level is the other column: its own panel, its own header,
      and Save/Cancel in the panel's own footer slot.
    -->
    <UDashboardPanel v-if="hasDetail" id="site-page-section">
      <template #header>
        <UDashboardNavbar :title="openTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sectionsPath" label="Sections" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-5xl">
          <TenantPageBlockEditorPage :site-id="siteId" :page-id="pageId" />
        </div>
      </template>

      <template v-if="showActions" #footer>
        <div class="flex shrink-0 items-center justify-between gap-4 border-t border-default px-4 py-3 sm:px-6">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="cancel" />
          <UButton :label="'Save'" :loading="saving" :disabled="saveDisabled" @click="save" />
        </div>
      </template>
    </UDashboardPanel>
  </template>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import TenantPageBlockEditorPage from '~/components/dashboard/TenantPageBlockEditorPage.vue'
import { getErrorMessage, showNotFound } from '~/utils/errors'
import { tenantPageBlockSummary, validateTenantPageBlock } from '~/utils/tenant-page-editor'
import { tenantPageBlockIsHub, tenantPageBlockLabel } from '~/utils/tenant-page-block-sections'

const props = defineProps<{ siteId: string; pageId: string }>()

const route = useRoute()
const recordPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages/${props.pageId}`)
const sectionsPath = computed(() => `${recordPath.value}/sections`)
const frame = useEditorFrame(sectionsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

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
  if (!openBlock.value) showNotFound('Section not found')
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
