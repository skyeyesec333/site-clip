# site-clip

Records a web page or 3D scene as a smooth, looping video for a portfolio or case study.

## Good for

- Showing off a website or 3D scene with a clip that plays perfectly, even if your computer is slow
- Loops with no visible jump where the end meets the start
- Hiding private details (QR codes, emails, addresses) before anything is filmed
- Re-recording project clips after a site redesign

## Install

In Claude Code, run:

```
/plugin marketplace add skyeyesec333/site-clip
/plugin install site-clip@site-clip
```

Or copy the skill into your own skills folder:

```sh
git clone https://github.com/skyeyesec333/site-clip
cp -r site-clip/skills/site-clip ~/.claude/skills/
```

You can also copy it into one project's `.claude/skills/` folder instead.

## Try asking Claude

- "Record the hero of https://example.com as a loop for the case study"
- "Make a 16:10 clip of the scroll from the pricing section down to the footer"
- "Re-record the project clips, the site was redesigned"

Or call it directly: `/site-clip the three.js scene on localhost:5173, pointer circling the logo`.

## You'll need

- [Claude Code](https://claude.com/claude-code)
- Node 18+ and Playwright (`npm i -D playwright-core`, or point `PLAYWRIGHT=` at an existing install)
- Google Chrome, recommended for WebGL on the GPU. Point `CHROME=` at it if it is not in the usual place.
- ffmpeg 5.1 or newer with libx264 (and libsvtav1 for the AV1 copy), and `bc`
- A QR scanner for the privacy check: Chrome's built-in one on macOS, or `zbarimg` on Linux (`brew install zbar`, `apt install zbar-tools`)
- Optional: `cwebp` if your ffmpeg lacks libwebp; Python 3 for the stand-in QR maker

## How it works

```
shot.json → headless Chrome on a held clock → motion blur → loop → H.264 + AV1 + WebP poster → privacy check
```

Screen recorders capture whatever your machine manages, so 3D stutters and scrolls judder. This skill controls the page's clock instead. Every frame moves exactly 1/60 s (or 1/120 s), so even a slow laptop makes a perfect 60 fps clip.

1. **Plans the shot** with you: what moves, which window, where the loop joins, and the shape of the frame.
2. **Finds anything private** in a quick test still, then **swaps it in the filming browser only**. It uses stand-in images, rewritten text and hidden elements. The live site is never touched.
3. **Records** frame by frame (`scripts/record.mjs`, using Playwright to drive Chrome). It can script scrolling, pointer circles or drags, hidden overlays and a crop.
4. **Blends** extra in-between frames into natural motion blur (`scripts/blend.sh`).
5. **Loops and encodes** (`scripts/loop-encode.sh`). The end dissolves into the start. It writes H.264 and AV1 video plus a WebP poster image, with optional half-size copies.
6. **Checks the finished file** (`scripts/check.mjs`). It scans frames for QR codes and fails if one reads anything but your public URL. It also shows the last and first frames side by side, so you can check the loop's seam.

You can run the scripts yourself from your project, where Playwright is installed. `SC` is the skill's scripts folder:

```sh
SC=~/.claude/skills/site-clip/scripts
cp ~/.claude/skills/site-clip/examples/pointer-hero.json shot.json   # then edit url, selector, timing
PROBE=1 node $SC/record.mjs shot.json probe     # quick stills to check framing
node $SC/record.mjs shot.json frames             # a new, empty folder each take
$SC/blend.sh frames 60
SM=1 $SC/loop-encode.sh frames out/hero 0.6 7.5
node $SC/check.mjs out/hero.mp4 https://example.com
```

## Licence

MIT. See [LICENSE](LICENSE).
