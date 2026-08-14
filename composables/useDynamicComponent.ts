// Composable for dynamic component rendering in Saya theme
import { getVueComponent, isValidComponent } from '~/utils/vue-component-resolver'

export function resolveDynamicComponent(componentName: string | null | undefined) {
  const resolved = getVueComponent(componentName)
  if (!resolved) {
    throw new Error(`Saya content component is not registered: "${componentName ?? ''}"`)
  }
  return resolved
}

export function useDynamicComponent() {
  /**
   * Resolves a component identifier to a registered Vue component
   * @param componentName - The component identifier from the database
   * @returns The registered Vue component name
   */
  const resolveComponent = (componentName: string | null | undefined) => {
    return resolveDynamicComponent(componentName)
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
