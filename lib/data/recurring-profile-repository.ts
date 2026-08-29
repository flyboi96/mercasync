'use client';

import { collection, doc, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { RECURRING_PROFILES, type RecurringConsumptionProfile } from '@/lib/domain/recurring-consumption';
import { firebaseHouseholdId, getFirebaseServices, usesFirebaseBackend } from '@/lib/firebase/client';

function profilesCollection(householdId?: string) {
  const { db } = getFirebaseServices();
  return collection(db, 'households', householdId || firebaseHouseholdId(), 'recurringProfiles');
}

export function subscribeToRecurringProfiles(householdId: string | undefined, onChange: (profiles: RecurringConsumptionProfile[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!usesFirebaseBackend()) { onChange(RECURRING_PROFILES); return () => undefined; }
  let bootstrapping = false;
  return onSnapshot(profilesCollection(householdId), async (snapshot) => {
    if (snapshot.empty && !bootstrapping) {
      bootstrapping = true;
      try { await seedProfiles(householdId); } catch (error) { onError(error instanceof Error ? error : new Error('Could not create recurring routines.')); }
      return;
    }
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as RecurringConsumptionProfile).sort((a, b) => a.personId.localeCompare(b.personId)));
  }, onError);
}

async function seedProfiles(householdId?: string) {
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before creating routines.');
  const household = householdId || firebaseHouseholdId();
  const batch = writeBatch(db);
  RECURRING_PROFILES.forEach(({ id, ...profile }) => batch.set(doc(db, 'households', household, 'recurringProfiles', id), { ...profile, enabled: true, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() }));
  await batch.commit();
}

export async function saveRecurringProfile(profile: RecurringConsumptionProfile, householdId?: string) {
  if (!usesFirebaseBackend()) return;
  const { auth, db } = getFirebaseServices();
  if (!auth.currentUser) throw new Error('Sign in before changing routines.');
  const { id, ...data } = profile;
  await setDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'recurringProfiles', id), { ...data, enabled: profile.enabled !== false, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
}
