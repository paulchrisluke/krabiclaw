// Feature-flagged off (2026-07) — upsell surface paused while we focus on
// primary product features. `open()` is a no-op and SayaUpgradeModal is
// unmounted at both its render sites (layouts/saya.vue, layouts/editor.vue)
// so the component chunk doesn't ship to real tenant-site visitors either.
// Existing call sites (e.g. content.vue's "Upgrade to Pro to fill this from
// Google Business" button) are left in place and harmlessly do nothing.
//
// To bring this back: flip UPGRADE_MODAL_ENABLED to true, then reconsider
// where it's mounted — it is NOT a dashboard-chrome feature despite living
// under a `pages/dashboard/...` route; the trigger in content.vue renders
// through `layout: 'editor'` (a bare wrapper, no dashboard sidebar/nav), and
// the other real-world mount point is layouts/saya.vue's live `?edit=true`
// preview. If you want this in actual dashboard chrome, it needs a new mount
// point inside layouts/dashboard.vue, not just re-enabling the flag. If you
// keep it in the Saya tree, gate it with `useEditMode().editMode` the way
// SayaMcpHint.vue does — the previous version had no such gate and shipped
// the modal to every real customer regardless of whether they could ever
// trigger it.
export const UPGRADE_MODAL_ENABLED = false

export const useUpgradeModal = () => {
  const state = useState('upgrade-modal', () => ({
    isOpen: false,
    feature: '' as string
  }))

  const open = (feature: string) => {
    if (!UPGRADE_MODAL_ENABLED) return
    state.value.feature = feature
    state.value.isOpen = true
  }

  const close = () => {
    state.value.isOpen = false
    state.value.feature = ''
  }

  return {
    isOpen: computed(() => state.value.isOpen),
    feature: computed(() => state.value.feature),
    open,
    close
  }
}
