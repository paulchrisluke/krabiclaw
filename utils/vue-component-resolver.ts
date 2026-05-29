// Dynamic Vue component resolver for Saya theme
// Maps component identifiers to actual Vue components for dynamic rendering

// Component registry - maps component names to Vue components
// Components are auto-imported by Nuxt, so we use string names that match the component file names
const COMPONENT_REGISTRY: Record<string, string> = {
  // Above the fold - load immediately
  'SayaHero': 'SayaHero',
  'SayaHeader': 'SayaHeader',
  'SayaLogoMark': 'SayaLogoMark',
  'SayaContentBlockFallback': 'SayaContentBlockFallback',

  // Below the fold - Lazy load JS!
  'SayaLocationsGrid': 'LazySayaLocationsGrid',
  'SayaReviews': 'LazySayaReviews',
  'SayaPosts': 'LazySayaPosts',
  'SayaCTA': 'LazySayaCTA',
  'SayaAbout': 'LazySayaAbout',
  'SayaQA': 'LazySayaQA',
  'SayaFilterTabs': 'LazySayaFilterTabs',
  'SayaSubNav': 'LazySayaSubNav',
  'SayaFooter': 'LazySayaFooter',
  'SayaUpgradeModal': 'LazySayaUpgradeModal',
  'SayaFeaturedContent': 'LazySayaFeaturedContent',

  // Generic content blocks (Below the fold)
  'ContentText': 'LazyContentText',
  'ContentImage': 'LazyContentImage',
  'ContentVideo': 'LazyContentVideo',
  'ContentGrid': 'LazyContentGrid',
  'ContentList': 'LazyContentList',

  // Generic content blocks (Above the fold)
  'ContentHero': 'ContentHero',
}

/**
 * Resolves a component identifier to a Vue component
 * @param componentName - The component identifier from the database
 * @returns The Vue component or null if not found
 */
export function getVueComponent(componentName: string | null | undefined) {
  if (!componentName) {
    return null
  }

  // Look up the component in the registry
  const resolvedName = COMPONENT_REGISTRY[componentName]
  
  if (!resolvedName) {
    // Log warning for unknown component
    if (import.meta.client) {
      console.warn(`[vue-component-resolver] Unknown component: "${componentName}"`)
    }
    return null
  }

  // Return the component name for Vue's dynamic component resolution
  // Nuxt will auto-resolve this to the actual component
  return resolvedName
}

/**
 * Checks if a component identifier is valid
 * @param componentName - The component identifier to check
 * @returns true if the component is registered, false otherwise
 */
export function isValidComponent(componentName: string | null | undefined): boolean {
  if (!componentName) return false
  return componentName in COMPONENT_REGISTRY
}

/**
 * Gets all registered component names
 * @returns Array of registered component names
 */
export function getRegisteredComponents(): string[] {
  return Object.keys(COMPONENT_REGISTRY)
}
