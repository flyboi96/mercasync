'use client';

import { doc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { dedupeGroceryRunItems, groceryNeedsFingerprint, mergeGroceryRunItems, type GroceryNeed, type GroceryRunItem } from '@/lib/domain/grocery';
import { inventoryDocumentId } from '@/lib/domain/inventory';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';
import { canonicalItemId, normalizeUnit } from '@/lib/domain/units';

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
    const existing = snapshot.exists() ? snapshot.data().items as GroceryRunItem[] : [];
    const normalizedExisting = dedupeGroceryRunItems(existing);
    if (snapshot.data()?.calculationFingerprint === fingerprint && normalizedExisting.length === existing.length) return;
    const items = mergeGroceryRunItems(needs, normalizedExisting);
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
  actualQuantity?: number,
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
    const purchasedQuantity = checked ? (actualQuantity && actualQuantity > 0 ? actualQuantity : item.quantity) : item.purchasedQuantity;
    const nextItems = items.map((candidate) => candidate.id === itemId ? {
      ...candidate,
      checked,
      purchasedQuantity: checked ? purchasedQuantity : 0,
      purchasedAt: checked ? new Date().toISOString() : null,
      reconciledAt: null,
    } : candidate);
    transaction.update(runRef, { items: nextItems, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() });
  });
}

export async function reconcileGroceryStoreTrip(weekStart: string, store: 'King Soopers' | 'Costco', householdId?: string) {
  if (!usesFirebaseBackend()) return 0;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in before finishing a shopping trip.');
  const resolvedHouseholdId = householdId || firebaseHouseholdId(); const runRef = runDocument(weekStart, resolvedHouseholdId);
  return runTransaction(db, async (transaction) => {
    const runSnapshot = await transaction.get(runRef); if (!runSnapshot.exists()) return 0;
    const items = runSnapshot.data().items as GroceryRunItem[];
    const purchased = items.filter((item) => item.store === store && item.checked && !item.reconciledAt);
    for (const item of purchased) {
      const inventoryRef = doc(db, 'households', resolvedHouseholdId, 'inventory', inventoryDocumentId(item));
      const inventory = await transaction.get(inventoryRef);
      transaction.set(inventoryRef, { itemId: item.itemId, name: item.name, quantity: Math.round(((inventory.data()?.quantity || 0) + (item.purchasedQuantity || item.quantity)) * 100) / 100, unit: item.unit, confidence: 100, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
    }
    if (purchased.length) transaction.update(runRef, { items: items.map((item) => purchased.some((candidate) => candidate.id === item.id) ? { ...item, reconciledAt: new Date().toISOString() } : item), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
    return purchased.length;
  });
}

export async function addManualGroceryItem(weekStart: string, item: { name: string; quantity: number; unit: string; store: 'King Soopers' | 'Costco'; note?: string }, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const cleanName = item.name.trim();
  if (!cleanName || !Number.isFinite(item.quantity) || item.quantity <= 0 || !item.unit.trim()) throw new Error('Enter a valid grocery item.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before adding groceries.');
  const runRef = runDocument(weekStart, householdId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(runRef);
    const existing = snapshot.exists() ? snapshot.data().items as GroceryRunItem[] : [];
    const itemId = canonicalItemId(cleanName);
    const unit = normalizeUnit(item.unit);
    const id = `manual:${item.store}:${itemId}:${unit}`;
    const manual: GroceryRunItem = { id, itemId, name: cleanName, quantity: item.quantity, unit, store: item.store, inventoryUsed: 0, sources: ['Manually added'], checked: false, purchasedQuantity: 0, purchasedAt: null, manual: true, forceBuy: true, note: item.note?.trim() || '' };
    const items = dedupeGroceryRunItems([...existing.filter((candidate) => candidate.id !== id), manual]);
    transaction.set(runRef, { weekStart, items, calculationFingerprint: snapshot.data()?.calculationFingerprint || 'manual', createdBy: snapshot.data()?.createdBy || auth.currentUser!.uid, createdAt: snapshot.data()?.createdAt || serverTimestamp(), updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() });
  });
}

export async function moveGroceryItem(weekStart: string, itemId: string, store: 'King Soopers' | 'Costco', householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before moving groceries.');
  const runRef = runDocument(weekStart, householdId);
  const { db } = getFirebaseServices();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(runRef);
    if (!snapshot.exists()) return;
    const items = (snapshot.data().items as GroceryRunItem[]).map((item) => item.id === itemId ? { ...item, store, manual: true, note: item.note || `Moved to ${store}` } : item);
    transaction.update(runRef, { items, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() });
  });
}

export async function updateGroceryQuantity(weekStart: string, itemId: string, quantity: number, householdId?: string, unit?: string) {
  if (!usesFirebaseBackend() || !Number.isFinite(quantity) || quantity <= 0) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in before editing groceries.');
  const runRef = runDocument(weekStart, householdId);
  const cleanUnit = unit?.trim() ? normalizeUnit(unit) : undefined;
  await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(runRef); if (!snapshot.exists()) return; const items = (snapshot.data().items as GroceryRunItem[]).map((item) => item.id === itemId ? { ...item, quantity, ...(cleanUnit ? { unit: cleanUnit } : {}), manual: true, note: item.note || 'Quantity adjusted' } : item); transaction.update(runRef, { items, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() }); });
}

export async function removeGroceryItem(weekStart: string, itemId: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices(); if (!auth.currentUser) throw new Error('Sign in before editing groceries.');
  const runRef = runDocument(weekStart, householdId);
  await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(runRef); if (!snapshot.exists()) return; const items = (snapshot.data().items as GroceryRunItem[]).map((item) => item.id === itemId ? { ...item, quantity: 0, manual: true, note: 'Removed this week' } : item); transaction.update(runRef, { items, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() }); });
}
