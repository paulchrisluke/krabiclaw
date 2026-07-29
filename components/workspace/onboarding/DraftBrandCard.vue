<template>
  <UCard class="onboarding-intake-card" :ui="{ body: 'p-0 sm:p-0' }">
    <div class="space-y-5 p-6 sm:p-7">
      <div class="flex items-start gap-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon :name="icon" class="size-5" />
        </div>
        <div class="min-w-0 pt-0.5">
          <p class="text-[17px] font-bold leading-6 text-highlighted">{{ title }}</p>
          <p class="mt-1 text-[15px] leading-6 text-muted">{{ description }}</p>
        </div>
      </div>

      <template v-if="section === 'brand'">
        <UFormField label="Brand color">
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="swatch in colorPresets"
              :key="swatch"
              type="button"
              class="size-7 rounded-full border-2 transition"
              :class="form.brandColor === swatch ? 'scale-110 border-highlighted' : 'border-transparent'"
              :style="{ background: swatch }"
              :aria-label="`Use ${swatch} as brand color`"
              @click="form.brandColor = swatch"
            />
          </div>
        </UFormField>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-default bg-default transition-colors hover:border-primary"
            aria-label="Upload logo"
            @click="logoInput?.click()"
          >
            <img v-if="logoPreviewUrl" :src="logoPreviewUrl" alt="" class="h-full w-full object-contain">
            <UIcon v-else name="i-lucide-image" class="size-5 text-dimmed" />
          </button>
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            @click="logoInput?.click()"
          >
            {{ logoPreviewUrl ? 'Replace logo' : 'Upload logo' }}
          </UButton>
          <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoSelected">
        </div>
      </template>

      <template v-else>
        <button
          type="button"
          class="flex min-h-48 w-full items-center justify-center overflow-hidden rounded-[18px] border border-default bg-default transition-colors hover:border-primary"
          aria-label="Upload hero photo"
          @click="heroInput?.click()"
        >
          <img v-if="heroPreviewUrl" :src="heroPreviewUrl" alt="" class="h-full min-h-48 w-full object-cover">
          <UIcon v-else name="i-lucide-image" class="size-9 text-highlighted" />
        </button>
        <input ref="heroInput" type="file" accept="image/*" class="hidden" @change="onHeroSelected">
      </template>

      <div class="grid gap-4">
        <UButton
          color="primary"
          size="xl"
          block
          class="justify-center"
          :loading="loading"
          :disabled="disabled"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xl"
          block
          class="justify-center"
          :disabled="disabled"
          @click="$emit('submit')"
        >
          Skip for now
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

export type DraftBrandForm = {
  brandColor: string
  logoNote: string
  heroPhotoNote: string
  heroHeadline: string
}

const form = defineModel<DraftBrandForm>('form', { required: true })

const props = defineProps<{
  title: string
  description: string
  actionLabel: string
  section: 'brand' | 'hero'
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const colorPresets = ['#3F3F46', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706']
const icon = computed(() => props.section === 'brand' ? 'i-lucide-paintbrush' : 'i-lucide-image')
const logoInput = ref<HTMLInputElement | null>(null)
const heroInput = ref<HTMLInputElement | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const heroPreviewUrl = ref<string | null>(null)

function setPreview(target: typeof logoPreviewUrl | typeof heroPreviewUrl, file: File | undefined) {
  if (!file) return
  if (target.value?.startsWith('blob:')) URL.revokeObjectURL(target.value)
  target.value = URL.createObjectURL(file)
}

function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  setPreview(logoPreviewUrl, file)
  form.value.logoNote = file?.name ?? ''
}

function onHeroSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  setPreview(heroPreviewUrl, file)
  form.value.heroPhotoNote = file?.name ?? ''
}

onUnmounted(() => {
  if (logoPreviewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(logoPreviewUrl.value)
  if (heroPreviewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(heroPreviewUrl.value)
})
</script>

<style scoped>
.onboarding-intake-card {
  border-radius: 22px;
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
