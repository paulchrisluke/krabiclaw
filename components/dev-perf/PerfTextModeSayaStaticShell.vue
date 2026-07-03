<template>
  <section class="dev-perf-section dev-perf-platform-shell" aria-label="Static Saya shell render test">
    <h2>Static Saya shell render test</h2>
    <p>
      This mode renders Saya-shaped header/footer markup without real Saya components.
    </p>
    <div class="dev-perf-shell-frame saya-theme">
      <header class="dev-perf-static-header">
        <NuxtLink to="/" class="dev-perf-static-brand">
          <span class="dev-perf-static-mark">S</span>
          <span>Saya tenant</span>
        </NuxtLink>
        <nav class="dev-perf-static-nav" aria-label="Static Saya test navigation">
          <NuxtLink v-for="item in sayaStaticNavItems" :key="item.to" :to="item.to">
            {{ item.label }}
          </NuxtLink>
        </nav>
      </header>
      <main class="dev-perf-shell-body">
        <h3>Static body</h3>
        <p>This is the tenant static shell control.</p>
      </main>
      <footer class="dev-perf-static-footer">
        Static Saya footer text
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  sayaStaticNavItems: Array<{ label: string, to: string }>
}>()
</script>
