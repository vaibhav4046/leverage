/**
 * Full-page screenshot via the Chrome DevTools Protocol.
 *
 * No Playwright, no puppeteer: Node 24 ships a WebSocket client and Chrome ships a
 * debugging endpoint, so a full-page capture needs neither dependency. The Browser
 * pane cannot paint below the fold and the Playwright MCP server is not always up,
 * and demo screenshots are evidence — they should not depend on either being
 * available.
 *
 *   node scripts/shot.cjs <url> <out.png> [width]
 *
 * Requires Chrome already listening:
 *   chrome --headless=new --remote-debugging-port=9222 about:blank
 */
const http = require('node:http');
const fs = require('node:fs');

const [, , url, out, widthArg] = process.argv;
const WIDTH = Number(widthArg) || 1440;

if (!url || !out) {
  console.error('usage: node scripts/shot.cjs <url> <out.png> [width]');
  process.exit(1);
}

function getJson(endpoint) {
  return new Promise((resolve, reject) => {
    http
      .get(endpoint, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const targets = await getJson('http://127.0.0.1:9222/json');
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target — is Chrome running with --remote-debugging-port=9222?');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: 900,
    deviceScaleFactor: 1,
    mobile: WIDTH < 700,
  });
  await send('Page.navigate', { url });

  // Give fonts, the shader and the scroll-reveals time to settle. Scrolling to the
  // bottom first is what triggers every below-fold reveal; capturing without it
  // photographs a page mid-animation.
  await sleep(3500);
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, document.body.scrollHeight)',
  });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
  await sleep(1200);

  const { cssContentSize } = await send('Page.getLayoutMetrics');
  const height = Math.min(Math.ceil(cssContentSize.height), 16000);

  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height,
    deviceScaleFactor: 1,
    mobile: WIDTH < 700,
  });
  await sleep(1200);

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });

  fs.mkdirSync(require('node:path').dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`saved ${out} (${WIDTH}x${height})`);

  ws.close();
  process.exit(0);
})().catch((err) => {
  console.error('screenshot failed:', err.message);
  process.exit(1);
});
