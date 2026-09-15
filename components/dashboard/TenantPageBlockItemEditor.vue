<template>
  <!-- The browse state: records, not every record's form at once. -->
  <DashboardListEditor
    v-if="frame.mode.value === 'index'"
    v-model:editing="editing"
    :title="noun.plural"
    :items="listItems"
    :empty-title="`No ${noun.plural.toLowerCase()} yet`"
    empty-icon="i-lucide-list"
    :add-label="noun.add"
    reorderable
    @add="addRecord"
    @open="open"
    @remove="removeRecord"
    @move="move"
  >
    <template #item="{ item }">
      <button type="button" class="block w-full text-left" @click="open(item)">
        <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
        <p v-if="item.summary" class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
      </button>
    </template>
  </DashboardListEditor>

  <UDashboardPanel v-else id="site-page-block-record" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="recordTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="collectionPath" :label="noun.plural" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :detail-title="detailTitle"
        :dismiss-to="recordSections.length ? recordPath : collectionPath"
        :show-actions="!recordSections.length || Boolean(openLeaf)"
        :saving="saving"
        :save-disabled="saveDisabled"
        @cancel="cancel"
        @save="save"
      >
        <template #index>
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <!--
            A record with one concern is the leaf; the list stays beside it. A
            record with several is a hub, and its rows take the index column.
          -->
          <EditorNavigationList v-if="recordSections.length && openLeaf" :groups="recordGroups" :active-item="openLeaf" />
          <DashboardListEditor
            v-else
            v-model:editing="editing"
            :title="noun.plural"
            :items="listItems"
            :empty-title="`No ${noun.plural.toLowerCase()} yet`"
            empty-icon="i-lucide-list"
            :add-label="noun.add"
            reorderable
            @add="addRecord"
            @open="open"
            @remove="removeRecord"
            @move="move"
          >
            <template #item="{ item }">
              <button type="button" class="block w-full text-left" @click="open(item)">
                <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
                <p v-if="item.summary" class="mt-1 line-clamp-2 text-sm text-muted">{{ item.summary }}</p>
              </button>
            </template>
          </DashboardListEditor>
        </template>

        <template #detail>
          <EditorNavigationList v-if="recordSections.length && !openLeaf" :groups="recordGroups" />

          <div v-else-if="record" class="space-y-6">
            <!-- buttons -->
            <template v-if="collection === 'buttons'">
              <UFormField label="Label" required>
                <UInput :model-value="str('label')" size="xl" autofocus class="w-full" @update:model-value="set('label', $event)" />
              </UFormField>
              <UFormField label="URL" required>
                <UInput :model-value="str('url')" size="xl" placeholder="/contact or https://example.com" class="w-full" @update:model-value="set('url', $event)" />
              </UFormField>
            </template>

            <!-- steps -->
            <template v-else-if="collection === 'steps'">
              <UFormField label="Step name">
                <UInput :model-value="str('name')" size="xl" autofocus class="w-full" @update:model-value="set('name', $event)" />
              </UFormField>
              <UFormField label="Instructions">
                <UTextarea :model-value="str('text')" :rows="6" autoresize class="w-full" @update:model-value="set('text', $event)" />
              </UFormField>
            </template>

            <!-- tiers -->
            <template v-else-if="collection === 'tiers'">
              <UFormField label="Amount" required>
                <UInput :model-value="str('amount')" size="xl" autofocus class="w-full" @update:model-value="set('amount', $event)" />
              </UFormField>
              <UFormField label="Title" required>
                <UInput :model-value="str('title')" size="xl" class="w-full" @update:model-value="set('title', $event)" />
              </UFormField>
              <UFormField label="Description">
                <UInput :model-value="str('description')" size="xl" class="w-full" @update:model-value="set('description', $event)" />
              </UFormField>
            </template>

            <!-- a person -->
            <template v-else-if="isPerson">
              <template v-if="openLeaf === 'name'">
                <UFormField label="First name">
                  <UInput :model-value="str('first_name')" size="xl" autofocus class="w-full" @update:model-value="set('first_name', $event)" />
                </UFormField>
                <UFormField label="Last name">
                  <UInput :model-value="str('last_name')" size="xl" class="w-full" @update:model-value="set('last_name', $event)" />
                </UFormField>
              </template>
              <UFormField v-else-if="openLeaf === 'role'" label="Role">
                <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="set('title', $event)" />
              </UFormField>
              <UFormField v-else-if="openLeaf === 'bio'" label="Bio">
                <UTextarea :model-value="str('bio')" :rows="8" autoresize autofocus class="w-full" @update:model-value="set('bio', $event)" />
              </UFormField>
              <UFormField v-else-if="openLeaf === 'photo'" label="Photo">
                <MediaPicker :site-id="siteId" :model-value="recordImage" accept="image" @update:model-value="setRecordImage($event)" />
              </UFormField>
            </template>

            <!-- a grid item -->
            <template v-else>
              <template v-if="openLeaf === 'copy'">
                <UFormField label="Title">
                  <UInput :model-value="str('title', ['name'])" size="xl" autofocus class="w-full" @update:model-value="set('title', $event)" />
                </UFormField>
                <UFormField label="Description">
                  <UTextarea :model-value="str('description', ['summary', 'body'])" :rows="4" autoresize class="w-full" @update:model-value="set('description', $event)" />
                </UFormField>
                <UFormField label="Value" description="A figure shown beside the title, if this row has one.">
                  <UInput :model-value="str('value')" size="xl" class="w-full" @update:model-value="set('value', $event)" />
                </UFormField>
              </template>
              <UFormField
                v-else-if="openLeaf === 'icon'"
                label="Icon"
                description="A Heroicons name, such as ScaleIcon."
              >
                <UInput :model-value="str('icon')" size="xl" autofocus class="w-full" @update:model-value="set('icon', $event)" />
              </UFormField>
              <UFormField v-else-if="openLeaf === 'image'" label="Image">
                <MediaPicker :site-id="siteId" :model-value="recordImage" accept="image" @update:model-value="setRecordImage($event)" />
              </UFormField>
              <template v-else-if="openLeaf === 'link'">
                <UFormField label="Link label">
                  <UInput :model-value="str('label', ['cta_label'])" size="xl" autofocus class="w-full" @update:model-value="set('label', $event)" />
                </UFormField>
                <UFormField label="Link URL">
                  <UInput :model-value="str('url', ['cta_url'])" size="xl" placeholder="/about or https://example.com" class="w-full" @update:model-value="set('url', $event)" />
                </UFormField>
              </template>
            </template>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  TENANT_PAGE_RECORD_NOUNS,
  tenantPageRecordSections,
  tenantPageRecordTitle,
  type TenantPageBlockCollection,
} from '~/utils/tenant-page-block-sections'

/**
 * One nested collection of one block: its records, and whatever a record holds.
 *
 * Records have no ids of their own, so they are addressed by position — which
 * is also how their media is stored (`items.<index>.image`), so moving a record
 * moves its picture with it rather than leaving the two to disagree.
 */
const props = defineProps<{
  siteId: string
  pageId: string
  blockId: string
  collection: TenantPageBlockCollection
}>()

const route = useRoute()
const toast = useToast()
const blockPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/pages/${props.pageId}/sections/${props.blockId}`)
const collectionPath = computed(() => `${blockPath.value}/${props.collection}`)
const frame = useEditorFrame(collectionPath)

const { draft, dirty, ready, revert, commit } = useTenantPageDraft(props.siteId, props.pageId)

const editing = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const block = computed(() => draft.value.blocks.find(candidate => candidate.id === props.blockId) ?? null)
const records = computed<Array<Record<string, unknown>>>(() => {
  const value = block.value?.data[props.collection]
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
})

const noun = computed(() => {
  const entry = TENANT_PAGE_RECORD_NOUNS[props.collection]
  const plural = props.collection === 'items' && block.value?.type === 'team_grid' ? 'People' : `${entry.one}s`
  return { one: entry.one, plural, add: entry.add }
})

const recordIndex = computed(() => {
  const segment = frame.rest.value[0]
  if (segment === undefined) return -1
  const index = Number(segment)
  return Number.isInteger(index) && index >= 0 ? index : -1
})
const record = computed(() => (recordIndex.value >= 0 ? records.value[recordIndex.value] ?? null : null))
const recordPath = computed(() => `${collectionPath.value}/${recordIndex.value}`)
const openLeaf = computed(() => frame.rest.value[1] ?? null)

const recordSections = computed(() => (block.value ? tenantPageRecordSections(block.value.type, props.collection) : []))
const isPerson = computed(() => block.value?.type === 'team_grid' && props.collection === 'items')

// A record that is not there is not a page, and neither is a leaf a record does
// not have.
watchEffect(() => {
  if (!ready.value) return
  const rest = frame.rest.value
  if (rest.length === 0) return
  if (!record.value) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  if (rest.length > 2) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  if (rest.length === 2) {
    const leaf = rest[1]!
    if (!recordSections.value.some(section => section.key === leaf)) {
      throw createError({ statusCode: 404, statusMessage: 'Page not found' })
    }
  }
})

const recordTitle = computed(() => (record.value && block.value
  ? tenantPageRecordTitle(record.value, block.value.type, props.collection, recordIndex.value)
  : noun.value.one))

const detailTitle = computed(() => {
  if (!recordSections.value.length) return recordTitle.value
  if (!openLeaf.value) return recordTitle.value
  return recordSections.value.find(section => section.key === openLeaf.value)?.label ?? recordTitle.value
})

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

const listItems = computed(() => records.value.map((item, index) => ({
  id: String(index),
  title: block.value ? tenantPageRecordTitle(item, block.value.type, props.collection, index) : `${noun.value.one} ${index + 1}`,
  summary: summaryFor(item),
})))

function summaryFor(item: Record<string, unknown>): string {
  if (props.collection === 'buttons') return text(item.url)
  if (props.collection === 'steps') return text(item.text)
  if (props.collection === 'tiers') return text(item.description)
  if (isPerson.value) return text(item.title)
  return text(item.description) || text(item.summary) || text(item.body)
}

const recordGroups = computed<EditorNavigationGroup[]>(() => [{
  id: 'record',
  items: recordSections.value.map(section => ({
    id: section.key,
    label: section.label,
    summary: leafSummary(section.key),
    placeholder: !leafSummary(section.key),
    to: `${recordPath.value}/${section.key}`,
  })),
}])

function leafSummary(key: string): string {
  const item = record.value
  if (!item) return ''
  if (key === 'name') return [text(item.first_name), text(item.last_name)].filter(Boolean).join(' ')
  if (key === 'role') return text(item.title)
  if (key === 'bio') return text(item.bio)
  if (key === 'photo' || key === 'image') return recordImage.value ? 'Chosen' : ''
  if (key === 'copy') return text(item.title) || text(item.name) || text(item.description)
  if (key === 'icon') return text(item.icon)
  if (key === 'link') return text(item.url) || text(item.cta_url)
  return ''
}

// ── Reading and writing one record ──────────────────────
function str(key: string, aliases: string[] = []): string {
  const item = record.value
  if (!item) return ''
  for (const candidate of [key, ...aliases]) if (item[candidate] != null) return String(item[candidate])
  return ''
}

function writeRecords(next: Array<Record<string, unknown>>) {
  const current = block.value
  if (!current) return
  current.data[props.collection] = next
}

function set(key: string, value: unknown) {
  const index = recordIndex.value
  const item = records.value[index]
  if (!item) return
  const next = [...records.value]
  next[index] = { ...item, [key]: value == null ? '' : String(value) }
  writeRecords(next)
}

// ── A record's own picture ──────────────────────────────
// Stored as a placement on the block at `items.<index>.image`, which is what the
// public renderer reads for both grid items and people.
const imageSlot = computed(() => `items.${recordIndex.value}.image`)
const recordImage = computed(() => block.value?.media.find(item => item.slot === imageSlot.value)?.asset_id ?? null)

function setRecordImage(assetId: string | null | undefined) {
  const current = block.value
  if (!current) return
  const rest = current.media.filter(item => item.slot !== imageSlot.value)
  current.media = assetId ? [...rest, { asset_id: assetId, slot: imageSlot.value, sort_order: 0 }] : rest
}

// ── Adding, removing, reordering ────────────────────────
function blankRecord(): Record<string, unknown> {
  if (props.collection === 'buttons') return { label: '', url: '' }
  if (props.collection === 'steps') return { name: '', text: '' }
  if (props.collection === 'tiers') return { amount: '', title: '', description: '' }
  if (isPerson.value) return { first_name: '', last_name: '', title: '', bio: '' }
  return { title: '', description: '', value: '', label: '', url: '' }
}

function addRecord() {
  writeRecords([...records.value, blankRecord()])
  void navigateTo(`${collectionPath.value}/${records.value.length - 1}`)
}

function open(item: { id: string }) {
  void navigateTo(`${collectionPath.value}/${item.id}`)
}

/**
 * A record's picture is addressed by the record's position, so any change to the
 * order has to carry the placements with it. Remapping the whole slot set from
 * the new order is one rule for removing and reordering alike.
 */
function remapMedia(order: number[]) {
  const current = block.value
  if (!current || props.collection !== 'items') return
  const next = current.media.flatMap((item) => {
    const match = /^items\.(\d+)\.image$/.exec(item.slot)
    if (!match) return [item]
    const position = order.indexOf(Number(match[1]))
    return position < 0 ? [] : [{ ...item, slot: `items.${position}.image` }]
  })
  current.media = next
}

function removeRecord(item: { id: string }) {
  const index = Number(item.id)
  const order = records.value.map((_, position) => position).filter(position => position !== index)
  writeRecords(order.map(position => records.value[position]!))
  remapMedia(order)
}

function move(item: { id: string }, direction: -1 | 1) {
  const index = Number(item.id)
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= records.value.length) return
  const order = records.value.map((_, position) => position)
  const [moved] = order.splice(index, 1)
  if (moved === undefined) return
  order.splice(nextIndex, 0, moved)
  writeRecords(order.map(position => records.value[position]!))
  remapMedia(order)
}

const saveDisabled = computed(() => !dirty.value)

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await commit()
    toast.add({ description: `${noun.value.one} saved`, color: 'success' })
    await navigateTo(recordSections.value.length && openLeaf.value ? recordPath.value : collectionPath.value)
  } catch (cause) {
    errorMessage.value = getErrorMessage(cause, 'Failed to save this page')
  } finally {
    saving.value = false
  }
}

function cancel() {
  errorMessage.value = ''
  revert()
  void navigateTo(recordSections.value.length && openLeaf.value ? recordPath.value : collectionPath.value)
}
</script>
