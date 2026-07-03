<template>
  <section class="dev-perf-section" aria-label="Nuxt UI render test">
    <h2>Nuxt UI render test</h2>
    <p>
      This mode adds Nuxt UI components without icon props.
    </p>
    <UCard class="dev-perf-card">
      <template #header>
        <strong>Plain Nuxt UI card</strong>
      </template>
      <p>
        Static text inside a card, plus two buttons rendered without icons.
      </p>
      <div class="dev-perf-actions">
        <UButton label="Primary action" color="primary" />
        <UButton label="Neutral action" color="neutral" variant="soft" />
      </div>
    </UCard>
  </section>
</template>
