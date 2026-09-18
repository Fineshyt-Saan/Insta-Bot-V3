# Media Pipeline & Attachment Engine

## 1. Overview

Instagram Direct has unique media transport characteristics compared to Facebook Messenger. InstaBOT provides a **transparent media pipeline** that abstracts these differences away from commands.

---

## 2. Instagram Video Caption Separation

### The Problem
When sending video or audio broadcasts to Instagram Direct, Instagram's API silently discards any text caption included in the multipart payload.

### The Solution
The media pipeline (`platforms/instagram/media/handler.js`) detects if an outgoing form contains both a text body and video/voice media:
```javascript
// A command simply issues:
message.reply({
  body: "Here is your generated video summary:",
  attachment: "https://example.com/video.mp4"
});
```
The media handler automatically:
1. Sends the text caption as a preamble reply to preserve message context.
2. Downloads, validates, and prepares the video stream.
3. Broadcasts the video file to Instagram Direct.
4. Cleans up temporary artifacts.

---

## 3. Supported Media Formats

| Media Type | Extensions | Handling Details |
| :--- | :--- | :--- |
| **Photo / Image** | `.jpg`, `.jpeg`, `.png`, `.webp` | Sent via `sendPhoto` with optional inline caption. |
| **Video** | `.mp4`, `.mov`, `.webm` | Sent via `sendVideo`. Preamble text caption sent separately. |
| **Audio / Music** | `.mp3`, `.m4a`, `.wav` | Processed through `services/media` and sent as standalone audio. |
| **Canvas Graphics** | Memory Buffers | Rendered via `@napi-rs/canvas` or `canvas` and piped as JPEG/PNG buffers. |

---

## 4. Canvas & Image Generation Engine

InstaBOT supports over 25 canvas-powered commands (e.g. `rank`, `couple`, `gay`, `hug`, `kiss`, `jail`, `pfpframe`, `rip`, `ship`, `wanted`):
- Graphics are composited in memory using high-performance 2D context pipelines.
- User avatars and remote assets are buffered asynchronously.
- Output buffers are streamed directly to the Instagram media adapter with zero disk leaks.
