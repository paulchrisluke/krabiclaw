<template>
  <section class="dev-perf-section" aria-label="Single UI button render test">
    <h2>Single UI button render test</h2>
    <p>
      This mode renders a single UButton with no icon and no UCard wrapper,
      to isolate baseline Nuxt UI component overhead from the heavier
      <code>ui</code> mode (card + two buttons).
    </p>
    <UButton label="Primary action" color="primary" />
  </section>
</template>
