// record.mjs: film a web page frame by frame on a held clock, so every frame is perfect no matter how slow the machine is.
//
//   node record.mjs <shot.json> <out dir>          writes <out dir>/s-00000.jpg ... at `sub` pictures a second of page time
//   PROBE=1 node record.mjs <shot.json> <out dir>   one small still a second instead, to check the framing and timing first
//
// The page's clock is taken over before it loads: performance.now, Date.now and requestAnimationFrame run on virtual time,
// and CSS / Web Animations are paused and stepped by hand. Each step advances the clock by 1000/sub ms, runs the frame's
// callbacks, applies the scroll and pointer for that moment, then takes the screenshot. See references/recording.md.
//
// Playwright: set PLAYWRIGHT=/path/to/playwright-core/index.mjs, or have `playwright` or `playwright-core` installed where
// node can resolve it. Chrome: set CHROME=/path/to/chrome (a real Chrome draws WebGL on the GPU; the bundled Chromium may not).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [shotFile, OUT] = process.argv.slice(2);
if (!shotFile || !OUT) { console.error("usage: node record.mjs <shot.json> <out dir>"); process.exit(2); }
const S = JSON.parse(fs.readFileSync(shotFile, "utf8"));
const PROBE = !!process.env.PROBE;

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT) return import(process.env.PLAYWRIGHT);
  for (const m of ["playwright", "playwright-core"]) { try { return await import(m); } catch {} }
  console.error("Playwright not found: npm i -D playwright-core (or set PLAYWRIGHT=<path to its index.mjs>)"); process.exit(2);
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"],
    win32: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"] }[process.platform] || [];
  return c.find((p) => fs.existsSync(p));   /* undefined: Playwright's own Chromium */
}

const { chromium } = await loadPlaywright();
const W = S.viewport?.[0] ?? 1280, H = S.viewport?.[1] ?? 800, DPR = S.dpr ?? 1;
const SUB = S.sub ?? 60, STEP = 1000 / SUB;
const SECONDS = S.seconds ?? 6, KEEP_FROM = S.keepFrom ?? 0;
const args = ["--disk-cache-size=1", "--ignore-gpu-blocklist", "--enable-gpu", "--enable-webgl",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--mute-audio",
  "--autoplay-policy=no-user-gesture-required", ...(process.platform === "darwin" ? ["--use-angle=metal"] : []), ...(S.chromeArgs || [])];
const launch = { executablePath: findChrome(), headless: true, args };

/* one profile per port/site, reused between runs (a fresh profile per run fills the disk with caches over a day's work) */
let browser, ctx;
if (S.profile) {
  const dir = path.resolve(S.profile.replace(/^~/, os.homedir()));
  ctx = await chromium.launchPersistentContext(dir, { ...launch, viewport: { width: W, height: H }, deviceScaleFactor: DPR });
} else {
  browser = await chromium.launch(launch);
  ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
}

try {
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));

  /* ---- privacy: swap what must not be filmed, in this browser only ---- */
  const swapped = new Set();
  for (const sw of S.swaps || []) {
    await p.route(sw.match.startsWith("/") ? new RegExp(sw.match.slice(1, sw.match.lastIndexOf("/"))) : sw.match, (route) => {
      swapped.add(sw.match);
      const body = sw.file ? fs.readFileSync(path.resolve(path.dirname(shotFile), sw.file)) : (sw.body ?? "");
      route.fulfill({ status: 200, body, contentType: sw.type || "application/octet-stream", headers: { "Access-Control-Allow-Origin": "*" } });
    });
  }
  /* text drawn into canvases (strap labels, card backs, textures made at runtime): rewritten as it is drawn */
  if (S.canvasText?.length) await p.addInitScript((pairs) => {
    const P = CanvasRenderingContext2D.prototype, sw = (t) => typeof t === "string" ? pairs.reduce((s, [a, f, b]) => s.replace(new RegExp(a, f), b), t) : t;
    for (const k of ["fillText", "strokeText", "measureText"]) { const f = P[k]; P[k] = function (t, ...a) { return f.call(this, sw(t), ...a); }; }
  }, S.canvasText.map(([a, b]) => [a, "gi", b]));
  /* text in the page itself */
  if (S.domText?.length) await p.addInitScript((pairs) => {
    const fix = (n) => { for (const [a, b] of pairs) { const r = new RegExp(a, "gi"); if (r.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(r, b); } };
    const walk = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fix(n); };
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n); })
      .observe(document, { childList: true, subtree: true, characterData: true });
  }, S.domText);

  /* ---- the held clock ---- */
  await p.addInitScript(() => {
    const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance), d0 = Date.now(), n0 = realNow();
    let t = 0, manual = false, q = [];
    performance.now = () => (manual ? t : (t = realNow() - n0)); Date.now = () => d0 + performance.now();
    window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
    window.cancelAnimationFrame = () => {};
    const flush = () => { const cbs = q; q = []; for (const cb of cbs) { try { cb(t); } catch (e) { console.error(e); } } };
    const auto = () => { if (!manual) { t = realNow() - n0; flush(); } realRaf(auto); }; realRaf(auto);
    const own = (a) => !(a.timeline && a.timeline !== document.timeline);   /* leave scroll-driven animations to the scroll */
    const hold = (a) => { if (!a.__held) { a.__held = true; a.pause(); } };
    window.__clipHold = () => { manual = true; for (const a of document.getAnimations()) if (own(a)) try { hold(a); } catch {} };
    window.__clipStep = (ms) => { t += ms;
      for (const a of document.getAnimations()) { if (!own(a)) continue;
        try { if (!a.__held) hold(a); else if (a.playState !== "finished" || a.effect?.getComputedTiming().endTime === Infinity) a.currentTime = (a.currentTime || 0) + ms; } catch {} }
      for (const v of document.querySelectorAll("video")) { try { v.pause(); v.currentTime += ms / 1000; } catch {} }
      flush(); };
    window.__clipScroll = (y) => { const L = window.lenis || window.__lenis; L ? L.scrollTo(y, { immediate: true, force: true }) : window.scrollTo(0, y); };
  });

  await p.goto(S.url, { waitUntil: "load", timeout: 120000 });
  if (S.waitFor) await p.waitForFunction(S.waitFor, null, { timeout: 180000 });
  await p.waitForTimeout(S.settle ?? 4000);

  /* scroll pages: visit everything once first so lazy sections are loaded ("walk"), or creep to the start a frame at a time
     ("cont") for pages whose scroll story must be played through in order */
  const sc = S.scroll;
  if (sc) {
    if (sc.preload === "walk") await p.evaluate(async ([a, b]) => { for (let y = 0; y <= b; y += 1500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } window.__clipScroll(a); }, [sc.from, sc.to]);
    else await p.evaluate(async ([a]) => { for (let y = 0; y <= a; y += 40) { window.__clipScroll(y); await new Promise((r) => requestAnimationFrame(r)); } window.__clipScroll(a); }, [sc.from]);
    await p.waitForTimeout(sc.settle ?? 3000);
  }

  /* hide everything that should not be in the picture */
  const css = [...(S.hide || []).map((s) => `${s} { visibility: hidden !important; }`),
    ...(S.onlyCanvas ? ["body * { visibility: hidden !important; } canvas { visibility: visible !important; }"] : []), S.css || ""].join("\n");
  if (css.trim()) await p.addStyleTag({ content: css });

  /* the pointer: keyframes [{t, x, y, down}] in page pixels, or a circle round an element's box */
  let box = null;
  if (S.pointer?.circle?.selector) {
    box = await p.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height }; }, S.pointer.circle.selector);
    if (!box) throw new Error(`pointer.circle.selector not found: ${S.pointer.circle.selector}`);
  }
  const pointerAt = (t) => {
    const P = S.pointer; if (!P) return null;
    if (P.circle) { const c = P.circle, a = (c.start ?? Math.PI / 2) - (c.clockwise === false ? -1 : 1) * (t / (c.period ?? 6)) * 2 * Math.PI, R = c.radius ?? 0.3;
      const b = box || { x: 0, y: 0, w: W, h: H }; return { x: b.x + b.w * (0.5 + R * Math.cos(a)), y: b.y + b.h * (0.5 - R * Math.sin(a)), down: false }; }
    const k = P.keys; if (!k?.length) return null;
    if (t <= k[0].t) return k[0];
    for (let i = 1; i < k.length; i++) if (t <= k[i].t) { const a = k[i - 1], b = k[i], u = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, down: !!a.down }; }
    return k[k.length - 1];
  };
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const scrollAt = (t) => { if (!sc) return null; const k = Math.min(1, Math.max(0, (t - (sc.start ?? 0.8)) / (sc.seconds ?? SECONDS)));
    return sc.from + (sc.to - sc.from) * (sc.ease === "linear" ? k : ease(k)); };

  const p0 = pointerAt(0); let isDown = false;
  if (p0) { await p.mouse.move(p0.x, p0.y); await p.waitForTimeout(1000); }
  await p.evaluate(() => window.__clipHold());
  fs.mkdirSync(OUT, { recursive: true });

  const clip = S.clip ? { x: S.clip[0], y: S.clip[1], width: S.clip[2], height: S.clip[3] } : undefined;
  const N = Math.round(SECONDS * SUB), every = Math.round(SUB * (+process.env.EVERY || 1));
  let saved = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / SUB, pt = pointerAt(t);
    if (pt) { await p.mouse.move(pt.x, pt.y);
      if (pt.down && !isDown) { await p.mouse.down(); isDown = true; } else if (!pt.down && isDown) { await p.mouse.up(); isDown = false; } }
    const y = scrollAt(t);
    await p.evaluate(([ms, y]) => { if (y != null) window.__clipScroll(y); window.__clipStep(ms); }, [i === 0 ? 0 : STEP, y]);
    if (t < KEEP_FROM - 1e-6) continue;
    if (PROBE && (i - Math.round(KEEP_FROM * SUB)) % every !== 0) continue;
    await p.screenshot({ path: `${OUT}/s-${String(saved++).padStart(5, "0")}.jpg`, type: "jpeg", quality: PROBE ? 70 : (S.quality ?? 92), clip });
  }
  if (S.swaps?.length) console.log("swapped in the browser:", [...swapped].join(", ") || "NOTHING (check the match patterns!)");
  console.log(`${saved} ${PROBE ? "probe stills" : "sub-frames"} at ${SUB}/s -> ${OUT}`);
} finally {
  await ctx.close(); if (browser) await browser.close();
}
