import type { ComputedRef, InjectionKey } from 'vue'
import type { DashboardScopeHeaderModel } from './DashboardScopeHeader.vue'

export const dashboardScopeHeaderModelKey: InjectionKey<ComputedRef<DashboardScopeHeaderModel>> = Symbol('dashboard-scope-header-model')
export const dashboardOrganizationParentKey: InjectionKey<ComputedRef<{ label: string; to: string } | null>> = Symbol('dashboard-organization-parent')
