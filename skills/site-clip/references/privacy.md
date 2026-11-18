# Privacy: what must not be readable in a clip

A clip on a public page is a public screenshot at 60 frames a second. A QR code that is sharp for a quarter of a second is enough for a phone to scan from a paused video. Before filming, assume anything readable will be read.

## What to look for (on a probe still, at 1:1)

- QR codes and barcodes (business cards, badges, tickets, "scan to connect" panels)
- email addresses, phone numbers, street addresses, messaging handles
- real people's names where they are not meant to be public (a client's staff, a test user)
- API keys, tokens, session IDs (dev panels, query strings in an address bar, debug overlays)
- private URLs (a staging address, an admin path, a personal site the user does not want linked)
- third-party watermarks and logos the user has no right to show

Ask the user which of these are fine to show. Default to hiding.

## Swap in the browser, never on the site

The live site stays as it is. Only the filming browser sees the stand-ins:

| what | how | shot-file key |
|---|---|---|
| an image, SVG or file the page fetches (a QR code, a card face, an avatar) | intercept the request and answer with a stand-in | `swaps: [{ "match": "**/qr.svg", "file": "stand-in.svg", "type": "image/svg+xml" }]` |
| text in the page | rewrite text nodes as they appear | `domText: [["me@private\\.example", "hello@example.com"]]` |
| text drawn into a canvas (labels on a 3D card, a strap, runtime textures) | wrap `fillText` / `strokeText` / `measureText` | `canvasText: [["PRIVATE\\.COM", "EXAMPLE.COM"]]` |
| a whole element | hide it | `hide: ["#contact-card"]`, or `onlyCanvas: true` for a 3D scene alone |

`match` is a Playwright URL glob (`**/qr.svg`, `**/card-front.png*`) or a `/regex/`. Patterns are case-insensitive regexes for the text swaps. The recorder prints which swaps fired; "NOTHING" means a pattern missed and the real thing is in the take.

**A stand-in QR code:** `python3 scripts/makeqr.py "https://your-public-site" stand-in.svg` writes a valid code that reads your public URL (29x29, up to 42 bytes). To swap a code that is baked into a larger image (a card face), make a copy of that image with the stand-in pasted over the code, at the same size, and swap the whole image.

**A watermark on a source video or render:** crop it out (`ASPECT` in `loop-encode.sh`, or a crop of your own) rather than painting over it. Paint-overs shimmer and read as tampering.

## Check the encoded file

The encoder can sharpen, the poster is a separate file, and the small copy is another one. Check what will actually be published:

```sh
node scripts/check.mjs out/clip.mp4 "https://your-public-site"
node scripts/check.mjs out/clip.sm.mp4 "https://your-public-site"
```

It scans 8 frames spread through the clip with Chrome's `BarcodeDetector` (needs a secure page: the script serves the frames from a routed `https://` origin; available on macOS and ChromeOS) and with `zbarimg` when installed (`brew install zbar`, `apt install zbar-tools`), prints every code it reads, and exits 1 if any reads something other than the expected text. Also look at the poster (`.sm.webp`) by eye.

A code too small or blurred to scan is fine; a code that scans to the wrong place is not.

## When the source changes

Re-recording after a redesign: the page may now fetch the private asset under a new name, or draw text in a new place. Re-check which swaps fired and re-scan the new clip every time. Keep the stand-in files with the shot file (outside the public folder), so the next take uses them.
