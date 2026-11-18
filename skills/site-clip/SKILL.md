---
name: site-clip
description: Record a web page, scroll story or WebGL / three.js scene as a smooth, seamlessly looping video for a portfolio, case study or project page. Films headless Chrome frame by frame on a held clock (so a slow machine still gives perfect 60 fps), blends sub-frames into motion blur, dissolves the end into the start, crops and encodes H.264 + AV1 + a WebP poster, and swaps out anything private (QR codes, emails, addresses) in the browser before filming. Use when the user wants a screen recording, clip, loop, preview video or showreel take of a website or 3D scene, or asks to re-record a project clip after a redesign.
---

# Site clip: a web page → a perfect looping video

```
1. plan       what moves, which window of it, where the loop joins
2. privacy    anything readable that must not ship? swap it in the browser (references/privacy.md)
3. probe      PROBE=1 node scripts/record.mjs shot.json probe      one still a second: framing and timing
4. record     node scripts/record.mjs shot.json frames             sub-frames on a held clock
5. blend      scripts/blend.sh frames 120                          sub-frames → 60 fps with motion blur
6. loop       scripts/loop-encode.sh frames out/name <start> <end> loop, crop, mp4 + webm + poster
7. check      node scripts/check.mjs out/name.mp4 [expected QR]    scan the ENCODED file, look at the seam
8. ship       <video> tag, bump the page's clip version constant
```

Show the user the probe stills before the full take, and the seam picture and a few frames before shipping. A full take costs minutes; a probe costs seconds.

## Why a held clock

A screen recorder captures whatever the machine manages: dropped frames, stutter on WebGL, a hitch whenever a texture uploads. The recorder here owns time instead. Before the page loads it replaces `performance.now`, `Date.now` and `requestAnimationFrame`, then pauses every CSS / Web Animation. Each frame it advances the clock exactly `1000/sub` ms, sets the scroll and pointer for that moment, runs the page's frame callbacks and takes a screenshot. A frame that takes two seconds to draw still lands exactly 1/120 s after the last one. Details, flags and failure cases: [references/recording.md](references/recording.md).

## 1. Plan the shot

- **What moves and why someone would watch it loop:** a scroll story, a hero animation reacting to the pointer, a 3D scene turning. Pick one idea per clip; 4-9 s loops read best on a project page.
- **The loop point:** a loop is cheapest where the picture is nearly the same at both ends (a full turn of a pointer circle, a scroll that comes back, an idle scene). Otherwise the dissolve (0.6 s) hides it.
- **Aspect:** film at the size the page is designed for (1280x800, 1600x1000 or 1920x1080) and crop to the target aspect from the middle afterwards. Never paint over a watermark or a mark you don't want: crop it out, or hide it with `hide` before filming.

## 2. Privacy first

Before any take, look at a probe still and list what is readable: QR codes, email addresses, phone numbers, street addresses, real names, API keys in a dev panel, a watermark. Each one is swapped **in the filming browser only**, never on the live site:

- an image or SVG (a QR code, a card face) → `swaps` replaces the network response with a stand-in file (`scripts/makeqr.py` writes a valid stand-in QR that reads your public URL);
- text in the page → `domText`; text drawn into a canvas (labels on 3D objects, textures made at runtime) → `canvasText`;
- whole elements → `hide` (CSS selectors) or `onlyCanvas: true`.

The recorder prints which swaps actually fired ("NOTHING" means your pattern missed). Then **check the encoded file**, not the source frames: `scripts/check.mjs` scans frames of the .mp4 for QR codes and exits non-zero if one reads anything but the code you expect. Full method: [references/privacy.md](references/privacy.md).

## 3-4. Record

Write a shot file (examples in `examples/`):

```json
{
  "url": "https://example.com/",
  "viewport": [1280, 800], "dpr": 1,
  "sub": 120,
  "seconds": 9.2, "keepFrom": 1.5,
  "settle": 5000,
  "scroll": { "from": 0, "to": 5200, "start": 0.8, "seconds": 11, "preload": "walk" },
  "pointer": { "circle": { "selector": ".hero-crest", "radius": 0.27, "period": 6.3 } },
  "hide": [".cookie-banner", "#chat-widget"],
  "swaps": [{ "match": "**/qr.svg", "file": "stand-in-qr.svg", "type": "image/svg+xml" }],
  "domText": [["me@private\\.example", "hello@example.com"]],
  "clip": [0, 0, 1280, 800]
}
```

| key | meaning |
|---|---|
| `sub` | pictures per second of page time. 120 for motion blur (two per output frame), 60 for UI with no fast motion (no blend needed), 240 for very fast 3D |
| `seconds`, `keepFrom` | how long to run, and where saving starts (the page runs from 0 so its animations are in step) |
| `waitFor` | a JS expression to wait for before settling (e.g. `"window.app && window.app.ready"`) |
| `scroll` | eased scroll `from` → `to` px over `seconds`, starting at `start` s. `preload: "walk"` visits the page once first so lazy sections exist; `"cont"` creeps to `from` a frame at a time (scroll stories that must play in order). Lenis is driven directly when present |
| `pointer` | `circle` round an element's box (`radius` as a share of the box, `period` s per turn, `clockwise`, `start` angle) or `keys: [{t, x, y, down}]` (drags: `down: true` from that key on) |
| `profile` | a Chrome profile folder reused between runs (sign-ins, consent banners dismissed once). One per site |
| `clip` | screenshot region `[x, y, w, h]` (a part of the page only) |
| `chromeArgs`, `css`, `quality` | extra flags, extra CSS, JPEG quality (92) |

Run `PROBE=1` first (one still a second, quick); adjust; then the full take. `PLAYWRIGHT=` and `CHROME=` point at Playwright and a real Chrome if they are not found by themselves.

## 5-6. Blend, loop, encode

```sh
scripts/blend.sh frames 120                                  # s-*.jpg → b-*.jpg at 60 fps
LOOK=ui SM=1 scripts/loop-encode.sh frames out/hero 0.6 7.5  # the loop from 0.6 s to 7.5 s
```

`LOOK=ui` (flat interface, type) or `LOOK=rich` (renders, photoreal, gradients) picks the quality; `ASPECT`, `WIDTH`, `X` (dissolve length), `CRF`/`AV1CRF`, `SM=1` (half-size copies for thumbnails). Sizes and settings that held up in production: [references/encoding.md](references/encoding.md).

## 7. Check

`node scripts/check.mjs out/hero.mp4 https://your-public-url` then open `out/hero.seam.png` (last frame | first frame: they should look like neighbours) and step through a few frames. Look at the clip at 1:1, not only as a thumbnail.

## 8. Ship

```html
<video autoplay muted loop playsinline preload="metadata" poster="/work/hero.sm.webp">
  <source src="/work/hero.webm?v=3" type="video/webm; codecs=av01.0.08M.08">
  <source src="/work/hero.mp4?v=3" type="video/mp4">
</video>
```

- Bump a version constant (`?v=`) whenever a clip is rebuilt under the same name, or browsers and CDNs keep the old one for a year.
- Respect `prefers-reduced-motion`: show the poster, play on click.
- Keep frame folders out of git (`frames/`, `probe/`, `s-*.jpg`).

## Housekeeping

Each take is hundreds of JPEGs (a 9 s take at 120/s is ~1,100 files, 150-300 MB). Write them outside the repo, reuse one Chrome profile per site rather than a fresh one per run, run with the disk cache off (the recorder does), and clear frame folders once the clip is encoded and checked — asking the user first if they are theirs. A day of re-takes has filled a disk before.
