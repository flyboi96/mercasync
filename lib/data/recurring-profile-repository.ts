'use client';

import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { RECURRING_FOODS, type RecurringFood } from '@/lib/domain/recurring-consumption';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function foodsCollection(householdId?: string) {
  const { db } = getFirebaseServices();
  return collection(db, 'households', householdId || firebaseHouseholdId(), 'recurringFoods');
}

export function subscribeToRecurringProfiles(householdId: string | undefined, onChange: (foods: RecurringFood[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(RECURRING_FOODS); return () => undefined; }
  let bootstrapping = false;
  return onSnapshot(foodsCollection(householdId), async (snapshot) => {
    if (snapshot.empty && !bootstrapping) {
      bootstrapping = true;
      try { await migrateLegacyFoods(householdId); }
      catch (error) { onError(error instanceof Error ? error : new Error('Could not create recurring foods.')); }
      return;
    }
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as RecurringFood).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
}

async function migrateLegacyFoods(householdId?: string) {
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before creating recurring foods.');
  const household = householdId || firebaseHouseholdId();
  const legacy = await getDocs(collection(db, 'households', household, 'recurringProfiles'));
  const foods: RecurringFood[] = legacy.empty ? RECURRING_FOODS : legacy.docs.flatMap((entry) => {
    const profile = entry.data() as { enabled?: boolean; ingredients?: Array<{ itemId: string; name: string; quantity: number; unit: string; store: 'king_soopers' | 'costco' }> };
    return (profile.ingredients || []).map((ingredient) => ({ id: `${entry.id}-${ingredient.itemId}`, name: ingredient.name, kind: 'item' as const, timesPerWeek: 7, enabled: profile.enabled !== false, ingredient }));
  });
  const batch = writeBatch(db);
  foods.forEach(({ id, ...food }) => batch.set(doc(db, 'households', household, 'recurringFoods', id), { ...food, recipeId: food.recipeId || null, servings: food.servings || null, ingredient: food.ingredient || null, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() }));
  await batch.commit();
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
