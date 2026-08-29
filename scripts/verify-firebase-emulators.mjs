import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const projectId = 'demo-mercasync';
const householdId = 'mercasync-home';
const app = initializeApp({
  apiKey: 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  appId: '1:000000000000:web:mercasync-local',
});
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const createdPaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectPermissionDenied(operation, message) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === 'permission-denied') return;
    throw error;
  }
  throw new Error(message);
}

try {
  await expectPermissionDenied(
    () => getDoc(doc(db, 'households', householdId)),
    'An unauthenticated client could read the household.',
  );

  const credential = await signInWithEmailAndPassword(
    auth,
    'alex@mercasync.local',
    'mercasync-local',
  );
  const member = await getDoc(
    doc(db, 'households', householdId, 'members', credential.user.uid),
  );
  assert(member.data()?.personId === 'alex', 'Alex membership was not readable.');

  const created = await addDoc(
    collection(db, 'households', householdId, 'scheduleExceptions'),
    {
      personId: 'alex',
      kind: 'late_shift',
      date: '2099-01-01',
      title: 'Emulator verification',
      location: null,
      createdBy: credential.user.uid,
      createdAt: serverTimestamp(),
    },
  );
  createdPaths.push(created.path);
  const saved = await getDoc(created);
  assert(saved.data()?.kind === 'late_shift', 'Schedule exception was not saved.');

  const inventoryRef = doc(db, 'households', householdId, 'inventory', 'test-item--each');
  await setDoc(inventoryRef, {
    itemId: 'test-item', name: 'Test item', quantity: 1, unit: 'each', confidence: 50,
    lastConfirmedAt: serverTimestamp(), updatedBy: credential.user.uid, updatedAt: serverTimestamp(),
  });
  createdPaths.push(inventoryRef.path);
  const groceryRef = doc(db, 'households', householdId, 'groceryRuns', '2099-01-04');
  const groceryItem = {
    id: 'king_soopers:test-item:each', itemId: 'test-item', name: 'Test item',
    quantity: 2, unit: 'each', store: 'King Soopers', inventoryUsed: 0,
    sources: ['Verification'], checked: false, purchasedQuantity: 0, purchasedAt: null,
  };
  await setDoc(groceryRef, {
    weekStart: '2099-01-04', items: [groceryItem], calculationFingerprint: 'verification',
    createdBy: credential.user.uid, createdAt: serverTimestamp(),
    updatedBy: credential.user.uid, updatedAt: serverTimestamp(),
  });
  createdPaths.push(groceryRef.path);
  const transactionRef = doc(db, 'households', householdId, 'inventoryTransactions', 'verification-purchase');
  await runTransaction(db, async (transaction) => {
    const inventory = await transaction.get(inventoryRef);
    transaction.update(inventoryRef, {
      quantity: inventory.data().quantity + 2, confidence: 100,
      lastConfirmedAt: serverTimestamp(), updatedBy: credential.user.uid, updatedAt: serverTimestamp(),
    });
    transaction.update(groceryRef, {
      items: [{ ...groceryItem, checked: true, purchasedQuantity: 2, purchasedAt: new Date().toISOString() }],
      updatedBy: credential.user.uid, updatedAt: serverTimestamp(),
    });
    transaction.set(transactionRef, {
      kind: 'purchase', itemId: 'test-item', name: 'Test item', quantity: 2, unit: 'each',
      groceryRunId: '2099-01-04', groceryItemId: groceryItem.id,
      createdBy: credential.user.uid, createdAt: serverTimestamp(),
    });
  });
  createdPaths.push(transactionRef.path);
  assert((await getDoc(inventoryRef)).data()?.quantity === 3, 'Purchase did not increase inventory.');

  await signOut(auth);
  console.log('Firebase Auth, household membership, schedule, grocery, and inventory rules passed.');
} finally {
  for (const createdPath of createdPaths.reverse()) {
    await fetch(
      `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/${createdPath}`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      },
    );
  }
}
