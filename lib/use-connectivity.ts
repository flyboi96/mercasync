'use client';

import { useEffect, useState } from 'react';

export function useConnectivity() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    const goOnline = () => { setOnline(true); setReconnected(true); window.setTimeout(() => setReconnected(false), 3500); };
    const goOffline = () => { setOnline(false); setReconnected(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  return { online, reconnected };
}
