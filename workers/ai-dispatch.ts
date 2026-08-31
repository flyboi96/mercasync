interface Env { FIREBASE_WEB_API_KEY: string; OPENAI_API_KEY: string; ALLOWED_FIREBASE_UIDS: string; ALLOWED_ORIGINS: string; }
const json = (body: unknown, status = 200, origin = '') => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' } });
const allowed = (value = '') => new Set(value.split(',').map((item) => item.trim()).filter(Boolean));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') || '';
    if (!allowed(env.ALLOWED_ORIGINS).has(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') return json({ ok: true }, 204, origin);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/, '');
    if (!idToken) return json({ error: 'Sign in before requesting AI planning.' }, 401, origin);
    const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
    const identity = verify.ok ? await verify.json() as { users?: Array<{ localId?: string }> } : null;
    if (!identity?.users?.[0]?.localId || !allowed(env.ALLOWED_FIREBASE_UIDS).has(identity.users[0].localId)) return json({ error: 'Your household session could not be verified.' }, 403, origin);
    if (!env.OPENAI_API_KEY) return json({ error: 'AI is not configured yet. Add OPENAI_API_KEY to the secure Worker secrets.' }, 503, origin);
    const input = await request.json() as { brief?: unknown; mode?: 'ideas' | 'full_plan' | 'format_recipe' };
    const ideas = input.mode === 'ideas';
    const formattingRecipe = input.mode === 'format_recipe';
    const instruction = formattingRecipe ? 'You are MercaSync. Turn the household’s casual recipe idea into one accurate, practical recipe. Return JSON only with recipe: {name, mealType lunch or dinner, description, cuisine, protein, method, effortMinutes, servings, tags string[], ingredients [{name,quantity,unit,store}], instructions string[]}. Preserve every stated ingredient and quantity; make only minimal reasonable assumptions, put those assumptions in the description or steps, use King Soopers for produce/perishables and Costco only for durable bulk staples. Do not invent optional ingredients unless truly necessary.' : ideas ? 'You are MercaSync. Return JSON only: headline, summary, recipes (exactly three recipes with name, description, effortMinutes, ingredients [{name,quantity,unit,store}], instructions). Generate fresh practical ideas from the household brief. Do not include meal slots.' : 'You are MercaSync. Return JSON only: headline, summary, recipes (five recipes with name, description, effortMinutes, ingredients [{name,quantity,unit,store}], instructions), and slots (14 entries: date, mealType lunch or dinner, recipeName nullable, title, servings, kind recipe leftovers eat_out or skip, rationale). Lunches take ten minutes or less. Respect schedule, goals, inventory, variety, recurringRoutines, and store policy in the brief. Treat shared breakfast and saved weekday-lunch routines as fixed household habits; do not invent a replacement unless the routine or schedule calls for it.';
    const ai = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5-mini', input: [{ role: 'developer', content: instruction }, { role: 'user', content: JSON.stringify(input.brief || {}) }] }) });
    if (!ai.ok) return json({ error: `OpenAI returned ${ai.status}. Please retry.` }, 502, origin);
    const result = await ai.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    try {
      const payload = JSON.parse(text || '');
      return json(formattingRecipe ? { recipe: payload.recipe } : { plan: payload }, 200, origin);
    } catch { return json({ error: 'OpenAI returned an unreadable plan. Please retry.' }, 502, origin); }
  },
} satisfies ExportedHandler<Env>;
