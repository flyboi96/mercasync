'use client';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  firebaseHouseholdId,
  getFirebaseServices,
} from '@/lib/firebase/client';

export type PersonId = 'alex' | 'nathalia';

export type HouseholdMember = {
  uid: string;
  personId: PersonId;
  displayName: string;
  color: string;
};

export type HouseholdSession = {
  user: User;
  householdId: string;
  member: HouseholdMember;
};

export function observeHouseholdSession(
  onChange: (session: HouseholdSession | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { auth, db } = getFirebaseServices();

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onChange(null);
      return;
    }

    try {
      const householdId = firebaseHouseholdId();
      const memberSnapshot = await getDoc(
        doc(db, 'households', householdId, 'members', user.uid),
      );

      if (!memberSnapshot.exists()) {
        await signOut(auth);
        throw new Error('This account is not a member of the MercaSync household.');
      }

      const data = memberSnapshot.data() as Omit<HouseholdMember, 'uid'>;
      onChange({
        user,
        householdId,
        member: { uid: user.uid, ...data },
      });
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Could not load household.'));
    }
  });
}

export async function signInToHousehold(email: string, password: string) {
  const { auth } = getFirebaseServices();
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutOfHousehold() {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}
