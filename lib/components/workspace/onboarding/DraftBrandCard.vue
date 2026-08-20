<template>
  <div class="onboarding-intake-card">
      <UFormField v-if="section === 'brand'" label="Brand color">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="swatch in colorPresets"
            :key="swatch"
            type="button"
            class="size-7 rounded-full border-2 transition disabled:pointer-events-none disabled:opacity-50"
            :class="form.brandColor === swatch ? 'scale-110 border-highlighted' : 'border-transparent'"
            :style="{ background: swatch }"
            :aria-label="`Use ${swatch} as brand color`"
            :disabled="disabled"
            @click="setBrandColor(swatch)"
          />
          <label
            class="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition"
            :class="[
              customColorSelected ? 'scale-110 border-highlighted' : 'border-default bg-default text-muted hover:border-primary',
              disabled ? 'pointer-events-none opacity-50' : '',
            ]"
            :style="customColorSelected ? { background: form.brandColor } : undefined"
            aria-label="Choose custom brand color"
          >
            <UIcon v-if="!customColorSelected" name="i-lucide-plus" class="size-4" />
            <input
              :value="form.brandColor"
              type="color"
              class="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Choose custom brand color"
              :disabled="disabled"
              @input="setCustomBrandColor"
            >
          </label>
        </div>
      </UFormField>

      <div v-if="section === 'brand'" class="rounded-xl border border-default bg-elevated p-3">
        <p class="mb-2 text-[12px] font-bold text-highlighted">Logo</p>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default transition-colors hover:border-primary"
            aria-label="Upload logo"
            :disabled="disabled || logoUploading || !draftId"
            @click="logoInput?.click()"
          >
            <img v-if="form.logoPreviewUrl" :src="form.logoPreviewUrl" alt="" class="h-full w-full object-contain">
            <UIcon v-else name="i-lucide-image" class="size-5 text-dimmed" />
          </button>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :loading="logoUploading"
            :disabled="disabled || !draftId"
            @click="logoInput?.click()"
          >
            {{ form.logoPreviewUrl ? 'Replace logo' : 'Upload logo' }}
          </UButton>
          <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="event => uploadDraftImage(event, 'logo')">
        </div>
      </div>

      <div v-if="section === 'hero'" class="rounded-xl border border-default bg-elevated p-3">
        <p class="mb-2 text-[12px] font-bold text-highlighted">Hero photo</p>
        <button
          type="button"
          class="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border border-default bg-default transition-colors hover:border-primary"
          aria-label="Upload hero photo"
          :disabled="disabled || heroUploading || !draftId"
          @click="heroInput?.click()"
        >
          <img v-if="form.heroPreviewUrl" :src="form.heroPreviewUrl" alt="" class="h-full w-full object-cover">
          <UIcon v-else name="i-lucide-image" class="size-7 text-highlighted" />
        </button>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-3"
          :loading="heroUploading"
          :disabled="disabled || !draftId"
          @click="heroInput?.click()"
        >
          {{ form.heroPreviewUrl ? 'Replace photo' : 'Upload photo' }}
        </UButton>
        <input ref="heroInput" type="file" accept="image/*" class="hidden" @change="event => uploadDraftImage(event, 'hero')">
      </div>

      <UFormField v-if="section === 'hero'" label="Hero headline">
        <UInput v-model="form.heroHeadline" size="xl" class="w-full" placeholder="A clear promise guests remember" />
      </UFormField>
      <UFormField v-if="section === 'hero'" label="Hero description">
        <UTextarea
          v-model="form.heroDescription"
          size="xl"
          class="w-full"
          autoresize
          :rows="3"
          placeholder="One or two sentences about what makes this business worth choosing."
        />
      </UFormField>

      <UAlert
        v-if="uploadError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="uploadError"
      />

      <div class="grid gap-3">
        <UButton
          color="primary"
          size="xl"
          block
          class="justify-center"
          :loading="loading"
          :disabled="disabled || activeUploadInProgress"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
  </div>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

type DraftUploadedImage = {
  draftAssetId: string
  cloudflareImageId: string
  publicUrl: string
  thumbnailUrl: string | null
  mimeType: string | null
  fileName: string | null
  fileSize: number | null
  category: 'logo' | 'other'
}

export type DraftBrandForm = {
  brandColor: string
  logoNote: string
  logoPreviewUrl: string
  logoImage: DraftUploadedImage | null
  heroPhotoNote: string
  heroPreviewUrl: string
  heroImage: DraftUploadedImage | null
  heroHeadline: string
  heroDescription: string
}

const form = defineModel<DraftBrandForm>('form', { required: true })

const props = defineProps<{
  actionLabel: string
  section: 'brand' | 'hero'
  draftId?: string | null
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: []
  'brand-color-change': []
}>()

const colorPresets = ['#3F3F46', '#FB7461', '#0EA5E9', '#16A34A', '#D97706', '#1F2547']
const logoInput = ref<HTMLInputElement | null>(null)
const heroInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)
const heroUploading = ref(false)
const uploadError = ref<string | null>(null)
const section = computed(() => props.section)
const activeUploadInProgress = computed(() => section.value === 'brand' ? logoUploading.value : heroUploading.value)
const customColorSelected = computed(() => !colorPresets.includes(form.value.brandColor))

function setBrandColor(color: string) {
  if (props.disabled) return
  form.value.brandColor = color
  emit('brand-color-change')
}

function setCustomBrandColor(event: Event) {
  const input = event.target as HTMLInputElement
  setBrandColor(input.value)
}

async function uploadDraftImage(event: Event, target: 'logo' | 'hero') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.draftId || props.disabled) return

  uploadError.value = null
  if (target === 'logo') logoUploading.value = true
  else heroUploading.value = true

  try {
    const body = new FormData()
    body.set('target', target)
    body.set('file', file)
    const res = await applicationFetch<{ success: boolean; image?: DraftUploadedImage; error?: string; message?: string }>(
      `/api/dashboard/onboarding/drafts/${props.draftId}/media/upload`,
      {
        method: 'POST',
        body,
        validate: (value): value is { success: boolean; image?: DraftUploadedImage; error?: string; message?: string } =>
          isRecord(value)
          && typeof value.success === 'boolean'
          && (value.image === undefined || (
            isRecord(value.image)
            && typeof value.image.draftAssetId === 'string'
            && typeof value.image.cloudflareImageId === 'string'
            && typeof value.image.publicUrl === 'string'
          )),
      },
    )
    if (!res.success || !res.image) throw new Error(res.error || res.message || 'Upload failed.')

    if (target === 'logo') {
      form.value.logoImage = res.image
      form.value.logoNote = res.image.fileName ?? file.name
      form.value.logoPreviewUrl = res.image.publicUrl
    } else {
      form.value.heroImage = res.image
      form.value.heroPhotoNote = res.image.fileName ?? file.name
      form.value.heroPreviewUrl = res.image.publicUrl
    }
  } catch (error) {
    const fetchError = error as { data?: { error?: string; message?: string }; status?: number; statusCode?: number }
    const apiMessage = fetchError.data?.message || fetchError.data?.error
    const status = fetchError.status ?? fetchError.statusCode
    uploadError.value = status === 503 && apiMessage === 'Cloudflare Images not configured'
      ? 'Image upload is not configured for this server. Restart dev with the project environment loaded, then try again.'
      : apiMessage || getErrorMessage(error, 'Upload failed.')
  } finally {
    if (target === 'logo') logoUploading.value = false
    else heroUploading.value = false
  }
}
</script>

<style scoped>
.onboarding-intake-card {
  display: grid;
  gap: 1rem;
}

.onboarding-intake-card :deep(.rounded-md),
.onboarding-intake-card :deep(.rounded-lg) {
  border-radius: 14px;
}

.onboarding-intake-card :deep(label) {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
</style>
