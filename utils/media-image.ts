export interface MediaImageSource {
  kind?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
}

export function resolveMediaImageUrl(source: MediaImageSource | null | undefined): string | null {
  const value = source?.kind === 'video' ? source.thumbnail_url : source?.kind === 'image' ? source.public_url : null
  return value?.trim() || null
}
