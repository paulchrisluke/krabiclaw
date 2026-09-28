<template>
  <!--
    Rendered on the server, lazily loaded by the browser. The frame used to be
    mounted by an IntersectionObserver after hydration, so the page's HTML held
    an empty box and a crawler reading it found no video at all.
  -->
  <iframe
    :title="title"
    :src="youTubeEmbedUrl(videoId)"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen
    class="aspect-video w-full border-0"
  />
</template>

<script setup lang="ts">
import { youTubeEmbedUrl, youTubeVideoId } from '~/shared/youtube-video'

const props = defineProps<{ url: unknown; title: string }>()
// The writer only stores YouTube addresses, so any other one is data this page
// cannot show, and it says so rather than rendering an empty frame.
const videoId = computed(() => {
  const id = youTubeVideoId(props.url)
  if (!id) throw createError({ statusCode: 500, statusMessage: 'A video block holds an address that is not a YouTube video' })
  return id
})
</script>
