'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { LEGACY_STARTER_FOOD_IDS, RECURRING_FOODS, type RecurringFood } from '@/lib/domain/recurring-consumption';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function foodsCollection(householdId?: string) {
  const { db } = getFirebaseServices();
  return collection(db, 'households', householdId || firebaseHouseholdId(), 'recurringFoods');
}

export function subscribeToRecurringProfiles(householdId: string | undefined, onChange: (foods: RecurringFood[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(RECURRING_FOODS); return () => undefined; }
  return onSnapshot(foodsCollection(householdId), async (snapshot) => {
    const obsolete = snapshot.docs.filter((entry) => LEGACY_STARTER_FOOD_IDS.has(entry.id) && !entry.data().person && entry.data().timesPerWeek === 7);
    if (obsolete.length) {
      const { db } = getFirebaseServices(); const batch = writeBatch(db); obsolete.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
      return;
    }
    if (snapshot.empty) { onChange([]); return; }
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as RecurringFood).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
}

export async function saveRecurringProfile(food: RecurringFood, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before changing recurring foods.');
  const { id, ...data } = food;
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recurringFoods', id), { ...data, recipeId: food.recipeId || null, servings: food.servings || null, ingredient: food.ingredient || null, enabled: food.enabled !== false, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function deleteRecurringFood(id: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recurringFoods', id));
}
