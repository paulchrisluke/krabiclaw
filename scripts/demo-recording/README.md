# Demo Recording Workflow

This folder helps capture the web portion of the OpenAI app submission demo.

What it does:

- records the screen with `ffmpeg`
- includes a legacy Playwright-guided recording helper, which ChatGPT may block
- provides a normal-browser, telemetry-asserted connector gate via `yarn test:mcp:chatgpt`

What it does not do:

- it does not fully automate ChatGPT login
- it does not turn Developer Mode on for you
- it does not automate iOS or Android app capture

## Why this setup

OpenAI's testing guide says to:

- link the connector in `Settings -> Connectors -> Developer mode`
- run your golden prompts in a new conversation
- record whether the model picks the right tool, passes the right arguments, and shows confirmation prompts
- test mobile layouts in the ChatGPT iOS and Android apps

This toolkit is designed around that flow.

## 1. Find your macOS capture device

```bash
yarn demo:record:list-devices
```

Usually the built-in full-screen capture device is `"Capture screen 0"`.

## 2. Start the screen recording

In terminal 1:

```bash
yarn demo:record:web demo-web.mp4
```

Optional environment variables:

```bash
VIDEO_DEVICE="Capture screen 0" FRAMERATE=60 SIZE=1920x1080 yarn demo:record:web demo-web.mp4
```

Press `q` in that terminal to stop the recording.

## 3. Run the guided ChatGPT web demo

In terminal 2:

```bash
yarn demo:chatgpt:web
```

For acceptance testing rather than a guided recording, use the normal-browser
telemetry gate documented in
[`docs/local-mcp-harness.md`](../../docs/local-mcp-harness.md):

```bash
yarn test:mcp:chatgpt
```

That command creates its own quick tunnel, runs the automated API/Playwright
prerequisites, prints the exact `/api/mcp` URL to use for `devkrabiclaw`, and
then pauses while you use a normal ChatGPT browser and verifies each expected
tool call through KrabiClaw telemetry before stopping the tunnel.

The older `yarn demo:chatgpt:web` recording helper will:

- reuse a persistent profile in `.playwright/chatgpt-profile`
- open `https://chatgpt.com/`
- wait for you to sign in and turn on your Developer Mode connector
- send prompts from `scripts/demo-recording/prompts.example.json`

ChatGPT and Google may detect and block that Playwright-launched browser. It is
not MCP acceptance evidence and is not used by `yarn test:mcp:chatgpt`.

You can customize the prompt sequence:

```bash
CHATGPT_PROMPTS_FILE=./my-prompts.json yarn demo:chatgpt:web
```

You can also force a specific browser channel if installed:

```bash
PLAYWRIGHT_CHANNEL=chrome yarn demo:chatgpt:web
```

## 4. Recommended recording structure

For the review video, keep the web recording short and deliberate:

1. Show the connector enabled in Developer Mode.
2. Run a read-only prompt like listing sites.
3. Run a non-destructive workflow like summarizing settings.
4. Run a write workflow like creating a draft post.
5. Run a triage workflow.
6. Run a destructive or publish workflow and show the confirmation behavior.

## 5. iOS and Android

Playwright is good for the web recording, but not for the native ChatGPT apps.

For iOS and Android, the simplest path is manual device capture:

- iPhone/iPad: use built-in screen recording from Control Center
- Android: use built-in screen recording or `adb shell screenrecord`

If you want later, you can automate mobile with emulators and Appium, but that is a separate setup and not included here.

## 6. Post-process with ffmpeg

Trim a raw recording:

```bash
ffmpeg -ss 00:00:05 -to 00:01:20 -i demo-web.mp4 -c copy demo-web-trimmed.mp4
```

Scale to a submission-friendly 1080p output:

```bash
ffmpeg -i demo-web-trimmed.mp4 -vf "scale=1920:-2" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p demo-web-final.mp4
```
