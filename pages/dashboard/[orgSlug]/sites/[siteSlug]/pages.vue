<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A page is open: my list is the index column, the page is the detail. -->
  <template v-else>
    <UDashboardPanel
      id="site-pages"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Pages" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sitePath" label="Site" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <TenantPageList />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import TenantPageList from '~/components/dashboard/TenantPageList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const pagesPath = computed(() => `${sitePath.value}/pages`)
const frame = useEditorFrame(pagesPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

useSeoMeta({ title: 'Pages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
