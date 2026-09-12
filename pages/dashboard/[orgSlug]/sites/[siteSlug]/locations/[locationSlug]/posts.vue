<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A post is open: my list is the index column, the post is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-posts">
    <template #header>
      <UDashboardNavbar title="Posts" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="postsPath"
        detail-title="Post"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <PostList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <PostList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import PostList from '~/components/dashboard/PostList.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.posts' })

const route = useRoute()

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const postsPath = computed(() => `${locationPath.value}/posts`)
const frame = useEditorFrame(postsPath)
</script>
