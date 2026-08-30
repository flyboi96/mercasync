'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import type { PlanningDay } from '@/lib/domain/schedule';
import type { MealOverride } from '@/lib/domain/meal-override';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

export function subscribeToMealOverrides(householdId: string | undefined, onChange: (items: MealOverride[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange([]); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides'), (snapshot) => onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as MealOverride)), onError);
}

export async function saveMealOverride(override: Omit<MealOverride, 'id'>, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before changing a meal.');
  const id = override.mealType === 'lunch' ? `${override.date}--lunch` : override.date;
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides', id), { ...override, mealType: override.mealType || 'dinner', updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function clearMealOverride(date: string, mealType: 'lunch' | 'dinner' = 'dinner', householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides', mealType === 'lunch' ? `${date}--lunch` : date));
}

export async function movePlannedMeal(day: PlanningDay, targetDate: string, mealType: 'lunch' | 'dinner', householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const planned = mealType === 'lunch' ? day.lunch : day.meal;
  if (!planned.recipeId || planned.servings <= 0 || targetDate === day.date) throw new Error('Choose a different day for a planned recipe.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before moving a meal.');
  const root = collection(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides');
  const idFor = (date: string) => mealType === 'lunch' ? `${date}--lunch` : date;
  const common = { mealType, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(doc(root, idFor(day.date)), { date: day.date, kind: 'skip', recipeId: null, servings: 0, ...common });
  batch.set(doc(root, idFor(targetDate)), { date: targetDate, kind: 'recipe', recipeId: planned.recipeId, servings: planned.servings, ...common });
  await batch.commit();
}
