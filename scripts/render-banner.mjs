/**
 * Render the README banner from an HTML card in the site's own type system.
 *
 *   node scripts/render-banner.mjs            -> docs/shots/banner.png (2400x720)
 *
 * Uses the Playwright checkout in D:/project/cherry (the same one the film's
 * capture scripts use) so this repository does not carry a browser dependency.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire('D:/project/cherry/package.json');
const { chromium } = require('playwright');

const out = path.resolve(process.argv[2] ?? 'docs/shots/banner.png');

const mark = `
<svg width="164" height="164" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 12h3M17 12h3M7 12c0-3 1.6-5 5-5s5 2 5 5M7 12c0 3 1.6 5 5 5s5-2 5-5" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  <path d="M4 12h3M7 12h10M17 12h3" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="3" cy="12" r="1.6" fill="#85a6e9"/><circle cx="21" cy="12" r="1.6" fill="#85a6e9"/>
  <circle cx="12" cy="7" r="1.4" fill="#85a6e9" opacity="0.75"/><circle cx="12" cy="17" r="1.4" fill="#85a6e9" opacity="0.75"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 2400px; height: 720px; overflow: hidden; background: #0b0c0e; }
  #root { position: relative; width: 2400px; height: 720px; overflow: hidden; background: linear-gradient(180deg, #0e111b 0%, #0b0c0e 100%); font-family: Manrope, system-ui, sans-serif; color: #ffffff; }
  #aurora { position: absolute; left: -200px; top: -420px; width: 2000px; height: 1400px; filter: blur(40px);
    background: radial-gradient(closest-side at 45% 55%, rgba(98,95,255,0.42), rgba(98,95,255,0.08) 55%, transparent 75%),
                radial-gradient(closest-side at 70% 40%, rgba(133,166,233,0.18), transparent 70%),
                radial-gradient(closest-side at 30% 70%, rgba(255,125,218,0.10), transparent 70%); }
  #aurora2 { position: absolute; right: -300px; top: -200px; width: 1400px; height: 1100px; filter: blur(50px);
    background: radial-gradient(closest-side, rgba(98,95,255,0.22), transparent 72%); }
  #grid { position: absolute; inset: 0; opacity: 0.32;
    background-image: linear-gradient(rgba(36,55,90,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(36,55,90,0.45) 1px, transparent 1px);
    background-size: 96px 96px; background-position: 48px 24px;
    -webkit-mask-image: radial-gradient(ellipse at 40% 50%, #000 30%, transparent 85%); }
  #frame { position: absolute; inset: 28px; border: 1px solid rgba(23,37,64,0.9); border-radius: 22px; }
  #edge { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: linear-gradient(90deg, transparent, #625fff 30%, #85a6e9 60%, transparent); opacity: 0.9; }
  #mark { position: absolute; left: 132px; top: 278px; }
  #eyebrow { position: absolute; left: 340px; top: 236px; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 22px; letter-spacing: 0.22em; color: #85a6e9; text-transform: uppercase; }
  #word { position: absolute; left: 332px; top: 268px; font-size: 208px; font-weight: 600; letter-spacing: -0.045em; line-height: 1; color: #ffffff; }
  #tag { position: absolute; left: 342px; top: 500px; font-size: 54px; font-weight: 500; letter-spacing: -0.01em; color: #c7c9d1; white-space: nowrap; }
  #tag em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: #85a6e9; font-size: 62px; }
  #stats { position: absolute; right: 132px; top: 262px; display: flex; flex-direction: column; gap: 22px; align-items: flex-end; }
  .pill { display: inline-flex; align-items: baseline; gap: 18px; padding: 18px 30px; border-radius: 999px; border: 1px solid rgba(133,166,233,0.28); background: rgba(14,17,27,0.72); backdrop-filter: blur(8px); }
  .pill b { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-weight: 500; font-size: 40px; color: #ffffff; letter-spacing: -0.02em; }
  .pill span { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 20px; letter-spacing: 0.16em; text-transform: uppercase; color: #abaebb; }
  .pill.pass b { color: #4ade80; }
</style></head><body><div id="root">
  <div id="aurora"></div><div id="aurora2"></div><div id="grid"></div><div id="frame"></div>
  <div id="mark">${mark}</div>
  <div id="eyebrow">Intelligence resource manager · MCP server · RocketRide</div>
  <div id="word">Leverage</div>
  <div id="tag">One frontier brain. <em>An elastic workforce.</em></div>
  <div id="stats">
    <div class="pill pass"><b>$0.00</b><span>paid inference</span></div>
    <div class="pill"><b>88</b><span>tests green</span></div>
    <div class="pill"><b>Verified</b><span>or nothing</span></div>
  </div>
  <div id="edge"></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 720 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`wrote ${out}`);
