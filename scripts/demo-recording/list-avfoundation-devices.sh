#!/usr/bin/env bash
set -euo pipefail

echo "Listing macOS avfoundation capture devices..."
echo "Use the video device index with VIDEO_DEVICE=<index> when recording."
echo

ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true
