<template>
  <UCard>
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Ask ChatGPT</p>
        <h3 class="text-base font-semibold text-highlighted">Quick prompts to try</h3>
      </div>
      <UButton
        :icon="copied === starterPrompt ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="copyStarterPrompt"
      >
        {{ copied === starterPrompt ? 'Copied' : 'Copy prompt' }}
      </UButton>
    </div>

    <div class="mt-3 rounded-xl border border-default bg-elevated px-3 py-3 text-sm leading-relaxed text-highlighted">
      {{ starterPrompt }}
    </div>

    <ul class="mt-3 space-y-1.5">
      <li v-for="prompt in quickPrompts" :key="prompt" class="flex items-center gap-2">
        <code class="text-xs text-muted bg-elevated px-2 py-1 rounded-lg truncate max-w-[320px] block">
          {{ prompt }}
        </code>
        <UButton
          :icon="copied === prompt ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="`Copy prompt: ${prompt}`"
          @click="copyPrompt(prompt)"
        />
      </li>
    </ul>

    <div class="pt-3 flex items-center gap-3">
      <UButton to="/docs/integrations/mcp-setup" size="sm">
        Open setup docs
      </UButton>
      <UButton :to="`/dashboard/${orgSlug}/~/settings/chatgpt`" variant="outline" color="neutral" size="sm">
        Open ChatGPT settings
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import {
  buildOnboardingStarterPrompt,
  getQuickActionPrompts,
  type OnboardingChecklistResponse,
} from '~/composables/useOnboardingPrompts'

const props = defineProps<{ orgSlug: string }>()
const orgSlug = computed(() => props.orgSlug)

const { data } = await useFetch<OnboardingChecklistResponse>('/api/dashboard/onboarding/checklist', {
  server: false,
  lazy: true,
})

const starterPrompt = computed(() => buildOnboardingStarterPrompt(data.value))
const quickPrompts = computed(() => getQuickActionPrompts(data.value?.vertical))

const { copied, copy } = useCopyToClipboard()

async function copyPrompt(prompt: string) {
  await copy(prompt)
}

async function copyStarterPrompt() {
  await copy(starterPrompt.value)
}
</script>
