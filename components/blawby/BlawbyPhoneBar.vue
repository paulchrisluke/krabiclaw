<template>
  <div v-if="phone" data-blawby-critical-banner class="bg-[var(--blawby-primary-dark)] py-2.5">
    <div class="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
      <a :href="phoneHref" class="whitespace-nowrap text-sm font-semibold leading-6 text-white no-underline hover:text-white/85">{{ phone }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  phone?: string | null
}>()

const phoneHref = computed(() => {
  const digits = String(props.phone || '').replace(/\D/g, '')
  const normalized = digits.length === 10 ? `1${digits}` : digits
  return normalized ? `tel:+${normalized}` : undefined
})
</script>
