'use client';

import { doc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { groceryNeedsFingerprint, mergeGroceryRunItems, type GroceryNeed, type GroceryRunItem } from '@/lib/domain/grocery';
import { inventoryDocumentId } from '@/lib/domain/inventory';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function runDocument(weekStart: string, householdId?: string) {
  const { db } = getFirebaseServices();
  return doc(db, 'households', householdId || firebaseHouseholdId(), 'groceryRuns', weekStart);
}

export function subscribeToGroceryRun(
  weekStart: string,
  householdId: string | undefined,
  onChange: (items: GroceryRunItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) return () => undefined;
  return onSnapshot(runDocument(weekStart, householdId), (snapshot) => {
    onChange(snapshot.exists() ? snapshot.data().items as GroceryRunItem[] : []);
  }, onError);
}

export async function syncGroceryRun(needs: GroceryNeed[], weekStart: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before syncing groceries.');
  const runRef = runDocument(weekStart, householdId);
  const fingerprint = groceryNeedsFingerprint(needs);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(runRef);
    if (snapshot.data()?.calculationFingerprint === fingerprint) return;
    const existing = snapshot.exists() ? snapshot.data().items as GroceryRunItem[] : [];
    const items = mergeGroceryRunItems(needs, existing);
    transaction.set(runRef, {
      weekStart,
      items,
      calculationFingerprint: fingerprint,
      createdBy: snapshot.data()?.createdBy || auth.currentUser!.uid,
      createdAt: snapshot.data()?.createdAt || serverTimestamp(),
      updatedBy: auth.currentUser!.uid,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setGroceryItemPurchased(
  weekStart: string,
  itemId: string,
  checked: boolean,
  householdId?: string,
) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before updating groceries.');
  const resolvedHouseholdId = householdId || firebaseHouseholdId();
  const runRef = runDocument(weekStart, resolvedHouseholdId);
  await runTransaction(db, async (transaction) => {
    const runSnapshot = await transaction.get(runRef);
    if (!runSnapshot.exists()) throw new Error('The shared grocery run is not ready.');
    const items = runSnapshot.data().items as GroceryRunItem[];
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.checked === checked) return;
    const inventoryRef = doc(db, 'households', resolvedHouseholdId, 'inventory', inventoryDocumentId(item));
    const purchaseRef = doc(db, 'households', resolvedHouseholdId, 'inventoryTransactions', `${weekStart}--${inventoryDocumentId(item)}`);
    const inventorySnapshot = await transaction.get(inventoryRef);
    const currentQuantity = inventorySnapshot.data()?.quantity || 0;
    const purchasedQuantity = checked ? item.quantity : item.purchasedQuantity;
    const nextQuantity = Math.max(0, Math.round((currentQuantity + (checked ? purchasedQuantity : -purchasedQuantity)) * 100) / 100);
    const nextItems = items.map((candidate) => candidate.id === itemId ? {
      ...candidate,
      checked,
      purchasedQuantity: checked ? purchasedQuantity : 0,
      purchasedAt: checked ? new Date().toISOString() : null,
    } : candidate);
    transaction.update(runRef, { items: nextItems, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() });
    transaction.set(inventoryRef, {
      itemId: item.itemId,
      name: item.name,
      quantity: nextQuantity,
      unit: item.unit,
      confidence: checked ? 100 : (inventorySnapshot.data()?.confidence || 75),
      lastConfirmedAt: checked ? serverTimestamp() : (inventorySnapshot.data()?.lastConfirmedAt || serverTimestamp()),
      updatedBy: auth.currentUser!.uid,
      updatedAt: serverTimestamp(),
    });
    if (checked) {
      transaction.set(purchaseRef, {
        kind: 'purchase', itemId: item.itemId, name: item.name, quantity: purchasedQuantity,
        unit: item.unit, groceryRunId: weekStart, groceryItemId: item.id,
        createdBy: auth.currentUser!.uid, createdAt: serverTimestamp(),
      });
    } else {
      transaction.delete(purchaseRef);
    }
  });
}
