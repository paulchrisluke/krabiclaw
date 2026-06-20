<template>
  <UCard v-if="!dismissed && !allDone" class="border-primary/20">
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Getting started</p>
          <h3 class="text-base font-semibold text-highlighted">Finish setting up with ChatGPT</h3>
          <p class="text-sm text-muted mt-0.5">
            Ask ChatGPT to complete these — your site gets better with each one.
          </p>
        </div>
        <UButton icon="i-heroicons-x-mark" color="neutral" variant="ghost" size="sm" square aria-label="Dismiss" @click="dismiss" />
      </div>

      <!-- Progress bar -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted">
          <span>{{ completedCount }} of {{ total }} complete</span>
          <span v-if="allDone" class="text-primary font-medium">All done!</span>
        </div>
        <div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            class="h-full bg-primary rounded-full transition-all duration-500"
            :style="{ width: `${(completedCount / total) * 100}%` }"
          />
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">Start here</p>
          <UButton
            :icon="copiedStarter ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="copyStarterPrompt"
          >
            {{ copiedStarter ? 'Copied' : 'Copy prompt' }}
          </UButton>
        </div>
        <div class="rounded-xl border border-default bg-elevated px-3 py-3 text-sm leading-relaxed text-highlighted">
          {{ starterPrompt }}
        </div>
      </div>

      <!-- Items -->
      <ul class="space-y-2.5">
        <li v-for="item in items" :key="item.key" class="flex items-start gap-3">
          <div :class="[
            'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5 transition-colors',
            item.complete ? 'bg-(--kc-teal)' : 'border-2 border-muted bg-transparent',
          ]">
            <UIcon v-if="item.complete" name="i-heroicons-check" class="size-3 text-white" />
          </div>
          <div class="min-w-0 flex-1">
            <p :class="['text-sm font-medium', item.complete ? 'text-muted line-through' : 'text-highlighted']">
              {{ item.label }}
            </p>
            <div v-if="!item.complete" class="mt-1.5 flex items-center gap-2">
              <code class="text-xs text-muted bg-elevated px-2 py-1 rounded-lg truncate max-w-[320px] block">
                {{ item.prompt }}
              </code>
              <UButton
                :icon="copied === item.key ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :aria-label="`Copy prompt for ${item.label}`"
                @click="copyPrompt(item.key, item.prompt)"
              />
            </div>
          </div>
        </li>
      </ul>

      <div class="pt-1 flex items-center gap-3">
        <UButton as="a" href="https://chatgpt.com" target="_blank" rel="noopener" size="sm">
          Open ChatGPT
          <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5" />
        </UButton>
        <UButton :to="`/dashboard/${props.orgSlug}/~/settings/chatgpt`" variant="outline" color="neutral" size="sm">
          ChatGPT setup guide
        </UButton>
        <UButton variant="ghost" color="neutral" size="sm" @click="dismiss">
          Dismiss
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{ orgSlug: string }>()

interface ChecklistResponse {
  success: boolean
  vertical: string
  brandName: string
  city: string | null
  items: {
    business_info: boolean
    hero_image: boolean
    menu_or_experiences: boolean
    story: boolean
    post: boolean
  }
}

const { data, refresh } = await useFetch<ChecklistResponse>('/api/dashboard/onboarding/checklist', {
  server: false,
  lazy: true,
})

const DISMISS_KEY = computed(() => `kc_checklist_dismissed_${props.orgSlug}`)
const dismissed = ref(false)

onMounted(() => {
  dismissed.value = localStorage.getItem(DISMISS_KEY.value) === '1'
  refresh()
})

function dismiss() {
  localStorage.setItem(DISMISS_KEY.value, '1')
  dismissed.value = true
}

const copied = ref<string | null>(null)
const copiedStarter = ref(false)
async function copyPrompt(key: string, prompt: string) {
  try {
    await navigator.clipboard.writeText(prompt)
    copied.value = key
    setTimeout(() => { copied.value = null }, 2000)
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

async function copyStarterPrompt() {
  try {
    await navigator.clipboard.writeText(starterPrompt.value)
    copiedStarter.value = true
    setTimeout(() => { copiedStarter.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy starter prompt: ', err)
  }
}

const items = computed(() => {
  const name = data.value?.brandName ?? 'your business'
  const city = data.value?.city ? ` in ${data.value.city}` : ''
  const isExperience = data.value?.vertical === 'experience'
  const completed = data.value?.items

  return [
    {
      key: 'business_info',
      label: 'Business info imported from Google Maps',
      prompt: `Show me a summary of my site for ${name}`,
      complete: completed?.business_info ?? false,
    },
    {
      key: 'hero_image',
      label: 'Hero image added',
      prompt: `Generate a hero image for ${name}'s homepage`,
      complete: completed?.hero_image ?? false,
    },
    {
      key: 'menu_or_experiences',
      label: isExperience ? 'Experiences listed' : 'Menu added',
      prompt: isExperience
        ? `Add our signature experience to ${name} — include a description, duration, price per person, and max capacity`
        : `Build a menu for ${name}. Ask me about our sections and dishes.`,
      complete: completed?.menu_or_experiences ?? false,
    },
    {
      key: 'story',
      label: 'About section written',
      prompt: `Write an About section for ${name}${city}. Ask me a few questions first.`,
      complete: completed?.story ?? false,
    },
    {
      key: 'post',
      label: 'First post published',
      prompt: `Write a launch post announcing ${name}'s new website is live`,
      complete: completed?.post ?? false,
    },
  ]
})

const firstIncompleteItem = computed(() => items.value.find(item => !item.complete) ?? null)

const starterPrompt = computed(() => {
  const name = data.value?.brandName ?? 'my business'
  const isExperience = data.value?.vertical === 'experience'
  const firstMissing = firstIncompleteItem.value

  if (!firstMissing) {
    return isExperience
      ? `Help me review ${name}'s experience site and suggest the next highest-impact improvement. Ask me one question at a time.`
      : `Help me review ${name}'s restaurant site and suggest the next highest-impact improvement. Ask me one question at a time.`
  }

  return `Help me finish ${name}'s ${isExperience ? 'experience' : 'restaurant'} site. Start with "${firstMissing.label}" first. Ask me one question at a time and then help me complete this: ${firstMissing.prompt}`
})

const completedCount = computed(() => items.value.filter(i => i.complete).length)
const total = computed(() => items.value.length)
const allDone = computed(() => completedCount.value === total.value)
</script>
