<template>
  <UPage>

    <UPageBody>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-lg" />
      </div>

      <UCard v-else-if="experiences.length === 0" :ui="{ root: 'border border-dashed border-default', body: 'py-20 sm:py-20 text-center' }">
        <UIcon name="i-heroicons-ticket" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-semibold text-highlighted">No experiences yet</p>
        <p class="mt-1 text-sm text-muted">Create your first bookable experience — a tasting menu, a chef's table, a cooking class.</p>
        <UButton class="mt-6" icon="i-heroicons-plus" @click="openCreate">Add experience</UButton>
      </UCard>

      <div v-else class="space-y-3">
        <UCard
          v-for="exp in experiences"
          :key="exp.id"
          :ui="{ body: 'p-5 sm:p-5' }"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-3">
                <p class="truncate font-semibold text-highlighted">{{ exp.title }}</p>
                <UBadge
                  :color="exp.status === 'active' ? 'success' : exp.status === 'sold_out' ? 'warning' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ exp.status === 'sold_out' ? 'Sold out' : exp.status }}
                </UBadge>
              </div>
              <p v-if="exp.tagline" class="mt-0.5 truncate text-sm text-muted">{{ exp.tagline }}</p>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span v-if="exp.price">{{ exp.price }}</span>
                <span v-if="exp.duration_minutes">{{ exp.duration_minutes }} min</span>
                <span v-if="exp.max_capacity">{{ exp.max_capacity }} max guests</span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-pencil-square" aria-label="Edit experience" @click="openEdit(exp)" />
              <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-trash" aria-label="Delete experience" @click="confirmDelete(exp)" />
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>

    <!-- Create / Edit slide-over -->
    <USlideover v-model:open="sliderOpen" :title="editing ? 'Edit experience' : 'New experience'" side="right">
      <template #body>
        <div class="space-y-5 p-6">
          <UFormField label="Title" required>
            <UInput v-model="form.title" placeholder="e.g. Chef's Table Omakase" class="w-full" />
          </UFormField>
          <UFormField label="Tagline" help="One-line hook shown on the listing card.">
            <UInput v-model="form.tagline" placeholder="e.g. Eight courses, one table, full attention." class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.body" :rows="5" placeholder="Describe the experience in detail." class="w-full" />
          </UFormField>
          <UFormField label="Primary image">
            <MediaPicker
              v-model="form.image_asset_id"
              :site-id="siteId"
              accept="image"
              title="Select experience image"
              @change="handleImageChange"
            />
          </UFormField>
          <UFormField label="Video (optional)">
            <MediaPicker
              v-model="form.video_asset_id"
              :site-id="siteId"
              accept="video"
              title="Select experience video"
              @change="handleVideoChange"
            />
          </UFormField>
          <UFormField label="Additional media gallery" help="Add more images or videos to show in a carousel.">
            <div class="space-y-3">
              <div v-for="(media, index) in form.images" :key="index" class="flex items-center gap-3">
                <div class="flex-1">
                  <MediaPicker
                    v-model="media.asset_id"
                    :site-id="siteId"
                    accept="image,video"
                    title="Select media"
                    @change="(asset) => handleGalleryMediaChange(index, asset)"
                  />
                </div>
                <UButton size="sm" color="error" variant="ghost" icon="i-heroicons-x-mark" @click="removeGalleryMedia(index)" />
              </div>
              <UButton size="sm" color="neutral" variant="soft" icon="i-heroicons-plus" @click="addGalleryMedia">
                Add media
              </UButton>
            </div>
          </UFormField>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Price" help="Display string, e.g. ฿ 1,500 per person.">
              <UInput v-model="form.price" placeholder="฿ 1,500" class="w-full" />
            </UFormField>
            <UFormField label="Duration (minutes)">
              <UInput v-model="form.duration_minutes" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max capacity">
              <UInput v-model="form.max_capacity" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect
                v-model="form.status"
                :items="[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'Sold out', value: 'sold_out' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Featured" help="Show on homepage/location pages when no menu exists">
              <UCheckbox v-model="form.featured" />
            </UFormField>
            <UFormField label="Featured sort order" help="Lower numbers appear first">
              <UInput v-model="form.featured_sort_order" type="number" min="0" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Time slots" help="Comma-separated times, e.g. 18:00, 20:30">
            <UInput v-model="timeSlotsInput" placeholder="18:00, 20:30" class="w-full" />
          </UFormField>
          <UFormField label="Availability note" help="Short note shown when near capacity, e.g. 'Last 2 spots'.">
            <UInput v-model="form.available_note" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" @click="sliderOpen = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">{{ editing ? 'Save changes' : 'Create' }}</UButton>
        </div>
      </template>
    </USlideover>

    <!-- Delete confirm -->
    <UModal v-model:open="deleteOpen" title="Delete experience">
      <template #body>
        <p class="text-sm text-muted px-6 py-4">
          Delete <strong>{{ deletingExp?.title }}</strong>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 px-6 py-4">
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="doDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>

<script setup lang="ts">
// -nocheck
import type { Experience } from '~/server/utils/experiences'

definePageMeta({ layout: 'dashboard' })

type ApiRecord = Experience

const toast = useToast()
const siteId = await useDashboardSiteId()

const sitePublicUrl = ref<string | null>(null)
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const _headerLinks = computed(() => buildHeaderLinks())

// ── List ──────────────────────────────────────────────────
const loading = ref(true)
const experiences = ref<ApiRecord[]>([])

async function loadExperiences() {
  loading.value = true
  try {
    const res = await $fetch<{ experiences: ApiRecord[] }>(`/api/dashboard/editor/experiences`)
    experiences.value = res.experiences ?? []
  } catch {
    experiences.value = []
  } finally {
    loading.value = false
  }
}

async function loadSitePublicUrl() {
  try {
    const response = await $fetch<{ success: boolean; settings: { public_url?: string | null } }>(`/api/dashboard/settings`)
    sitePublicUrl.value = response.settings?.public_url || null
  } catch {
    sitePublicUrl.value = null
  }
}

await Promise.all([loadExperiences(), loadSitePublicUrl()])

// ── Form ──────────────────────────────────────────────────
const sliderOpen = ref(false)
const editing = ref<ApiRecord | null>(null)
const saving = ref(false)
const timeSlotsInput = ref('')

const emptyForm = () => ({
  title: '',
  tagline: '',
  body: '',
  image_asset_id: null as string | null,
  image_url: null as string | null,
  video_asset_id: null as string | null,
  video_url: null as string | null,
  images: [] as Array<{ asset_id: string | null; url: string | null; kind: 'image' | 'video' }>,
  price: '',
  duration_minutes: '',
  max_capacity: '',
  available_note: '',
  status: 'active' as 'active' | 'inactive' | 'sold_out',
  featured: false,
  featured_sort_order: 0,
})

const form = reactive(emptyForm())

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  timeSlotsInput.value = ''
  sliderOpen.value = true
}

function handleImageChange(asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  form.image_url = asset?.publicUrl ?? asset?.thumbnailUrl ?? null
}

function handleVideoChange(asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  form.video_url = asset?.publicUrl ?? null
}

function addGalleryMedia() {
  form.images.push({ asset_id: null, url: null, kind: 'image' })
}

function removeGalleryMedia(index: number) {
  form.images.splice(index, 1)
}

function handleGalleryMediaChange(index: number, asset: { id: string; publicUrl: string; thumbnailUrl: string; kind?: string } | null) {
  form.images[index].asset_id = asset?.id ?? null
  form.images[index].url = asset?.publicUrl ?? asset?.thumbnailUrl ?? null
  form.images[index].kind = asset?.kind === 'video' ? 'video' : 'image'
}

function openEdit(exp: ApiRecord) {
  editing.value = exp
  Object.assign(form, {
    title: exp.title ?? '',
    tagline: exp.tagline ?? '',
    body: exp.body ?? '',
    image_asset_id: exp.image_asset_id ?? null,
    image_url: exp.image_url ?? null,
    video_asset_id: exp.video_asset_id ?? null,
    video_url: exp.video_url ?? null,
    images: Array.isArray(exp.images) ? [...exp.images] : [],
    price: exp.price ?? '',
    duration_minutes: exp.duration_minutes != null ? String(exp.duration_minutes) : '',
    max_capacity: exp.max_capacity != null ? String(exp.max_capacity) : '',
    available_note: exp.available_note ?? '',
    status: exp.status ?? 'active',
    featured: exp.featured ?? false,
    featured_sort_order: exp.featured_sort_order != null ? String(exp.featured_sort_order) : '0',
  })
  timeSlotsInput.value = Array.isArray(exp.time_slots) ? exp.time_slots.join(', ') : (exp.time_slots ?? '')
  sliderOpen.value = true
}

async function save() {
  if (!form.title.trim()) {
    toast.add({ description: 'Title is required.', color: 'error' })
    return
  }
  saving.value = true
  try {
    const parseNumber = (value: string | number): number | null => {
      const str = String(value)
      if (!str.trim()) return null
      const parsed = Number(str)
      return Number.isFinite(parsed) ? parsed : null
    }
    const payload = {
      ...form,
      duration_minutes: parseNumber(form.duration_minutes),
      max_capacity: parseNumber(form.max_capacity),
      featured_sort_order: parseNumber(form.featured_sort_order),
      time_slots: timeSlotsInput.value
        ? timeSlotsInput.value.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      images: form.images.filter(img => img.url).map(img => ({
        url: img.url,
        kind: img.kind,
      })),
    }
    if (editing.value) {
      await $fetch(`/api/dashboard/editor/experiences/${editing.value.id}`, { method: 'PATCH', body: payload })
      toast.add({ description: 'Experience updated.', color: 'success' })
    } else {
      await $fetch(`/api/dashboard/editor/experiences`, { method: 'POST', body: payload })
      toast.add({ description: 'Experience created.', color: 'success' })
    }
    sliderOpen.value = false
    await loadExperiences()
  } catch {
    toast.add({ description: 'Failed to save experience.', color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────
const deleteOpen = ref(false)
const deletingExp = ref<ApiRecord | null>(null)
const deleting = ref(false)

function confirmDelete(exp: ApiRecord) {
  deletingExp.value = exp
  deleteOpen.value = true
}

async function doDelete() {
  if (!deletingExp.value) return
  deleting.value = true
  try {
    await $fetch(`/api/dashboard/editor/experiences/${deletingExp.value.id}`, { method: 'DELETE' })
    toast.add({ description: 'Experience deleted.', color: 'success' })
    deleteOpen.value = false
    await loadExperiences()
  } catch {
    toast.add({ description: 'Failed to delete experience.', color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>
