<template>
  <nav v-if="totalPages > 1" class="mt-8 flex items-center justify-between border-t border-gray-200 px-4 sm:px-0" aria-label="Article pages">
    <div class="-mt-px flex w-0 flex-1">
      <button v-if="modelValue !== 1" type="button" class="inline-flex items-center border-t-2 border-transparent pr-1 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700" @click="select(modelValue - 1)">
        <svg class="mr-3 size-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L5.56 9.25h10.69A.75.75 0 0 1 17 10Z" clip-rule="evenodd" /></svg>
        Previous
      </button>
    </div>
    <div class="hidden space-x-4 md:-mt-px md:flex">
      <button v-for="page in visiblePages" :key="page" type="button" class="inline-flex items-center border-t-2 px-4 pt-4 text-sm font-medium" :class="modelValue === page ? 'border-[var(--blawby-accent)] text-[var(--blawby-accent)]' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'" :aria-current="modelValue === page ? 'page' : undefined" @click="select(page)">{{ page }}</button>
    </div>
    <div class="-mt-px flex w-0 flex-1 justify-end">
      <button v-if="modelValue !== totalPages" type="button" class="inline-flex items-center border-t-2 border-transparent pl-1 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700" @click="select(modelValue + 1)">
        Next
        <svg class="ml-3 size-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.69l-3.22-3.22a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H3.75A.75.75 0 0 1 3 10Z" clip-rule="evenodd" /></svg>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: number, totalPages: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const visiblePages = computed(() => {
  const start = Math.max(1, props.modelValue - 2)
  const end = Math.min(props.totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
function select(page: number) {
  emit('update:modelValue', Math.min(props.totalPages, Math.max(1, page)))
}
</script>
