import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './ai-dispatch';
const env = { FIREBASE_WEB_API_KEY: 'firebase-key', OPENAI_API_KEY: 'openai-key', ALLOWED_FIREBASE_UIDS: 'alex-uid,nathalia-uid', ALLOWED_ORIGINS: 'https://flyboi96.github.io' };
afterEach(() => vi.restoreAllMocks());
describe('AI dispatch worker', () => {
  it('rejects untrusted origins before contacting external services', async () => { expect((await worker.fetch(new Request('https://worker.test', { method: 'POST', headers: { origin: 'https://attacker.test' } }), env)).status).toBe(403); });
  it('verifies a household token and calls OpenAI directly', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ users: [{ localId: 'alex-uid' }] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"headline":"Plan","summary":"","recipes":[],"slots":[]}' }] }] }), { status: 200 }));
    const response = await worker.fetch(new Request('https://worker.test', { method: 'POST', headers: { origin: 'https://flyboi96.github.io', authorization: 'Bearer firebase-token', 'content-type': 'application/json' }, body: JSON.stringify({ brief: {} }) }), env);
    expect(response.status).toBe(200); expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses');
  });
});
