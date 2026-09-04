// The state every list manager keeps: whether the list is in its edit state,
// whether the item sheet is open, which row that sheet is editing, and which row
// is being removed right now.
//
// Each page owns its own form and its own API calls — those genuinely differ. It
// supplies four hooks and gets the shared behaviour back, rather than each page
// re-deriving "adding means clear the form, then open" and drifting on the
// details, which is what the nine hand-written managers did.
export interface ListEditorHost<T extends { id: string }> {
  /** The record behind a row, or null if it has since been removed. */
  find: (id: string) => T | null
  /** Loads a record into the page's form. Called before the sheet opens. */
  fill: (row: T) => void
  /** Returns the form to its empty state. */
  clear: () => void
  /** Deletes the record. Throwing is reported by the page, not swallowed here. */
  destroy: (id: string) => Promise<void>
}

export function useListEditor<T extends { id: string }>(host: ListEditorHost<T>) {
  const editing = ref(false)
  const dialogOpen = ref(false)
  const editingId = ref<string | null>(null)
  const removingId = ref<string | null>(null)

  function openNew() {
    host.clear()
    editingId.value = null
    dialogOpen.value = true
  }

  function openExisting(item: { id: string }) {
    const row = host.find(item.id)
    // The row went away between render and click. Opening a sheet over a record
    // that no longer exists would save it back into being.
    if (!row) return
    host.fill(row)
    editingId.value = row.id
    dialogOpen.value = true
  }

  /** Call after a successful save so the sheet closes and the form resets. */
  function close() {
    dialogOpen.value = false
    editingId.value = null
    host.clear()
  }

  async function removeItem(item: { id: string }) {
    removingId.value = item.id
    try {
      await host.destroy(item.id)
      if (editingId.value === item.id) close()
    } catch {
      // The sheet stays open on the record that is still there. The page has
      // already reported the failure — that is what `destroy` throwing means —
      // so there is nothing to add here beyond not closing over it. Caught
      // rather than rethrown because the only caller is a template handler,
      // where it would surface as an unhandled rejection instead.
    } finally {
      removingId.value = null
    }
  }

  /** The sheet's own Remove, which acts on whatever it currently holds. */
  async function removeEditing() {
    if (!editingId.value) return
    await removeItem({ id: editingId.value })
  }

  return { editing, dialogOpen, editingId, removingId, openNew, openExisting, close, removeItem, removeEditing }
}
