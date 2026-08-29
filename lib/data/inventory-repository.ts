'use client';

import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp, type Unsubscribe } from 'firebase/firestore';
import { inventoryDocumentId, STARTER_INVENTORY, type InventoryItem } from '@/lib/domain/inventory';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function inventoryCollection(householdId?: string) {
  const { db } = getFirebaseServices();
  return collection(db, 'households', householdId || firebaseHouseholdId(), 'inventory');
}

function timestampToIso(value: Timestamp | undefined) {
  return value?.toDate().toISOString() || null;
}

export function subscribeToInventory(
  householdId: string | undefined,
  onChange: (items: InventoryItem[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!usesFirebaseBackend()) {
    onChange(STARTER_INVENTORY);
    return () => undefined;
  }
  let bootstrapping = false;
  return onSnapshot(inventoryCollection(householdId), async (snapshot) => {
    if (snapshot.empty && !bootstrapping) {
      bootstrapping = true;
      try { await seedStarterInventory(householdId); }
      catch (error) { onError(error instanceof Error ? error : new Error('Could not create starter inventory.')); }
      return;
    }
    onChange(snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        itemId: data.itemId,
        name: data.name,
        quantity: data.quantity,
        unit: data.unit,
        confidence: data.confidence,
        lastConfirmedAt: timestampToIso(data.lastConfirmedAt),
      } satisfies InventoryItem;
    }).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
}

async function seedStarterInventory(householdId?: string) {
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before creating inventory.');
  const resolvedHouseholdId = householdId || firebaseHouseholdId();
  const batch = writeBatch(db);
  STARTER_INVENTORY.forEach((item) => batch.set(
    doc(db, 'households', resolvedHouseholdId, 'inventory', inventoryDocumentId(item)),
    { ...item, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() },
  ));
  await batch.commit();
}

export async function confirmInventoryItem(item: InventoryItem, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before confirming inventory.');
  await updateDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)), {
    confidence: 100,
    lastConfirmedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function setInventoryQuantity(item: InventoryItem, quantity: number, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Inventory quantity must be zero or greater.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before correcting inventory.');
  await updateDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)), {
    quantity: Math.round(quantity * 100) / 100,
    confidence: 100,
    lastConfirmedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function addInventoryItem(name: string, quantity: number, unit: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const cleanName = name.trim();
  const cleanUnit = unit.trim().toLowerCase();
  if (!cleanName || cleanName.length > 120 || !cleanUnit || !Number.isFinite(quantity) || quantity < 0) throw new Error('Enter a valid item, quantity, and unit.');
  const item: InventoryItem = { itemId: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: cleanName, quantity: Math.round(quantity * 100) / 100, unit: cleanUnit, confidence: 100, lastConfirmedAt: null };
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before adding inventory.');
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)), { ...item, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}
