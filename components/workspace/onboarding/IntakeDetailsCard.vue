<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-square-pen" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="@container px-4 pb-4">
      <div class="grid gap-4 @sm:grid-cols-2">
        <UFormField v-if="section === 'basics'" label="Name">
          <UInput v-model="form.name" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="City" :required="requireLocationBasics">
          <UInput v-model="form.city" placeholder="Ao Nang" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Address" :required="requireLocationBasics">
          <UTextarea v-model="form.address" :rows="2" placeholder="Street, ward, district" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Phone" :required="requireLocationBasics">
          <UInput v-model="form.phone" type="tel" placeholder="+66..." />
        </UFormField>
        <div v-if="section === 'basics' && showPrimaryToggle">
          <UCheckbox v-model="form.isPrimary" label="Make this the primary location" />
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <p class="text-[11px] text-muted">{{ helperText }}</p>
        <UButton
          color="primary"
          class="justify-center"
          :loading="loading"
          :disabled="disabled || !canSubmit"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
type IntakeForm = {
  name: string
  city: string
  address: string
  phone: string
  isPrimary: boolean
}

const form = defineModel<IntakeForm>('form', { required: true })

const props = defineProps<{
  title: string
  description: string
  actionLabel: string
  requireLocationBasics: boolean
  showPrimaryToggle: boolean
  section: 'basics'
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const helperText = computed(() => 'You can adjust these later.')

const canSubmit = computed(() => {
  if (!props.requireLocationBasics) return !!form.value.name.trim()
  return [
    form.value.name,
    form.value.city,
    form.value.address,
    form.value.phone,
  ].every(value => value.trim().length > 0)
})
</script>
