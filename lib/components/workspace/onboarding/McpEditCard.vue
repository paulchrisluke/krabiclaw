<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-simple-icons-openai" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="space-y-4 px-4 pb-4">
      <div v-if="starterPrompt" class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed">Start with this prompt</p>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="copiedStarter ? 'i-lucide-check' : 'i-lucide-clipboard'"
            @click="copyStarterPrompt"
          >
            {{ copiedStarter ? 'Copied' : 'Copy prompt' }}
          </UButton>
        </div>
        <div class="rounded-xl border border-default bg-default px-3 py-3 text-[12px] leading-relaxed text-highlighted">
          {{ starterPrompt }}
        </div>
      </div>

      <div class="rounded-xl border border-default bg-default px-3 py-3">
        <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed">How it works</p>
        <div class="mt-2 space-y-2">
          <div v-for="(step, index) in steps" :key="step" class="flex items-start gap-2">
            <div class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {{ index + 1 }}
            </div>
            <p class="text-[12px] leading-relaxed text-muted">{{ step }}</p>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-[11px] font-bold uppercase tracking-wide text-dimmed">Try prompts like</p>
        <div
          v-for="example in examples"
          :key="example"
          class="rounded-lg border border-default bg-default px-3 py-2 text-[12px] leading-relaxed text-highlighted"
        >
          {{ example }}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="guideTo"
          size="sm"
          color="primary"
          :to="guideTo"
        >
          {{ guideLabel }}
        </UButton>
        <UButton
          as="a"
          href="https://chatgpt.com"
          target="_blank"
          rel="noopener"
          size="sm"
          color="neutral"
          variant="outline"
        >
          Open ChatGPT
        </UButton>
        <UButton
          v-if="dashboardTo"
          size="sm"
          color="neutral"
          variant="ghost"
          :to="dashboardTo"
        >
          {{ dashboardLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
  dashboardTo?: string | null
  dashboardLabel?: string
  guideTo?: string | null
  guideLabel?: string
  starterPrompt?: string | null
  examples?: string[]
}>(), {
  title: 'Edit with ChatGPT',
  description: 'After the site exists, ChatGPT is the fastest place to ask for content edits, new sections, and media changes.',
  dashboardTo: null,
  dashboardLabel: 'Open the dashboard',
  guideTo: null,
  guideLabel: 'Setup guide',
  starterPrompt: null,
  examples: () => [
    'Update the beachfront pottery price to ฿2,000.',
    'Add a new FAQ for this location about parking.',
    'Write a warmer homepage headline and a short founder story.',
  ],
})

const steps = computed(() => [
  'Install the KrabiClaw ChatGPT app from the setup guide if you have not already.',
  'Tell it exactly what you want to change in plain English.',
  'Use the dashboard when you want precise control over members, billing, domains, or structured content.',
])

const examples = computed(() => props.examples)
const starterPrompt = computed(() => props.starterPrompt)
const copiedStarter = ref(false)

async function copyStarterPrompt() {
  if (!starterPrompt.value) return
  try {
    await navigator.clipboard.writeText(starterPrompt.value)
    copiedStarter.value = true
    setTimeout(() => {
      copiedStarter.value = false
    }, 2000)
  } catch (error) {
    console.error('copy_starter_prompt_failed', error)
  }
}
</script>
