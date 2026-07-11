<template>
  <div class="w-full bg-white" data-parity-section="article-filters">
    <div class="mx-auto max-w-7xl px-0 py-4">
      <div class="border-b border-gray-200 bg-white pb-4">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div ref="menuRoot" class="relative z-10 inline-block text-left">
            <button
              type="button"
              class="group inline-flex justify-center text-sm font-medium text-[var(--blawby-primary)] hover:text-[var(--blawby-primary-dark)]"
              :aria-expanded="open"
              aria-haspopup="menu"
              @click="open = !open"
            >
              Category
              <svg class="-mr-1 ml-1 size-5 shrink-0 text-gray-400 group-hover:text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd" />
              </svg>
            </button>
            <div v-if="open" class="absolute z-10 mt-1 w-72 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5" role="menu">
              <label v-for="tag in tags" :key="tag" class="flex cursor-pointer items-center px-4 py-2 text-sm text-[var(--blawby-primary-dark)] hover:bg-gray-100">
                <input
                  type="checkbox"
                  :checked="modelValue.includes(tag)"
                  class="mr-2 size-4 rounded border-gray-300 text-[var(--blawby-accent)] focus:ring-[var(--blawby-accent)]"
                  @change="toggle(tag)"
                >
                {{ tag }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="modelValue.length" class="bg-gray-100">
        <div class="mx-auto max-w-7xl px-4 py-3 sm:flex sm:items-center sm:px-6 lg:px-8">
          <h3 class="text-sm font-medium text-gray-500">Filters<span class="sr-only">, active</span></h3>
          <div aria-hidden="true" class="hidden h-5 w-px bg-gray-300 sm:ml-4 sm:block" />
          <div class="mt-2 sm:ml-4 sm:mt-0">
            <div class="flex flex-wrap items-center">
              <span v-for="tag in modelValue" :key="tag" class="m-1 inline-flex items-center rounded-full border border-gray-200 bg-white py-1.5 pl-3 pr-2 text-sm font-medium text-[var(--blawby-primary-dark)]">
                {{ tag }}
                <button type="button" class="ml-1 inline-flex size-4 shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-500" @click="remove(tag)">
                  <span class="sr-only">Remove filter for {{ tag }}</span>
                  <svg class="size-2" stroke="currentColor" fill="none" viewBox="0 0 8 8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-width="1.5" d="M1 1l6 6m0-6L1 7" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  tags: string[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const open = ref(false)
const menuRoot = useTemplateRef<HTMLElement>('menuRoot')

function toggle(tag: string) {
  emit('update:modelValue', props.modelValue.includes(tag)
    ? props.modelValue.filter(value => value !== tag)
    : [...props.modelValue, tag])
}

function remove(tag: string) {
  emit('update:modelValue', props.modelValue.filter(value => value !== tag))
}

function onDocumentClick(event: MouseEvent) {
  if (!menuRoot.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>
