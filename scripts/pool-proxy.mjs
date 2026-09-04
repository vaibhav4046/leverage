/**
 * The contract Leverage presents to RocketRide.
 *
 * The local router streams by default: ask it for a completion and it answers in
 * Server-Sent Events whether or not you requested them. RocketRide's
 * `llm_openai_api` component parses the body as one JSON document, so an SSE reply
 * comes back as
 *
 *   **LLM error** - ValueError: An error occurred with the API.
 *
 * while the pipeline still runs and bills for it. That failure is indistinguishable
 * from an unreachable pool, which is how it survived two passes: both look like a
 * healthy pipeline with a broken worker, and the credits are spent either way.
 *
 * Setting `stream: false` in the component config does not fix it, because the
 * component does not forward unknown keys into the upstream request body. So the
 * normalisation has to happen on our side of the wire. This proxy is that side:
 * it forces every completion request to be non-streaming, which makes the
 * behaviour a property of the endpoint Leverage publishes rather than a default
 * of somebody else's router.
 *
 *   node scripts/pool-proxy.mjs           # listens on 20129, forwards to 20128
 */
import http from 'node:http';
import { freePort } from './port-utils.mjs';

const PORT = Number(process.env.POOL_PROXY_PORT ?? 20129);
const UPSTREAM = (process.env.POOL_UPSTREAM_URL ?? 'http://127.0.0.1:20128').replace(/\/$/, '');

const reaped = freePort(PORT);
if (reaped.length) console.log(`[pool-proxy] freed port ${PORT} from ${reaped.length} stale listener(s)`);

const server = http.createServer(async (req, res) => {
  if (process.env.POOL_PROXY_VERBOSE) console.log('[pool-proxy] inbound', req.method, req.url);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);

  let body = raw;
  const isCompletion = /\/(chat\/)?completions$/.test(req.url ?? '');

  if (isCompletion && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      // The single reason this proxy exists.
      parsed.stream = false;
      body = Buffer.from(JSON.stringify(parsed));
    } catch {
      // Unparseable bodies pass through untouched: this is a proxy, not a
      // validator, and swallowing a malformed request would hide the real error.
    }
  }

  const headers = { ...req.headers, host: new URL(UPSTREAM).host };
  delete headers['content-length'];
  if (body.length) headers['content-length'] = String(body.length);

  const upstream = http.request(
    `${UPSTREAM}${req.url}`,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `pool upstream unreachable: ${err.message}` } }));
  });

  if (body.length) upstream.write(body);
  upstream.end();
});

server.listen(PORT, () => {
  console.log(`[pool-proxy] listening on 127.0.0.1:${PORT}, forwarding to ${UPSTREAM}`);
  console.log('[pool-proxy] forcing stream:false on completion requests');
});
