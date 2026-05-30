import { getVueComponent, isValidComponent } from '~/utils/vue-component-resolver'

export function useDynamicComponent() {
  const resolveComponent = (componentName: string | null | undefined): string | null => {
    if (!componentName || componentName.trim() === '') return null
    return getVueComponent(componentName)
  }

  return {
    resolveComponent,
    isValidComponent,
  }
}
