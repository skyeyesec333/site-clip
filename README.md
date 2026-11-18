# site-clip

A Claude Code skill that turns a web page, scroll story or WebGL / three.js scene into a smooth, seamlessly looping video for a portfolio or project page:

```
shot.json → headless Chrome on a held clock → motion blur → loop → H.264 + AV1 + WebP poster → privacy check
```

Screen recorders capture whatever your machine manages, so WebGL stutters and scrolls judder. This one owns the page's clock: every frame is advanced exactly 1/60 s (or 1/120 s), so even a slow laptop produces a perfect 60 fps clip.

## What the skill does

1. **Plans the shot** with you: what moves, which window, where the loop joins, what aspect.
2. **Finds anything private** in a probe still (QR codes, emails, addresses, keys) and **swaps it in the filming browser only**: stand-in images, rewritten page or canvas text, hidden elements. The live site is never touched.
3. **Records** frame by frame (`scripts/record.mjs`, Playwright): scripted scroll (Lenis-aware), pointer circles or drags, hidden overlays, a crop region.
4. **Blends** sub-frames into motion blur (`scripts/blend.sh`).
5. **Loops and encodes** (`scripts/loop-encode.sh`): the end dissolved into the start, cropped from the middle, H.264 + AV1 + WebP poster, optional half-size copies, two tested quality presets.
6. **Checks the encoded file** (`scripts/check.mjs`): scans frames for QR codes and fails if one reads anything but your public URL; writes a last-frame/first-frame picture to check the seam.

## Install

**As a Claude Code plugin** (from inside Claude Code):

```
/plugin marketplace add skyeyesec333/site-clip
/plugin install site-clip@site-clip
```

**Or as a plain skill:** copy `skills/site-clip` into `~/.claude/skills/` (all your projects) or into a project's `.claude/skills/`:

```sh
git clone https://github.com/skyeyesec333/site-clip
cp -r site-clip/skills/site-clip ~/.claude/skills/
```

## Use

Just ask, in any project:

- "Record the hero of https://example.com as a loop for the case study"
- "Make a 16:10 clip of the scroll from the pricing section down to the footer"
- "Re-record the project clips, the site was redesigned"

or call it directly: `/site-clip the three.js scene on localhost:5173, pointer circling the logo`.

You can also run the scripts yourself:

```sh
# from your project (where playwright-core is installed); SC is the skill's scripts folder
SC=~/.claude/skills/site-clip/scripts
cp ~/.claude/skills/site-clip/examples/pointer-hero.json shot.json   # then edit url, selector, timing
PROBE=1 node $SC/record.mjs shot.json probe     # quick stills to check framing
node $SC/record.mjs shot.json frames             # a new, empty folder each take
$SC/blend.sh frames 60
SM=1 $SC/loop-encode.sh frames out/hero 0.6 7.5
node $SC/check.mjs out/hero.mp4 https://example.com
```

## Requirements

- [Claude Code](https://claude.com/claude-code)
- Node 18+ and Playwright (`npm i -D playwright-core`, or point `PLAYWRIGHT=` at an existing install)
- Google Chrome (recommended for WebGL on the GPU; point `CHROME=` at it if it is not in the usual place)
- ffmpeg 5.1 or newer with libx264 (libsvtav1 for the AV1 copy), and `bc`
- A QR scanner for the check: Chrome's built-in one on macOS, or `zbarimg` (`brew install zbar`, `apt install zbar-tools`) on Linux
- Optional: `cwebp` if your ffmpeg lacks libwebp; Python 3 for the stand-in QR maker

## Licence

MIT. See [LICENSE](LICENSE).
