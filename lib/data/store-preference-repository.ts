'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import type { StorePreference } from '@/lib/domain/store-preference';
import { canonicalItemId, normalizeUnit } from '@/lib/domain/units';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

const resolvedHousehold = (householdId?: string) => householdId || firebaseHouseholdId();

export function subscribeToStorePreferences(householdId: string | undefined, onChange: (preferences: StorePreference[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange([]); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', resolvedHousehold(householdId), 'storePreferences'), (snapshot) => {
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as StorePreference).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
}

export async function saveStorePreference(preference: Omit<StorePreference, 'id'>, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before saving store preferences.');
  const itemId = canonicalItemId(preference.itemId || preference.name);
  await setDoc(doc(db, 'households', resolvedHousehold(householdId), 'storePreferences', itemId), {
    ...preference,
    itemId,
    packageUnit: preference.packageUnit ? normalizeUnit(preference.packageUnit) : null,
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStorePreference(itemId: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', resolvedHousehold(householdId), 'storePreferences', canonicalItemId(itemId)));
}
