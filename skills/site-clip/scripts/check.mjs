// check.mjs: look at what you are about to publish, from the ENCODED file (not the frames you fed in).
//
//   node check.mjs <clip.mp4> [expect] [--allow-no-scanner]
//
// It exits 3 if neither scanner could run (no BarcodeDetector in this Chrome and no zbarimg): "no codes found" would then
// mean nothing. Pass --allow-no-scanner only to get the seam picture anyway.
//
// 1. Scans 8 frames spread through the clip for QR codes and barcodes and prints what each one says. If `expect` is given
//    (e.g. "https://example.com"), anything readable that is not it is an error: a real code made it into the clip.
//    Uses Chrome's BarcodeDetector (needs a secure page, so the frames are served from a routed https:// origin; works on
//    macOS and ChromeOS, not every Linux Chrome) and `zbarimg` too when it is installed.
// 2. Writes <clip>.seam.png: the last frame beside the first, to see that the loop joins (they should look like neighbours).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2), ALLOW_NONE = argv.includes("--allow-no-scanner");
const [clip, expect] = argv.filter((a) => a !== "--allow-no-scanner");
if (!clip) { console.error("usage: node check.mjs <clip.mp4> [expected QR text]"); process.exit(2); }
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
const dur = +sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clipcheck-"));
const times = Array.from({ length: 8 }, (_, i) => (dur * (i + 0.5)) / 8);
const frames = times.map((t, i) => { const f = path.join(tmp, `f${i}.png`); sh("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(3), "-i", clip, "-frames:v", "1", f]); return f; });

const found = new Map();   /* text -> frames */
const note = (text, where) => { if (!found.has(text)) found.set(text, []); found.get(text).push(where); };

/* zbar, if present */
let zbar = false;
try { sh("zbarimg", ["--version"]); zbar = true;
  for (const [i, f] of frames.entries()) { try { for (const line of sh("zbarimg", ["-q", f]).split("\n").filter(Boolean)) note(line.replace(/^[^:]+:/, ""), `zbar@${times[i].toFixed(2)}s`); } catch {} }
} catch { console.log("(zbarimg not installed: Chrome's detector only)"); }

async function loadPlaywright() {
  // Order: PLAYWRIGHT=<file> if set, then a copy installed beside this skill, then the project you run it from
  // (the usual `npm i -D playwright-core`). The file actually loaded is printed, so a surprise is visible.
  const tries = [];
  if (process.env.PLAYWRIGHT) tries.push(path.resolve(process.env.PLAYWRIGHT));
  for (const req of [createRequire(import.meta.url), createRequire(path.join(process.cwd(), "noop.js"))])
    for (const m of ["playwright-core", "playwright"]) { try { tries.push(req.resolve(m)); } catch {} }
  for (const f of tries) {
    try { const pw = await import(pathToFileURL(f).href); console.error(`playwright: ${f}`); return pw; } catch {}
  }
  return null;
}

/* Chrome's BarcodeDetector */
let chrome = "skipped";
try {
  const pw = await loadPlaywright();
  if (!pw) throw new Error("Playwright not found: npm i -D playwright-core in your project, or set PLAYWRIGHT=<path to its index.mjs>");
  const exe = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
  const b = await pw.chromium.launch({ executablePath: exe, headless: true });
  const page = await b.newPage();
  await page.route("https://clip-check.test/**", (r) => { const u = new URL(r.request().url());
    if (u.pathname === "/") return r.fulfill({ contentType: "text/html", body: "<!doctype html><title>check</title>" });
    r.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(tmp, path.basename(u.pathname))) }); });
  await page.goto("https://clip-check.test/");
  const ok = await page.evaluate(() => "BarcodeDetector" in window);
  if (!ok) chrome = "BarcodeDetector not available in this Chrome";
  else {
    for (const [i, f] of frames.entries()) {
      const hits = await page.evaluate(async (src) => { const img = new Image(); img.src = src; await img.decode();
        return (await new BarcodeDetector().detect(img)).map((d) => d.rawValue); }, `/${path.basename(f)}`);
      for (const h of hits) note(h, `chrome@${times[i].toFixed(2)}s`);
    }
    chrome = "ok";
  }
  await b.close();
} catch (e) { chrome = `failed: ${String(e).split("\n")[0]}`; }
console.log(`Chrome detector: ${chrome}`);

let bad = 0;
if (!found.size) console.log("no readable codes in 8 frames");
for (const [text, where] of found) { const okText = expect && text === expect; if (expect && !okText) bad++;
  console.log(`${okText ? "ok  " : expect ? "BAD " : "    "}${JSON.stringify(text)}  (${where.join(", ")})`); }
if (expect && !found.has(expect)) console.log(`note: the expected code "${expect}" was not read in any sampled frame (too small or blurred to scan is fine, if that is intended)`);

/* the seam: last frame | first frame */
const seam = clip.replace(/\.[^.]+$/, "") + ".seam.png";
const last = path.join(tmp, "last.png"), first = path.join(tmp, "first.png");
sh("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.1", "-i", clip, "-update", "1", "-q:v", "1", last]);
sh("ffmpeg", ["-v", "error", "-y", "-i", clip, "-frames:v", "1", first]);
sh("ffmpeg", ["-v", "error", "-y", "-i", last, "-i", first, "-filter_complex", "hstack=inputs=2,scale=1600:-2", seam]);
console.log(`seam (last | first): ${seam}`);
fs.rmSync(tmp, { recursive: true, force: true });
if (!zbar && chrome !== "ok") {
  console.error("NO SCANNER RAN: Chrome's BarcodeDetector was unavailable and zbarimg is not installed, so this clip was NOT checked for codes. Install zbar (brew install zbar / apt install zbar-tools).");
  if (!ALLOW_NONE) process.exit(3);
}
process.exit(bad ? 1 : 0);
