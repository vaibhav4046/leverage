import { afterEach, describe, expect, it, vi } from 'vitest';
import { PoolAdapter, isGatewayErrorText } from '../src/providers/pool';
import { ProviderHttpError } from '../src/providers/ollama';

const GATEWAY_TEXT = '**LLM error** — ValueError: An error occurred with the API.';

describe('isGatewayErrorText', () => {
  it('recognises an error message standing where the completion should be', () => {
    expect(isGatewayErrorText(GATEWAY_TEXT)).toBe(true);
    expect(isGatewayErrorText('API error: upstream timed out')).toBe(true);
    expect(isGatewayErrorText('  Gateway error 502')).toBe(true);
  });

  it('leaves real answers alone, including ones that talk about errors', () => {
    expect(isGatewayErrorText('FILE: src/physics.js\nexport function step() {}')).toBe(false);
    expect(isGatewayErrorText('The LLM error handling lives in provider.js; here is the module:')).toBe(false);
    expect(isGatewayErrorText('')).toBe(false);
  });
});

describe('PoolAdapter.invoke', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns a 200 whose content is a gateway error into a provider failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ model: 'x', choices: [{ message: { content: GATEWAY_TEXT } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const adapter = new PoolAdapter('http://pool.test/v1', 'key', ['x']);
    const model = { key: 'pool:x', providerId: 'pool', modelId: 'x', displayName: 'x', costClass: 'free' as const };
    const request = { system: 's', user: 'u', temperature: 0, maxOutputTokens: 10, timeoutMs: 5_000 };

    const err = await adapter
      .invoke(model as never, request as never, new AbortController().signal)
      .then(() => null, (e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as ProviderHttpError).status).toBe(502);
    expect(adapter.classifyError(err).type).toBe('PROVIDER_5XX');
  });
});
