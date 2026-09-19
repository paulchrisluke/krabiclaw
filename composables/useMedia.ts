import { mediaPlaybackUrl, mediaStillUrl, type MediaPresentation } from '~/shared/media-placement-contract'

/**
 * One reading of a media record for the UI, over the canonical resolver.
 * `media_assets.kind` decides; nothing here guesses at a missing one.
 */
export const useMedia = () => {
  const resolveMedia = (asset?: (MediaPresentation & { alt_text?: string | null }) | null) => ({
    url: asset?.public_url ?? null,
    kind: asset?.kind ?? null,
    thumb: mediaStillUrl(asset),
    playback: mediaPlaybackUrl(asset),
    // The asset's own alt text, empty when it has none. A caller that wants a
    // description the asset does not carry has to fix the asset.
    alt: asset?.alt_text ?? '',
    isImage: asset?.kind === 'image',
    isVideo: asset?.kind === 'video',
  })

  return { resolveMedia }
}
