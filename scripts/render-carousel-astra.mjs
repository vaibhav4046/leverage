/**
 * LinkedIn document carousel for Leverage in the launch-deck idiom: black
 * ground, one grotesque, a two-line headline, one plain sentence, and one
 * figure per slide. Ten 1080x1350 slides to one PDF plus PNGs.
 *
 *   node scripts/render-carousel-astra.mjs docs/linkedin/astra [run-screenshot.png]
 *
 * The RocketRide lockup on the cover is the logo RocketRide serves from its own
 * site (docs/linkedin/brand/). The run screenshot on slide 9 is a capture of
 * Mission Control after a mission this deck was made for.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire('D:/project/cherry/package.json');
const { chromium } = require('playwright');
const outDir = path.resolve(process.argv[2] ?? 'docs/linkedin/astra');
fs.mkdirSync(outDir, { recursive: true });
// Image slots for tonight's outputs, passed as key=path: quill=..., paper=..., mission=...
const shots = Object.fromEntries(
  process.argv
    .slice(3)
    .map((a) => a.split('='))
    .filter(([k, v]) => k && v && fs.existsSync(v))
    .map(([k, v]) => [k, `data:image/png;base64,${fs.readFileSync(path.resolve(v)).toString('base64')}`]),
);

const logo = fs.readFileSync(path.resolve('docs/linkedin/brand/rocketride-logo-white.svg'), 'utf8');
const bannerData = `data:image/png;base64,${fs.readFileSync(path.resolve('docs/shots/banner.png')).toString('base64')}`;


function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function specks(seed, n) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = r() * 1080, y = r() * 1350, s = 0.6 + r() * 1.6, a = 0.25 + r() * 0.6;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="#fff" opacity="${a.toFixed(2)}"/>`;
  }
  return `<svg class="specks" viewBox="0 0 1080 1350" width="1080" height="1350">${out}</svg>`;
}


/* A node-and-edge figure: the harness as it actually sits in the stack. */
function architecture() {
  const node = (x, y, w, h, title, sub, hero = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${hero ? '#0d1a3a' : '#0c0c0c'}" stroke="${hero ? '#4f7cff' : '#2a2a2a'}" stroke-width="1.5"/>` +
    `<text x="${x + 22}" y="${y + 40}" fill="#fff" font-size="24" font-weight="500">${title}</text>` +
    (sub ? `<text x="${x + 22}" y="${y + 72}" fill="#9a9ca4" font-size="18">${sub}</text>` : '');
  const edge = (x1, y1, x2, y2, label) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3a3a3a" stroke-width="1.5"/>` +
    (label ? `<text x="${(x1 + x2) / 2 + 12}" y="${(y1 + y2) / 2 + 6}" fill="#6f7078" font-size="16">${label}</text>` : '');
  const stages = ['Compile', 'Auction', 'Hire', 'Execute', 'Verify', 'Prove'];
  const stageBoxes = stages
    .map((s, i) => {
      const x = 84 + i * 152;
      return `<rect x="${x}" y="396" width="136" height="56" rx="10" fill="#0c0c0c" stroke="#2a2a2a"/><text x="${x + 68}" y="431" text-anchor="middle" fill="#d5d7dd" font-size="19" font-weight="500">${s}</text>` +
        (i < 5 ? `<line x1="${x + 136}" y1="424" x2="${x + 152}" y2="424" stroke="#3a3a3a" stroke-width="1.5"/>` : '');
    })
    .join('');
  return `<svg class="fig" viewBox="0 0 1080 760" width="1080" height="760">
    ${node(84, 0, 912, 100, 'Your best model', 'Claude, Codex or Cursor. Keeps the strategy. Never writes the fortieth test.')}
    ${edge(540, 100, 540, 150, 'MCP · five tools')}
    ${node(84, 150, 912, 320, 'Leverage · the control plane', 'What work exists, who does it, what it may cost, whether the output is true.', true)}
    ${stageBoxes}
    <path d="M 900 452 C 900 500, 220 470, 220 452" fill="none" stroke="#f87171" stroke-width="1.5" stroke-dasharray="6 6"/>
    <text x="540" y="498" text-anchor="middle" fill="#f87171" font-size="17">a failed worker is checkpointed and the task resumes on a replacement</text>
    ${edge(540, 470, 540, 530, 'pipelines · credits metered')}
    ${node(84, 530, 912, 92, 'RocketRide', 'The execution fabric. Cloud workers run as pipelines through a token-gated pool.')}
    ${edge(540, 622, 540, 668, '')}
    ${node(84, 668, 290, 92, 'Local', 'Ollama on your machine')}
    ${node(395, 668, 290, 92, 'Free routes', 'swept for the ones that answer')}
    ${node(706, 668, 290, 92, 'Your seat', 'the subscription you have')}
  </svg>`;
}

/* The memory graph of one real mission: what a checkpoint carries across a handoff. */
function memoryGraph() {
  const box = (x, y, w, h, t, sub, tone) => {
    const stroke = tone === 'fail' ? '#f87171' : tone === 'pass' ? '#4ade80' : tone === 'hero' ? '#4f7cff' : '#2a2a2a';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#0c0c0c" stroke="${stroke}" stroke-width="1.5"/><text x="${x + 18}" y="${y + 34}" fill="#fff" font-size="21" font-weight="500">${t}</text>` + (sub ? `<text x="${x + 18}" y="${y + 62}" fill="#9a9ca4" font-size="16">${sub}</text>` : '');
  };
  const line = (x1, y1, x2, y2, dashed = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${dashed ? '#4f7cff' : '#3a3a3a'}" stroke-width="1.5" ${dashed ? 'stroke-dasharray="6 6"' : ''}/>`;
  return `<svg class="fig" viewBox="0 0 1080 720" width="1080" height="720">
    ${box(84, 0, 912, 80, 'Goal', 'make the whole test suite in test/ pass, touch nothing under test/', 'hero')}
    ${line(300, 80, 300, 120)}${line(540, 80, 540, 120)}${line(780, 80, 780, 120)}
    ${box(84, 120, 280, 80, 'redirect.js', 'held to test/redirect.test.js')}
    ${box(400, 120, 280, 80, 'ssrf.js', 'held to test/ssrf.test.js')}
    ${box(716, 120, 280, 80, 'ratelimit.js', 'held to test/ratelimit.test.js')}
    ${line(540, 200, 540, 250)}
    ${box(400, 250, 280, 80, 'Worker 1 · MiniMax M2.7', 'attempt 1 · one test red', 'fail')}
    ${line(540, 330, 540, 380, true)}
    ${box(300, 380, 480, 120, 'Checkpoint cp_b2074cda83dd', '', 'hero')}
    <text x="318" y="446" fill="#9a9ca4" font-size="16">what was decided · which files changed · which checks already pass</text>
    <text x="318" y="472" fill="#9a9ca4" font-size="16">what is left · the failing assertion, quoted</text>
    ${line(540, 500, 540, 550, true)}
    ${box(400, 550, 280, 80, 'Worker 2 · MiniMax M3', 'attempt 2 · resumes, passes', 'pass')}
    ${line(680, 590, 760, 590)}
    ${box(760, 550, 236, 80, 'Proof pack', 'checks, files, hash', 'pass')}
    <text x="84" y="690" fill="#6f7078" font-size="16">One of the two handoffs in mission LVR-e6443739. The second worker never re-read the whole repository.</text>
  </svg>`;
}

const slides = [
  { cover: true, h: 'Meet Leverage', sub: 'Your expensive model just got a team.' },
  { h: 'It is 2 a.m.<br>The suite is red.', sub: 'You paste the failing test into your best model. Third time tonight. It fixes one thing and breaks another. Then the rate limit lands, and you sit there waiting for a quota to reset.',
    fig: `<div class="quote">Everyone who has shipped with an AI in the loop knows this night.</div>` },
  { h: 'What if the smart one<br>delegated?', sub: 'Leverage sits under the model you already pay for. That model keeps the plan. A team of cheaper models takes the grind: the boilerplate, the retries, the test that has to go green.',
    fig: `<div class="trio"><div><b>Decides</b><span>your frontier model</span></div><div><b>Does</b><span>local, free and subscription models</span></div><div><b>Judges</b><span>the repository\u2019s own tests</span></div></div>` },
  { h: 'The harness.', sub: 'Six stages between a goal and a proof, and one loop that runs when something breaks.', fig: architecture(), figTop: 400 },
  { h: 'A worker dies.<br>The work does not.', sub: 'When a model hits a limit or fails a test, Leverage writes down what it understood and hands that note to the next one. Nobody starts from zero.', fig: memoryGraph(), figTop: 440 },
  { h: 'The tests are<br>the boss.', sub: 'A task is finished when the test runner says so, not when a model says so. After the last task, the whole suite runs once more. Everything that passed is written into a proof pack you can read.',
    fig: `<div class="trio"><div><b>Exit 0</b><span>or it is not done</span></div><div><b>Whole suite</b><span>runs again at the end</span></div><div><b>Proof pack</b><span>checks, files, hash, spend</span></div></div>` },
  { shot: 'quill', h: 'It built<br>a chat product.', sub: 'We wrote the tests for a Claude-style assistant: conversations, a context window, rate limits, a model adapter, an HTTP server, then settings, projects, attachments and streaming. Workers wrote every module; the surface was given as a shell, the way a canvas is. This is Quill, answering from a model on the laptop.' },
  { shot: 'saas', h: 'Then a billing SaaS,<br>five agents, one mission.', sub: 'Plans and entitlements, usage metering, prorated invoices, signed webhooks, tenant isolation. Five independent modules, so the planner cut five tasks and hired a worker for each, two at a time. This is the console when they were done.' },
  { shot: 'guards', h: 'Then, on the live site,<br>one button.', sub: 'A repository with no plan at all. A model writes the task graph, three workers are hired, three tasks pass their own tests, the whole suite runs green, and the RocketRide credits are read from billing before and after: 4129.1 to 4117.1.' },
  { shot: 'contra', h: 'Then a run-and-gun<br>you can play.', sub: 'Contra Run: physics, bullets, enemies, collisions and the game loop, five modules from a test spec, each its own task. The canvas shell was given; every line of logic came from workers and passed its tests. It is playable on the site.' },
  { shot: 'mario', h: 'Then a platformer.', sub: 'Plumber Bros: a level parsed from ASCII, question blocks, coins, goombas you stomp, a flag to reach. Same recipe: tests first, workers second, nothing counts until the suite is green.' },
  { h: 'Things people<br>hand to it.', sub: 'From the missions it has actually run.',
    fig: `<div class="list"><div><b>The failing suite before standup</b><span>a four-task repo, seventeen tests, three worker failures survived</span></div><div><b>The physics for a small game</b><span>vector maths, a seeded spawner, a state machine, 22 tests green</span></div><div><b>A chat product from a test spec</b><span>six modules, one mission, running against a local model the same night</span></div><div><b>Three security guards from one chat message</b><span>open redirect, request forgery, rate limiting, planned in 45 seconds, every test green</span></div></div>` },
  { h: 'It costs what<br>you already pay.', sub: 'Local models on your laptop. Free hosted routes. The subscription seat you have. Set the budget to zero and paid routes are not discouraged, they are removed from the room before the auction starts.',
    fig: `<div class="trio"><div><b>Local</b><span>Ollama, on your machine</span></div><div><b>Free</b><span>hosted routes, swept for the ones that answer</span></div><div><b>Yours</b><span>the seat you already pay for</span></div></div>` },
  { cta: true, h: 'Press the button.', sub: 'A real mission runs on the live site while you watch. Planned by a model, verified by its tests.', url: 'useleverage.vercel.app', foot: 'Links in the first comment.' },
];
// A slide whose screenshot was not supplied is left out rather than rendered empty.
const deck = slides.filter((s) => !s.shot || shots[s.shot]);

const css = `
  @page { size: 1080px 1350px; margin: 0; }
  html, body { margin: 0; background: #000; }
  .slide { position: relative; width: 1080px; height: 1350px; overflow: hidden; page-break-after: always; background: #000; font-family: Inter, system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .slide:last-child { page-break-after: auto; }
  .specks, .galaxy { position: absolute; left: 0; top: 0; }
  h1 { position: absolute; left: 84px; right: 84px; top: 112px; margin: 0; font-size: 64px; font-weight: 500; letter-spacing: -0.03em; line-height: 1.1; }
  .sub { position: absolute; left: 84px; right: 84px; top: 300px; font-size: 27px; line-height: 1.5; color: #a9abb3; font-weight: 400; letter-spacing: -0.005em; }
  .fig { position: absolute; left: 0; top: 520px; }
  .quote { position: absolute; left: 84px; right: 84px; top: 620px; font-size: 40px; line-height: 1.3; font-weight: 500; letter-spacing: -0.02em; color: #fff; border-left: 3px solid #4f7cff; padding-left: 28px; }
  .trio { position: absolute; left: 84px; right: 84px; top: 600px; display: flex; flex-direction: column; }
  .trio div { display: grid; grid-template-columns: 260px 1fr; gap: 20px; padding: 34px 0; border-top: 1px solid #1c1c1c; align-items: baseline; }
  .trio div:last-child { border-bottom: 1px solid #1c1c1c; }
  .trio b { font-size: 34px; font-weight: 500; letter-spacing: -0.02em; }
  .trio span { font-size: 24px; color: #a9abb3; }
  .list { position: absolute; left: 84px; right: 84px; top: 470px; display: flex; flex-direction: column; }
  .list div { display: flex; flex-direction: column; gap: 8px; padding: 30px 0; border-top: 1px solid #1c1c1c; }
  .list div:last-child { border-bottom: 1px solid #1c1c1c; }
  .list b { font-size: 30px; font-weight: 500; letter-spacing: -0.015em; }
  .list span { font-size: 21px; color: #a9abb3; line-height: 1.4; }
  .foot { position: absolute; left: 84px; right: 84px; bottom: 76px; font-size: 18px; line-height: 1.5; color: #6f7078; }
  .num { position: absolute; right: 84px; top: 68px; font-size: 16px; color: #6f7078; letter-spacing: 0.02em; }
  .brand { position: absolute; left: 84px; top: 64px; font-size: 18px; color: #6f7078; font-weight: 500; letter-spacing: -0.01em; }
  .k-cover .banner { position: absolute; left: 60px; right: 60px; top: 150px; border-radius: 22px; overflow: hidden; border: 1px solid #1f2026; }
  .k-cover .banner img { display: block; width: 100%; }
  .k-cover .hero { position: absolute; left: 84px; right: 84px; top: 470px; }
  .k-cover .wm { display: flex; align-items: center; gap: 18px; font-size: 92px; font-weight: 600; letter-spacing: -0.045em; line-height: 1; }
  .k-cover .tag { margin-top: 14px; font-size: 30px; color: #c9cbd1; font-weight: 500; letter-spacing: -0.01em; }
  .k-cover .line { margin-top: 0; font-size: 26px; color: #c9cbd1; line-height: 1.45; max-width: 900px; }
  .k-cover .pills { position: absolute; left: 84px; right: 84px; top: 640px; display: flex; flex-wrap: wrap; gap: 8px; }
  .k-cover .pill { display: inline-flex; border-radius: 6px; overflow: hidden; font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
  .k-cover .pill i { font-style: normal; background: #1c1d22; color: #c9cbd1; padding: 7px 10px; }
  .k-cover .pill b { font-weight: 500; color: #0b0c0e; padding: 7px 10px; }
  .k-cover .pill b.g { background: #4ade80; } .k-cover .pill b.b { background: #85a6e9; }
  .k-cover .facts { position: absolute; left: 84px; right: 84px; top: 740px; border-collapse: collapse; width: 912px; font-size: 20px; }
  .k-cover .facts td { padding: 11px 14px; border-top: 1px solid #1f2026; color: #c9cbd1; }
  .k-cover .facts td:last-child { text-align: right; color: #fff; font-family: 'IBM Plex Mono', monospace; font-weight: 500; }
  .k-cover h1 { top: 120px; font-size: 76px; }
  .k-cover .sub { top: 236px; font-size: 28px; color: #c9cbd1; }
  .k-cover .built { position: absolute; left: 84px; right: 84px; bottom: 52px; display: flex; align-items: center; gap: 22px; }
  .k-cover .built .t { font-size: 17px; color: #9a9ca4; letter-spacing: 0.01em; line-height: 1.4; }
  .k-cover .built .t b { display: block; color: #fff; font-weight: 500; font-size: 19px; }
  .k-cover .built svg { height: 44px; width: auto; }
  .k-cover .built .sep { width: 1px; height: 44px; background: #2a2a2a; }
  .k-cta h1 { top: 150px; font-size: 84px; }
  .k-cta .sub { top: 290px; }
  .k-cta .url { position: absolute; left: 84px; top: 520px; font-size: 46px; font-weight: 500; color: #fff; letter-spacing: -0.02em; border-bottom: 2px solid #4f7cff; padding-bottom: 10px; }
  .k-shot .sub { top: 260px; }
  .k-shot .frame { position: absolute; left: 60px; right: 60px; top: 470px; height: 800px; border-radius: 16px; border: 1px solid #262626; overflow: hidden; background: #0b0c0e; }
  .k-shot .frame img { display: block; width: 100%; }
  .k-shot .missing { position: absolute; left: 84px; top: 520px; color: #f87171; font-size: 24px; }
`;

function render(s, i) {
  const n = `<div class="brand">Leverage</div><div class="num">${i + 1} / ${deck.length}</div>`;
  if (s.cover) {
    const pills = [['live', 'useleverage.vercel.app', 'g'], ['tests', '97 green', 'g'], ['ci', 'passing', 'g'], ['mcp', '5 tools', 'b'], ['rocketride', 'staging verified', 'b'], ['license', 'MIT', 'b']]
      .map(([k, v, tone]) => `<span class="pill"><i>${k}</i><b class="${tone}">${v}</b></span>`).join('');
    const rows = [['Paid inference, five recorded missions', '$0.00'], ['Same workload at frontier rates, estimated', '$0.24'], ['Chat product from a test spec', '28 / 28 tests'], ['Billing SaaS, five modules, one mission', '23 / 23 tests'], ['Plan written by a free model', '45.7 s'], ['Workers replaced from a checkpoint', '2 of 2 resumed']]
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    return `<section class="slide k-cover">${specks(11, 120)}
      <div class="banner"><img src="${bannerData}" alt="Leverage"></div>
      <div class="hero"><div class="line">The intelligence resource manager under the model you already pay for. Cheaper models do the work. The repository’s own tests decide what counts.</div></div>
      <div class="pills">${pills}</div>
      <table class="facts">${rows}</table>
      <div class="built">${logo}<div class="sep"></div><div class="t"><b>Built for the RocketRide x SCU Buildathon</b>Cloud workers run as RocketRide pipelines. Credits read from billing.</div></div></section>`;
  }
  if (s.cta) return `<section class="slide k-cta">${specks(90 + i, 110)}${n}<h1>${s.h}</h1><div class="sub">${s.sub}</div><div class="url">${s.url}</div><div class="foot">${s.foot}</div></section>`;
  if (s.shot) {
    const data = shots[s.shot];
    const img = data ? `<div class="frame"><img src="${data}" alt="${s.shot}"></div>` : `<div class="missing">screenshot "${s.shot}" missing: pass ${s.shot}=path</div>`;
    return `<section class="slide k-shot">${specks(90 + i, 110)}${n}<h1>${s.h}</h1><div class="sub">${s.sub}</div>${img}</section>`;
  }
  const fig = s.figTop ? s.fig.replace('class="fig"', `class="fig" style="top:${s.figTop}px"`) : s.fig;
  return `<section class="slide">${specks(90 + i, 110)}${n}<h1>${s.h}</h1><div class="sub">${s.sub}</div>${fig}</section>`;
}

const head = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet"><style>${css}</style></head><body>`;
const html = head + deck.map(render).join('') + '</body></html>';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
for (let i = 0; i < deck.length; i++) {
  await page.setContent(head + render(deck[i], i) + '</body></html>', { waitUntil: 'networkidle' });
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
console.log(`wrote ${deck.length} slides to ${outDir}; shots: ${Object.keys(shots).join(', ') || 'none'}`);
