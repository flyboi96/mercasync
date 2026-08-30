import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './ai-dispatch';

const env = {
  FIREBASE_WEB_API_KEY: 'firebase-key',
  GITHUB_ACTIONS_TOKEN: 'github-token',
  ALLOWED_FIREBASE_UIDS: 'alex-uid,nathalia-uid',
  ALLOWED_ORIGINS: 'https://flyboi96.github.io',
  GITHUB_OWNER: 'flyboi96',
  GITHUB_REPO: 'mercasync',
  GITHUB_REF: 'main',
};

afterEach(() => vi.restoreAllMocks());

describe('AI dispatch worker', () => {
  it('rejects untrusted origins before contacting external services', async () => {
    const response = await worker.fetch(new Request('https://worker.test', { method: 'POST', headers: { origin: 'https://attacker.test' } }), env);
    expect(response.status).toBe(403);
  });

  it('verifies a household token and dispatches the GitHub workflow', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [{ localId: 'alex-uid' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await worker.fetch(new Request('https://worker.test', { method: 'POST', headers: { origin: 'https://flyboi96.github.io', authorization: 'Bearer firebase-token' } }), env);
    expect(response.status).toBe(202);
    expect(fetchMock.mock.calls[1][0]).toContain('/actions/workflows/ai-recipes.yml/dispatches');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ authorization: 'Bearer github-token' });
  });
});
