import type { ComputedRef, InjectionKey } from 'vue'

/**
 * The id of the element in an index panel's navbar that holds the list's
 * controls. One rule for every list screen: the navbar carries Back, the
 * title, and what you can do to the list — Edit, Add — and the body carries
 * the list itself. A list editor mounted inside an index panel teleports its
 * controls here; one mounted anywhere else keeps them inline.
 */
export const dashboardPanelActionsKey: InjectionKey<ComputedRef<string>> = Symbol('dashboard-panel-actions')
