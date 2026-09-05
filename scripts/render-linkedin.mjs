/**
 * LinkedIn feed image for Leverage: 1080x1350 (4:5) rendered at 2x.
 *   node render-linkedin.mjs <out.png>
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire('D:/project/cherry/package.json');
const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] ?? 'leverage-linkedin.png');

const mark = (s) => `
<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 12h3M17 12h3M7 12c0-3 1.6-5 5-5s5 2 5 5M7 12c0 3 1.6 5 5 5s5-2 5-5" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  <path d="M4 12h3M7 12h10M17 12h3" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="3" cy="12" r="1.6" fill="#85a6e9"/><circle cx="21" cy="12" r="1.6" fill="#85a6e9"/>
  <circle cx="12" cy="7" r="1.4" fill="#85a6e9" opacity="0.75"/><circle cx="12" cy="17" r="1.4" fill="#85a6e9" opacity="0.75"/>
</svg>`;

const steps = [
  ['Compile', 'Goal to a task graph a test can prove'],
  ['Auction', 'Every reachable model, scored'],
  ['Hire', 'Best eligible one. $0 means $0'],
  ['Execute', 'RocketRide pipeline, credits metered'],
  ['Verify', 'The repo\u2019s own tests are the gate'],
  ['Prove', 'Checks, files, hash, real spend'],
];

const uses = [
  ['Finish the failing tests', 'Point it at a repo. A model plans, workers pass every test, the whole suite runs green.'],
  ['Pay $0 for the boring work', 'Local models, free routes and the subscription you already have. Paid routes removed, not outranked.'],
  ['Survive the rate limit', 'A worker that dies is checkpointed and replaced. The work resumes instead of restarting.'],
  ['Get proof, not vibes', 'Every completion carries the checks that ran and their results. Verified or nothing.'],
];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1080px; height: 1350px; overflow: hidden; background: #0b0c0e; }
  #root { position: relative; width: 1080px; height: 1350px; overflow: hidden; background: linear-gradient(180deg, #0e111b 0%, #0b0c0e 100%); font-family: Manrope, system-ui, sans-serif; color: #fff; }
  #aurora { position: absolute; left: -300px; top: -380px; width: 1500px; height: 1100px; filter: blur(46px);
    background: radial-gradient(closest-side at 50% 55%, rgba(98,95,255,0.40), rgba(98,95,255,0.06) 55%, transparent 75%),
                radial-gradient(closest-side at 75% 35%, rgba(255,125,218,0.10), transparent 70%); }
  #aurora2 { position: absolute; left: -200px; bottom: -500px; width: 1500px; height: 900px; filter: blur(60px);
    background: radial-gradient(closest-side, rgba(98,95,255,0.18), transparent 72%); }
  #grid { position: absolute; inset: 0; opacity: 0.28;
    background-image: linear-gradient(rgba(36,55,90,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(36,55,90,0.5) 1px, transparent 1px);
    background-size: 72px 72px; background-position: 36px 30px;
    -webkit-mask-image: radial-gradient(ellipse at 50% 20%, #000 20%, transparent 80%); }
  #frame { position: absolute; inset: 22px; border: 1px solid rgba(23,37,64,0.95); border-radius: 22px; }
  .pad { position: absolute; left: 64px; right: 64px; }
  #head { top: 62px; display: flex; align-items: center; gap: 16px; }
  #head .w { font-size: 38px; font-weight: 600; letter-spacing: -0.03em; }
  #head .e { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.2em; color: #85a6e9; text-transform: uppercase; }
  #h1 { top: 140px; font-size: 76px; font-weight: 700; letter-spacing: -0.04em; line-height: 0.98; }
  #h1 em { display: block; font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; color: #85a6e9; font-size: 84px; letter-spacing: -0.02em; }
  #what { top: 318px; font-size: 22px; line-height: 1.42; color: #c7c9d1; font-weight: 500; max-width: 940px; }
  #what b { color: #fff; font-weight: 700; }
  .label { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.22em; color: #85a6e9; text-transform: uppercase; }
  #loop { top: 470px; }
  #steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-top: 14px; }
  .step { position: relative; border: 1px solid rgba(133,166,233,0.22); background: rgba(14,17,27,0.78); border-radius: 14px; padding: 14px 12px 14px; min-height: 96px; }
  .step .n { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #abaebb; letter-spacing: 0.16em; }
  .step .t { font-size: 19px; font-weight: 700; margin-top: 4px; letter-spacing: -0.02em; }
  .step .d { font-size: 12.5px; color: #abaebb; margin-top: 6px; line-height: 1.3; }
  .step:last-child { border-color: rgba(74,222,128,0.5); }
  #handoff { margin-top: 12px; border: 1px solid rgba(248,113,113,0.42); background: rgba(14,17,27,0.8); border-radius: 14px; padding: 14px 18px; display: flex; gap: 18px; align-items: center; }
  #handoff .k { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.2em; color: #f87171; text-transform: uppercase; white-space: nowrap; }
  #handoff .t { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  #handoff .t span { color: #abaebb; font-weight: 500; }
  #uses { top: 748px; }
  #cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .card { border: 1px solid rgba(23,37,64,1); background: rgba(14,17,27,0.86); border-radius: 16px; padding: 18px 20px 18px; }
  .card .t { font-size: 22px; font-weight: 700; letter-spacing: -0.025em; }
  .card .d { font-size: 14.5px; color: #abaebb; margin-top: 6px; line-height: 1.38; }
  #ev { top: 1096px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
  .stat { border-top: 1px solid rgba(133,166,233,0.35); padding-top: 12px; }
  .stat .v { font-family: 'IBM Plex Mono', monospace; font-size: 34px; font-weight: 500; letter-spacing: -0.03em; }
  .stat .v.g { color: #4ade80; }
  .stat .l { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.16em; color: #abaebb; text-transform: uppercase; margin-top: 4px; }
  #foot { top: 1256px; display: flex; justify-content: space-between; align-items: baseline; font-family: 'IBM Plex Mono', monospace; font-size: 15px; color: #c7c9d1; letter-spacing: 0.02em; }
  #foot b { color: #fff; font-weight: 500; }
  #foot .r { color: #85a6e9; }
  #edge { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: linear-gradient(90deg, transparent, #625fff 30%, #85a6e9 60%, transparent); }
</style></head><body><div id="root">
  <div id="aurora"></div><div id="aurora2"></div><div id="grid"></div><div id="frame"></div>
  <div class="pad" id="head">${mark(42)}<span class="w">Leverage</span><span class="e">Intelligence resource manager · MCP</span></div>
  <div class="pad" id="h1">One frontier brain.<em>An elastic workforce.</em></div>
  <div class="pad" id="what">Your best model should make the expensive decisions, not write the fortieth test. <b>Leverage is the MCP server underneath it:</b> it hires local, free and subscription models, gives each the smallest job it can verify, runs cloud workers on RocketRide, and calls nothing done until the repository&rsquo;s own tests pass.</div>
  <div class="pad" id="loop"><div class="label">The harness · one mission, six stages</div>
    <div id="steps">${steps.map(([t, d], i) => `<div class="step"><div class="n">0${i + 1}</div><div class="t">${t}</div><div class="d">${d}</div></div>`).join('')}</div>
    <div id="handoff"><span class="k">When it fails</span><span class="t">429, timeout or a red test → checkpoint → replacement → resumed task. <span>Never a blind retry.</span></span></div>
  </div>
  <div class="pad" id="uses"><div class="label">What people use it for</div>
    <div id="cards">${uses.map(([t, d]) => `<div class="card"><div class="t">${t}</div><div class="d">${d}</div></div>`).join('')}</div>
  </div>
  <div class="pad" id="ev">
    <div class="stat"><div class="v g">$0.00</div><div class="l">paid inference</div></div>
    <div class="stat"><div class="v">45.7s</div><div class="l">plan from a chat</div></div>
    <div class="stat"><div class="v">2</div><div class="l">real handoffs</div></div>
    <div class="stat"><div class="v g">green</div><div class="l">whole suite</div></div>
    <div class="stat"><div class="v">88</div><div class="l">tests in CI</div></div>
  </div>
  <div class="pad" id="foot"><span><b>useleverage.vercel.app</b> · press the button, a real mission runs</span><span class="r">youtu.be/TQJ_neL7gFY · github.com/vaibhav4046/leverage</span></div>
  <div id="edge"></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`wrote ${out}`);
