'use client';

import { useEffect, useState } from 'react';
import {
  observeHouseholdSession,
  type HouseholdSession,
} from '@/lib/auth/household-auth';
import { usesFirebaseBackend } from '@/lib/firebase/client';

type AuthState = {
  loading: boolean;
  session: HouseholdSession | null;
  error: string;
};

export function useHouseholdSession(): AuthState {
  const firebaseEnabled = usesFirebaseBackend();
  const [state, setState] = useState<AuthState>({
    loading: firebaseEnabled,
    session: null,
    error: '',
  });

  useEffect(() => {
    if (!firebaseEnabled) return;

    return observeHouseholdSession(
      (session) => setState({ loading: false, session, error: '' }),
      (error) =>
        setState({ loading: false, session: null, error: error.message }),
    );
  }, [firebaseEnabled]);

  return state;
}
