<template>
  <section class="dev-perf-section" aria-label="Saya theme CSS render test">
    <h2>Saya theme CSS render test</h2>
    <p>
      This mode applies the <code>saya-theme</code> class and the same
      brand-color CSS custom property computation the Saya layout runs
      (<code>calculateThemeColors</code>), without rendering any Saya
      component, to isolate theme-color computation/CSS scoping cost from
      component-tree cost.
    </p>
    <div class="saya-theme dev-perf-saya-css-frame" :style="sayaThemeStyles">
      <p>Static text under saya-theme styling.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { calculateThemeColors } from '~/utils/color-utils'

const sayaThemeStyles = computed(() => {
  const colors = calculateThemeColors('#e11d48')
  return {
    '--brand-color': colors.brandColor,
    '--ui-primary': colors.brandColor,
    '--color-primary': colors.brandColor,
    '--brand-color-foreground': colors.brandColorForeground,
  }
})
</script>
