<template>
  <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 space-y-6 backdrop-blur-md" data-parity-section="prose">
    <h2 v-if="title" class="text-2xl sm:text-3xl font-bold text-default m-0">{{ title }}</h2>
    <TenantPageMarkdown :content="content" class="space-y-6 text-base text-muted leading-relaxed [&>p]:m-0" />
  </div>
</template>

<script setup lang="ts">
/** A heading and a few paragraphs in a glass card — the About page's "dilemma" section. */
defineProps<{ title?: string | null; content: string }>()
</script>
