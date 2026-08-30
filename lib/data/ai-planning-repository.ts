'use client';

import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
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

export async function requestAiRecipes(weekStart: string, season: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in first.');
  const requestRef = await addDoc(collection(db, 'households', household(householdId), 'aiGenerationRequests'), { weekStart, season, scope: 'full_plan', status: 'pending', requestedBy: auth.currentUser.uid, requestedAt: serverTimestamp() });
  try {
    const dispatchUrl = process.env.NEXT_PUBLIC_AI_DISPATCH_URL;
    if (!dispatchUrl) throw new Error('Immediate AI dispatch is not configured.');
    const response = await fetch(dispatchUrl, { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }) });
    if (!response.ok) throw new Error('Could not start the AI generation worker.');
  } catch (error) {
    await updateDoc(requestRef, { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Could not start generation.', completedAt: serverTimestamp() });
    throw error;
  }
}

export const requestAiPlan = requestAiRecipes;

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
