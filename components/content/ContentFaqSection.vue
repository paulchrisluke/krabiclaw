<template>
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-semibold text-default">{{ label || 'Frequently Asked Questions' }}</h2>
      <p class="mt-1 text-sm text-muted">Helpful answers related to this page.</p>
    </div>

    <div class="space-y-3">
      <div v-for="(item, index) in items" :key="`faq-${index}`" class="rounded-2xl border border-default p-5">
        <h3 class="text-lg font-medium text-default">{{ item.question }}</h3>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose mt-3 max-w-none text-muted dark:prose-invert" v-html="item.answerHtml" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  label?: string | null
  items: Array<{
    question: string
    answerHtml: string
  }>
}>()
</script>
