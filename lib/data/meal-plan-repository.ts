'use client';

import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { mealPlanDays, mealPlanFingerprint } from '@/lib/domain/meal-plan';
import type { PlanningDay } from '@/lib/domain/schedule';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

export function subscribeToSavedMealPlan(
  weekStart: string,
  householdId: string | undefined,
  onChange: (fingerprint: string | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) return () => undefined;
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, 'households', householdId || firebaseHouseholdId(), 'mealPlans', weekStart),
    (snapshot) => onChange(snapshot.exists() ? snapshot.data().sourceFingerprint : null),
    onError,
  );
}

export async function saveMealPlan(week: PlanningDay[], householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before saving the plan.');
  const weekStart = week[0]?.date;
  if (!weekStart) throw new Error('There is no week to save.');
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealPlans', weekStart), {
    weekStart,
    days: mealPlanDays(week),
    sourceFingerprint: mealPlanFingerprint(week),
    savedBy: auth.currentUser.uid,
    savedAt: serverTimestamp(),
  });
}
