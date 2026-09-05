/**
 * LinkedIn document carousel for Leverage: ten 1080x1350 slides to one PDF,
 * plus the cover as a PNG for a single-image post.
 *   node render-carousel.mjs <outdir>
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire('D:/project/cherry/package.json');
const { chromium } = require('playwright');
const outDir = path.resolve(process.argv[2] ?? '.');
fs.mkdirSync(outDir, { recursive: true });

const mark = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M4 12h3M17 12h3M7 12c0-3 1.6-5 5-5s5 2 5 5M7 12c0 3 1.6 5 5 5s5-2 5-5" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/><path d="M4 12h3M7 12h10M17 12h3" stroke="#85a6e9" stroke-width="1.5" stroke-linecap="round"/><circle cx="3" cy="12" r="1.6" fill="#85a6e9"/><circle cx="21" cy="12" r="1.6" fill="#85a6e9"/><circle cx="12" cy="7" r="1.4" fill="#85a6e9" opacity="0.75"/><circle cx="12" cy="17" r="1.4" fill="#85a6e9" opacity="0.75"/></svg>`;

// One idea per slide, under 50 words each, every number from a recorded mission.
const slides = [
  { kind: 'cover', eyebrow: 'A real run, on film', h: 'One chat message.<br>3 tasks. 2 workers failed<br>and were replaced.<br><em>Whole test suite green.</em>', big: '$0 paid', sub: 'The machine behind it, in 9 slides →' },
  { kind: 'text', eyebrow: 'The problem', h: 'Your best AI model is <em>expensive</em> and brilliant.', p: 'And you use it for everything. The architecture decision. And the fortieth boilerplate test. Same price per token.' },
  { kind: 'text', eyebrow: 'The idea', h: 'One frontier brain.<br><em>An elastic workforce.</em>', p: 'Your best model keeps the strategy. Leverage sits underneath it and hires cheaper models for the work that only needs to be verified, not invented.' },
  { kind: 'list', eyebrow: 'Where the workers come from', h: 'Three sources. <em>No new bill.</em>', items: [['Local', 'Models on your own machine, through Ollama'], ['Free', 'Free hosted routes, swept daily for the ones that answer'], ['Yours', 'The subscription you already pay for, as a worker seat']], note: 'Budget $0 removes paid routes before the auction. Not outranked. Removed.' },
  { kind: 'steps', eyebrow: 'How a mission runs', h: 'Six stages. <em>One rule.</em>', steps: [['Compile', 'goal to a task graph a test can prove'], ['Auction', 'every reachable model, scored'], ['Hire', 'the best eligible one'], ['Execute', 'as a RocketRide pipeline'], ['Verify', 'the repo\u2019s own tests are the gate'], ['Prove', 'checks, files, hash, real spend']] },
  { kind: 'text', eyebrow: 'When a worker fails', h: 'It is <em>replaced</em>, not retried.', p: 'A rate limit, a timeout or a red test releases the worker. What it understood is checkpointed. A replacement resumes from the checkpoint. The work continues instead of restarting.', tag: '429 → checkpoint → replacement → resumed' },
  { kind: 'text', eyebrow: 'The rule', h: '<em>Verified</em> or nothing.', p: 'A task is done when the tests exit 0. After the last task, the whole suite runs once more. Every completion carries a proof pack: the checks that ran, the files changed, the real spend.' },
  { kind: 'stats', eyebrow: 'It happened, on film', h: 'A security repo. <em>One message.</em>', stats: [['45.7s', 'to plan 3 tasks'], ['2', 'real handoffs'], ['100', 'quality score'], ['$0.00', 'paid inference']], p: 'Three guards from the OWASP Top 10, planned by a free model, passed on attempt two, whole suite green, proof returned into the chat.' },
  { kind: 'list', eyebrow: 'Use it', h: 'Three ways in. <em>No API key.</em>', items: [['Claude Code', 'add it as an MCP server, then ask it to finish the app'], ['Any chat', 'a connector URL. One message starts a mission'], ['Terminal', 'point it at a repo and a goal']], note: '88 tests. CI green. Open source, MIT.' },
  { kind: 'cta', eyebrow: 'Try it in 30 seconds', h: 'Press the button.<br><em>A real mission runs<br>while you watch.</em>', url: 'useleverage.vercel.app', sub: 'Links in the first comment. Save this if you run AI agents on real code.' },
];

const css = `
  @page { size: 1080px 1350px; margin: 0; }
  html, body { margin: 0; background: #0b0c0e; }
  .slide { position: relative; width: 1080px; height: 1350px; overflow: hidden; page-break-after: always; background: linear-gradient(180deg, #0e111b 0%, #0b0c0e 100%); font-family: Manrope, system-ui, sans-serif; color: #fff; }
  .slide:last-child { page-break-after: auto; }
  .aurora { position: absolute; left: -300px; top: -380px; width: 1500px; height: 1100px; filter: blur(46px); background: radial-gradient(closest-side at 50% 55%, rgba(98,95,255,0.40), rgba(98,95,255,0.06) 55%, transparent 75%), radial-gradient(closest-side at 75% 35%, rgba(255,125,218,0.10), transparent 70%); }
  .grid { position: absolute; inset: 0; opacity: 0.26; background-image: linear-gradient(rgba(36,55,90,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(36,55,90,0.5) 1px, transparent 1px); background-size: 72px 72px; background-position: 36px 30px; -webkit-mask-image: radial-gradient(ellipse at 50% 30%, #000 20%, transparent 80%); }
  .frame { position: absolute; inset: 22px; border: 1px solid rgba(23,37,64,0.95); border-radius: 22px; }
  .edge { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: linear-gradient(90deg, transparent, #625fff 30%, #85a6e9 60%, transparent); }
  .head { position: absolute; left: 72px; right: 72px; top: 64px; display: flex; align-items: center; gap: 14px; }
  .head .w { font-size: 30px; font-weight: 600; letter-spacing: -0.03em; }
  .head .n { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #85a6e9; letter-spacing: 0.1em; }
  .eyebrow { position: absolute; left: 72px; right: 72px; top: 250px; font-family: 'IBM Plex Mono', monospace; font-size: 20px; letter-spacing: 0.22em; color: #85a6e9; text-transform: uppercase; }
  h1 { position: absolute; left: 72px; right: 72px; top: 300px; margin: 0; font-size: 84px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.02; }
  h1 em { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; color: #85a6e9; font-size: 92px; letter-spacing: -0.02em; }
  .k-cover h1 { top: 330px; font-size: 76px; line-height: 1.06; }
  .k-cover h1 em { font-size: 84px; }
  .k-cover .big { position: absolute; left: 72px; top: 790px; font-family: 'IBM Plex Mono', monospace; font-size: 150px; font-weight: 500; color: #4ade80; letter-spacing: -0.05em; line-height: 1; }
  .k-cover .sub { position: absolute; left: 72px; right: 72px; top: 1000px; font-size: 36px; color: #c7c9d1; font-weight: 500; }
  p.body { position: absolute; left: 72px; right: 72px; top: 680px; margin: 0; font-size: 40px; line-height: 1.38; color: #c7c9d1; font-weight: 500; }
  .tag { position: absolute; left: 72px; right: 72px; top: 1080px; border: 1px solid rgba(248,113,113,0.45); border-radius: 16px; padding: 22px 28px; font-family: 'IBM Plex Mono', monospace; font-size: 28px; color: #f87171; letter-spacing: 0.02em; background: rgba(14,17,27,0.8); }
  .items { position: absolute; left: 72px; right: 72px; top: 640px; display: flex; flex-direction: column; gap: 18px; }
  .item { border: 1px solid rgba(23,37,64,1); background: rgba(14,17,27,0.86); border-radius: 18px; padding: 26px 30px; display: flex; gap: 26px; align-items: baseline; }
  .item b { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; min-width: 250px; }
  .item span { font-size: 28px; color: #abaebb; line-height: 1.3; }
  .note { position: absolute; left: 72px; right: 72px; top: 1120px; font-size: 30px; color: #c7c9d1; font-weight: 500; border-left: 4px solid #625fff; padding-left: 22px; }
  .steps { position: absolute; left: 72px; right: 72px; top: 620px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .step { border: 1px solid rgba(133,166,233,0.22); background: rgba(14,17,27,0.8); border-radius: 18px; padding: 24px 26px; }
  .step .k { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #abaebb; letter-spacing: 0.16em; }
  .step .t { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; margin-top: 6px; }
  .step .d { font-size: 24px; color: #abaebb; margin-top: 8px; line-height: 1.3; }
  .step:last-child { border-color: rgba(74,222,128,0.5); }
  .stats { position: absolute; left: 72px; right: 72px; top: 600px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .stat { border-top: 2px solid rgba(133,166,233,0.35); padding-top: 18px; }
  .stat .v { font-family: 'IBM Plex Mono', monospace; font-size: 92px; font-weight: 500; letter-spacing: -0.05em; line-height: 1; }
  .stat:nth-child(4) .v { color: #4ade80; }
  .stat .l { font-family: 'IBM Plex Mono', monospace; font-size: 20px; letter-spacing: 0.16em; color: #abaebb; text-transform: uppercase; margin-top: 10px; }
  .stats-p { position: absolute; left: 72px; right: 72px; top: 1040px; margin: 0; font-size: 32px; line-height: 1.38; color: #c7c9d1; font-weight: 500; }
  .k-cta h1 { top: 320px; }
  .k-cta .url { position: absolute; left: 72px; top: 800px; font-family: 'IBM Plex Mono', monospace; font-size: 58px; color: #fff; font-weight: 500; letter-spacing: -0.02em; border: 1px solid rgba(133,166,233,0.4); border-radius: 999px; padding: 26px 44px; background: rgba(14,17,27,0.85); }
  .k-cta .sub { position: absolute; left: 72px; right: 72px; top: 1000px; font-size: 34px; color: #c7c9d1; font-weight: 500; line-height: 1.4; }
  .foot { position: absolute; left: 72px; right: 72px; bottom: 60px; display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #abaebb; letter-spacing: 0.06em; }
`;

function render(s, i) {
  const head = `<div class="aurora"></div><div class="grid"></div><div class="frame"></div><div class="head">${mark(34)}<span class="w">Leverage</span><span class="n">${String(i + 1).padStart(2, '0')} / ${slides.length}</span></div><div class="eyebrow">${s.eyebrow}</div>`;
  const foot = `<div class="foot"><span>useleverage.vercel.app</span><span>${i < slides.length - 1 ? 'swipe →' : 'github.com/vaibhav4046/leverage'}</span></div><div class="edge"></div>`;
  let body = '';
  if (s.kind === 'cover') body = `<h1>${s.h}</h1><div class="big">${s.big}</div><div class="sub">${s.sub}</div>`;
  if (s.kind === 'text') body = `<h1>${s.h}</h1><p class="body">${s.p}</p>${s.tag ? `<div class="tag">${s.tag}</div>` : ''}`;
  if (s.kind === 'list') body = `<h1>${s.h}</h1><div class="items">${s.items.map(([b, d]) => `<div class="item"><b>${b}</b><span>${d}</span></div>`).join('')}</div><div class="note">${s.note}</div>`;
  if (s.kind === 'steps') body = `<h1>${s.h}</h1><div class="steps">${s.steps.map(([t, d], j) => `<div class="step"><div class="k">0${j + 1}</div><div class="t">${t}</div><div class="d">${d}</div></div>`).join('')}</div>`;
  if (s.kind === 'stats') body = `<h1>${s.h}</h1><div class="stats">${s.stats.map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div><p class="stats-p">${s.p}</p>`;
  if (s.kind === 'cta') body = `<h1>${s.h}</h1><div class="url">${s.url}</div><div class="sub">${s.sub}</div>`;
  return `<section class="slide k-${s.kind}">${head}${body}${foot}</section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet"><style>${css}</style></head><body>${slides.map(render).join('')}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const headHtml = html.slice(0, html.indexOf('<body>') + 6);
for (let i = 0; i < slides.length; i++) {
  await page.setContent(headHtml + render(slides[i], i) + '</body></html>', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const file = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  if (i === 0) fs.copyFileSync(file, path.join(outDir, 'leverage-cover.png'));
}
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.emulateMedia({ media: 'screen' });
await page.pdf({ path: path.join(outDir, 'leverage-carousel.pdf'), width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`wrote ${slides.length} slides to ${outDir}`);
