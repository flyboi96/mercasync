'use client';

import { collection, doc, onSnapshot, runTransaction, serverTimestamp, type DocumentData, type DocumentSnapshot, type Unsubscribe } from 'firebase/firestore';
import { inventoryDocumentId } from '@/lib/domain/inventory';
import { mealCompletionId, mealDeductions, type MealCompletion, type MealCompletionStatus, type MealTypeKey } from '@/lib/domain/meal-reconciliation';
import type { Recipe } from '@/lib/domain/recipe';
import type { PlanningDay } from '@/lib/domain/schedule';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

export function subscribeToMealCompletions(
  householdId: string | undefined,
  onChange: (items: MealCompletion[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange([]); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', householdId || firebaseHouseholdId(), 'mealCompletions'), (snapshot) => {
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as MealCompletion));
  }, onError);
}

export async function setMealCompletion(
  day: PlanningDay,
  mealType: MealTypeKey,
  status: MealCompletionStatus | null,
  recipes: Recipe[],
  householdId?: string,
) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before reconciling a meal.');
  const resolvedHouseholdId = householdId || firebaseHouseholdId();
  const id = mealCompletionId(day.date, mealType);
  const completionRef = doc(db, 'households', resolvedHouseholdId, 'mealCompletions', id);
  const ledgerRef = doc(db, 'households', resolvedHouseholdId, 'inventoryTransactions', `${id}--consumption`);
  const planned = mealType === 'lunch' ? day.lunch : day.meal;
  const nextDeductions = status === 'cooked' ? mealDeductions(day, mealType, recipes) : [];

  await runTransaction(db, async (transaction) => {
    const completionSnapshot = await transaction.get(completionRef);
    const previous = completionSnapshot.exists() ? completionSnapshot.data() as MealCompletion : null;
    const keys = new Map<string, { itemId: string; name: string; unit: string }>();
    for (const item of [...(previous?.deductions || []), ...nextDeductions]) keys.set(inventoryDocumentId(item), item);
    const inventorySnapshots = new Map<string, DocumentSnapshot<DocumentData>>();
    for (const [key] of keys) {
      const ref = doc(db, 'households', resolvedHouseholdId, 'inventory', key);
      inventorySnapshots.set(key, await transaction.get(ref));
    }

    for (const [key, identity] of keys) {
      const ref = doc(db, 'households', resolvedHouseholdId, 'inventory', key);
      const snapshot = inventorySnapshots.get(key)!;
      const restored = (previous?.deductions || []).filter((item) => inventoryDocumentId(item) === key).reduce((sum, item) => sum + item.quantity, 0);
      const consumed = nextDeductions.filter((item) => inventoryDocumentId(item) === key).reduce((sum, item) => sum + item.quantity, 0);
      const quantity = Math.max(0, Math.round(((snapshot.data()?.quantity || 0) + restored - consumed) * 100) / 100);
      transaction.set(ref, {
        itemId: identity.itemId, name: identity.name, quantity, unit: identity.unit,
        confidence: 100, lastConfirmedAt: serverTimestamp(),
        updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp(),
      });
    }

    if (!status) {
      transaction.delete(completionRef);
      transaction.delete(ledgerRef);
      return;
    }
    const completion = {
      date: day.date, mealType, recipeId: planned.recipeId || '', recipeName: planned.title,
      servings: planned.servings, status, deductions: nextDeductions,
      completedBy: auth.currentUser!.uid, completedAt: serverTimestamp(),
    };
    transaction.set(completionRef, completion);
    if (status === 'cooked') {
      transaction.set(ledgerRef, {
        kind: 'confirmed_consumption', mealId: id, deductions: nextDeductions,
        createdBy: auth.currentUser!.uid, createdAt: serverTimestamp(),
      });
    } else transaction.delete(ledgerRef);
  });
}
