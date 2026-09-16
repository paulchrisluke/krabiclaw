<template>
  <UPage
    class="h-full min-h-0"
    :ui="{ root: 'flex! h-full min-h-0', center: 'h-full min-h-0 w-full' }"
  >
    <UPageBody
      class="h-full min-h-0"
      :ui="{ base: 'mt-0! space-y-0! pb-0!' }"
    >
      <div
        class="flex h-full min-h-0 flex-col lg:grid"
        :class="wideDetail
          ? 'lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.5fr)]'
          : 'lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]'"
      >
        <section
          class="h-full min-h-0 flex-1 flex-col overflow-hidden border-default lg:flex lg:border-r"
          :class="hasDetail || showDesktopDetail ? 'flex' : 'flex lg:col-span-2 lg:border-r-0'"
        >
          <!--
            An editor's index is a column of fields and reads best measured and
            inset. A list panel is not: its rows run to the edge of the pane and
            its header stays put while they scroll, so `flushIndex` hands the
            whole section over and lets the list own its own spacing.
          -->
          <div v-if="flushIndex" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <slot name="index" />
          </div>
          <div v-else class="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-6 sm:px-8 sm:pt-8">
            <div class="mx-auto w-full" :class="hasDetail || showDesktopDetail ? 'max-w-xl' : 'max-w-3xl'">
              <slot name="index" />
            </div>
          </div>
          <footer v-if="$slots['index-footer']" class="shrink-0 border-t border-default bg-default px-5 py-4 sm:px-8">
            <div class="mx-auto flex w-full items-center justify-between gap-4" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
              <slot name="index-footer" />
            </div>
          </footer>
        </section>

        <!--
          One element, two renderings. Below `lg` this is the sheet: fixed over the
          index it was opened from, covering the bottom nav, dismissed by the close
          button. At `lg` the same element is the detail column of the pair.

          Rendering it twice — a slideover for narrow and a pane for wide — is what
          let the menu's two surfaces drift apart. The content has one home.
        -->
        <section
          v-if="hasDetail || showDesktopDetail"
          class="min-h-0 flex-col overflow-hidden bg-default lg:static lg:z-auto lg:h-full lg:flex-1"
          :class="hasDetail ? 'fixed inset-0 z-50 flex' : 'hidden lg:flex'"
        >
          <!--
            The close control belongs to the sheet, not to the pane: at `lg` the
            index is still on screen beside the detail, so there is nothing to
            dismiss back to. Dismiss discards the draft without warning, matching
            the sheets this is modelled on.

            It renders whenever there is somewhere to dismiss to, not only when
            a title was supplied. Gating it on the title meant a caller that
            passed `dismiss-to` and no title produced a full-screen sheet with
            no way out of it — which is what every chain parent did, so on a
            phone a post, a dish, an experience and an article were each a dead
            end.
          -->
          <header
            v-if="detailTitle || dismissTo"
            class="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-default px-4 py-3 lg:hidden"
          >
            <UButton
              icon="i-lucide-x"
              :aria-label="`Close ${detailTitle}`"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :to="dismissTo"
              @click="$emit('cancel')"
              data-testid="editor-detail-dismiss"
            />
            <h2 class="truncate text-center text-base font-semibold text-highlighted">{{ detailTitle }}</h2>
            <span class="size-8" />
          </header>

          <div v-if="flushDetail" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <slot name="detail" />
          </div>
          <div v-else class="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div class="mx-auto w-full" :class="wideDetail ? 'max-w-5xl' : 'max-w-2xl'">
              <h2
                v-if="detailTitle && !hideDetailHeading"
                class="mb-6 hidden text-2xl font-semibold text-highlighted lg:block"
              >
                {{ detailTitle }}
              </h2>
              <UAlert
                v-if="error"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="error"
                class="mb-6"
              />
              <slot name="detail" />
            </div>
          </div>

          <footer
            v-if="showActions"
            class="shrink-0 border-t border-default bg-default px-5 pb-4 pt-4 sm:px-8 lg:px-10"
          >
            <div class="mx-auto flex w-full items-center justify-between gap-4" :class="wideDetail ? 'max-w-5xl' : 'max-w-2xl'">
              <UButton color="neutral" variant="ghost" label="Cancel" @click="$emit('cancel')" />
              <UButton :label="saveLabel || 'Save'" :loading="saving" :disabled="saveDisabled" @click="$emit('save')" />
            </div>
          </footer>
        </section>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
defineProps<{
  hasDetail: boolean
  showDesktopDetail?: boolean
  showActions?: boolean
  saving?: boolean
  saveDisabled?: boolean
  saveLabel?: string
  error?: string | null
  wideDetail?: boolean
  /** Names the open node. Centred in the sheet's bar, a heading in the pane. */
  detailTitle?: string
  /** Where the sheet's close control goes: one level up, never back to itself. */
  dismissTo?: string
  /**
   * Drops the pane's own heading at `lg` for details that already title
   * themselves. The sheet's bar still uses `detailTitle`, because below `lg`
   * the detail covers the index and nothing else names what is open.
   */
  hideDetailHeading?: boolean
  /** The index is a list panel, not a form: it owns the whole column and its own padding. */
  flushIndex?: boolean
  /** Same for the detail: a conversation fills its column rather than sitting in it. */
  flushDetail?: boolean
}>()

defineEmits<{
  cancel: []
  save: []
}>()
</script>
