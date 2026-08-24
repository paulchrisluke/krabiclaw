# ChatGPT MCP recording

The acceptance run attaches to a normal, signed-in Chrome session through CDP.
It drives ChatGPT from visible DOM state and records screenshots beside the
sanitized MCP telemetry evidence. The FFmpeg recording remains a real screen
capture, not a synthetic video.

## Prepare Chrome and the connection

Start a dedicated Chrome profile with remote debugging enabled:

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$PWD/.playwright/chatgpt-cdp-profile"
```

Sign in to ChatGPT in that Chrome profile. Open **Settings → Security and
login**, enable **Developer mode**, then open **ChatGPT Plugins** and select the
plus button. Create or refresh the `devkrabiclaw` connection using the MCP URL
printed by the test harness. Developer mode availability depends on account and
workspace policy.

Override `CHATGPT_CDP_URL` or `CHATGPT_CONNECTOR_NAME` when Chrome or the
connection uses a different value.

## Record the screen

List macOS AVFoundation devices:

```bash
yarn demo:record:list-devices
```

Start a recording:

```bash
yarn demo:record:web demo-web.mp4
```

The FFmpeg recorder captures the selected screen, cursor, and mouse clicks. It
does **not** capture a microphone or system audio. Press `q` in its terminal to
stop cleanly. Override `VIDEO_DEVICE`, `FRAMERATE`, or `SIZE` when needed.

## Run the recordable gate

In a second terminal:

```bash
yarn test:mcp:chatgpt
```

The gate starts the isolated local fixture and tunnel, connects to the prepared
Chrome session, selects the connection, and drives one continuous ChatGPT
workflow. It waits on DOM state, captures each approval card, clicks **Allow**
once, captures every completed response, and verifies each expected call through
sanitized server telemetry:

1. Identify the fixture site.
2. Inspect homepage and media information.
3. Create a uniquely titled future-scheduled announcement.
4. Read it back.
5. Confirm and publish it immediately.
6. Open the returned public URL in the same Chrome session and verify the title.
7. Clean up through the fixture-authenticated MCP path.

It also checks that a read-only request, ambiguous site selection, and an
unsupported logo-deletion request produce no mutation. Browser screenshots and
`evidence.json` are written under `.wrangler/chatgpt-connector/`.

The detailed local prerequisites are in
[`docs/local-mcp-harness.md`](../../docs/local-mcp-harness.md).

## Trim the result

```bash
ffmpeg -ss 00:00:05 -to 00:01:20 -i demo-web.mp4 -c copy demo-web-trimmed.mp4
```
