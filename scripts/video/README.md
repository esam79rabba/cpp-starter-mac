# Tutorial video

Builds the Arabic install-and-use tutorial (1080p MP4, about 3 minutes) from `scenes.mjs`.

Each scene is drawn as HTML, captured with headless Chrome, narrated with Microsoft's neural voice `en-US-AndrewMultilingualNeural` through `edge-tts` (it reads Arabic and the English terms in one voice), and joined with ffmpeg.

## Requirements

- `ffmpeg` (`brew install ffmpeg`)
- `edge-tts`: `python3 -m venv .venv && .venv/bin/pip install edge-tts`. It sends the narration text to Microsoft's online speech service.
- A headless Chrome. The default is Playwright's `chrome-headless-shell` (`npx playwright install chromium-headless-shell`); set `CHROME` to use another.

## Build

```bash
EDGE_TTS=.venv/bin/edge-tts node scripts/video/build.mjs                 # writes scripts/video/out/cpp-starter-tutorial.mp4
EDGE_TTS=.venv/bin/edge-tts node scripts/video/build.mjs ~/Desktop/x.mp4  # or another path
ONLY=1 node scripts/video/build.mjs                                       # images only, to check the screens quickly
```

`scripts/video/out/` holds the images, audio and video. Git ignores it.

## Editing scenes

In `scenes.mjs`, each scene has:

- `say`: what the voice speaks. Wrap English terms in `{...}`. The braces are removed before speaking; they only mark which words are English.
- `caption`: the Arabic subtitle. English parts are kept left-to-right automatically.
- `step`: the optional badge in the corner (for example `الخطوة ١`).
- `body`: the HTML drawn in the middle, using the helpers at the top of the file.

Keep the on-screen text (buttons, messages) identical to the extension's real UI strings in `src/`.
