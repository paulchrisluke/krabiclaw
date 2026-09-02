<template>
  <div class="min-h-full bg-default pb-32">
    <div class="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <header class="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div class="max-w-3xl">
          <div class="flex items-center gap-3">
            <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">Visual storyboard</span>
            <span class="flex items-center gap-2 text-xs text-muted"><span class="size-2 rounded-full bg-success" /> Ready to publish</span>
          </div>
          <h1 class="mt-4 font-display text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">{{ page.title }}</h1>
          <p class="mt-4 max-w-2xl text-lg leading-8 text-muted">{{ page.summary || 'Arrange the story your visitors will see, section by section.' }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-eye" label="Preview story" />
          <UButton icon="i-lucide-check" label="Save draft" />
        </div>
      </header>

      <div class="mb-8 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-default bg-muted/45 px-5 py-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">Language</p>
          <p class="mt-2 font-bold text-highlighted">{{ page.locale.toUpperCase() }}</p>
        </div>
        <div class="rounded-2xl border border-default bg-muted/45 px-5 py-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">Sections</p>
          <p class="mt-2 font-bold text-highlighted">{{ page.sections.length }}</p>
        </div>
        <div class="rounded-2xl border border-default bg-muted/45 px-5 py-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">Public path</p>
          <p class="mt-2 truncate font-bold text-highlighted">{{ page.path }}</p>
        </div>
      </div>

      <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main class="grid min-w-0 auto-rows-[minmax(13rem,auto)] gap-4 md:grid-cols-2">
          <button
            v-for="(section, index) in page.sections"
            :key="section.id"
            type="button"
            class="group relative min-h-56 overflow-hidden rounded-[1.5rem] border border-default bg-elevated text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="[
              (section.type === 'hero' || section.type === 'gallery' || index % 5 === 0) ? 'md:col-span-2' : '',
              activeId === section.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : '',
            ]"
            @click="activeId = section.id"
          >
            <img v-if="section.mediaUrl" :src="section.mediaUrl" :alt="section.mediaAlt" class="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.02]" />
            <div v-if="section.mediaUrl" class="absolute inset-0 bg-gradient-to-t from-[#11152d]/90 via-[#11152d]/20 to-transparent" />
            <div v-else class="absolute inset-0 bg-gradient-to-br from-primary/12 via-elevated to-secondary/10" />
            <div class="relative flex min-h-56 flex-col justify-between p-6 sm:p-7" :class="section.mediaUrl ? 'text-white' : 'text-highlighted'">
              <div class="flex items-center justify-between gap-4">
                <span class="grid size-11 place-items-center rounded-xl backdrop-blur" :class="section.mediaUrl ? 'bg-white/15 text-white' : 'bg-default text-primary shadow-sm'">
                  <UIcon :name="section.icon" class="size-5" />
                </span>
                <span class="rounded-full px-3 py-1 text-xs font-bold backdrop-blur" :class="section.mediaUrl ? 'bg-black/25 text-white' : 'bg-default text-muted'">{{ String(index + 1).padStart(2, '0') }}</span>
              </div>
              <div class="mt-12 max-w-2xl">
                <p class="text-xs font-bold uppercase tracking-[0.16em]" :class="section.mediaUrl ? 'text-white/70' : 'text-primary'">{{ section.label }}</p>
                <h2 class="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">{{ section.summary }}</h2>
                <p v-if="section.body && section.body !== section.summary" class="mt-3 line-clamp-2 text-sm leading-6" :class="section.mediaUrl ? 'text-white/80' : 'text-muted'">{{ section.body }}</p>
              </div>
            </div>
          </button>

          <button type="button" class="flex min-h-56 items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-accented bg-muted/30 text-sm font-bold text-toned transition hover:border-primary hover:bg-primary/5 hover:text-primary">
            <span class="grid size-10 place-items-center rounded-full bg-default shadow-sm"><UIcon name="i-lucide-plus" class="size-5" /></span>
            Add the next section
          </button>
        </main>

        <aside class="xl:sticky xl:top-8">
          <div class="rounded-[1.5rem] border border-default bg-elevated p-6 shadow-lg">
            <template v-if="activeSection">
              <div class="flex items-start justify-between gap-4">
                <span class="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><UIcon :name="activeSection.icon" class="size-6" /></span>
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Close inspector" @click="activeId = ''" />
              </div>
              <p class="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">Selected section</p>
              <h2 class="mt-2 text-2xl font-bold text-highlighted">{{ activeSection.label }}</h2>
              <p class="mt-3 text-sm leading-6 text-muted">{{ activeSection.description }}</p>
              <div class="mt-6 rounded-xl bg-muted/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Visitor preview</p>
                <p class="mt-2 text-sm font-semibold leading-6 text-highlighted">{{ activeSection.summary }}</p>
              </div>
              <div class="mt-6 space-y-2">
                <UButton block color="neutral" variant="outline" icon="i-lucide-pencil" label="Edit content" />
                <UButton block color="neutral" variant="ghost" icon="i-lucide-image" label="Change media" />
                <UButton block color="neutral" variant="ghost" icon="i-lucide-grip-vertical" label="Reorder section" />
              </div>
            </template>
            <template v-else>
              <span class="grid size-12 place-items-center rounded-xl bg-muted text-toned"><UIcon name="i-lucide-mouse-pointer-2" class="size-6" /></span>
              <h2 class="mt-6 text-xl font-bold text-highlighted">Select a section</h2>
              <p class="mt-2 text-sm leading-6 text-muted">Choose any story card to inspect its content, media, and position.</p>
            </template>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PrototypePageView } from './prototype-model'

const props = defineProps<{ page: PrototypePageView }>()
const activeId = ref(props.page.sections[0]?.id ?? '')
const activeSection = computed(() => props.page.sections.find(section => section.id === activeId.value) ?? null)
</script>
