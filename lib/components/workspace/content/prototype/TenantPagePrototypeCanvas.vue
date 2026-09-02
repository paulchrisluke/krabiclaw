<template>
  <div class="min-h-full bg-[#ece9e3] pb-28 dark:bg-[#0b0e1d]">
    <header class="sticky top-0 z-20 border-b border-default bg-default/90 px-5 py-4 backdrop-blur-xl sm:px-8">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-5">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs font-semibold text-muted">
            <span>Pages</span><UIcon name="i-lucide-chevron-right" class="size-3" /><span class="truncate">{{ page.title }}</span>
          </div>
          <div class="mt-1 flex items-center gap-3">
            <h1 class="truncate text-lg font-bold text-highlighted sm:text-xl">Editorial canvas</h1>
            <span class="hidden size-1.5 rounded-full sm:block" :class="page.dirty ? 'bg-warning' : 'bg-success'" />
            <span class="hidden text-xs text-muted sm:inline">{{ page.dirty ? 'Changes ready' : 'All changes saved' }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-external-link" label="Preview" class="hidden sm:inline-flex" />
          <UButton icon="i-lucide-check" label="Save page" />
        </div>
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-12">
      <aside class="hidden lg:block">
        <div class="sticky top-32 space-y-1">
          <p class="mb-3 px-3 text-xs font-bold uppercase tracking-[0.16em] text-muted">On this page</p>
          <button type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition" :class="activeId === 'details' ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:bg-default/60'" @click="activeId = 'details'">
            <UIcon name="i-lucide-file-pen-line" class="size-4" />
            Page details
          </button>
          <button v-for="section in page.sections" :key="section.id" type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition" :class="activeId === section.id ? 'bg-default font-semibold text-highlighted shadow-sm' : 'text-muted hover:bg-default/60'" @click="activeId = section.id">
            <UIcon :name="section.icon" class="size-4 shrink-0" />
            <span class="truncate">{{ section.label }}</span>
          </button>
          <button type="button" class="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-accented px-3 py-3 text-left text-sm font-semibold text-toned hover:border-primary hover:text-primary">
            <UIcon name="i-lucide-plus" class="size-4" />
            Add section
          </button>
        </div>
      </aside>

      <main class="min-w-0">
        <section class="mx-auto max-w-3xl overflow-hidden rounded-[1.75rem] border border-white/70 bg-default shadow-[0_24px_80px_rgba(31,35,64,0.12)] dark:border-white/10">
          <div class="border-b border-default px-6 py-8 sm:px-10 sm:py-10" :class="activeId === 'details' ? 'bg-primary/5' : ''" @click="activeId = 'details'">
            <div class="flex flex-wrap items-start justify-between gap-5">
              <div class="max-w-2xl">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-primary">{{ page.locale.toUpperCase() }} · {{ page.path }}</p>
                <h2 class="mt-4 font-display text-4xl font-bold leading-tight text-highlighted sm:text-5xl">{{ page.title }}</h2>
                <p class="mt-5 text-lg leading-8 text-muted">{{ page.summary || 'Add a short introduction for this page.' }}</p>
              </div>
              <UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Edit page details" />
            </div>
            <div v-if="activeId === 'details'" class="mt-8 grid gap-5 rounded-2xl border border-primary/20 bg-default p-5 sm:grid-cols-2">
              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">Title</span>
                <input :value="page.title" readonly class="h-12 w-full rounded-xl border border-default bg-elevated px-4 text-highlighted outline-none" />
              </label>
              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">Path</span>
                <input :value="page.path" readonly class="h-12 w-full rounded-xl border border-default bg-elevated px-4 text-highlighted outline-none" />
              </label>
            </div>
          </div>

          <div class="divide-y divide-default">
            <article
              v-for="(section, index) in page.sections"
              :key="section.id"
              class="group relative cursor-pointer px-6 py-8 transition sm:px-10 sm:py-10"
              :class="activeId === section.id ? 'bg-primary/[0.035]' : 'hover:bg-muted/35'"
              @click="activeId = section.id"
            >
              <div class="flex items-start gap-4">
                <span class="mt-1 text-xs font-semibold text-dimmed">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <div class="flex items-center gap-2">
                        <UIcon :name="section.icon" class="size-4 text-primary" />
                        <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary">{{ section.label }}</p>
                      </div>
                      <h3 v-if="section.type !== 'markdown'" class="mt-4 font-display text-3xl font-bold leading-tight text-highlighted">{{ section.summary }}</h3>
                      <p v-else class="mt-4 whitespace-pre-line text-lg leading-8 text-highlighted">{{ section.body || section.summary }}</p>
                    </div>
                    <UButton color="neutral" variant="ghost" icon="i-lucide-grip-vertical" aria-label="Reorder section" />
                  </div>
                  <img v-if="section.mediaUrl" :src="section.mediaUrl" :alt="section.mediaAlt" class="mt-6 aspect-[16/7] w-full rounded-2xl object-cover" />

                  <div v-if="activeId === section.id" class="mt-7 rounded-2xl border border-primary/20 bg-default p-5 shadow-sm" @click.stop>
                    <div class="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p class="font-semibold text-highlighted">Edit {{ section.label.toLowerCase() }}</p>
                        <p class="mt-1 text-xs text-muted">{{ section.description }}</p>
                      </div>
                      <span class="text-xs text-muted">{{ section.body.length }} characters</span>
                    </div>
                    <textarea :value="section.body || section.summary" readonly rows="7" class="w-full resize-none rounded-xl border border-default bg-elevated p-4 text-base leading-7 text-highlighted outline-none" />
                    <div class="mt-4 flex justify-end gap-2">
                      <UButton color="neutral" variant="ghost" label="Done" @click="activeId = ''" />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div class="px-6 py-8 sm:px-10">
            <button type="button" class="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accented py-5 text-sm font-semibold text-toned transition hover:border-primary hover:text-primary">
              <UIcon name="i-lucide-plus" class="size-4" />
              Add another section
            </button>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PrototypePageView } from './prototype-model'

const props = defineProps<{ page: PrototypePageView }>()
const activeId = ref(props.page.sections[0]?.id ?? 'details')
</script>
