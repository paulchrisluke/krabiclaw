<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A page is open: my list is the index column, the page is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="site-pages">
    <template #header>
      <UDashboardNavbar title="Pages" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sitePath" label="Site" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="pagesPath"
        detail-title="Page"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <TenantPageList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <TenantPageList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import TenantPageList from '~/components/dashboard/TenantPageList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const pagesPath = computed(() => `${sitePath.value}/pages`)
const frame = useEditorFrame(pagesPath)

useSeoMeta({ title: 'Pages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
