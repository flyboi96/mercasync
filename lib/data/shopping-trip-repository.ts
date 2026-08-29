'use client';

import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

export type ShoppingTrip = { id: string; store: 'King Soopers' | 'Costco'; date: string };

export function subscribeToShoppingTrips(householdId: string | undefined, onChange: (trips: ShoppingTrip[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange([]); return () => undefined; }
  const { db } = getFirebaseServices();
  return onSnapshot(collection(db, 'households', householdId || firebaseHouseholdId(), 'shoppingTrips'), (snapshot) => onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as ShoppingTrip)), onError);
}

export async function saveShoppingTrip(store: ShoppingTrip['store'], date: string, weekStart: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser || !date) throw new Error('Choose a shopping date.');
  const id = `${weekStart}--${store === 'Costco' ? 'costco' : 'king-soopers'}`;
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'shoppingTrips', id), { store, date, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}
