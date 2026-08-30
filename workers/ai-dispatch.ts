interface Env {
  FIREBASE_WEB_API_KEY: string;
  GITHUB_ACTIONS_TOKEN: string;
  ALLOWED_FIREBASE_UIDS: string;
  ALLOWED_ORIGINS: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_REF: string;
}

const json = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  },
});

function allowedValues(value: string) {
  return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') || '';
    if (!allowedValues(env.ALLOWED_ORIGINS).has(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') return json({ ok: true }, 204, origin);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

    const authorization = request.headers.get('authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken) return json({ error: 'Sign in before requesting AI planning.' }, 401, origin);

    const identityResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!identityResponse.ok) return json({ error: 'Firebase session could not be verified.' }, 401, origin);
    const identity = await identityResponse.json() as { users?: Array<{ localId?: string }> };
    const uid = identity.users?.[0]?.localId || '';
    if (!allowedValues(env.ALLOWED_FIREBASE_UIDS).has(uid)) return json({ error: 'Not a MercaSync household member.' }, 403, origin);

    const dispatchResponse = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/ai-recipes.yml/dispatches`, {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'mercasync-ai-dispatch',
        'x-github-api-version': '2026-03-10',
      },
      body: JSON.stringify({ ref: env.GITHUB_REF || 'main' }),
    });
    if (!dispatchResponse.ok) return json({ error: 'The generation worker could not be started.' }, 502, origin);
    return json({ ok: true, status: 'starting' }, 202, origin);
  },
} satisfies ExportedHandler<Env>;
