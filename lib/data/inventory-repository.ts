'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp, type Unsubscribe } from 'firebase/firestore';
import { inventoryDocumentId, STARTER_INVENTORY, type InventoryItem } from '@/lib/domain/inventory';
import { canonicalItemId, normalizeUnit } from '@/lib/domain/units';
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
  return onSnapshot(inventoryCollection(householdId), (snapshot) => {
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
    }).filter((item) => item.quantity > 0).sort((a, b) => a.name.localeCompare(b.name)));
  }, onError);
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

export async function confirmInventoryItems(items: InventoryItem[], householdId?: string) {
  if (!usesFirebaseBackend() || items.length === 0) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before confirming inventory.');
  const batch = writeBatch(db);
  items.forEach((item) => batch.update(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)), {
    confidence: 100, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp(),
  }));
  await batch.commit();
}

export async function setInventoryQuantity(item: InventoryItem, quantity: number, householdId?: string, unit?: string) {
  if (!usesFirebaseBackend()) return;
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Inventory quantity must be zero or greater.');
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before correcting inventory.');
  const cleanUnit = normalizeUnit(unit || item.unit);
  const oldRef = doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item));
  if (quantity === 0) {
    await deleteDoc(oldRef);
    return;
  }
  const updated = { ...item, quantity: Math.round(quantity * 100) / 100, unit: cleanUnit };
  const nextRef = doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(updated));
  if (nextRef.path !== oldRef.path) {
    const batch = writeBatch(db);
    batch.set(nextRef, { ...updated, confidence: 100, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
    batch.delete(oldRef);
    await batch.commit();
    return;
  }
  await updateDoc(oldRef, {
    quantity: Math.round(quantity * 100) / 100,
    unit: cleanUnit,
    confidence: 100,
    lastConfirmedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function addInventoryItem(name: string, quantity: number, unit: string, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const cleanName = name.trim();
  const cleanUnit = normalizeUnit(unit);
  if (!cleanName || cleanName.length > 120 || !cleanUnit || !Number.isFinite(quantity) || quantity < 0) throw new Error('Enter a valid item, quantity, and unit.');
  const item: InventoryItem = { itemId: canonicalItemId(cleanName), name: cleanName, quantity: Math.round(quantity * 100) / 100, unit: cleanUnit, confidence: 100, lastConfirmedAt: null };
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before adding inventory.');
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)), { ...item, lastConfirmedAt: serverTimestamp(), updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}

export async function deleteInventoryItem(item: InventoryItem, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before deleting inventory.');
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'inventory', inventoryDocumentId(item)));
}
