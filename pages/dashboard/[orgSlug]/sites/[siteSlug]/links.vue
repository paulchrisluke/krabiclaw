<template>
  <UDashboardPanel id="site-links-page">
    <template #header>
      <UDashboardNavbar title="Links page">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" icon="i-lucide-copy" :disabled="!publicLinksUrl" @click="copyPublicUrl">Copy URL</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-external-link" :to="publicLinksUrl || undefined" target="_blank" :disabled="!publicLinksUrl">Open</UButton>
            <UButton icon="i-lucide-save" :loading="saving" :disabled="!dirty" @click="save">Save</UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="space-y-6">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="errorMessage"
          />

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">Page details</h2>
                  <p class="mt-1 text-sm text-muted">Manage the owned-domain link hub for this site.</p>
                </div>
                <USelect v-model="form.status" :items="pageStatusOptions" class="w-36" />
              </div>
            </template>

            <div v-if="!editorReady" class="space-y-4">
              <USkeleton class="h-10" />
              <USkeleton class="h-24" />
              <USkeleton class="h-14" />
            </div>
            <div v-else class="grid gap-5 md:grid-cols-2">
              <UFormField label="Title" required>
                <UInput v-model="form.title" aria-label="Links page title" maxlength="160" />
              </UFormField>
              <UFormField label="Robots">
                <USelect v-model="form.robots" :items="robotsOptions" />
              </UFormField>
              <UFormField class="md:col-span-2" label="Bio">
                <UTextarea v-model="form.bio" aria-label="Links page bio" :rows="3" maxlength="500" />
              </UFormField>
              <UFormField class="md:col-span-2" label="Profile image">
                <MediaPicker
                  v-model="form.profile_image_asset_id"
                  :site-id="siteId"
                  accept="image"
                  title="Select profile image"
                  context="Links page profile image"
                  @change="onProfileImageChange"
                />
              </UFormField>
              <UFormField label="SEO title">
                <UInput v-model="form.seo_title" maxlength="200" />
              </UFormField>
              <UFormField label="SEO description">
                <UInput v-model="form.seo_description" maxlength="500" />
              </UFormField>
            </div>
          </UCard>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-highlighted">Links</h2>
                <p class="mt-1 text-sm text-muted">Add, hide, delete, and reorder the buttons shown on /links.</p>
              </div>
              <UButton color="neutral" variant="soft" icon="i-lucide-plus" @click="addLink">Add link</UButton>
            </div>

            <div v-if="items.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
              <UIcon name="i-lucide-link" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">No links yet</p>
              <p class="mt-1 text-sm text-muted">Add at least one active link before publishing.</p>
            </div>

            <div v-for="(item, index) in items" :key="item.id" class="rounded-lg border border-default bg-default p-4">
              <div class="flex flex-wrap items-center gap-2">
                <span class="flex size-8 shrink-0 items-center justify-center rounded bg-elevated text-xs font-semibold text-muted">{{ index + 1 }}</span>
                <UInput v-model="item.label" class="min-w-52 flex-1" placeholder="Label" maxlength="120" />
                <USelect v-model="item.status" :items="itemStatusOptions" class="w-32" />
                <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" :disabled="index === 0" :aria-label="`Move ${item.label || 'link'} up`" @click="moveItem(index, -1)" />
                <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" :disabled="index === items.length - 1" :aria-label="`Move ${item.label || 'link'} down`" @click="moveItem(index, 1)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="`Delete ${item.label || 'link'}`" @click="deleteItem(index)" />
              </div>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <UFormField label="Destination" required>
                  <UInput v-model="item.destination" aria-label="Link destination" placeholder="/reservations or https://example.com" maxlength="2048" />
                </UFormField>
                <UFormField label="Icon">
                  <USelect v-model="item.icon" :items="iconOptions" />
                </UFormField>
                <UFormField class="md:col-span-2" label="Description">
                  <UTextarea v-model="item.description" :rows="2" maxlength="280" />
                </UFormField>
                <UFormField class="md:col-span-2" label="Image">
                  <MediaPicker
                    v-model="item.image_asset_id"
                    :site-id="siteId"
                    accept="image"
                    title="Select link image"
                    :context="`Links page image for ${item.label || 'link'}`"
                    @change="asset => onItemImageChange(index, asset)"
                  />
                </UFormField>
              </div>
            </div>
          </div>
        </div>

        <aside class="xl:sticky xl:top-4 xl:self-start">
          <div class="overflow-hidden rounded-lg border border-default bg-elevated">
            <div class="border-b border-default px-4 py-3">
              <h2 class="text-sm font-semibold text-highlighted">Preview</h2>
            </div>
            <div class="px-4 py-6">
              <div class="mx-auto max-w-xs text-center">
                <img
                  v-if="previewProfileUrl"
                  :src="previewProfileUrl"
                  alt=""
                  class="mx-auto size-20 rounded-full object-cover"
                >
                <div v-else class="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                  {{ previewInitial }}
                </div>
                <h3 class="mt-4 truncate text-xl font-semibold text-highlighted">{{ form.title || 'Links' }}</h3>
                <p v-if="form.bio" class="mt-2 line-clamp-3 text-sm text-muted">{{ form.bio }}</p>
                <div class="mt-5 space-y-2 text-left">
                  <div
                    v-for="item in activePreviewItems"
                    :key="item.id"
                    class="flex min-h-12 items-center gap-3 rounded-lg border border-default bg-default px-3 py-2"
                  >
                    <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted">
                      <img v-if="item.image_url" :src="item.image_url" alt="" class="size-full rounded-full object-cover">
                      <span v-else>{{ iconPreview(item.icon) }}</span>
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium text-highlighted">{{ item.label || 'Untitled link' }}</span>
                      <span v-if="item.description" class="block truncate text-xs text-muted">{{ item.description }}</span>
                    </span>
                  </div>
                  <p v-if="activePreviewItems.length === 0" class="text-center text-sm text-muted">No active links to preview.</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import MediaPicker from '~/components/workspace/media/MediaPicker.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.links' })
useSeoMeta({ title: 'Links page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

type LinkItemIcon = 'none' | 'calendar' | 'menu' | 'shopping-bag' | 'ticket' | 'mail' | 'phone' | 'map-pin' | 'star' | 'heart' | 'globe' | 'message-circle' | 'external-link'
type PageStatus = 'draft' | 'published' | 'archived'
type ItemStatus = 'active' | 'hidden'

interface LinksPage {
  title: string
  bio: string
  profile_image_asset_id: string | null
  profile_image_url: string | null
  status: PageStatus
  robots: string
  seo_title: string
  seo_description: string
}

interface LinkItem {
  id: string
  label: string
  destination: string
  description: string
  icon: LinkItemIcon
  image_asset_id: string | null
  image_url: string | null
  sort_order: number
  status: ItemStatus
}

interface ApiLinksPage extends Omit<LinksPage, 'bio' | 'seo_title' | 'seo_description'> {
  bio: string | null
  seo_title: string | null
  seo_description: string | null
}

interface ApiLinkItem extends Omit<LinkItem, 'description' | 'icon'> {
  description: string | null
  icon: Exclude<LinkItemIcon, 'none'> | null
}

const siteId = await useDashboardSiteId()
const headers = buildDashboardRequestHeaders()
const dashboard = useDashboardSite()
const toast = useToast()
const saving = ref(false)
const errorMessage = ref('')
const savedSnapshot = ref('')
const mounted = ref(false)

const pageStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
]
const itemStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Hidden', value: 'hidden' },
]
const robotsOptions = [
  { label: 'No index, follow', value: 'noindex,follow' },
  { label: 'Index, follow', value: 'index,follow' },
  { label: 'Index, no follow', value: 'index,nofollow' },
  { label: 'No index, no follow', value: 'noindex,nofollow' },
]
const iconOptions = [
  { label: 'No icon', value: 'none' },
  { label: 'Calendar', value: 'calendar' },
  { label: 'Menu', value: 'menu' },
  { label: 'Shopping bag', value: 'shopping-bag' },
  { label: 'Ticket', value: 'ticket' },
  { label: 'Mail', value: 'mail' },
  { label: 'Phone', value: 'phone' },
  { label: 'Map pin', value: 'map-pin' },
  { label: 'Star', value: 'star' },
  { label: 'Heart', value: 'heart' },
  { label: 'Globe', value: 'globe' },
  { label: 'Message', value: 'message-circle' },
  { label: 'External link', value: 'external-link' },
]

const form = reactive<LinksPage>({
  title: '',
  bio: '',
  profile_image_asset_id: null,
  profile_image_url: null,
  status: 'draft',
  robots: 'noindex,follow',
  seo_title: '',
  seo_description: '',
})
const items = ref<LinkItem[]>([])

const { data, pending, refresh } = await useAsyncData(
  `links-page-editor-${siteId}`,
  () => $fetch<{ page: ApiLinksPage; items: ApiLinkItem[] }>(`/api/editor/sites/${siteId}/links-page`, { headers }),
  { server: false },
)

watch(data, (value) => {
  if (!value) return
  Object.assign(form, {
    ...value.page,
    bio: value.page.bio ?? '',
    seo_title: value.page.seo_title ?? '',
    seo_description: value.page.seo_description ?? '',
  })
  items.value = value.items.map(item => ({ ...item, description: item.description ?? '', icon: item.icon ?? 'none' }))
  savedSnapshot.value = serializeState()
}, { immediate: true })

const dirty = computed(() => savedSnapshot.value !== serializeState())
const editorReady = computed(() => mounted.value && !pending.value)
const activePreviewItems = computed(() => items.value.filter(item => item.status === 'active'))
const previewProfileUrl = computed(() => form.profile_image_url || null)
const previewInitial = computed(() => (form.title || dashboard.site.value?.brand_name || 'L').trim().charAt(0).toUpperCase() || 'L')
const publicLinksUrl = computed(() => {
  const base = dashboard.site.value?.public_url || (dashboard.site.value?.subdomain ? `https://${dashboard.site.value.subdomain}.krabiclaw.com` : '')
  return base ? `${base.replace(/\/+$/, '')}/links` : ''
})

function serializeState() {
  return JSON.stringify({
    page: {
      title: form.title,
      bio: form.bio,
      profile_image_asset_id: form.profile_image_asset_id,
      status: form.status,
      robots: form.robots,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
    },
    items: items.value.map((item, index) => ({
      id: item.id,
      label: item.label,
      destination: item.destination,
      description: item.description,
      icon: item.icon,
      image_asset_id: item.image_asset_id,
      sort_order: index,
      status: item.status,
    })),
  })
}

function addLink() {
  items.value.push({
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    destination: '',
    description: '',
    icon: 'none',
    image_asset_id: null,
    image_url: null,
    sort_order: items.value.length,
    status: 'active',
  })
}

function moveItem(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.value.length) return
  const next = [...items.value]
  const [item] = next.splice(index, 1)
  if (!item) return
  next.splice(nextIndex, 0, item)
  items.value = next.map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
}

function deleteItem(index: number) {
  const item = items.value[index]
  if (!item) return
  if (import.meta.client && !window.confirm(`Delete "${item.label || 'this link'}"?`)) return
  items.value.splice(index, 1)
  items.value = items.value.map((entry, sortOrder) => ({ ...entry, sort_order: sortOrder }))
}

function onProfileImageChange(asset: { publicUrl: string; thumbnailUrl: string } | null) {
  form.profile_image_url = asset?.publicUrl || asset?.thumbnailUrl || null
}

function onItemImageChange(index: number, asset: { publicUrl: string; thumbnailUrl: string } | null) {
  const item = items.value[index]
  if (!item) return
  item.image_url = asset?.publicUrl || asset?.thumbnailUrl || null
}

function iconPreview(icon: LinkItemIcon) {
  if (icon === 'none') return 'Go'
  if (icon === 'mail') return '@'
  if (icon === 'phone') return 'Tel'
  if (icon === 'map-pin') return 'Map'
  if (icon === 'external-link') return 'Go'
  return icon.split('-')[0]?.slice(0, 4) || 'Go'
}

async function copyPublicUrl() {
  if (!publicLinksUrl.value) return
  try {
    await navigator.clipboard.writeText(publicLinksUrl.value)
    toast.add({ description: 'Links page URL copied', color: 'success' })
  } catch {
    toast.add({ description: 'Unable to copy the links page URL', color: 'error' })
  }
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      page: {
        title: form.title,
        bio: form.bio,
        profile_image_asset_id: form.profile_image_asset_id,
        status: form.status,
        robots: form.robots,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
      },
      items: items.value.map((item, index) => ({
        id: item.id,
        label: item.label,
        destination: item.destination,
        description: item.description,
        icon: item.icon === 'none' ? null : item.icon,
        image_asset_id: item.image_asset_id,
        sort_order: index,
        status: item.status,
      })),
    }
    const response = await $fetch<{ page: ApiLinksPage; items: ApiLinkItem[] }>(`/api/editor/sites/${siteId}/links-page`, {
      method: 'PATCH',
      headers,
      body: payload,
    })
    data.value = response
    await refresh()
    savedSnapshot.value = serializeState()
    toast.add({ description: 'Links page saved', color: 'success' })
  } catch (error) {
    const data = error && typeof error === 'object' ? (error as { data?: { error?: string } }).data : null
    errorMessage.value = data?.error || (error instanceof Error ? error.message : 'Unable to save links page')
    toast.add({ description: errorMessage.value, color: 'error' })
  } finally {
    saving.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
}

if (import.meta.client) {
  onMounted(() => {
    mounted.value = true
    window.addEventListener('beforeunload', handleBeforeUnload)
  })
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
}

onBeforeRouteLeave(() => {
  if (!dirty.value || !import.meta.client) return true
  return window.confirm('Discard unsaved links page changes?')
})
</script>
