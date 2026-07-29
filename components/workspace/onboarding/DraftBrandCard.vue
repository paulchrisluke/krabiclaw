<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="icon" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="space-y-4 px-4 pb-4">
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
          <UInput v-model="form.logoNote" placeholder="Describe it, or skip for now" />
        </UFormField>
      </template>

      <template v-else>
        <UFormField label="Hero photo">
          <UInput v-model="form.heroPhotoNote" placeholder="Describe the photo guests should see first" />
        </UFormField>
        <UFormField label="Hero headline">
          <UInput v-model="form.heroHeadline" placeholder="Leave blank to use your business name" />
        </UFormField>
      </template>

      <div class="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <p class="text-[11px] text-muted">{{ helperText }}</p>
        <UButton
          color="primary"
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
