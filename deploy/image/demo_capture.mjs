// Quick, deterministic screenshots/GIF of the three things daii asked to see: the two loading-spinner
// variants, the page-1 textarea that now grows with long text, and the page-2 "دقیق‌تر بگو" reveal that
// now opens as a little chat bubble instead of a bare input. Drives real headless Chrome over CDP, the
// same low-level pattern as deploy/video/record.mjs (no extra npm deps).
//   node deploy/image/demo_capture.mjs [baseUrl]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BASE = process.argv[2] || "http://localhost:5180";
const OUT = join(ROOT, "_video", "demo");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9344;
const W = 390, H = 844, DPR = 2;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "loading-frames"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "tbd-"))}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--window-size=${W},${H}`,
  "about:blank",
], { stdio: "ignore" });
const quit = (code, why) => { log(why); proc.kill(); process.exit(code); };

async function pageUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("chrome did not start");
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const cdp = (method, params = {}, ms = 15000) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method}: no reply in ${ms} ms`)); }, ms);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async (expr) => {
    try { return (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value; }
    catch (e) { log("js failed:", e.message, expr.slice(0, 80)); return undefined; }
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  return { cdp, js };
}

const shot = async (page, path, opts = {}) => {
  const { data } = await page.cdp("Page.captureScreenshot", { format: opts.jpeg ? "jpeg" : "png", quality: opts.jpeg ? 88 : undefined });
  writeFileSync(path, Buffer.from(data, "base64"));
};

const page = await connect(await pageUrl());

// ---------------------------------------------------------------- 1) loading: both variants, one full loop
log("loading preview");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: W, height: 560, deviceScaleFactor: DPR, mobile: true });
await page.cdp("Page.navigate", { url: `${BASE}/loading-preview.html` });
await sleep(900); // let webfonts/images settle
const T0 = Date.now();
let n = 0;
while (Date.now() - T0 < 3400) {
  await shot(page, join(OUT, "loading-frames", `f${String(++n).padStart(3, "0")}.jpg`), { jpeg: true });
}
log("loading frames:", n);

// ---------------------------------------------------------------- 2) page 1: textarea grows with long text
log("need step");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await page.cdp("Page.navigate", { url: `${BASE}/` });
await sleep(400);
await page.js(`sessionStorage.clear(); localStorage.clear(); location.reload();`).catch(() => {});
await sleep(900);
await page.js(`new Promise((r) => { const i = setInterval(() => { if (document.querySelector('.wz-field textarea')) { clearInterval(i); r(true); } }, 100); setTimeout(() => r(false), 15000); })`);
await sleep(300);
await shot(page, join(OUT, "need-before.png"));
const LONG_NEED = "یه هدفون بی‌سیم می‌خوام که هم برای باشگاه خوب باشه هم برای مکالمه‌های کاری، رنگش مشکی یا سفید باشه و بتونم با گوشی آیفون و اندروید هر دو جفتش کنم، بودجه‌م هم حدودا سه میلیون تومنه";
await page.js(`(() => {
  const ta = document.querySelector('.wz-field textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(LONG_NEED)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(250);
await shot(page, join(OUT, "need-after.png"));

// ---------------------------------------------------------------- 3) page 2+: reach a GenProducts screen, show the reveal
log("driving to a products screen");
await page.js(`(() => { document.querySelectorAll('.wz-ex').forEach((b) => { if (b.textContent.includes('گوشی سامسونگ')) b.click(); }); })()`);

const DEADLINE = Date.now() + 90000;
let landed = false;
while (Date.now() < DEADLINE) {
  await sleep(600);
  const state = await page.js(`(() => {
    const h1 = document.querySelector('.wz-head h1')?.textContent || '';
    const hasAsk = Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('دقیق‌تر بگو'));
    const hasOpt = !!document.querySelector('.wz-opt');
    const hasRange = !!document.querySelector('input[type=range]');
    const hasNext = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('ادامه') && !b.disabled);
    return { h1, hasAsk, hasOpt, hasRange, hasNext: !!hasNext };
  })()`);
  if (!state) continue;
  if (state.hasAsk) { landed = true; break; }
  if (state.h1.includes("کجا می‌خوای خرید کنی")) {
    // headless Chrome has no real GPS fix, so type a place instead of tapping «نزدیک خودم»
    await page.js(`(() => {
      const inp = document.querySelector('.wz-field input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'میدان ولیعصر');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(700);
    await page.js(`document.querySelector('.wz-opts .wz-opt')?.click()`);
    await sleep(400);
    await page.js(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('ادامه') && !x.disabled); b && b.click(); })()`);
    continue;
  }
  if (state.h1.includes("چطوری می") || state.h1.includes("چطور می")) {
    await page.js(`document.querySelector('.wz-opt')?.click()`);
    await sleep(300);
    await page.js(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('پیدا کن') || x.textContent.includes('ادامه')); b && !b.disabled && b.click(); })()`);
    continue;
  }
  if (state.hasRange) {
    await page.js(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('ادامه') && !x.disabled); b && b.click(); })()`);
    continue;
  }
  if (state.hasOpt) {
    await page.js(`document.querySelector('.wz-opt')?.click()`);
    await sleep(400);
    await page.js(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('ادامه') && !x.disabled); b && b.click(); })()`);
    continue;
  }
}

if (!landed) {
  log("WARN: did not reach a GenProducts screen in time; skipping the chat-reveal shots");
} else {
  await sleep(300);
  await shot(page, join(OUT, "ask-before.png"));
  await page.js(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('دقیق‌تر بگو')); b && b.click(); })()`);
  await sleep(350);
  await page.js(`document.querySelector('.wz-field.sm')?.scrollIntoView({ block: 'center' })`);
  await sleep(250);
  await shot(page, join(OUT, "ask-after.png"));
  log("chat-reveal shots done");
}

quit(0, "done");
