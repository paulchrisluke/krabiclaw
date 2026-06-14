#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-demo-recording-$(date +%Y%m%d-%H%M%S).mp4}"
VIDEO_DEVICE="${VIDEO_DEVICE:-Capture screen 0}"
FRAMERATE="${FRAMERATE:-60}"
SIZE="${SIZE:-1920x1080}"

echo "Recording screen to ${OUTPUT}"
echo "Video device: ${VIDEO_DEVICE}"
echo "Frame rate: ${FRAMERATE}"
echo "Size: ${SIZE}"
echo
echo "Press q in this terminal to stop recording cleanly."

ffmpeg \
  -f avfoundation \
  -framerate "${FRAMERATE}" \
  -video_size "${SIZE}" \
  -capture_cursor 1 \
  -capture_mouse_clicks 1 \
  -i "${VIDEO_DEVICE}:none" \
  -c:v libx264 \
  -preset veryfast \
  -crf 18 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "${OUTPUT}"
