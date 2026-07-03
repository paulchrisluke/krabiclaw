<template>
  <section class="dev-perf-section" aria-label="Single icon render test">
    <h2>Single icon render test</h2>
    <p>
      This mode renders exactly one UIcon, to isolate the fixed cost of
      engaging the Icon module/server bundle at all from the marginal
      per-icon cost measured by the full <code>icons</code> mode.
    </p>
    <UIcon name="i-heroicons-bolt" class="dev-perf-icon" />
  </section>
</template>
