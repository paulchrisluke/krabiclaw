// Ref-counted scroll lock for managing document.body.style.overflow across
// multiple overlays (modals, drawers, lightboxes). Prevents multiple overlays
// from fighting over the overflow property.
export function useScrollLock() {
  // Store the count of active locks
  const refCount = useState<number>("scroll-lock-ref-count", () => 0);
  const previousOverflow = useState<string>(
    "scroll-lock-previous-overflow",
    () => "",
  );

  /**
   * Acquire a scroll lock. Safe to call multiple times.
   * The document overflow is hidden only when the first lock is acquired.
   */
  function acquire() {
    if (!import.meta.client) return;

    if (refCount.value === 0) {
      // Save the current overflow value before changing it
      previousOverflow.value = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    refCount.value++;
  }

  /**
   * Release a scroll lock. Must be paired with acquire().
   * The document overflow is restored only when the last lock is released.
   */
  function release() {
    if (!import.meta.client) return;

    if (refCount.value > 0) {
      refCount.value--;
      if (refCount.value === 0) {
        // Restore the previous overflow value (usually empty string)
        document.body.style.overflow = previousOverflow.value;
      }
    }
  }

  return { acquire, release };
}
