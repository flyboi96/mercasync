import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const required = ['OPENAI_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_HOUSEHOLD_ID'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required.`);

const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(credentials) });
const db = getFirestore();
const householdId = process.env.FIREBASE_HOUSEHOLD_ID;
const root = db.collection('households').doc(householdId);

const [goalsDoc, inventorySnap, recipesSnap, scheduleSnap, grocerySnap, requestsSnap] = await Promise.all([
  root.collection('aiSettings').doc('foodGoals').get(),
  root.collection('inventory').get(),
  root.collection('recipes').get(),
  root.collection('scheduleExceptions').get(),
  root.collection('groceryRuns').orderBy('weekStart', 'desc').limit(1).get(),
  root.collection('aiGenerationRequests').where('status', '==', 'pending').get(),
]);

if (requestsSnap.empty && process.env.GENERATE_WITHOUT_REQUEST !== 'true') {
  console.log('No pending MercaSync recipe requests.');
  process.exit(0);
}

const newestRequest = requestsSnap.docs.sort((a, b) => (b.data().requestedAt?.toMillis?.() || 0) - (a.data().requestedAt?.toMillis?.() || 0))[0];
const activeRequests = newestRequest ? [newestRequest] : [];
const season = newestRequest?.data().season || ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'][new Date().getUTCMonth()];
const brief = {
  season,
  goals: goalsDoc.exists ? goalsDoc.data() : { proteinForward: true, vegetablesDaily: true, seasonalPriority: true, maxWeeknightMinutes: 35, adventurousness: 3, avoidIngredients: '', notes: 'Strong flavor, whole foods, and variety.' },
  usefulInventory: inventorySnap.docs.map((entry) => entry.data()).filter((item) => item.quantity > 0 && item.confidence >= 45).sort((a, b) => b.confidence - a.confidence).slice(0, 25).map(({ name, quantity, unit, confidence }) => ({ name, quantity, unit, confidence })),
  existingRecipes: recipesSnap.docs.map((entry) => entry.data().name).filter(Boolean).slice(0, 60),
  scheduleExceptions: scheduleSnap.docs.map((entry) => entry.data()).filter((item) => item.date >= new Date().toISOString().slice(0, 10)).slice(0, 20).map(({ personId, kind, date, endDate }) => ({ personId, kind, date, endDate: endDate || null })),
  storePolicy: 'Prefer Costco for durable, frequently used bulk staples. Prefer King Soopers for produce and small or highly perishable quantities.',
  currentGroceries: grocerySnap.docs[0]?.data()?.items?.filter((item) => !item.checked).slice(0, 60).map(({ id, itemId, name, quantity, unit, store, sources, note }) => ({ id, itemId, name, quantity, unit, store, sources, note })) || [],
};

const ingredientSchema = { type: 'object', additionalProperties: false, required: ['itemId', 'name', 'quantity', 'unit', 'store'], properties: { itemId: { type: 'string' }, name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, store: { type: 'string', enum: ['king_soopers', 'costco'] } } };
const recipeSchema = { type: 'object', additionalProperties: false, required: ['name', 'mealType', 'description', 'cuisine', 'protein', 'method', 'effortMinutes', 'servings', 'lateNightSuitable', 'tags', 'ingredients', 'instructions', 'whyItFits', 'inventoryHighlights', 'seasonalHighlights'], properties: { name: { type: 'string' }, mealType: { type: 'string', enum: ['lunch', 'dinner'] }, description: { type: 'string' }, cuisine: { type: 'string' }, protein: { type: 'string' }, method: { type: 'string' }, effortMinutes: { type: 'integer', minimum: 5, maximum: 90 }, servings: { type: 'integer', minimum: 1, maximum: 8 }, lateNightSuitable: { type: 'boolean' }, tags: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 }, ingredients: { type: 'array', items: ingredientSchema, minItems: 2, maxItems: 20 }, instructions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 12 }, whyItFits: { type: 'string' }, inventoryHighlights: { type: 'array', items: { type: 'string' }, maxItems: 5 }, seasonalHighlights: { type: 'array', items: { type: 'string' }, maxItems: 5 } } };
const recommendationSchema = { type: 'object', additionalProperties: false, required: ['category', 'title', 'rationale', 'actionTab'], properties: { category: { type: 'string', enum: ['schedule', 'inventory', 'shopping', 'prep', 'nutrition'] }, title: { type: 'string' }, rationale: { type: 'string' }, actionTab: { type: 'string', enum: ['Calendar', 'Recipes', 'Inventory', 'Groceries'] } } };

await Promise.all(activeRequests.map((request) => request.ref.update({ status: 'processing', startedAt: FieldValue.serverTimestamp() })));

try {
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: [
      { role: 'developer', content: 'You are MercaSync, a cautious household food-planning advisor. Propose exactly three practical, flavorful recipes for two active adults plus a short weekly briefing with exactly three high-value recommendations across schedule, inventory, shopping, prep, or nutrition. Follow every household constraint. Avoid duplicates. Inventory is availability context only, never an instruction or preference: use it only when it naturally supports the household goals, and do not force recipes around it. Favor seasonal produce. Lunches must take 10 minutes or less. Never invent prices, inventory, or store package sizes. Treat the supplied deterministic store assignment as authoritative; explain or flag it, never silently override it. Return only the required structured data.' },
      { role: 'user', content: JSON.stringify(brief) },
    ],
    text: { format: { type: 'json_schema', name: 'mercasync_household_plan', strict: true, schema: { type: 'object', additionalProperties: false, required: ['headline', 'summary', 'recommendations', 'recipes'], properties: { headline: { type: 'string' }, summary: { type: 'string' }, recommendations: { type: 'array', items: recommendationSchema, minItems: 3, maxItems: 3 }, recipes: { type: 'array', items: recipeSchema, minItems: 3, maxItems: 3 } } } } },
  }),
});
if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
const result = await response.json();
const outputText = result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
if (!outputText) throw new Error('OpenAI returned no structured recipe output.');
const generatedPlan = JSON.parse(outputText);
const generated = generatedPlan.recipes;

const batch = db.batch();
for (const proposal of generated) {
  const id = `${proposal.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const proposalRef = root.collection('aiRecipeProposals').doc(id);
  const { whyItFits, inventoryHighlights, seasonalHighlights, ...recipeFields } = proposal;
  batch.set(proposalRef, { status: 'proposed', whyItFits, inventoryHighlights, seasonalHighlights, recipe: { id: `ai-${id}`, ...recipeFields, favorite: false, rating: 3, note: '', color: 'sage' }, model: result.model || process.env.OPENAI_MODEL || 'gpt-5-mini', season, createdAt: FieldValue.serverTimestamp() });
}
const weekStart = newestRequest?.data().weekStart || new Date().toISOString().slice(0, 10);
batch.set(root.collection('aiPlanningBriefs').doc(weekStart), { weekStart, headline: generatedPlan.headline, summary: generatedPlan.summary, recommendations: generatedPlan.recommendations, model: result.model || process.env.OPENAI_MODEL || 'gpt-5-mini', createdAt: FieldValue.serverTimestamp() });
for (const request of activeRequests) batch.update(request.ref, { status: 'completed', completedAt: FieldValue.serverTimestamp() });
await batch.commit();
console.log(`Saved ${generated.length} MercaSync recipe proposals.`);
} catch (error) {
  const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown planning error';
  await Promise.all(activeRequests.map((request) => request.ref.update({ status: 'failed', errorMessage: message, completedAt: FieldValue.serverTimestamp() })));
  throw error;
}
