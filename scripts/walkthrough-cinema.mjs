#!/usr/bin/env node
/**
 * Frames each raw walkthrough clip the way a product film frames a screen
 * capture: the untouched 1920x1080 recording floats as a rounded window with a
 * soft shadow over a blurred, darkened copy of itself tinted to the Leverage
 * palette, with lower-third captions (a letterspaced kicker over a headline)
 * rendered from HTML so the type is real Figtree, not an ffmpeg drawtext.
 *
 * No narration, no music: those are composed later.
 *
 * Usage:
 *   node scripts/walkthrough-cinema.mjs [--in motion/assets/capture/raw]
 *     [--captions motion/assets/capture/captions.json]
 *     [--out motion/assets/capture/framed] [--only landing,mission]
 *
 * captions.json: { "<clip name>": [ { "start": 0, "end": 6.5, "kicker": "…", "headline": "…" }, … ] }
 * A clip with no entry is framed without captions.
 */
import { createRequire } from 'node:module';
import { readFile, mkdir, rm, access } from 'node:fs/promises';
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
const IN = path.resolve(flag('in', 'motion/assets/capture/raw'));
const CAPTIONS = path.resolve(flag('captions', 'motion/assets/capture/captions.json'));
const OUT = path.resolve(flag('out', 'motion/assets/capture/framed'));
const ONLY = flag('only', '').split(',').filter(Boolean);
const FONT_DIR = path.resolve('motion/assets/fonts');

const W = 1920;
const H = 1080;
const WIN_W = 1568;
const WIN_H = 882; // 16:9, the capture's own aspect
const WIN_X = Math.round((W - WIN_W) / 2);
const WIN_Y = 64;
const RADIUS = 14;
const FPS = 30;

const PALETTE = { bg: '#0e111b', accent: '#625fff', text: '#ffffff', muted: '#abaebb' };
const ASSETS = path.join(OUT, '.cinema');

/* ------------------------------------------------------------------- fonts */

async function fontFace() {
  // Figtree ships with the motion project; embed it so the caption page needs
  // no file:// access. Fall back to the system stack when it is absent.
  const faces = [];
  for (const [weight, file] of [[500, 'figtree-500.woff2'], [600, 'figtree-600.woff2']]) {
    const p = path.join(FONT_DIR, file);
    try {
      await access(p);
      const b64 = (await readFile(p)).toString('base64');
      faces.push(`@font-face{font-family:"Figtree";font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2")}`);
    } catch { /* not present */ }
  }
  return { css: faces.join('\n'), family: faces.length ? '"Figtree", system-ui, "Segoe UI", sans-serif' : 'system-ui, "Segoe UI", sans-serif', embedded: faces.length };
}

/* ------------------------------------------------------------------ layers */

/** White rounded rectangle on black: the alpha channel for the floated window. */
const maskHtml = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;width:${WIN_W}px;height:${WIN_H}px;overflow:hidden}
  .r{width:${WIN_W}px;height:${WIN_H}px;background:#fff;border-radius:${RADIUS}px}
</style><div class="r"></div>`;

/** Shadow plus a hairline ring in the accent, drawn under the window. */
const shadowHtml = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
  .s{position:absolute;left:${WIN_X}px;top:${WIN_Y}px;width:${WIN_W}px;height:${WIN_H}px;
     border-radius:${RADIUS}px;background:#000;
     box-shadow:0 44px 96px rgba(0,0,0,.62), 0 14px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(98,95,255,.28)}
</style><div class="s"></div>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function captionHtml(font, kicker, headline) {
  return `<!doctype html><meta charset="utf-8"><style>
    ${font.css}
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
    .scrim{position:absolute;left:0;right:0;bottom:0;height:300px;
       background:linear-gradient(to top, rgba(14,17,27,.94) 0%, rgba(14,17,27,.74) 40%, rgba(14,17,27,0) 100%)}
    .wrap{position:absolute;left:0;right:0;bottom:58px;text-align:center;font-family:${font.family}}
    .k{display:inline-flex;align-items:center;gap:12px;font-size:17px;letter-spacing:.3em;text-transform:uppercase;
       color:${PALETTE.muted};margin:0 0 12px;font-weight:600;text-shadow:0 2px 12px rgba(0,0,0,.7)}
    .k::before{content:"";display:inline-block;width:22px;height:3px;border-radius:2px;background:${PALETTE.accent}}
    .h{font-size:46px;line-height:1.14;color:${PALETTE.text};margin:0 auto;max-width:1240px;font-weight:600;letter-spacing:-.012em;
       text-shadow:0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.6)}
  </style><div class="scrim"></div><div class="wrap"><p class="k">${esc(kicker)}</p><p class="h">${esc(headline)}</p></div>`;
}

async function renderPngs(font, jobs) {
  await rm(ASSETS, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  await page.setViewportSize({ width: WIN_W, height: WIN_H });
  await page.setContent(maskHtml);
  await page.screenshot({ path: path.join(ASSETS, 'mask.png') });

  await page.setViewportSize({ width: W, height: H });
  await page.setContent(shadowHtml);
  await page.screenshot({ path: path.join(ASSETS, 'shadow.png'), omitBackground: true });

  for (const job of jobs) {
    for (const [i, caption] of job.captions.entries()) {
      await page.setContent(captionHtml(font, caption.kicker, caption.headline));
      await page.evaluate(() => document.fonts.ready);
      caption.file = path.join(ASSETS, `${job.name}-cap-${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: caption.file, omitBackground: true });
    }
  }
  await browser.close();
}

/* ------------------------------------------------------------------ ffmpeg */

const ffprobe = (file, entry) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();

function frame(job) {
  const source = job.source;
  const seconds = Number(ffprobe(source, 'format=duration'));
  const bgHex = PALETTE.bg.replace('#', '0x');

  // Inputs: 0 = capture, 1 = mask, 2 = shadow, 3.. = captions.
  const inputs = ['-i', source, '-loop', '1', '-i', path.join(ASSETS, 'mask.png'), '-loop', '1', '-i', path.join(ASSETS, 'shadow.png')];
  job.captions.forEach((c) => inputs.push('-loop', '1', '-i', c.file));

  const chain = [
    // Blurred, darkened copy of the clip, then a palette tint so the ground reads as #0e111b.
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=34,eq=brightness=-0.38:saturation=0.6,format=rgba[blur]`,
    `color=c=${bgHex}@0.58:s=${W}x${H}:r=${FPS},format=rgba[tint]`,
    `[blur][tint]overlay=0:0:format=auto:shortest=1[bg]`,
    `[0:v]scale=${WIN_W}:${WIN_H}:flags=lanczos,format=rgba[fg]`,
    `[1:v]format=gray,scale=${WIN_W}:${WIN_H}[mk]`,
    `[fg][mk]alphamerge[fgm]`,
    `[bg][2:v]overlay=0:0:format=auto[withshadow]`,
    `[withshadow][fgm]overlay=${WIN_X}:${WIN_Y}:format=auto[base0]`,
  ];
  job.captions.forEach((c, i) => {
    const start = Math.max(0, c.start).toFixed(2);
    const end = Math.min(c.end, seconds).toFixed(2);
    chain.push(`[base${i}][${i + 3}:v]overlay=0:0:format=auto:enable='between(t,${start},${end})'[base${i + 1}]`);
  });
  const finalLabel = `base${job.captions.length}`;

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', chain.join(';'),
    '-map', `[${finalLabel}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', '-an',
    '-t', String(seconds),
    job.out,
  ], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  return seconds;
}

/* -------------------------------------------------------------------- main */

async function main() {
  const capture = JSON.parse(await readFile(path.join(IN, 'capture.json'), 'utf8'));
  let captions = {};
  try { captions = JSON.parse(await readFile(CAPTIONS, 'utf8')); } catch (error) {
    process.stderr.write(`no captions at ${CAPTIONS} (${error.code ?? error}); framing without captions\n`);
  }
  await mkdir(OUT, { recursive: true });
  const font = await fontFace();

  const jobs = capture.clips
    .filter((c) => ONLY.length === 0 || ONLY.includes(c.name))
    .map((c) => ({
      name: c.name,
      source: path.join(IN, c.file),
      out: path.join(OUT, `${c.name}.mp4`),
      captions: (captions[c.name] ?? []).map((x) => ({ ...x })),
    }));

  await renderPngs(font, jobs);
  const results = [];
  for (const job of jobs) {
    process.stderr.write(`framing ${job.name} (${job.captions.length} captions) …\n`);
    const seconds = frame(job);
    results.push({ name: job.name, out: path.relative(process.cwd(), job.out), seconds: +seconds.toFixed(2), captions: job.captions.length });
  }
  await rm(ASSETS, { recursive: true, force: true });
  console.log(JSON.stringify({
    font: font.embedded ? 'Figtree (embedded from motion/assets/fonts)' : 'system sans (Figtree not found)',
    palette: PALETTE,
    window: { w: WIN_W, h: WIN_H, x: WIN_X, y: WIN_Y, radius: RADIUS },
    clips: results,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
