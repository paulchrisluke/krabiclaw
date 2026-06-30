<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-heroicons-paint-brush" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">Make it yours</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">
            A logo, a real photo, and a brand color make this look like your business — not a template everyone else has too.
          </p>
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
            <UIcon v-else name="i-heroicons-photo" class="size-4 text-muted" />
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="logoUploading"
            @click="logoInput?.click()"
          >
            {{ logoPreviewUrl ? 'Replace logo' : 'Upload logo' }}
          </UButton>
          <input
            ref="logoInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoSelected"
          >
        </div>
      </div>

      <!-- Hero photo -->
      <div>
        <p class="text-[12px] font-semibold text-highlighted mb-2">Hero photo</p>
        <div class="flex items-center gap-3">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-default bg-elevated overflow-hidden">
            <img v-if="heroPreviewUrl" :src="heroPreviewUrl" alt="" class="h-full w-full object-cover">
            <UIcon v-else name="i-heroicons-photo" class="size-4 text-muted" />
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="heroUploading"
            @click="heroInput?.click()"
          >
            {{ heroPreviewUrl ? 'Replace photo' : 'Upload a real photo' }}
          </UButton>
          <input
            ref="heroInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onHeroSelected"
          >
        </div>
        <p class="mt-1.5 text-[11px] text-muted">
          Until you add one, the homepage shows your brand color instead of a stock photo that isn't actually yours.
        </p>
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

const logoInput = ref<HTMLInputElement | null>(null)
const heroInput = ref<HTMLInputElement | null>(null)

const siteApiBase = computed(() => `/api/editor/sites/${props.siteId}`)
const { uploading: logoUploading, upload: uploadLogo } = useMediaUpload(siteApiBase.value)
const { uploading: heroUploading, upload: uploadHero } = useMediaUpload(siteApiBase.value)

const anyUploading = computed(() => logoUploading.value || heroUploading.value)
const logoAssetId = ref<string | null>(null)

async function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  errorMessage.value = null
  try {
    logoPreviewUrl.value = URL.createObjectURL(file)
    const result = await uploadLogo(file, { category: 'logo' })
    if (result) logoAssetId.value = result.id
  } catch {
    errorMessage.value = 'Could not upload that logo. Try a different image.'
    logoPreviewUrl.value = null
  }
}

async function onHeroSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  errorMessage.value = null
  heroAssetId.value = null
  try {
    heroPreviewUrl.value = URL.createObjectURL(file)
    const result = await uploadHero(file)
    if (result) heroAssetId.value = result.id
  } catch {
    errorMessage.value = 'Could not upload that photo. Try a different image.'
    heroPreviewUrl.value = null
  }
}

async function save() {
  saving.value = true
  errorMessage.value = null
  try {
    // Wait for any pending uploads to complete
    if (logoUploading.value || heroUploading.value) {
      errorMessage.value = 'Please wait for uploads to complete before saving.'
      return
    }
    const calls: Array<Promise<unknown>> = [
      $fetch<unknown>(`${siteApiBase.value}/settings`, {
        method: 'PATCH',
        body: { brand_color: brandColor.value, logo_asset_id: logoAssetId.value },
      }),
    ]
    if (heroAssetId.value) {
      calls.push($fetch<unknown>(`${siteApiBase.value}/content/save`, {
        method: 'POST',
        body: { page: 'home', changes: { 'hero.image': heroAssetId.value } },
      }))
    }
    await Promise.all(calls)
    emit('done')
  } catch {
    errorMessage.value = 'Could not save your brand essentials. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>
