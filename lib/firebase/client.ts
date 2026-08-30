'use client';

import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

export type FirebaseServices = {
  auth: Auth;
  db: Firestore;
};

let emulatorConnectionsReady = false;
let firestore: Firestore | null = null;

export function usesFirebaseBackend() {
  return process.env.NEXT_PUBLIC_DATA_BACKEND === 'firebase';
}

export function firebaseHouseholdId() {
  return process.env.NEXT_PUBLIC_FIREBASE_HOUSEHOLD_ID || 'mercasync-home';
}

function firebaseOptions(): FirebaseOptions {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const usingEmulators = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === 'true';

  if (!projectId && !usingEmulators) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for Firebase mode.');
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      `${projectId || 'demo-mercasync'}.firebaseapp.com`,
    projectId: projectId || 'demo-mercasync',
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
      '1:000000000000:web:mercasync-local',
  };
}

export function getFirebaseServices(): FirebaseServices {
  if (!usesFirebaseBackend()) {
    throw new Error('Firebase services requested while the D1 backend is active.');
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseOptions());
  const auth = getAuth(app);
  if (!firestore) {
    try {
      firestore = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      firestore = getFirestore(app);
    }
  }
  const db = firestore;

  if (
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === 'true' &&
    !emulatorConnectionsReady
  ) {
    const authHost =
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || '9099',
    );
    const firestoreHost =
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || '8080',
    );

    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    emulatorConnectionsReady = true;
  }

  return { auth, db };
}
