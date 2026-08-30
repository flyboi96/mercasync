'use client';

import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { createRecipe } from './recipe-repository';
import { DEFAULT_FOOD_GOALS, type AiGenerationRequest, type AiPlanningBrief, type AiRecipeProposal, type HouseholdFoodGoals } from '@/lib/domain/ai-planning';
import type { AiWeeklyDraft } from '@/lib/domain/weekly-draft';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

const household = (householdId?: string) => householdId || firebaseHouseholdId();

export function subscribeToFoodGoals(householdId: string | undefined, onChange: (goals: HouseholdFoodGoals) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(DEFAULT_FOOD_GOALS); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'households', household(householdId), 'aiSettings', 'foodGoals'), (snapshot) => {
    const data = snapshot.data();
    onChange(snapshot.exists() ? {
      proteinForward: data!.proteinForward,
      vegetablesDaily: data!.vegetablesDaily,
      seasonalPriority: data!.seasonalPriority,
      maxWeeknightMinutes: data!.maxWeeknightMinutes,
      adventurousness: data!.adventurousness,
      avoidIngredients: data!.avoidIngredients,
      notes: data!.notes,
    } : DEFAULT_FOOD_GOALS);
  }, onError);
}

export async function saveFoodGoals(goals: HouseholdFoodGoals, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  await setDoc(doc(db, 'households', household(householdId), 'aiSettings', 'foodGoals'), { ...goals, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export function subscribeToAiProposals(householdId: string | undefined, onChange: (proposals: AiRecipeProposal[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange([]); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', household(householdId), 'aiRecipeProposals'), (snapshot) => onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AiRecipeProposal).filter((proposal) => proposal.status === 'proposed')), onError);
}

export async function requestAiRecipes(weekStart: string, season: string, householdId?: string, mode: 'ideas' | 'full_plan' = 'ideas') {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  const requestRef = await addDoc(collection(db, 'households', household(householdId), 'aiGenerationRequests'), { weekStart, season, scope: 'full_plan', status: 'pending', requestedBy: auth.currentUser.uid, requestedAt: serverTimestamp() });
  try {
    const dispatchUrl = process.env.NEXT_PUBLIC_AI_DISPATCH_URL;
    if (!dispatchUrl) throw new Error('Immediate AI dispatch is not configured.');
    const root = doc(db, 'households', household(householdId));
    const [goalsDoc, settingsDoc, inventorySnap, recipesSnap, scheduleSnap, routinesSnap] = await Promise.all([getDoc(doc(root, 'aiSettings', 'foodGoals')), getDoc(doc(root, 'planningSettings', 'current')), getDocs(collection(root, 'inventory')), getDocs(collection(root, 'recipes')), getDocs(collection(root, 'scheduleExceptions')), getDocs(collection(root, 'recurringFoods'))]);
    const response = await fetch(dispatchUrl, { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, brief: { weekStart, season, dinnerTarget: settingsDoc.data()?.dinnerTarget ?? 5, goals: goalsDoc.exists() ? goalsDoc.data() : DEFAULT_FOOD_GOALS, inventory: inventorySnap.docs.map((entry) => entry.data()).filter((item) => item.quantity > 0).map(({ name, quantity, unit }) => ({ name, quantity, unit })).slice(0, 30), existingRecipes: recipesSnap.docs.map((entry) => entry.data().name).filter(Boolean).slice(0, 60), recurringRoutines: routinesSnap.docs.map((entry) => entry.data()).filter((routine) => routine.active !== false).map(({ name, person, mealType, timesPerWeek, weekdays, recipeId }) => ({ name, person, mealType, timesPerWeek, weekdays, recipeId })).slice(0, 20), scheduleExceptions: scheduleSnap.docs.map((entry) => entry.data()).filter((item) => item.date >= weekStart).slice(0, 20), storePolicy: 'Prefer Costco for durable bulk staples. Prefer King Soopers for produce and perishable items.' } }) });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(detail?.error || 'Could not generate the AI plan.');
    }
    const data = await response.json() as { plan?: { headline?: string; summary?: string; recipes?: Array<Record<string, unknown>>; slots?: Array<Record<string, unknown>> } };
    if (!data.plan?.recipes?.length || (mode === 'full_plan' && !data.plan.slots?.length)) throw new Error('AI returned an incomplete plan. Please retry.');
    const batch = writeBatch(db);
    const recipeIds = new Map<string, string>();
    const recipes = data.plan.recipes.slice(0, 5).map((raw, index) => {
      const name = String(raw.name || `New recipe ${index + 1}`); const id = `ai-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}-${index}`;
      recipeIds.set(name.toLowerCase(), id);
      const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null).map((item) => ({ itemId: String(item.name || 'ingredient').toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: String(item.name || 'Ingredient'), quantity: Number(item.quantity) || 1, unit: String(item.unit || 'each'), store: String(item.store).toLowerCase().includes('costco') ? 'costco' as const : 'king_soopers' as const })) : [];
      const recipe = { id, name, mealType: 'dinner' as const, description: String(raw.description || ''), cuisine: 'AI plan', protein: 'Mixed', method: 'Cook', effortMinutes: Math.max(5, Number(raw.effortMinutes) || 30), servings: 2, lateNightSuitable: Number(raw.effortMinutes) <= 25, tags: ['ai suggestion'], ingredients, instructions: Array.isArray(raw.instructions) ? raw.instructions.map(String) : [], favorite: false, rating: 3, note: '', color: 'sage' };
      batch.set(doc(root, 'aiRecipeProposals', id.slice(3)), { status: 'proposed', whyItFits: 'Generated from your current planner instructions.', inventoryHighlights: [], seasonalHighlights: [], recipe, model: 'gpt-5-mini', createdAt: serverTimestamp() }); return recipe;
    });
    if (mode === 'full_plan') {
      const slots = (data.plan.slots || []).slice(0, 14).map((raw) => ({ date: String(raw.date), mealType: raw.mealType === 'lunch' ? 'lunch' : 'dinner', recipeId: raw.recipeName ? recipeIds.get(String(raw.recipeName).toLowerCase()) || null : null, title: String(raw.title || 'Flexible meal'), servings: Math.max(0, Number(raw.servings) || 2), kind: ['recipe', 'leftovers', 'eat_out', 'skip'].includes(String(raw.kind)) ? String(raw.kind) : 'recipe', rationale: String(raw.rationale || '') }));
      batch.set(doc(root, 'aiPlanningBriefs', weekStart), { weekStart, headline: data.plan.headline || 'Your weekly plan', summary: data.plan.summary || '', recommendations: [], model: 'gpt-5-mini', createdAt: serverTimestamp() });
      batch.set(doc(root, 'aiWeeklyDrafts', weekStart), { weekStart, headline: data.plan.headline || 'Your weekly plan', summary: data.plan.summary || '', slots, recipes, warnings: [], status: 'proposed', model: 'gpt-5-mini', createdAt: serverTimestamp() });
    }
    batch.update(requestRef, { status: 'completed', completedAt: serverTimestamp() });
    await batch.commit();
  } catch (error) {
    await updateDoc(requestRef, { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Could not start generation.', completedAt: serverTimestamp() });
    throw error;
  }
}

export const requestAiPlan = (weekStart: string, season: string, householdId?: string) => requestAiRecipes(weekStart, season, householdId, 'full_plan');

export function subscribeToAiRequests(householdId: string | undefined, weekStart: string, onChange: (request: AiGenerationRequest | null) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(null); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', household(householdId), 'aiGenerationRequests'), (snapshot) => {
    const requests = snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }) as AiGenerationRequest)
      .filter((request) => request.weekStart === weekStart)
      .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
    onChange(requests[0] || null);
  }, onError);
}

export function subscribeToAiPlanningBrief(householdId: string | undefined, weekStart: string, onChange: (brief: AiPlanningBrief | null) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(null); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'households', household(householdId), 'aiPlanningBriefs', weekStart), (snapshot) => {
    onChange(snapshot.exists() ? snapshot.data() as AiPlanningBrief : null);
  }, onError);
}

export function subscribeToAiWeeklyDraft(householdId: string | undefined, weekStart: string, onChange: (draft: AiWeeklyDraft | null) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(null); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(doc(db, 'households', household(householdId), 'aiWeeklyDrafts', weekStart), (snapshot) => {
    onChange(snapshot.exists() ? snapshot.data() as AiWeeklyDraft : null);
  }, onError);
}

export async function reviewAiWeeklyDraft(weekStart: string, status: 'applied' | 'dismissed', householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  await updateDoc(doc(db, 'households', household(householdId), 'aiWeeklyDrafts', weekStart), { status, reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() });
}

export async function approveAiProposal(proposal: AiRecipeProposal, householdId?: string) {
  await createRecipe(proposal.recipe, householdId);
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  await updateDoc(doc(db, 'households', household(householdId), 'aiRecipeProposals', proposal.id), { status: 'approved', reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() });
}

export async function rejectAiProposal(id: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  await updateDoc(doc(db, 'households', household(householdId), 'aiRecipeProposals', id), { status: 'rejected', reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() });
}
