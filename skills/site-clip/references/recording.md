# Recording on a held clock

**Shot files are trusted code.** `waitFor` is evaluated in the page, `css` is injected, `chromeArgs` go to Chrome, and `swaps` serve files from disk to whatever page is open. Write your own, or read one fully before running it. Stand-in files are confined to the shot file's folder.

## What the recorder takes over

Injected before any page script runs (`addInitScript`):

- `performance.now()` and `Date.now()` return virtual time once the take starts. Before that they run on real time, so the page loads and settles normally.
- `requestAnimationFrame` queues callbacks; the recorder flushes the queue once per step, with the virtual time.
- Every animation on `document.timeline` (CSS animations and transitions, Web Animations, GSAP when it uses WAAPI) is paused on the first step and its `currentTime` advanced by hand each step. Scroll-driven animations (`ScrollTimeline`, `ViewTimeline`) are left alone: the scroll drives them.
- `<video>` elements are paused and stepped by `currentTime`.
- Scroll is set exactly each step: through Lenis (`window.lenis` / `window.__lenis`, `immediate: true`) when the page uses it, else `scrollTo`.

Libraries that keep their own clock usually read one of these, so they follow: three.js `Clock` (performance.now), GSAP's ticker (rAF + performance.now), Lenis, Framer Motion, Theatre.js.

## What it cannot hold

- **`setTimeout` / `setInterval` chains** run on real time. A typewriter or a carousel on timers will race ahead or lag. Either drive it from the page's own debug hooks, slow it in the browser only (`addInitScript` wrapping `setTimeout` to scale delays), or film with `sub: 60` and accept real-time behaviour.
- **Web Workers and OffscreenCanvas** keep real time.
- **Audio-clocked animation** (`AudioContext.currentTime`): hold the page's own "song time" hook instead, if it has one.
- **Physics with a fixed step and real-time accumulator** may take several steps per frame on a slow machine — still deterministic, as long as it reads `performance.now`.

## Chrome flags

- A real Chrome (`CHROME=`) draws WebGL on the GPU. Playwright's bundled Chromium in headless mode often falls back to software rendering (SwiftShader): correct but very slow, and some effects differ.
- macOS: `--use-angle=metal`. Linux with a GPU: try `--use-angle=vulkan --enable-features=Vulkan`, or `--use-gl=egl`.
- `--disk-cache-size=1`: the cache off, so a take always fetches fresh files and the profile does not grow.
- `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`: a headless tab is "in the background"; without these, timers and rAF are throttled.
- `--autoplay-policy=no-user-gesture-required`, `--mute-audio` for pages with media.

## Getting the page ready

- `settle` (ms) after load, before the clock is held: let fonts, textures and shaders arrive. WebGL scenes with a loader: use `waitFor` on the app's own ready flag rather than a long sleep.
- Scroll stories with lazy sections: `preload: "walk"` scrolls the whole range once before filming so every section has loaded; `"cont"` creeps to the start a frame at a time for pages whose animations must have played in order to be in the right state.
- `keepFrom`: run the page from 0 and only start saving later, so the take starts mid-motion rather than from a standing start.
- Hide overlays you don't want (`hide`, `onlyCanvas`), and cookie banners: dismiss once in a reused `profile`, or hide them.

## Probe first

`PROBE=1` saves one small still per second of the take (`EVERY=0.5` for two a second). Use it to check:

- the framing and that nothing private is visible,
- where the motion starts and ends (pick `keepFrom` and the loop window from it),
- after a redesign: compare the probe to the old clip to see whether the section has moved.

## Sub-frames and motion blur

`sub: 120` takes two pictures per output frame; `blend.sh` averages each pair (a half-open shutter, like a film camera at 180°). Fast-moving 3D (a spinning object, a whip of the camera) looks smooth instead of strobing. Interfaces and type need no blur: `sub: 60`, and `blend.sh frames 60` just renumbers.

## Speed

Screenshot cost dominates: about 30-80 ms a frame at 1280x800 JPEG, more at 1920x1080 or `dpr: 2`. A 9 s take at 120/s is ~1,100 screenshots: 1-2 minutes. Heavy WebGL adds its own draw time per step, but never drops a frame.

## Driving a page's own state

Many WebGL sites expose debug hooks (`window.__app`, a store, a camera). For a camera move, a scene change or a held moment, add a small `addInitScript` / `page.evaluate` of your own in a copy of `record.mjs` rather than adding options for every case. Keep such edits in the browser: never change the site to film it.

## Filming unreleased work

To film a change that is merged but not yet deployed, serve the site's files from disk under its real address with `page.route` (map the URL path to the local build folder, `index.html` for directories, correct content types), so absolute URLs and CORS behave as on the live site.
