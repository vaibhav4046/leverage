#!/usr/bin/env node
/**
 * Records the Leverage product walkthrough as separate clips of the real live
 * site. Nothing is mocked: every frame is https://useleverage.vercel.app (or
 * --base) rendered by a headless Chromium at 1920x1080, dark scheme, with a
 * drawn cursor that follows the real mouse.
 *
 * One clip per beat (landing, mission, handoff, providers, benchmarks), each
 * transcoded to a 30 fps H.264 mp4, plus capture.json with per-clip on-screen
 * moments (t in seconds from clip start) so captions can be placed on them.
 *
 * Usage:
 *   node scripts/walkthrough-record.mjs [--base https://useleverage.vercel.app]
 *     [--out motion/assets/capture/raw] [--only landing,mission]
 *
 * Playwright is not a dependency of this repo; it is resolved from the cherry
 * checkout (or PLAYWRIGHT_DIR) so nothing gets installed here.
 */
import { createRequire } from 'node:module';
import { mkdir, rm, rename, writeFile, readFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_DIR, 'D:/project/cherry/node_modules/playwright'].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  throw new Error(`playwright not resolvable; tried ${candidates.join(', ')}`);
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag('base', 'https://useleverage.vercel.app').replace(/\/$/, '');
const OUT = path.resolve(flag('out', 'motion/assets/capture/raw'));
const ONLY = flag('only', '').split(',').filter(Boolean);
const W = 1920;
const H = 1080;
const FPS = 30;
// Seconds between the solid pre-paint resolving and Playwright's first video frame (measured).
const VIDEO_ORIGIN_LAG = 0.1;

/* ------------------------------------------------------------- page helpers */

// A drawn cursor: Playwright's screencast does not render the OS pointer, so a
// fixed-position arrow follows the real mousemove events instead.
const CURSOR_SCRIPT = `(() => {
  const add = () => {
    if (document.getElementById('__wt_cursor')) return;
    const el = document.createElement('div');
    el.id = '__wt_cursor';
    el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:30px;z-index:2147483647;pointer-events:none;will-change:transform;transform:translate(-9999px,-9999px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))';
    el.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 23 L7.5 18 L11 27 L15 25.5 L11.5 17 L19 17 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    (document.body || document.documentElement).appendChild(el);
    document.addEventListener('mousemove', (e) => { el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, { passive: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

const easeInOut = 't => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2';

/** Eased scroll of the window or of an inner scroll container, driven by rAF. */
async function tweenScroll(page, { selector = null, to, ms }) {
  await page.evaluate(({ selector, to, ms, ease }) => new Promise((resolve) => {
    const easeFn = new Function('return ' + ease)();
    const el = selector ? document.querySelector(selector) : null;
    const from = el ? el.scrollTop : window.scrollY;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const y = from + (to - from) * easeFn(p);
      if (el) el.scrollTop = y; else window.scrollTo(0, y);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), { selector, to, ms, ease: easeInOut });
  debug(`tween ${selector ?? 'window'} -> ${to} (${ms}ms)`);
}

const DEBUG = !!process.env.WT_DEBUG;
let clipStart = 0;
const debug = (label) => { if (DEBUG) process.stderr.write(`    ${((Date.now() - clipStart) / 1000).toFixed(2)}s ${label}\n`); };

// Each mouse step is a CDP round trip that waits on the page's main thread
// (~15 ms on a quiet page, ~140 ms on the animated landing page), so the
// pointer is tweened by elapsed time rather than by a fixed step count.
const cursor = { x: 960, y: 540 };
async function glide(page, x, y, ms = 700) {
  const from = { ...cursor };
  const start = Date.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  for (;;) {
    const p = Math.min(1, (Date.now() - start) / ms);
    const e = ease(p);
    cursor.x = from.x + (x - from.x) * e;
    cursor.y = from.y + (y - from.y) * e;
    const stepStart = Date.now();
    await page.mouse.move(cursor.x, cursor.y);
    if (p >= 1) break;
    await page.waitForTimeout(Math.max(0, 40 - (Date.now() - stepStart)));
  }
  debug(`glide -> ${x},${y} (${ms}ms nominal)`);
}

const wait = async (page, ms) => { await page.waitForTimeout(ms); debug(`wait ${ms}`); };

async function open(page, url) {
  // Vercel occasionally stalls a cold request; one retry keeps a stall from
  // costing the whole clip.
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (error) {
    process.stderr.write(`  goto stalled (${String(error).split('\n')[0]}), retrying once\n`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.locator('h1').first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const log = document.querySelector('[role=log]');
    if (log) log.scrollTop = 0;
  });
  await wait(page, 400);
  debug(`open ${url}`);
}

/* ------------------------------------------------------------------- beats */

const BEATS = {
  landing: {
    page: '/',
    about: 'hero, the RocketRide section, the planner section',
    async run(page, mark) {
      await open(page, `${BASE}/`);
      await glide(page, 1500, 700, 300);
      mark('Hero: "One frontier brain. An elastic workforce." with the hero console');
      await glide(page, 1420, 620, 1800);
      await wait(page, 1700);
      // Sections move as the page evolves; scroll to where they are, not to a
      // pixel offset measured on an older layout.
      const yOf = (sel) =>
        page.evaluate((s) => {
          const el = document.querySelector(s);
          return el ? Math.round(el.getBoundingClientRect().top + window.scrollY - 40) : 0;
        }, sel);
      await tweenScroll(page, { to: await yOf('#rocketride'), ms: 4200 });
      mark('"RocketRide runs the work. Leverage decides what work should run." with the proof panels');
      await glide(page, 1180, 640, 1400);
      await wait(page, 2600);
      await tweenScroll(page, { to: await yOf('#planner'), ms: 3800 });
      mark('"Point it at a repository and a model writes the plan." with the planned mission figures');
      await glide(page, 1300, 700, 1200);
      await wait(page, 2400);
    },
  },

  mission: {
    page: '/app/missions/LVR-719a8c22',
    about: 'header and metrics, winner rationale, auction drawer with the candidate list, then the event log',
    async run(page, mark) {
      await open(page, `${BASE}/app/missions/LVR-719a8c22`);
      await glide(page, 1240, 470, 300);
      mark('Mission header: goal, COMPLETED status, metrics row (Quality 100, Paid spend $0.00, Tasks 4/4)');
      await glide(page, 1690, 80, 1200); // toward the status pill
      await wait(page, 800);
      await glide(page, 560, 190, 1000); // Paid spend $0.00
      await wait(page, 1200);
      await tweenScroll(page, { to: 120, ms: 2000 });
      mark('Workforce panel: winners with rationale ("80 task fit · 78 verified success over 3 prior jobs · free route, no spend")');
      await glide(page, 1420, 250, 1000);
      await wait(page, 2500);
      // The candidate list lives in the task drawer; open it on the first task.
      await glide(page, 360, 230, 1000);
      await page.locator('section[aria-label="Task graph"] button').first().click();
      await wait(page, 500);
      mark('Task drawer: Auction block listing 8 candidates with utility scores (ProofPack and Scope below)');
      await glide(page, 1640, 420, 1000);
      await wait(page, 4500);
      await page.keyboard.press('Escape');
      await wait(page, 500);
      await tweenScroll(page, { to: 700, ms: 2000 });
      mark('Live execution timeline: 76 events from mission.created');
      await glide(page, 900, 560, 800);
      await wait(page, 1000);
      // 0 -> 520 passes the first auction (candidates, Winner, worker.hired) and ends with the
      // second auction's candidates, its Winner line and worker.hired in the top half (rows ~23.5px).
      await tweenScroll(page, { selector: '[role=log]', to: 520, ms: 11000 });
      mark('Event log at auction.candidate rows and auction.completed "Winner: MiniMax M3 via OpenRouter", then worker.hired');
      await wait(page, 1800);
    },
  },

  handoff: {
    page: '/app/missions/LVR-bda3ba68',
    about: 'worker.failed, checkpoint.created, handoff.started, worker.hired resuming from the checkpoint',
    async run(page, mark) {
      await open(page, `${BASE}/app/missions/LVR-bda3ba68`);
      await glide(page, 1300, 500, 300);
      mark('Mission header: COMPLETED with "attempt 2" tasks in the graph, Paid spend $0.00');
      await glide(page, 400, 330, 1200);
      await wait(page, 1000);
      await tweenScroll(page, { to: 640, ms: 2000 });
      await glide(page, 700, 420, 800);
      // Bring the failure into the log viewport: verification.failed / worker.failed / checkpoint.created.
      // Targets are scrollTop values of the 340px log (rows are ~23.5px; worker.failed is row 34).
      await tweenScroll(page, { selector: '[role=log]', to: 700, ms: 2500 });
      mark('Event log: verification.failed, worker.failed (TEST_FAILURE), checkpoint.created');
      await glide(page, 420, 400, 600);
      await wait(page, 3500);
      await tweenScroll(page, { selector: '[role=log]', to: 790, ms: 2000 });
      mark('Event log: checkpoint.created, worker.released, handoff.started, auction re-run');
      await glide(page, 420, 300, 600);
      await wait(page, 2200);
      await tweenScroll(page, { selector: '[role=log]', to: 900, ms: 2000 });
      mark('Event log: auction.completed and worker.hired "resuming from cp_…"');
      await glide(page, 520, 430, 600);
      await wait(page, 2000);
    },
  },

  providers: {
    page: '/app/providers',
    about: 'healthy free pool and RocketRide credits, then the 13 models',
    async run(page, mark) {
      await open(page, `${BASE}/app/providers`);
      await glide(page, 1100, 640, 300);
      mark('Providers: Free model pool HEALTHY with 13 models; MCP host and agent CLI unavailable');
      await glide(page, 760, 320, 1200);
      await wait(page, 2000);
      await glide(page, 1180, 720, 1200);
      mark('Execution fabric: RocketRide HEALTHY with credits balance / granted and consumed');
      await wait(page, 2200);
      await open(page, `${BASE}/app/models`);
      mark('Models: the 13-model pool with observed quality and cost class');
      await glide(page, 1000, 520, 1000);
      await wait(page, 1200);
      await tweenScroll(page, { to: 125, ms: 2500 });
      await wait(page, 2000);
    },
  },

  benchmarks: {
    page: '/benchmarks',
    about: 'benchmarks page, one scroll',
    async run(page, mark) {
      await open(page, `${BASE}/benchmarks`);
      await glide(page, 1300, 700, 300);
      mark('Benchmarks: "Measured, or not claimed."');
      await wait(page, 1800);
      await tweenScroll(page, { to: 1900, ms: 6000 });
      mark('Benchmarks: recorded missions and "RocketRide executed the cloud workers"');
      await wait(page, 1800);
    },
  },
};

/* ----------------------------------------------------------------- capture */

const ffprobe = (file, entry) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();

async function recordBeat(name, beat, browser) {
  const tmp = path.join(OUT, `.tmp-${name}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    recordVideo: { dir: tmp, size: { width: W, height: H } },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));

  // Playwright's video clock starts at the first painted frame, and a blank page
  // paints nothing before a cross-process navigation. Painting a solid frame
  // first pins the video origin to a known wall time (measured lag ~0.10 s),
  // so the trim below and every moment timestamp line up with the footage.
  await page.setContent('<body style="margin:0;background:#0e111b"></body>');
  const t0 = Date.now();
  await page.waitForTimeout(250);
  clipStart = t0;
  cursor.x = 960; cursor.y = 540;
  let readyAt = null;
  const moments = [];
  const mark = (visible) => {
    const t = (Date.now() - t0) / 1000;
    if (readyAt === null) readyAt = t; // first mark = page settled = clip start
    moments.push({ t: Number((t - readyAt).toFixed(2)), visible });
    debug(`MARK ${visible.slice(0, 60)}`);
  };

  await beat.run(page, mark);
  const wallSeconds = (Date.now() - t0) / 1000 - readyAt;
  const videoPath = await page.video().path();
  await page.close();
  await context.close();

  const webm = path.join(OUT, `${name}.webm`);
  await rename(videoPath, webm);
  const mp4 = path.join(OUT, `${name}.mp4`);
  // Output-side -ss: frame-accurate trim of the load/settle period before the first mark.
  const trimStart = Math.max(0, readyAt - VIDEO_ORIGIN_LAG);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', webm, '-ss', trimStart.toFixed(3),
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an',
    mp4,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  const sourceFps = ffprobe(webm, 'stream=r_frame_rate');
  await unlink(webm);
  await rm(tmp, { recursive: true, force: true });

  const durationSeconds = Number(ffprobe(mp4, 'format=duration'));
  return {
    name,
    file: path.relative(OUT, mp4),
    page: beat.page,
    about: beat.about,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    wallSeconds: Number(wallSeconds.toFixed(2)),
    trimmedLeadSeconds: Number(trimStart.toFixed(2)),
    sourceFps,
    moments,
    problems,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const names = Object.keys(BEATS).filter((n) => ONLY.length === 0 || ONLY.includes(n));
  const browser = await chromium.launch();
  const clips = [];
  for (const name of names) {
    process.stderr.write(`recording ${name} …\n`);
    clips.push(await recordBeat(name, BEATS[name], browser));
    process.stderr.write(`  ${clips.at(-1).file} ${clips.at(-1).durationSeconds}s\n`);
  }
  await browser.close();

  // Merge with an existing capture.json when only some beats were re-recorded.
  const jsonPath = path.join(OUT, 'capture.json');
  let previous = [];
  if (ONLY.length) {
    try { previous = JSON.parse(await readFile(jsonPath, 'utf8')).clips.filter((c) => !names.includes(c.name)); } catch { /* fresh */ }
  }
  const all = [...previous, ...clips].sort((a, b) => Object.keys(BEATS).indexOf(a.name) - Object.keys(BEATS).indexOf(b.name));
  const capture = {
    base: BASE,
    capturedAt: new Date().toISOString(),
    width: W, height: H, fps: FPS,
    totalSeconds: Number(all.reduce((s, c) => s + c.durationSeconds, 0).toFixed(2)),
    clips: all,
  };
  await writeFile(jsonPath, JSON.stringify(capture, null, 2), 'utf8');
  console.log(JSON.stringify(capture, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
