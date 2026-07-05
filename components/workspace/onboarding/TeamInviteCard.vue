<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-users" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ props.title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ props.description }}</p>
        </div>
      </div>
    </template>

    <div class="px-4 pb-4 space-y-3">
      <UForm :state="form" class="flex flex-col gap-2" @submit.prevent="$emit('submit')">
        <div class="flex gap-2">
          <UInput
            v-model="form.email"
            type="email"
            placeholder="teammate@example.com"
            size="sm"
            class="flex-1"
            aria-label="Email address"
          />
          <USelect
            v-model="form.role"
            :items="roleOptions"
            size="sm"
            class="w-28"
            aria-label="Team member role"
          />
        </div>
        <div class="flex gap-2">
          <UButton type="submit" size="sm" color="primary" :loading="loading" icon="i-lucide-send">
          {{ props.actionLabel }}
        </UButton>
          <UButton size="sm" color="neutral" variant="ghost" @click="$emit('skip')">
            {{ props.skipLabel }}
          </UButton>
        </div>
      </UForm>

      <UAlert
        v-if="props.inviteSuccess"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        description="Invite sent. Add another or continue."
        :ui="{ root: 'py-2' }"
      />

      <UButton
        v-if="props.inviteSuccess && props.showContinue"
        size="sm"
        color="neutral"
        variant="outline"
        @click="$emit('continue')"
      >
        {{ props.continueLabel }}
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
type InviteForm = {
  email: string
  role: string
}

const form = defineModel<InviteForm>('form', { required: true })

const props = withDefaults(defineProps<{
  title: string
  description: string
  actionLabel: string
  skipLabel?: string
  continueLabel?: string
  showContinue?: boolean
  loading?: boolean
  inviteSuccess?: boolean
}>(), {
  skipLabel: 'Skip for now',
  continueLabel: 'Continue',
  showContinue: true,
  loading: false,
  inviteSuccess: false,
})

defineEmits<{
  submit: []
  skip: []
  continue: []
}>()

const roleOptions = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
]
</script>
