<template>
  <UFormField :label="field.label" :required="field.required" :description="description">
    <!-- A list of plain strings — how_to's tools and supplies. -->
    <UInputTags
      v-if="field.kind === 'list'"
      :model-value="stringList"
      size="xl"
      class="w-full"
      @update:model-value="writeStringList($event)"
    />

    <RichTextEditor
      v-else-if="field.kind === 'markdown'"
      :model-value="stringValue"
      :mode="markdownMode"
      placeholder="Start writing in Markdown…"
      @update:model-value="write($event)"
      @split-insert="$emit('splitInsert', $event)"
    />

    <USelect
      v-else-if="field.kind === 'enum'"
      :model-value="enumValue"
      :items="options"
      value-key="value"
      label-key="label"
      size="xl"
      class="w-full"
      @update:model-value="writeEnum($event)"
    />

    <TenantPageCalculatorField
      v-else-if="field.kind === 'calculator'"
      :site-id="siteId"
      :page-id="pageId"
      :block-id="blockId"
    />

    <TenantPageGalleryField
      v-else-if="field.kind === 'media' && field.slot === 'gallery'"
      :site-id="siteId"
      :page-id="pageId"
      :block-id="blockId"
    />

    <MediaPicker
      v-else-if="field.kind === 'media'"
      :site-id="siteId"
      :model-value="mediaAsset"
      accept="image"
      @update:model-value="writeMedia($event)"
    />

    <USelectMenu
      v-else-if="field.kind === 'reference' && multipleReference"
      :model-value="stringList"
      :items="referenceOptions"
      value-key="value"
      label-key="label"
      multiple
      size="xl"
      class="w-full"
      :placeholder="`Choose ${field.label.toLowerCase()}`"
      @update:model-value="writeStringList($event)"
    />

    <USelectMenu
      v-else-if="field.kind === 'reference'"
      :model-value="stringValue || undefined"
      :items="referenceOptions"
      value-key="value"
      label-key="label"
      size="xl"
      class="w-full"
      :placeholder="`Choose a ${field.label.toLowerCase()}`"
      @update:model-value="write($event)"
    />

    <UTextarea
      v-else-if="field.multiline"
      :model-value="stringValue"
      :rows="4"
      autoresize
      class="w-full"
      @update:model-value="write($event)"
    />

    <UInput
      v-else
      :model-value="stringValue"
      size="xl"
      :type="field.kind === 'url' ? 'text' : 'text'"
      :placeholder="field.kind === 'url' ? '/contact or https://example.com' : undefined"
      :autofocus="autofocus"
      class="w-full"
      @update:model-value="write($event)"
    />
  </UFormField>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import RichTextEditor from '~/components/ui/RichTextEditor.vue'
import TenantPageGalleryField from '~/components/dashboard/TenantPageGalleryField.vue'
import TenantPageCalculatorField from '~/components/dashboard/TenantPageCalculatorField.vue'
import { isPlatformTemplate, resolvePublicTemplate } from '~/utils/template-registry'
import { tenantPageBlockPresets } from '~/utils/tenant-page-presentation'
import type { TenantPageField } from '~/utils/tenant-page-blocks'

/**
 * One declared field, drawn as the control its kind calls for.
 *
 * Every control the editor has lived in one 200-line `v-if` chain keyed by
 * block type and then by section, which is why a field could be declared and
 * never shown, or shown and never saved: the chain and the contract were two
 * different documents. Here the contract is the only document — a field exists
 * because the registry declares it, and it is editable because it exists.
 */
const props = defineProps<{
  siteId: string
  pageId: string
  blockId: string
  fieldKey: string
  field: TenantPageField
  autofocus?: boolean
  /** Records this field may reference, already loaded by the leaf that owns them. */
  referenceOptions?: { label: string; value: string }[]
}>()

defineEmits<{ splitInsert: [{ after: string; blockType: 'image' | 'faq' | 'how_to'; editorMode: 'rich' | 'source' }] }>()

const block = useTenantPageBlock(props.siteId, props.pageId, () => props.blockId)
const dashboard = useDashboardSite()

/** The template this site publishes with, which decides its presets. */
const templateSlug = computed(() => resolvePublicTemplate({
  themeId: dashboard.site.value?.theme_id,
  vertical: dashboard.site.value?.vertical,
}).slug)

const stringValue = computed(() => {
  const value = block.value.data[props.fieldKey]
  return value == null ? '' : String(value)
})

const stringList = computed(() => {
  const value = block.value.data[props.fieldKey]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
})

const multipleReference = computed(() => props.fieldKey.endsWith('_ids'))

/**
 * A preset's choices are the presentations this template actually has. The
 * editor therefore cannot offer one no renderer can draw — the failure that
 * made every CMS-authored block invisible on a Blawby or platform page.
 */
const options = computed(() => {
  if (props.fieldKey === 'preset') {
    return tenantPageBlockPresets(templateSlug.value, block.value.type)
      .map(value => ({ value, label: presetLabel(value) }))
  }
  const platform = isPlatformTemplate({ themeId: dashboard.site.value?.theme_id })
  return (props.field.options ?? []).filter(option => !option.platformOnly || platform)
})

function presetLabel(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/^\w/, character => character.toUpperCase())
}

const description = computed(() => {
  if (props.fieldKey === 'preset') return 'How this template draws this section.'
  if (props.field.pairedWith) return 'Set this together with its pair, or leave both empty.'
  return undefined
})

/**
 * `level` is the block's own column, not its data. The level control used to
 * write `data.level`, which the writer deletes on save and no renderer reads,
 * so choosing a heading level did nothing at all.
 */
const enumValue = computed(() => (props.field.store === 'level'
  ? String(block.value.level ?? props.field.default ?? '')
  : stringValue.value || props.field.default || ''))

const markdownMode = computed<'rich' | 'source'>(() => (String(block.value.data.editor_mode) === 'source' ? 'source' : 'rich'))

const mediaAsset = computed(() => block.value.media
  .filter(item => item.slot === (props.field.slot ?? 'media'))
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.asset_id)

function write(value: unknown) {
  block.value.data[props.fieldKey] = value == null ? '' : String(value)
}

function writeEnum(value: unknown) {
  if (props.field.store !== 'level') {
    write(value)
    return
  }
  const level = Number(value)
  block.value.level = Number.isInteger(level) && level >= 1 && level <= 6 ? level : null
}

function writeStringList(value: unknown) {
  block.value.data[props.fieldKey] = Array.isArray(value) ? value.map(item => String(item)) : []
}

function writeMedia(assetId: string | null | undefined) {
  const slot = props.field.slot ?? 'media'
  block.value.media = [
    ...block.value.media.filter(item => item.slot !== slot),
    ...(assetId ? [{ asset_id: assetId, slot, sort_order: 0 }] : []),
  ]
}
</script>
