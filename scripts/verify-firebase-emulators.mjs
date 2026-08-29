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
  serverTimestamp,
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

let createdPath;

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
  createdPath = created.path;
  const saved = await getDoc(created);
  assert(saved.data()?.kind === 'late_shift', 'Schedule exception was not saved.');

  await signOut(auth);
  console.log('Firebase Auth, household membership, rules, and schedule writes passed.');
} finally {
  if (createdPath) {
    await fetch(
      `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/${createdPath}`,
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      },
    );
  }
}
