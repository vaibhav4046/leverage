import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../src/app/api/v1/pool/[...path]/route';

/**
 * The hosted pool forwards to real provider keys, so its refusals are the
 * product's spending limit. None of these cases may reach the network: every
 * one is decided before a fetch would happen.
 */

const BASE = 'https://leverage.test/api/v1/pool/';
const ENV = ['POOL_ACCESS_TOKEN', 'POOL_UPSTREAMS', 'POOL_KEY_OPENROUTER', 'POOL_MODELS', 'POOL_UPSTREAM_URL', 'POOL_UPSTREAM_KEY'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

function set(vars: Record<string, string | undefined>) {
  for (const k of ENV) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
}

afterEach(() => set(saved));

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const get = (path: string[], headers: Record<string, string> = {}) =>
  GET(new NextRequest(BASE + path.join('/'), { headers }), ctx(path));
const post = (path: string[], body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest(BASE + path.join('/'), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }),
    ctx(path),
  );

const CONFIGURED = { POOL_ACCESS_TOKEN: 'secret-token', POOL_UPSTREAMS: 'openrouter=https://openrouter.invalid/api', POOL_KEY_OPENROUTER: 'k' };

describe('hosted pool: refusals happen before any forwarding', () => {
  it('refuses everything while no access token is configured (never an open relay)', async () => {
    set({ POOL_UPSTREAMS: CONFIGURED.POOL_UPSTREAMS, POOL_KEY_OPENROUTER: 'k' });
    const res = await get(['v1', 'models']);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/access token not configured/);
  });

  it('answers 401 without a token, and 401 with the wrong one', async () => {
    set(CONFIGURED);
    expect((await get(['v1', 'models'])).status).toBe(401);
    expect((await get(['v1', 'models'], { authorization: 'Bearer secret-tokem' })).status).toBe(401);
    expect((await get(['v1', 'models'], { 'x-api-key': 'nope' })).status).toBe(401);
  });

  it('accepts the token as Bearer, x-api-key or api-key, then reports missing upstreams honestly', async () => {
    set({ POOL_ACCESS_TOKEN: 'secret-token' });
    const forms: Record<string, string>[] = [{ authorization: 'Bearer secret-token' }, { 'x-api-key': 'secret-token' }, { 'api-key': 'secret-token' }];
    for (const headers of forms) {
      const res = await get(['v1', 'models'], headers);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('pool upstream not configured');
    }
  });

  it('refuses a model outside POOL_MODELS with 403, so a leaked token cannot reach a paid model', async () => {
    set({ ...CONFIGURED, POOL_MODELS: 'openrouter/free-a:free, openrouter/free-b:free' });
    const res = await post(['v1', 'chat', 'completions'], { model: 'openrouter/anthropic/claude-opus', messages: [] }, { authorization: 'Bearer secret-token' });
    expect(res.status).toBe(403);
    expect((await res.json()).allowed).toEqual(['openrouter/free-a:free', 'openrouter/free-b:free']);
  });

  it('refuses an unknown upstream prefix with 400 and names the known ones', async () => {
    set(CONFIGURED);
    const res = await post(['v1', 'chat', 'completions'], { model: 'nvidia/some-model', messages: [] }, { authorization: 'Bearer secret-token' });
    expect(res.status).toBe(400);
    expect((await res.json()).known).toEqual(['openrouter']);
  });

  it('refuses paths that are not the OpenAI surface, and GET on completions', async () => {
    set(CONFIGURED);
    expect((await get(['v1', 'admin'], { authorization: 'Bearer secret-token' })).status).toBe(404);
    expect((await get(['v1', 'chat', 'completions'], { authorization: 'Bearer secret-token' })).status).toBe(405);
  });

  it('accepts the OpenAI-client spelling without the v1 prefix, as RocketRide sends it', async () => {
    set({ ...CONFIGURED, POOL_MODELS: 'openrouter/free-a:free' });
    // 403 on the allowlist, not 404 on the path: the path was recognised.
    const res = await post(['chat', 'completions'], { model: 'openrouter/paid', messages: [] }, { authorization: 'Bearer secret-token' });
    expect(res.status).toBe(403);
    expect((await get(['chat', 'completions'], { authorization: 'Bearer secret-token' })).status).toBe(405);
  });
});
