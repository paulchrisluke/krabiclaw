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
          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-6 sm:px-8 sm:pt-8">
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
          -->
          <header
            v-if="detailTitle"
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

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div class="mx-auto w-full" :class="wideDetail ? 'max-w-5xl' : 'max-w-2xl'">
              <h2
                v-if="detailTitle"
                class="mb-6 hidden text-2xl font-semibold text-highlighted lg:block"
              >
                {{ detailTitle }}
              </h2>
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
  wideDetail?: boolean
  /** Names the open node. Centred in the sheet's bar, a heading in the pane. */
  detailTitle?: string
  /** Where the sheet's close control goes: one level up, never back to itself. */
  dismissTo?: string
}>()

defineEmits<{
  cancel: []
  save: []
}>()
</script>
