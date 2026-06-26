<template>
  <nav v-if="headings.length" aria-label="On this page" class="sticky top-24 text-sm">
    <p class="mb-3 font-semibold text-default">On this page</p>
    <ul class="space-y-1">
      <li v-for="heading in headings" :key="heading.id">
        <a
          :href="`#${heading.id}`"
          class="block border-l-2 py-0.5 transition-colors no-underline"
          :class="[
            heading.depth === 3 ? 'pl-6' : 'pl-3',
            activeId === heading.id ? 'border-primary text-default font-medium' : 'border-default text-muted hover:text-default hover:border-muted',
          ]"
          @click="selectHeading(heading.id)"
        >
          {{ heading.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
// Parses h2/h3 + their id (added by the shared heading-id slugger in
// utils/markdown.ts) out of the already-rendered article HTML, so the TOC
// always matches the live article body instead of duplicating heading logic.
const props = defineProps<{ html: string }>()

interface Heading {
  id: string
  text: string
  depth: 2 | 3
}

const headings = computed<Heading[]>(() => {
  const matches: Heading[] = []
  const regex = /<h([23])\s+id="([^"]+)">([\s\S]*?)<\/h\1>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(props.html))) {
    const [, depth, id, text] = match
    matches.push({
      depth: Number(depth) as 2 | 3,
      id: id!,
      text: text!.replace(/<[^>]+>/g, ''),
    })
  }
  return matches
})

const activeId = ref<string | null>(null)
let observer: IntersectionObserver | null = null
// Clicking a TOC link triggers a smooth scroll into view — while that's in
// flight, the observer would otherwise see headings pass by and flicker the
// active state through them before settling. Suppress it until the scroll
// has had time to finish, so the clicked link is the one that stays active.
let suppressObserverUntil = 0

function selectHeading(id: string) {
  activeId.value = id
  suppressObserverUntil = Date.now() + 800
}

// Keeps the address bar in sync with scroll position. replaceState (not
// pushState) so scrolling through a doc doesn't fill up browser history with
// one entry per heading.
watch(activeId, (id) => {
  if (!id || !import.meta.client) return
  const newHash = `#${id}`
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash)
  }
})

function observeHeadings() {
  observer?.disconnect()
  if (!import.meta.client || !headings.value.length) return

  observer = new IntersectionObserver((entries) => {
    if (Date.now() < suppressObserverUntil) return
    const visible = entries.filter(entry => entry.isIntersecting)
    if (!visible.length) return
    // The "current" section is the visible heading closest to the top of the
    // viewport, not just whichever IntersectionObserver happened to list first.
    const topmost = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]!
    activeId.value = topmost.target.id
  }, { rootMargin: '-96px 0px -70% 0px' })

  for (const heading of headings.value) {
    const el = document.getElementById(heading.id)
    if (el) observer.observe(el)
  }
}

onMounted(() => {
  // A deep link like .../doc#some-heading should highlight that heading
  // immediately, instead of waiting for the observer's first scroll event.
  if (import.meta.client && window.location.hash) {
    const id = window.location.hash.slice(1)
    if (headings.value.some(h => h.id === id)) activeId.value = id
  }
  nextTick(observeHeadings)
})
watch(() => props.html, () => nextTick(observeHeadings))
onUnmounted(() => observer?.disconnect())
</script>
