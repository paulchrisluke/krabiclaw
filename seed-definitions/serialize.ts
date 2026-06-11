import type {
  CompiledCuratedSiteBundle,
  SerializedCompiledCuratedSiteBundle,
} from './contracts.ts'

export function serializeCompiledSeedBundle(
  bundle: CompiledCuratedSiteBundle,
): SerializedCompiledCuratedSiteBundle {
  return {
    ...bundle,
    publicRoutes: bundle.publicRoutes.map((route) => ({
      path: route.path,
      titlePattern: route.title.source,
      titleFlags: route.title.flags,
      text: route.text,
    })),
  }
}
