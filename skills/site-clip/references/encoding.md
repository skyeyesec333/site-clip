# Encoding: sizes and settings that held up in production

From a portfolio with about twenty project clips (UI scroll stories, WebGL heroes, 3D renders, photoreal before/after wipes).

## The files

| file | codec | use |
|---|---|---|
| `name.webm` | AV1 (SVT-AV1, preset 4) | first `<source>`: 30-50% smaller than H.264 at the same look |
| `name.mp4` | H.264 high, `+faststart`, no audio | every browser, every phone |
| `name.sm.webp` | WebP still, the loop's first frame, 3/4 width | `poster`: shown before the video plays and under reduced motion |
| `name.sm.mp4` / `.sm.webm` (`SM=1`) | half width | thumbnails, "next project" previews, hover cards |

## Two looks

| | `LOOK=ui` | `LOOK=rich` |
|---|---|---|
| for | flat interface, type, scrolling pages, simple WebGL | renders, photoreal, film grain, smoke, soft gradients |
| H.264 | CRF 27 (small 28) | CRF 19-21 (20 default) |
| AV1 | CRF 50 | CRF 33 |
| poster | WebP q62 | WebP q82 |
| typical 1280x800, 6-9 s | 1-3 MB mp4, 0.5-1.5 MB webm | 2.5-4.5 MB mp4 |

Gradients band at high CRF: if a dark sky or a glow shows steps, go to `LOOK=rich` or lower `CRF` by 2-3 rather than adding grain.

## Size and frame rate

- **1280 wide, 60 fps** for project-page clips. 60 fps matters for scroll and pointer motion; 30 fps visibly judders on a scroll.
- **16:10** (1280x800) suits a case-study column; 16:9 for full-bleed; 1:1 for a single object. Crop from the middle of the filmed frame (`ASPECT=16:10`); film wider than you need.
- **GOP 120 (H.264) / 240 (AV1):** a keyframe every 2-4 s keeps seeking cheap without bloating the file.
- No audio track in looping clips (`-an`): autoplay requires muted video, and an empty track still costs bytes.

## The loop

`loop-encode.sh` takes a window [start, end], keeps it from `X` seconds in, and dissolves its last `X` seconds into its first `X`. The output is `end - start - X` long, and its last frame leads straight into its first. 0.5-0.8 s hides most seams; longer shows two pictures at once. Pick the window where the two ends are already close (one full turn of a pointer circle, a scroll that returns).

For a clip that must start on a particular frame (a "before" that wipes to an "after"), put pre-roll of `X` seconds in front of it: the dissolve runs into the pre-roll, not into the shot.

## Rebuilding a clip

- **Bump the version** in the page (`?v=4`, or a `CLIP_V` constant the page appends to every clip URL). Long cache lifetimes are the right default for media; without a new URL a rebuilt clip is not seen for a year.
- Keep the shot file and stand-in assets with the project (not in the public folder), so a re-take after a redesign is one command.

## Very large files

Static hosts often cap single files (Cloudflare Pages: 25 MiB). A long, high-quality reel belongs on object storage behind its own subdomain, under a new folder per version (never overwritten), with a light muted preview served with the site and the full file swapped in on click.

## Without libwebp or AV1

Some ffmpeg builds lack `libwebp`: the script falls back to `cwebp` (`brew install webp`). Without `libsvtav1` the `.webm` is skipped and the `.mp4` alone is fine.
