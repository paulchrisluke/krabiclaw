import { createFile, MP4BoxBuffer, type Movie } from 'mp4box'

export interface VideoMetadata {
  /** Whole seconds, rounded. */
  duration: number
  width: number
  height: number
}

/**
 * Duration and display size from an MP4/MOV file's own header, read with
 * mp4box. A file without a readable header or a video track is refused: an
 * asset whose length is unknown cannot be published to Instagram or Facebook.
 */
export function readMp4Metadata(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): VideoMetadata {
  const arrayBuffer = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes
  const file = createFile()
  const read: { movie?: Movie; failure?: string } = {}
  file.onReady = (movie) => { read.movie = movie }
  file.onError = (module, message) => { read.failure = `${module}: ${message}` }
  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0), true)
  file.flush()
  if (read.failure) throw new Error(`The video file could not be read: ${read.failure}`)
  const movie = read.movie
  if (!movie) throw new Error('The video file has no MP4 header (moov box)')
  const track = movie.videoTracks[0]
  if (!track) throw new Error('The video file has no video track')
  const seconds = movie.fragment_duration
    ? movie.fragment_duration.num / movie.fragment_duration.den
    : movie.duration / movie.timescale
  // The track header holds the display size (pixel aspect applied); the
  // sample entry's coded size is the fallback. A quarter-turn in the track's
  // matrix (a = d = 0) means the picture is shown rotated: swap them.
  const storedWidth = track.track_width || track.video?.width
  const storedHeight = track.track_height || track.video?.height
  const quarterTurn = track.matrix[0] === 0 && track.matrix[4] === 0
  const [width, height] = quarterTurn ? [storedHeight, storedWidth] : [storedWidth, storedHeight]
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('The video file does not state its duration')
  if (!width || !height) throw new Error('The video file does not state its dimensions')
  // Whole seconds; a clip shorter than half a second is still one second long, not zero.
  return { duration: Math.max(1, Math.round(seconds)), width, height }
}
