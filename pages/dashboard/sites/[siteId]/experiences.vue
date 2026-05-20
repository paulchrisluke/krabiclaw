<template>
  <UPage>
    <UPageHeader title="Experiences" description="Bookable dining experiences shown on your site.">
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
        <UButton icon="i-heroicons-plus" @click="openCreate">Add experience</UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-lg" />
      </div>

      <div v-else-if="experiences.length === 0" class="rounded-xl border border-dashed border-default py-20 text-center">
        <UIcon name="i-heroicons-ticket" class="mx-auto size-10 text-muted" />
        <p class="mt-4 text-sm font-semibold text-highlighted">No experiences yet</p>
        <p class="mt-1 text-sm text-muted">Create your first bookable experience — a tasting menu, a chef's table, a cooking class.</p>
        <UButton class="mt-6" icon="i-heroicons-plus" @click="openCreate">Add experience</UButton>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="exp in experiences"
          :key="exp.id"
          class="flex items-start justify-between gap-4 rounded-lg border border-default bg-default p-5"
        >
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
            <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-pencil-square" @click="openEdit(exp)" />
            <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="confirmDelete(exp)" />
          </div>
        </div>
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
import type { Experience } from '~/server/utils/experiences'

type ApiRecord = Experience

const route = useRoute()
const toast = useToast()
const siteId = route.params.siteId as string

const sitePublicUrl = ref<string | null>(null)
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const headerLinks = computed(() => buildHeaderLinks())

// ── List ──────────────────────────────────────────────────
const loading = ref(true)
const experiences = ref<ApiRecord[]>([])

async function loadExperiences() {
  loading.value = true
  try {
    const res = await $fetch<{ experiences: ApiRecord[] }>(`/api/editor/sites/${siteId}/experiences`)
    experiences.value = res.experiences ?? []
  } finally {
    loading.value = false
  }
}

async function loadSitePublicUrl() {
  try {
    const response = await $fetch<{ success: boolean; settings: { public_url?: string | null } }>(`/api/sites/${siteId}/settings`)
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
  price: '',
  duration_minutes: '',
  max_capacity: '',
  available_note: '',
  status: 'active' as 'active' | 'inactive' | 'sold_out',
})

const form = reactive(emptyForm())

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  timeSlotsInput.value = ''
  sliderOpen.value = true
}

function openEdit(exp: ApiRecord) {
  editing.value = exp
  Object.assign(form, {
    title: exp.title ?? '',
    tagline: exp.tagline ?? '',
    body: exp.body ?? '',
    price: exp.price ?? '',
    duration_minutes: exp.duration_minutes ? String(exp.duration_minutes) : '',
    max_capacity: exp.max_capacity ? String(exp.max_capacity) : '',
    available_note: exp.available_note ?? '',
    status: exp.status ?? 'active',
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
    const payload = {
      ...form,
      duration_minutes: form.duration_minutes !== '' ? Number(form.duration_minutes) : null,
      max_capacity: form.max_capacity !== '' ? Number(form.max_capacity) : null,
      time_slots: timeSlotsInput.value
        ? timeSlotsInput.value.split(',').map(s => s.trim()).filter(Boolean)
        : null,
    }
    if (editing.value) {
      await $fetch(`/api/editor/sites/${siteId}/experiences/${editing.value.id}`, { method: 'PATCH', body: payload })
      toast.add({ description: 'Experience updated.', color: 'success' })
    } else {
      await $fetch(`/api/editor/sites/${siteId}/experiences`, { method: 'POST', body: payload })
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
    await $fetch(`/api/editor/sites/${siteId}/experiences/${deletingExp.value.id}`, { method: 'DELETE' })
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
