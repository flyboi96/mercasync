# MercaSync

Alex and Nathalia’s shared household planner for schedules, recipes, inventory, meal planning, and synchronized grocery runs.

## Open the app

### [Launch MercaSync](https://alex-nathalia-at-home.corbin-xela.chatgpt.site)

The app is designed mobile-first and can be installed on an iPhone from Safari using **Share → Add to Home Screen**. No App Store purchase or subscription is required.

## Current development slice

- Seven-day shared schedule and dinner plan
- Recipe favorites, ratings, notes, and history surface
- Inventory estimates with confidence levels
- Separate King Soopers and biweekly Costco lists
- Durable grocery completion state backed by the household database
- Installable mobile web app shell with iPhone safe-area support

The product definition and automation rules live in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Local development

```bash
npm ci
npm run dev
```

The current D1-backed API also needs `drizzle/0000_rainy_dark_beast.sql` applied to the local Sites database. This legacy setup remains available while features move to Firebase.

### Firebase emulator workflow

Firebase mode is explicit and emulator-first. It never connects to a production Firebase project unless `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false` and a real Firebase web-app configuration is supplied.

Requirements: Node 22 or 24 and Java 11 or newer.

```bash
npm run firebase:emulators
npm run firebase:seed
npm run firebase:verify
npm run dev:firebase
```

The local seed creates only emulator data and prints credentials for the two local test accounts. Production accounts and household membership must be provisioned administratively; the app does not offer public registration.

Copy `.env.example` to `.env.local` when you need to override the defaults. Firebase web configuration may be exposed to the browser, but service-account keys and administrative credentials must never be placed in `NEXT_PUBLIC_*` variables or committed.

See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the audited functionality boundary and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for migration decisions.
