// Composable for dynamic component rendering in Saya theme
import { getVueComponent, isValidComponent } from '~/utils/vue-component-resolver'

export function useDynamicComponent() {
  /**
   * Resolves a component identifier to a Vue component with fallback
   * @param componentName - The component identifier from the database
   * @returns The Vue component name or the fallback component name
   */
  const resolveComponent = (componentName: string | null | undefined) => {
    if (!componentName || (typeof componentName === 'string' && componentName.trim() === '')) return undefined
    const resolved = getVueComponent(componentName)
    return resolved || 'SayaContentBlockFallback'
  }

  /**
   * Checks if a component is valid and registered
   * @param componentName - The component identifier to check
   * @returns true if valid, false otherwise
   */
  const isComponentValid = (componentName: string | null | undefined): boolean => {
    return isValidComponent(componentName)
  }

  return {
    resolveComponent,
    isComponentValid,
    getVueComponent,
    isValidComponent,
  }
}
