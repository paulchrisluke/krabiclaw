<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-paintbrush" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">Brand identity</p>
        </div>
      </div>
    </template>

    <div class="space-y-4 px-4 pb-4">
      <!-- Brand color -->
      <div>
        <p class="text-[12px] font-semibold text-highlighted mb-2">Brand color</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="swatch in colorPresets"
            :key="swatch"
            type="button"
            class="size-7 rounded-full border-2 transition"
            :class="brandColor === swatch ? 'border-highlighted scale-110' : 'border-transparent'"
            :style="{ background: swatch }"
            :aria-label="`Use ${swatch} as brand color`"
            @click="brandColor = swatch"
          />
          <label class="relative size-7 rounded-full border border-default overflow-hidden cursor-pointer">
            <input
              v-model="brandColor"
              type="color"
              class="absolute -inset-1 cursor-pointer"
            >
          </label>
        </div>
      </div>

      <!-- Logo -->
      <div>
        <p class="text-[12px] font-semibold text-highlighted mb-2">Logo</p>
        <div class="flex items-center gap-3">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-default bg-elevated overflow-hidden">
            <img v-if="logoPreviewUrl" :src="logoPreviewUrl" alt="" class="h-full w-full object-contain">
            <UIcon v-else name="i-lucide-image" class="size-4 text-muted" />
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="logoUploading"
            @click="logoInput?.inputRef?.click()"
          >
            {{ logoPreviewUrl ? 'Replace logo' : 'Upload logo' }}
          </UButton>
          <UInput
            ref="logoInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoSelected"
          />
        </div>
      </div>

      <!-- Hero photo -->
      <div>
        <p class="text-[12px] font-semibold text-highlighted mb-2">Hero photo</p>
        <div class="flex items-center gap-3">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-default bg-elevated overflow-hidden">
            <img v-if="heroPreviewUrl" :src="heroPreviewUrl" alt="" class="h-full w-full object-cover">
            <UIcon v-else name="i-lucide-image" class="size-4 text-muted" />
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="heroUploading"
            @click="heroInput?.inputRef?.click()"
          >
            {{ heroPreviewUrl ? 'Replace photo' : 'Upload hero photo' }}
          </UButton>
          <UInput
            ref="heroInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onHeroSelected"
          />
        </div>
      </div>

      <div v-if="errorMessage" class="text-[12px] text-error-600 dark:text-error-400">
        {{ errorMessage }}
      </div>

      <div class="flex flex-wrap gap-2 pt-1">
        <UButton
          size="sm"
          color="primary"
          :loading="saving"
          :disabled="anyUploading"
          @click="save"
        >
          Save brand essentials
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          @click="emit('done')"
        >
          Skip for now
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useMediaUpload } from '~/composables/useMediaUpload'

type EditableTenantPageBlock = Record<string, unknown> & {
  type: string
  data: Record<string, unknown>
  media: Array<{ asset_id: string; slot: string; sort_order: number }>
}

type EditableTenantPage = {
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: string
  recipe: string | null
  sort_order: number
  blocks: EditableTenantPageBlock[]
  document: { updated_at: string }
}

const props = defineProps<{
  siteId: string
}>()

const emit = defineEmits<{ done: [] }>()

const colorPresets = ['#3F3F46', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DC2626', '#DB2777', '#1F2547']

const brandColor = ref(colorPresets[0])
const logoPreviewUrl = ref<string | null>(null)
const heroAssetId = ref<string | null>(null)
const heroPreviewUrl = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const saving = ref(false)

const logoInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const heroInput = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

const siteApiBase = computed(() => `/api/editor/sites/${props.siteId}`)
const { uploading: logoUploading, upload: uploadLogo } = useMediaUpload(siteApiBase.value)
const { uploading: heroUploading, upload: uploadHero } = useMediaUpload(siteApiBase.value)

const anyUploading = computed(() => logoUploading.value || heroUploading.value)
const logoAssetId = ref<string | null>(null)

async function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  errorMessage.value = null
  logoAssetId.value = null
  try {
    if (logoPreviewUrl.value?.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreviewUrl.value)
    }
    logoPreviewUrl.value = URL.createObjectURL(file)
    const result = await uploadLogo(file)
    if (result) logoAssetId.value = result.asset_id
  } catch {
    errorMessage.value = 'Could not upload that logo. Try a different image.'
    if (logoPreviewUrl.value?.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreviewUrl.value)
    }
    logoPreviewUrl.value = null
  } finally {
    if (logoInput.value?.inputRef) logoInput.value.inputRef.value = ''
  }
}

async function onHeroSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  errorMessage.value = null
  heroAssetId.value = null
  try {
    if (heroPreviewUrl.value?.startsWith('blob:')) {
      URL.revokeObjectURL(heroPreviewUrl.value)
    }
    heroPreviewUrl.value = URL.createObjectURL(file)
    const result = await uploadHero(file)
    if (result) heroAssetId.value = result.asset_id
  } catch {
    errorMessage.value = 'Could not upload that photo. Try a different image.'
    if (heroPreviewUrl.value?.startsWith('blob:')) {
      URL.revokeObjectURL(heroPreviewUrl.value)
    }
    heroPreviewUrl.value = null
  } finally {
    if (heroInput.value?.inputRef) heroInput.value.inputRef.value = ''
  }
}

onUnmounted(() => {
  if (logoPreviewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(logoPreviewUrl.value)
  }
  if (heroPreviewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(heroPreviewUrl.value)
  }
})

async function save() {
  saving.value = true
  errorMessage.value = null
  try {
    // Wait for any pending uploads to complete
    if (logoUploading.value || heroUploading.value) {
      errorMessage.value = 'Please wait for uploads to complete before saving.'
      return
    }
    
    // Run mutations sequentially to handle partial failures
    await applicationFetch<{ success: true }>(`${siteApiBase.value}/settings`, {
      method: 'PATCH',
      body: { brand_color: brandColor.value, media: logoAssetId.value ? [{ asset_id: logoAssetId.value, slot: 'logo' }] : [] },
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    
    if (heroAssetId.value) {
      const pageList = await applicationFetch<{ pages: Array<{ id: string; path: string }> }>(`${siteApiBase.value}/pages`, {
        validate: (value): value is { pages: Array<{ id: string; path: string }> } => isRecord(value) && Array.isArray(value.pages),
      })
      const home = pageList.pages.find(page => page.path === '/')
      if (!home) throw new Error('Canonical home page is unavailable.')
      const detail = await applicationFetch<{ page: EditableTenantPage }>(`${siteApiBase.value}/pages/${home.id}`, {
        validate: (value): value is { page: EditableTenantPage } => isRecord(value) && isRecord(value.page) && Array.isArray(value.page.blocks),
      })
      const page = detail.page
      const blocks = page.blocks.map(block => block.type === 'hero'
        ? {
            ...block,
            media: [
              ...block.media.filter(item => item.slot !== 'media'),
              { asset_id: heroAssetId.value!, slot: 'media', sort_order: 0 },
            ],
          }
        : block)
      await applicationFetch(`${siteApiBase.value}/pages/${home.id}`, {
        method: 'PATCH',
        body: {
          locale: page.locale,
          path: page.path,
          title: page.title,
          summary: page.summary,
          seoTitle: page.seo_title,
          seoDescription: page.seo_description,
          canonicalUrl: page.canonical_url,
          robots: page.robots,
          pageType: page.page_type,
          recipe: page.recipe,
          sortOrder: page.sort_order,
          blocks,
          expectedDocumentUpdatedAt: page.document.updated_at,
        },
        validate: (value): value is Record<string, unknown> => isRecord(value),
      })
    }
    
    emit('done')
  } catch {
    errorMessage.value = 'Could not save your brand essentials. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
