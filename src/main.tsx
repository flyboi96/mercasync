import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '@/app/page';
import '@/app/globals.css';
import '@/app/theme.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('MercaSync could not find its application root.');
}

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    }
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => registration.update())
      .catch(() => {
        // The app remains usable online if offline caching cannot initialize.
      });
  });
}
