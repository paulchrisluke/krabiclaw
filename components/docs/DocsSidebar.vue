<template>
  <nav aria-label="Documentation">
    <PlatformCommandSearchTrigger
      surface="docs"
      label="Search docs, blog, help..."
      aria-label="Open documentation search"
      class="mb-3"
    />

    <!-- Drilled into a nav_group folder: back chevron + group name, showing only that
         group's pages. Vercel-style — a group never expands inline, it replaces the view. -->
    <template v-if="activeGroup">
      <button
        type="button"
        class="mb-3 flex w-full items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-default transition-colors"
        @click="activeGroup = null"
      >
        <PlatformIcon name="arrow-left" class="size-4 shrink-0" />
        <span class="truncate">{{ activeGroup.group }}</span>
      </button>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in activeGroupItems" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="block truncate rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors"
            :class="item.active ? 'bg-elevated text-primary font-medium' : 'text-muted hover:text-default hover:bg-muted'"
            @click="emit('navigate')"
          >
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </template>

    <!-- Top level: section headings, each with direct-link pages and/or group folder
         rows (chevron). Clicking a folder row drills in — it never expands in place. -->
    <template v-else>
      <NuxtLink
        v-if="drilledCategory"
        to="/docs"
        class="mb-3 flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-default transition-colors no-underline"
        @click="emit('navigate')"
      >
        <PlatformIcon name="arrow-left" class="size-4 shrink-0" />
        <span class="truncate">Back to Docs</span>
      </NuxtLink>

      <div v-for="section in sections" :key="section.label" class="mb-4 last:mb-0">
        <p class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ section.label }}</p>
        <ul class="flex flex-col gap-0.5">
          <li v-for="item in section.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="block truncate rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors"
              :class="item.active ? 'bg-elevated text-primary font-medium' : 'text-muted hover:text-default hover:bg-muted'"
              @click="emit('navigate')"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
          <li v-for="group in section.groups" :key="group.label">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors text-muted hover:text-default hover:bg-muted"
              @click="activeGroup = { section: section.label, group: group.label }"
            >
              <span class="truncate">{{ group.label }}</span>
              <PlatformIcon name="chevron-right" class="size-4 shrink-0" />
            </button>
          </li>
        </ul>
      </div>
    </template>
  </nav>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { categories } = useDocsNav()

// Mirrors layouts/dashboard.vue's workspace drill-down: inside a category,
// the sidebar scopes to that category's docs (plus a back link) instead of
// showing every category at once.
const drilledCategory = computed(() => typeof route.params.category === 'string' ? route.params.category : null)

// Which nav_group folder (if any) the sidebar has drilled into. Component-local,
// ephemeral state — resets whenever the sidebar remounts (e.g. on navigation).
const activeGroup = ref<{ section: string; group: string } | null>(null)

interface SectionItem {
  label: string
  to: string
  active: boolean
}

const sections = computed(() => {
  const matchesDrilldown = (subgroup: { docs: Array<{ categorySlug: string }> }) =>
    !drilledCategory.value || subgroup.docs.some(doc => doc.categorySlug === drilledCategory.value)

  const visible = categories.value
    .map(category => ({
      ...category,
      groups: category.groups
        .filter(matchesDrilldown)
        .map(subgroup => ({
          ...subgroup,
          docs: drilledCategory.value ? subgroup.docs.filter(doc => doc.categorySlug === drilledCategory.value) : subgroup.docs,
        }))
        .filter(subgroup => subgroup.docs.length),
    }))
    .filter(category => category.groups.length)

  return visible.map(({ category, groups: subgroups }) => {
    // Ungrouped docs (group === null) render as direct links under the section;
    // named subgroups render as a folder row that drills in on click.
    const ungrouped = subgroups.find(subgroup => subgroup.group === null)
    const named = subgroups.filter(subgroup => subgroup.group !== null)

    return {
      label: category,
      items: (ungrouped?.docs ?? []).map((doc): SectionItem => ({
        label: doc.label,
        to: doc.path,
        active: route.path === doc.path,
      })),
      groups: named.map(subgroup => ({
        label: subgroup.group as string,
        items: subgroup.docs.map((doc): SectionItem => ({
          label: doc.label,
          to: doc.path,
          active: route.path === doc.path,
        })),
      })),
    }
  })
})

const activeGroupItems = computed<SectionItem[]>(() => {
  if (!activeGroup.value) return []
  const section = sections.value.find(s => s.label === activeGroup.value!.section)
  const group = section?.groups.find(g => g.label === activeGroup.value!.group)
  return group?.items ?? []
})

// If the active doc changes out from under a drilled-in group (e.g. the user
// picked a doc via search while a group panel was open), fall back to the top
// level rather than showing a stale panel.
watch(() => route.path, () => {
  if (activeGroup.value && !activeGroupItems.value.some(item => item.active)) {
    activeGroup.value = null
  }
})
</script>
