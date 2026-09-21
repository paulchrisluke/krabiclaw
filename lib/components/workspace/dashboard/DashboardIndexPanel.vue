<template>
  <UDashboardPanel
    v-if="level.mode.value !== 'yield'"
    :id="id"
    :class="pair ? 'hidden lg:flex' : undefined"
    :default-size="pair ? 32 : undefined"
    :ui="ui"
  >
    <template #header>
      <UDashboardNavbar :title="title" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
        <template v-if="$slots.right" #right>
          <slot name="right" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full" :class="pair ? 'max-w-xl' : 'max-w-3xl'">
        <slot />
      </div>
    </template>

    <!-- A list whose order is itself a draft — sections, links — commits from here. -->
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UDashboardPanel>

  <NuxtPage />
</template>

<script setup lang="ts">
/*
  An index: a level whose rows link to its children. It is the whole screen
  with nothing open, the left column once a child is, and it steps aside when a
  grandchild owns both columns — Nuxt UI's own two-panel idiom, decided here
  from the route tree so no page carries a breakpoint.

  `autoOpen` is the child an index opens on arrival where there is a pane to
  put it in, the way a listing editor lands on its first section. Below the
  pane width the index is the screen and nothing is chosen for the tenant.
  Client-only and `replace`, so Back still leaves the index.
*/
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  id: string
  title: string
  autoOpen?: RouteLocationRaw | null
  ui?: { root?: string; body?: string }
}>()

const level = useRouteLevel()
const pair = computed(() => level.mode.value === 'pair')

const pane = useDashboardPane()
let opened = false
onMounted(() => {
  watch([() => props.autoOpen, pane, level.mode], ([target, wide, mode]) => {
    if (opened || !target || !wide || mode !== 'index') return
    opened = true
    void navigateTo(target, { replace: true })
  }, { immediate: true })
})
</script>
