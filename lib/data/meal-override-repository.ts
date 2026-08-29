'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
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
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides', override.date), { ...override, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function clearMealOverride(date: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'mealOverrides', date));
}
