<template>
  <UDashboardPanel
    v-if="level.mode.value !== 'yield'"
    :id="id"
    :class="pair ? 'hidden lg:flex' : undefined"
    :default-size="pair ? 50 : undefined"
    :ui="ui"
  >
    <template #header>
      <UDashboardNavbar :title="title" :toggle="false" :ui="navbarUi">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
        <!-- A control that names what the whole level is showing — Today's range — belongs beside the title, not in the body. -->
        <template v-if="$slots.center" #default>
          <slot name="center" />
        </template>
        <template v-if="$slots.right" #right>
          <slot name="right" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Alone it uses the frame, as Airbnb's listing grid does; beside a child it is a column. -->
      <div class="mx-auto w-full" :class="pair ? 'max-w-2xl' : undefined">
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
  /** For a level whose navbar carries its own control, such as Today's range. */
  navbarUi?: Record<string, string>
}>()

const level = useRouteLevel()
const pair = computed(() => level.mode.value === 'pair')

const pane = useDashboardPane()
const router = useRouter()
let opened = false
onMounted(() => {
  watch([() => props.autoOpen, pane, level.mode], ([target, wide, mode]) => {
    // An index on its way out after a navigation elsewhere yields, so it opens nothing.
    if (opened || !target || !wide || mode !== 'index') return
    // A target that is this level's own URL opens nothing. An index whose rows
    // are still loading offers itself as the first row, and taking that as the
    // child both navigated nowhere and used up the one open this index gets.
    if (router.resolve(target).path === level.path.value) return
    opened = true
    void navigateTo(target, { replace: true })
  }, { immediate: true })
})
</script>
