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
        <UFormField label="Logo">
          <UInput v-model="form.logoNote" class="w-full" size="xl" placeholder="Describe it, or skip for now" />
        </UFormField>
      </template>

      <template v-else>
        <UFormField label="Hero photo">
          <UInput v-model="form.heroPhotoNote" class="w-full" size="xl" placeholder="Describe the photo guests should see first" />
        </UFormField>
        <UFormField label="Hero headline">
          <UInput v-model="form.heroHeadline" class="w-full" size="xl" placeholder="Leave blank to use your business name" />
        </UFormField>
      </template>

      <div class="grid gap-4">
        <p class="text-[13px] leading-5 text-muted">{{ helperText }}</p>
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
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
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

const colorPresets = ['#3F3F46', '#7C3AED', '#0EA5E9', '#16A34A', '#D97706', '#DC2626', '#DB2777', '#1F2547']
const icon = computed(() => props.section === 'brand' ? 'i-lucide-paintbrush' : 'i-lucide-image')
const helperText = computed(() => props.section === 'brand'
  ? 'A quick direction is enough.'
  : 'You can replace this later from the dashboard.'
)
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
