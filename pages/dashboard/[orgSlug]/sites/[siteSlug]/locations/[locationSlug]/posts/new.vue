<template>
  <UDashboardPanel id="location-post-new">
    <template #header>
      <UDashboardNavbar title="New post" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="postsPath" label="Posts" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        Creating a post only writes it. Choosing where it goes out is the next
        step, on the post's own route, once there is something to publish.
      -->
      <PostEditor
        v-model:title="editor.form.title"
        v-model:body="editor.form.body"
        v-model:media="editor.form.media"
        eyebrow="New location post"
        :site-id="siteId"
        show-image
        show-preview
        :show-slug="false"
        :show-seo="false"
        :saving="editor.saving.value"
        body-placeholder="What's the post about?"
        :body-rows="6"
        save-label="Save post"
        publish-label="Save and continue"
        @save="onSave"
        @publish="onSave"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import PostEditor from '~/lib/components/workspace/editor/PostEditor.vue'
import { useLocationPostEditor } from '~/composables/useLocationPostEditor'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.posts' })

const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const postsPath = computed(() => locationPaths.value?.posts ?? '')
const editor = useLocationPostEditor(siteId, currentLocationId)

/** A saved post has an id, so editing continues on its own route. */
async function onSave() {
  const post = await editor.save(null)
  if (post?.id) await navigateTo(`${postsPath.value}/${post.id}`)
}

useSeoMeta({ title: 'New post | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
