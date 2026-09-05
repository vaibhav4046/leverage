#!/usr/bin/env node
/**
 * Record one live run on the deployed site, as a visitor sees it.
 *
 * Opens /app/live in a 1920x1080 headless Chromium with Playwright's screencast
 * on, presses one of the two buttons, and records until the finished run has
 * rendered as a mission page (or the site's own wall clock stops it). Writes the
 * clip and a moments file (seconds from the first frame: the press, the plan
 * arriving, the first hire, the finish) that the film composition uses to cut
 * the long wait down to its moments.
 *
 *   node scripts/record-live.mjs [--base https://useleverage.vercel.app] [--fixture greeter|forge-app]
 *     [--out motion/assets/capture/raw] [--name live-planned]
 */
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', process.env.PLAYWRIGHT_DIR, 'D:/project/cherry/node_modules/playwright'].filter(Boolean)) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not resolvable');
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const BASE = flag('base', 'https://useleverage.vercel.app').replace(/\/$/, '');
const FIXTURE = flag('fixture', 'greeter');
const OUT = path.resolve(flag('out', 'motion/assets/capture/raw'));
const NAME = flag('name', 'live-planned');
const W = 1920, H = 1080;
const MAX_MS = 330_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const moments = {};
  const mark = (k) => { if (!(k in moments)) { moments[k] = Number(((Date.now() - t0) / 1000).toFixed(2)); process.stderr.write(`  ${moments[k].toFixed(1)}s ${k}\n`); } };

  await page.goto(`${BASE}/app/live`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('h1').first().waitFor({ timeout: 20_000 }).catch(() => {});
  mark('pageReady');
  await sleep(2500);

  const label = FIXTURE === 'greeter' ? 'Or let a model plan one first' : 'Run a real mission now';
  const button = page.getByRole('button', { name: label });
  await button.waitFor({ timeout: 20_000 });
  await page.mouse.move(400, 300);
  await sleep(300);
  await button.hover();
  await sleep(500);
  await button.click();
  mark('click');

  // Follow the visible log for the moments the film cuts to.
  const seen = new Set();
  const watch = async () => {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (!seen.has('planned') && /Planned by /.test(text)) { seen.add('planned'); mark('planned'); }
    if (!seen.has('firstHired') && /worker\.hired/.test(text)) { seen.add('firstHired'); mark('firstHired'); }
    if (!seen.has('verified') && /Mission verified/.test(text)) { seen.add('verified'); mark('verified'); }
    if (!seen.has('finished') && /Your run, in the same view/.test(text)) { seen.add('finished'); mark('finished'); return true; }
    if (/live\.error|Could not|already in progress|every ten minutes|used its RocketRide budget/.test(text) && !seen.has('error')) { seen.add('error'); mark('error'); }
    return false;
  };
  while (Date.now() - t0 < MAX_MS) {
    if (await watch()) break;
    await sleep(1000);
  }
  // Let the finished mission view settle, then scroll through it once.
  await sleep(3000);
  const scroll = async (to, ms) => page.evaluate(({ to, ms }) => new Promise((resolve) => {
    const from = window.scrollY; const start = performance.now();
    const step = (now) => { const p = Math.min(1, (now - start) / ms); const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; window.scrollTo(0, from + (to - from) * e); if (p < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { to, ms });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  mark('scrollStart');
  await scroll(Math.min(900, height - H), 3500);
  await sleep(2000);
  await scroll(Math.min(1800, height - H), 3500);
  await sleep(2500);
  mark('end');

  const video = page.video();
  await context.close();
  const webm = await video.path();
  await browser.close();

  const mp4 = path.join(OUT, `${NAME}.mp4`);
  const enc = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', webm, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (enc.status !== 0) throw new Error('ffmpeg failed');
  await rm(webm, { force: true }).catch(() => {});
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  const duration = Number(String(probe.stdout).trim());
  const record = { base: BASE, fixture: FIXTURE, file: `${NAME}.mp4`, capturedAt: new Date().toISOString(), width: W, height: H, durationSeconds: duration, moments };
  await writeFile(path.join(OUT, `${NAME}-moments.json`), JSON.stringify(record, null, 2), 'utf8');
  console.log(JSON.stringify(record, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
