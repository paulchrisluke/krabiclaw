<template>
  <section class="dev-perf-section" :aria-label="ariaLabel">
    <h2>{{ heading }}</h2>
    <p>
      {{ description }}
    </p>
    <ul>
      <li v-for="icon in icons" :key="icon">
        <ClientOnly v-if="renderMode === 'client-only'">
          <UIcon :name="icon" class="dev-perf-icon" />
          <template #fallback>
            <span class="dev-perf-icon dev-perf-icon-placeholder" aria-hidden="true" />
          </template>
        </ClientOnly>
        <span
          v-else-if="renderMode === 'placeholders'"
          class="dev-perf-icon dev-perf-icon-placeholder"
          aria-hidden="true"
        />
        <UIcon v-else :name="icon" class="dev-perf-icon" />
        <span>{{ icon }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  ariaLabel: string
  description: string
  heading: string
  icons: string[]
  renderMode: 'client-only' | 'icons' | 'placeholders'
}>()
</script>
