<template>
  <div class="space-y-6">
    <DashboardGridEditor
      v-model:selecting="selecting"
      v-model:selected="selectedIds"
      :items="gridItems"
      :title="title"
      :description="description"
      :empty-title="emptyTitle"
      empty-icon="i-lucide-images"
      :add-label="addLabel"
      :selection-title="addLabel"
      :pending="pending"
      :error="error"
      :removing="mutating"
      @add="addOpen = true"
      @open="openPhoto"
      @remove-many="removeMany"
    >
      <template #tile="{ item }">
        <img
          v-if="item.url"
          :src="item.url"
          :alt="item.alt"
          class="h-full w-full object-cover"
          loading="lazy"
        >
        <span v-else class="flex h-full w-full items-center justify-center bg-elevated">
          <UIcon :name="item.kind === 'video' ? 'i-lucide-film' : 'i-lucide-image'" class="size-5 text-muted" />
        </span>
        <!--
          The first photo is the cover. It is shown, never asked: there is one
          set of photos and its order decides what leads.
        -->
        <span
          v-if="item.isCover"
          class="absolute left-1.5 top-1.5 rounded-full bg-default/90 px-2 py-0.5 text-[11px] font-medium text-highlighted shadow-sm"
        >Cover</span>
      </template>
    </DashboardGridEditor>

    <!-- One photo: what it is, where it sits, and how to remove it. -->
    <DashboardListItemDialog
      v-model:open="photoOpen"
      :title="openPhoto0?.isCover ? 'Cover photo' : 'Photo'"
      removable
      :saving="mutating"
      :removing="mutating"
      save-label="Done"
      @save="photoOpen = false"
      @remove="removeOpenPhoto"
    >
      <img
        v-if="openPhoto0?.url"
        :src="openPhoto0.url"
        :alt="openPhoto0.alt"
        class="mx-auto max-h-64 rounded-lg object-contain"
      >
      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          v-if="openPhoto0 && !openPhoto0.isCover"
          label="Make cover"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-up-to-line"
          :loading="mutating"
          @click="makeCover"
        />
        <UButton
          v-if="openPhoto0 && !openPhoto0.isCover"
          label="Move earlier"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :loading="mutating"
          @click="move(-1)"
        />
        <UButton
          v-if="openPhoto0 && !openPhoto0.isLast"
          label="Move later"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-right"
          :loading="mutating"
          @click="move(1)"
        />
      </div>
    </DashboardListItemDialog>

    <UModal v-model:open="addOpen" :title="addLabel" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <MediaLibraryGrid
          :site-id="siteId"
          :accept="accept"
          :location-id="locationId"
          @select="onPicked"
          @uploaded="onPicked"
        />
      </template>
      <template #footer>
        <div class="flex justify-end px-1">
          <UButton color="neutral" variant="ghost" label="Done" @click="addOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import DashboardGridEditor from '~/components/dashboard/DashboardGridEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import MediaLibraryGrid from '~/lib/components/workspace/media/MediaLibraryGrid.vue'

export interface ManagedPhoto {
  asset_id: string
  url: string | null
  alt: string
  kind: 'image' | 'video' | string | null
}

const props = withDefaults(defineProps<{
  /** Ordered; the first is the cover. */
  photos: ManagedPhoto[]
  siteId: string
  title: string
  addLabel: string
  emptyTitle: string
  description?: string
  locationId?: string | null
  accept?: 'image' | 'video' | 'any'
  pending?: boolean
  error?: string | null
  mutating?: boolean
  /** Caps the set, so a single-photo owner uses this same manager. */
  max?: number
}>(), {
  description: undefined,
  locationId: null,
  accept: 'image',
  pending: false,
  error: null,
  mutating: false,
  max: undefined,
})

const emit = defineEmits<{
  /** The next full order, cover first. */
  reorder: [assetIds: string[]]
  add: [assetId: string]
  remove: [assetIds: string[]]
}>()

const selecting = ref(false)
const selectedIds = ref<string[]>([])
const addOpen = ref(false)
const photoOpen = ref(false)
const openId = ref<string | null>(null)

const gridItems = computed(() => props.photos.map((photo, index) => ({
  id: photo.asset_id,
  title: photo.alt || (index === 0 ? 'Cover photo' : `Photo ${index + 1}`),
  url: photo.url,
  alt: photo.alt,
  kind: photo.kind,
  isCover: index === 0,
  isLast: index === props.photos.length - 1,
})))

const openPhoto0 = computed(() => gridItems.value.find(item => item.id === openId.value) ?? null)

function openPhoto(item: { id: string }) {
  openId.value = item.id
  photoOpen.value = true
}

function order() {
  return props.photos.map(photo => photo.asset_id)
}

function makeCover() {
  const id = openId.value
  if (!id) return
  emit('reorder', [id, ...order().filter(assetId => assetId !== id)])
  photoOpen.value = false
}

function move(direction: -1 | 1) {
  const id = openId.value
  if (!id) return
  const ids = order()
  const index = ids.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return
  const next = [...ids]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  emit('reorder', next)
  photoOpen.value = false
}

function removeOpenPhoto() {
  if (!openId.value) return
  emit('remove', [openId.value])
  photoOpen.value = false
}

function removeMany(ids: string[]) {
  emit('remove', ids)
  selecting.value = false
  selectedIds.value = []
}

function onPicked(asset: { id: string }) {
  // A capped set replaces rather than appends, so a single-photo owner never
  // reaches a state it cannot represent.
  if (props.max === 1) {
    const existing = order()
    if (existing.length) emit('remove', existing)
  }
  emit('add', asset.id)
  if (props.max === 1) addOpen.value = false
}
</script>
