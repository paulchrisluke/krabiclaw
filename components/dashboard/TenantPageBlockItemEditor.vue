<template>
  <!--
    The fields of one record in one nested collection: a button, a step, a tier,
    a person, a grid item. Which fields depends on the collection and, where a
    record has several concerns, on which one is open.
  -->
  <div v-if="record" class="space-y-6">
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
      <template v-if="field === 'name'">
        <UFormField label="First name">
          <UInput :model-value="str('first_name')" size="xl" autofocus class="w-full" @update:model-value="set('first_name', $event)" />
        </UFormField>
        <UFormField label="Last name">
          <UInput :model-value="str('last_name')" size="xl" class="w-full" @update:model-value="set('last_name', $event)" />
        </UFormField>
      </template>
      <UFormField v-else-if="field === 'role'" label="Role">
        <UInput :model-value="str('title')" size="xl" autofocus class="w-full" @update:model-value="set('title', $event)" />
      </UFormField>
      <UFormField v-else-if="field === 'bio'" label="Bio">
        <UTextarea :model-value="str('bio')" :rows="8" autoresize autofocus class="w-full" @update:model-value="set('bio', $event)" />
      </UFormField>
      <UFormField v-else-if="field === 'photo'" label="Photo">
        <MediaPicker :site-id="siteId" :model-value="recordImage" :selected-summary="recordImageMedia" accept="image" @update:model-value="setRecordImage($event)" />
      </UFormField>
    </template>

    <!-- a grid item -->
    <template v-else>
      <template v-if="field === 'copy'">
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
      <UFormField v-else-if="field === 'icon'" label="Icon" description="A Heroicons name, such as ScaleIcon.">
        <UInput :model-value="str('icon')" size="xl" autofocus class="w-full" @update:model-value="set('icon', $event)" />
      </UFormField>
      <UFormField v-else-if="field === 'image'" label="Image">
        <MediaPicker :site-id="siteId" :model-value="recordImage" :selected-summary="recordImageMedia" accept="image" @update:model-value="setRecordImage($event)" />
      </UFormField>
      <template v-else-if="field === 'link'">
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

<script lang="ts">
import type { MaybeRefOrGetter } from 'vue'
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
 *
 * Three levels read this — the collection's list, a record's rows and a
 * record's field — and it is one function so the list, the rows and the field
 * all edit the same block in the same page draft.
 */
export function useTenantPageBlockRecords(siteId: string, pageId: string, blockId: string, collectionSource: MaybeRefOrGetter<TenantPageBlockCollection | null>, recordIndex: MaybeRefOrGetter<number> = -1) {
  const { draft } = useTenantPageDraft(siteId, pageId)
  const newBlock = useTenantPageNewBlock(siteId, pageId)

  // A section being created is not in the page draft yet — it is held beside it
  // until Create — and reading only the draft is how a Team under construction
  // reported "No items yet" over a person it was refusing to be created without.
  const block = computed(() => (blockId === 'new'
    ? newBlock.value
    : draft.value.blocks.find(candidate => candidate.id === blockId) ?? null))
  // Which collection is only known once the block is: a one-section block hangs
  // its records off a segment that names the collection, a many-section block off
  // a section whose kind says so, and both are read from the loaded block.
  const collectionRef = computed(() => toValue(collectionSource) ?? 'items')
  const records = computed<Array<Record<string, unknown>>>(() => {
    const value = block.value?.data[collectionRef.value]
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      : []
  })
  const isPerson = computed(() => block.value?.type === 'team_grid' && collectionRef.value === 'items')
  const noun = computed(() => {
    const entry = TENANT_PAGE_RECORD_NOUNS[collectionRef.value]
    const plural = isPerson.value ? 'People' : `${entry.one}s`
    return { one: entry.one, plural, add: entry.add }
  })
  const recordSections = computed(() => (block.value ? tenantPageRecordSections(block.value.type, collectionRef.value) : []))

  const index = computed(() => toValue(recordIndex))
  const record = computed(() => (index.value >= 0 ? records.value[index.value] ?? null : null))
  const recordTitle = computed(() => (record.value && block.value
    ? tenantPageRecordTitle(record.value, block.value.type, collectionRef.value, index.value)
    : noun.value.one))

  const text = (value: unknown) => (value == null ? '' : String(value))

  function summaryFor(item: Record<string, unknown>): string {
    if (collectionRef.value === 'buttons') return text(item.url)
    if (collectionRef.value === 'steps') return text(item.text)
    if (collectionRef.value === 'tiers') return text(item.description)
    if (isPerson.value) return text(item.title)
    return text(item.description) || text(item.summary) || text(item.body)
  }

  const listItems = computed(() => records.value.map((item, position) => ({
    id: String(position),
    title: block.value ? tenantPageRecordTitle(item, block.value.type, collectionRef.value, position) : `${noun.value.one} ${position + 1}`,
    summary: summaryFor(item),
  })))

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
    current.data[collectionRef.value] = next
  }

  function set(key: string, value: unknown) {
    const item = records.value[index.value]
    if (!item) return
    const next = [...records.value]
    next[index.value] = { ...item, [key]: value == null ? '' : String(value) }
    writeRecords(next)
  }

  // ── A record's own picture ──────────────────────────────
  // Stored as a placement on the block at `items.<index>.image`, which is what the
  // public renderer reads for both grid items and people.
  const imageSlot = computed(() => `items.${index.value}.image`)
  const recordImageMedia = computed(() => block.value?.media.find(item => item.slot === imageSlot.value) ?? null)
  const recordImage = computed(() => recordImageMedia.value?.asset_id ?? null)

  function setRecordImage(assetId: string | null | undefined) {
    const current = block.value
    if (!current) return
    const rest = current.media.filter(item => item.slot !== imageSlot.value)
    current.media = assetId ? [...rest, { asset_id: assetId, slot: imageSlot.value, sort_order: 0 }] : rest
  }

  // ── Adding, removing, reordering ────────────────────────
  function blankRecord(): Record<string, unknown> {
    if (collectionRef.value === 'buttons') return { label: '', url: '' }
    if (collectionRef.value === 'steps') return { name: '', text: '' }
    if (collectionRef.value === 'tiers') return { amount: '', title: '', description: '' }
    if (isPerson.value) return { first_name: '', last_name: '', title: '', bio: '' }
    return { title: '', description: '', value: '', label: '', url: '' }
  }

  /** Appends a blank record and returns its position. */
  function addRecord(): number {
    writeRecords([...records.value, blankRecord()])
    return records.value.length - 1
  }

  // A record's picture is addressed by the record's position, so any change to
  // the order has to carry the placements with it. Remapping the whole slot set
  // from the new order is one rule for removing and reordering alike.
  function remapMedia(order: number[]) {
    const current = block.value
    if (!current || collectionRef.value !== 'items') return
    current.media = current.media.flatMap((item) => {
      const match = /^items\.(\d+)\.image$/.exec(item.slot)
      if (!match) return [item]
      const position = order.indexOf(Number(match[1]))
      return position < 0 ? [] : [{ ...item, slot: `items.${position}.image` }]
    })
  }

  function removeRecord(item: { id: string }) {
    const at = Number(item.id)
    const order = records.value.map((_, position) => position).filter(position => position !== at)
    writeRecords(order.map(position => records.value[position]!))
    remapMedia(order)
  }

  function move(item: { id: string }, direction: -1 | 1) {
    const at = Number(item.id)
    const nextIndex = at + direction
    if (nextIndex < 0 || nextIndex >= records.value.length) return
    const order = records.value.map((_, position) => position)
    const [moved] = order.splice(at, 1)
    if (moved === undefined) return
    order.splice(nextIndex, 0, moved)
    writeRecords(order.map(position => records.value[position]!))
    remapMedia(order)
  }

  return { block, records, record, recordTitle, noun, isPerson, recordSections, listItems, leafSummary, str, set, recordImage, recordImageMedia, setRecordImage, addRecord, removeRecord, move }
}
</script>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'

const props = defineProps<{
  siteId: string
  pageId: string
  blockId: string
  collection: TenantPageBlockCollection
  recordIndex: number
  /** The open concern of a record that has several; a record with one shows all its fields. */
  field: string | null
}>()

const { record, isPerson, str, set, recordImage, recordImageMedia, setRecordImage } = useTenantPageBlockRecords(
  props.siteId, props.pageId, props.blockId, props.collection, () => props.recordIndex,
)
</script>
