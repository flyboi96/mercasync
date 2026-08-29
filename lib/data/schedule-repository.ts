'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  firebaseHouseholdId,
  getFirebaseServices,
  usesFirebaseBackend,
} from '@/lib/firebase/client';
import type {
  ScheduleException,
  ScheduleExceptionKind,
  PersonId,
} from '@/lib/domain/schedule';

export type CreateScheduleException = {
  personId: PersonId;
  kind: ScheduleExceptionKind;
  date: string;
  endDate?: string | null;
  title: string;
  location?: string | null;
};

function mapFirestoreException(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ScheduleException {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    personId: data.personId,
    kind: data.kind,
    date: data.date,
    endDate: data.endDate || null,
    title: data.title,
    location: data.location || null,
    createdAt: data.createdAt?.toMillis?.(),
  };
}

export function subscribeToScheduleExceptions(
  householdId: string | undefined,
  onChange: (exceptions: ScheduleException[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (usesFirebaseBackend()) {
    const { db } = getFirebaseServices();
    const resolvedHouseholdId = householdId || firebaseHouseholdId();
    return onSnapshot(
      collection(
        db,
        'households',
        resolvedHouseholdId,
        'scheduleExceptions',
      ),
      (snapshot) => {
        onChange(
          snapshot.docs
            .map(mapFirestoreException)
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) ||
                (a.createdAt || 0) - (b.createdAt || 0),
            ),
        );
      },
      (error) => onError(error),
    );
  }

  const controller = new AbortController();
  fetch('/api/home', { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error('Could not load schedule exceptions.');
      return response.json();
    })
    .then((data) => onChange(data.events || []))
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onError(error instanceof Error ? error : new Error('Could not load schedule.'));
    });
  return () => controller.abort();
}

export async function createScheduleException(
  input: CreateScheduleException,
  householdId?: string,
): Promise<ScheduleException> {
  if (usesFirebaseBackend()) {
    const { auth, db } = getFirebaseServices();
    if (!auth.currentUser) throw new Error('Sign in before changing the schedule.');
    const resolvedHouseholdId = householdId || firebaseHouseholdId();
    const reference = await addDoc(
      collection(
        db,
        'households',
        resolvedHouseholdId,
        'scheduleExceptions',
      ),
      {
        ...input,
        endDate: input.endDate || null,
        location: input.location || null,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      },
    );
    return { id: reference.id, ...input };
  }

  const response = await fetch('/api/home', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Could not save the schedule exception.');
  return response.json();
}

export async function updateScheduleException(
  id: string,
  input: CreateScheduleException,
  householdId?: string,
) {
  if (!usesFirebaseBackend()) throw new Error('Schedule editing requires Firebase.');
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'scheduleExceptions', id), {
    ...input,
    endDate: input.endDate || null,
    location: input.location || null,
  });
}

export async function deleteScheduleException(id: string, householdId?: string) {
  if (!usesFirebaseBackend()) throw new Error('Schedule editing requires Firebase.');
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, 'households', householdId || firebaseHouseholdId(), 'scheduleExceptions', id));
}
