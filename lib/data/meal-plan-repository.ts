'use client';

import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { mealPlanDays, type SavedMealPlanDay } from '@/lib/domain/meal-plan';
import type { PlanningDay } from '@/lib/domain/schedule';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

export function subscribeToSavedMealPlan(
  weekStart: string,
  householdId: string | undefined,
  onChange: (plan: { sourceFingerprint: string; days: SavedMealPlanDay[] } | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) return () => undefined;
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, 'households', householdId || firebaseHouseholdId(), 'mealPlans', weekStart),
    (snapshot) => onChange(snapshot.exists() ? {
      sourceFingerprint: snapshot.data().sourceFingerprint,
      days: snapshot.data().days as SavedMealPlanDay[],
    } : null),
    onError,
  );
}

export async function saveMealPlan(week: PlanningDay[], sourceFingerprint: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before saving the plan.');
  const weekStart = week[0]?.date;
  if (!weekStart) throw new Error('There is no week to save.');
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealPlans', weekStart), {
    weekStart,
    days: mealPlanDays(week),
    sourceFingerprint,
    savedBy: auth.currentUser.uid,
    savedAt: serverTimestamp(),
  });
}

export type PlanningSettings = { dinnerTarget: number; costcoThisWeek: boolean };

export function subscribeToPlanningSettings(
  householdId: string | undefined,
  onChange: (settings: PlanningSettings) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) return () => undefined;
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, 'households', householdId || firebaseHouseholdId(), 'planningSettings', 'current'),
    (snapshot) => onChange({
      dinnerTarget: snapshot.exists() ? snapshot.data().dinnerTarget : 5,
      costcoThisWeek: snapshot.exists() ? snapshot.data().costcoThisWeek ?? false : false,
    }),
    onError,
  );
}

async function savePlanningSettings(settings: PlanningSettings, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  if (!Number.isInteger(settings.dinnerTarget) || settings.dinnerTarget < 0 || settings.dinnerTarget > 6) throw new Error('Dinner target must be between zero and six.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before changing planning settings.');
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'planningSettings', 'current'), {
    ...settings,
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export function saveDinnerTarget(target: number, costcoThisWeek: boolean, householdId?: string) {
  return savePlanningSettings({ dinnerTarget: target, costcoThisWeek }, householdId);
}

export function saveCostcoWeek(costcoThisWeek: boolean, dinnerTarget: number, householdId?: string) {
  return savePlanningSettings({ dinnerTarget, costcoThisWeek }, householdId);
}
