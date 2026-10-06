<template>
  <section class="dev-perf-section" aria-label="Saya theme CSS render test">
    <h2>Saya theme CSS render test</h2>
    <p>
      This mode applies the <code>saya-theme</code> class and the same
      palette custom properties the Saya layout carries
      (<code>sitePaletteStyle</code>), without rendering any Saya
      component, to isolate theme-color CSS scoping cost from
      component-tree cost.
    </p>
    <div class="saya-theme dev-perf-saya-css-frame" :style="sayaThemeStyles">
      <p>Static text under saya-theme styling.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { TEMPLATE_PALETTES, sitePaletteStyle } from '~/shared/site-palette'

const sayaThemeStyles = sitePaletteStyle(TEMPLATE_PALETTES.saya)
</script>
