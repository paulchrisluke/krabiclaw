import { computed, toValue, type MaybeRefOrGetter } from 'vue'

export const SHARED_OG_IMAGE_PATH = '/og-image.png'

export function resolveSeoUrl(value: string | null | undefined, origin: string) {
  const target = value?.trim() || SHARED_OG_IMAGE_PATH
  try {
    return new URL(target).toString()
  } catch {
    return new URL(target, origin).toString()
  }
}

export function useSeoUrl(value: MaybeRefOrGetter<string | null | undefined> = SHARED_OG_IMAGE_PATH) {
  const requestURL = useRequestURL()
  return computed(() => resolveSeoUrl(toValue(value), requestURL.origin))
}

export function useSharedOgImage(value?: MaybeRefOrGetter<string | null | undefined>) {
  return useSeoUrl(() => toValue(value) || SHARED_OG_IMAGE_PATH)
}
