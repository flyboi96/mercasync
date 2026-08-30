import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const firebaseKeys = [
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const missing = firebaseKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `GitHub Pages build is missing Firebase web configuration: ${missing.join(', ')}`,
    );
  }

  const clientEnvironment = {
    NEXT_PUBLIC_DATA_BACKEND: 'firebase',
    NEXT_PUBLIC_FIREBASE_USE_EMULATORS: 'false',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_APP_ID: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_HOUSEHOLD_ID:
      env.NEXT_PUBLIC_FIREBASE_HOUSEHOLD_ID || 'mercasync-home',
    NEXT_PUBLIC_AI_DISPATCH_URL: env.NEXT_PUBLIC_AI_DISPATCH_URL || '',
  };

  return {
    base: '/mercasync/',
    plugins: [react()],
    css: { postcss: { plugins: [tailwindcss()] } },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    define: Object.fromEntries(
      Object.entries(clientEnvironment).map(([key, value]) => [
        `process.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
    build: {
      outDir: 'dist-pages',
      emptyOutDir: true,
    },
  };
});
