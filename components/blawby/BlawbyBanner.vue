<template>
  <div v-if="visible && (content || phone)" class="bg-[var(--blawby-primary-dark)] py-2.5">
    <div class="mx-auto flex max-w-7xl flex-col gap-y-1 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-x-8 sm:px-6 lg:px-8">
      <div class="min-w-0 flex-1">
        <BlawbyRichText v-if="content" :content="content" class="text-left text-sm font-medium leading-6 text-white [&_a]:text-white [&_a]:underline [&_p]:m-0 [&_p]:text-white" />
      </div>
      <div class="flex shrink-0 items-center gap-x-3">
        <a v-if="phone" :href="phoneHref" class="whitespace-nowrap text-sm font-semibold leading-6 text-white no-underline hover:text-white/85">{{ phone }}</a>
        <button v-if="dismissible" type="button" class="-m-3 p-3 text-white hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" @click="dismiss">
          <span class="sr-only">Dismiss</span>
          <svg class="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  content?: string | null
  phone?: string | null
  dismissible?: boolean
  storageKey: string
}>()

const visible = ref(true)
const phoneHref = computed(() => {
  const digits = String(props.phone || '').replace(/\D/g, '')
  const normalized = digits.length === 10 ? `1${digits}` : digits
  return normalized ? `tel:+${normalized}` : undefined
})

function dismiss() {
  if (props.dismissible) localStorage.setItem(props.storageKey, 'dismissed')
  visible.value = false
}

onMounted(() => {
  if (props.dismissible && localStorage.getItem(props.storageKey) === 'dismissed') visible.value = false
})
</script>
