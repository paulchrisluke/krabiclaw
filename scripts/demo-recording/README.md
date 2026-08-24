# ChatGPT MCP recording

Use a normal, signed-in ChatGPT browser for the acceptance run. The repository
does not automate ChatGPT or create a synthetic video.

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

The gate starts the isolated local fixture and tunnel, prints the MCP URL, and
guides one continuous human-controlled ChatGPT workflow. It verifies each
expected call through sanitized server telemetry:

1. Identify the fixture site.
2. Inspect homepage and media information.
3. Create a uniquely titled future-scheduled announcement.
4. Read it back.
5. Confirm and publish it immediately.
6. Open the returned public URL and verify the title.
7. Clean up through the fixture-authenticated MCP path.

It also checks that a read-only request, ambiguous site selection, and an
unsupported logo-deletion request produce no mutation.

The detailed local prerequisites are in
[`docs/local-mcp-harness.md`](../../docs/local-mcp-harness.md).

## Trim the result

```bash
ffmpeg -ss 00:00:05 -to 00:01:20 -i demo-web.mp4 -c copy demo-web-trimmed.mp4
```
