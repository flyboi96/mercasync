# MercaSync

Alex and Nathalia’s shared household planner for schedules, recipes, inventory, meal planning, and synchronized grocery runs.

## Open the app

### [Launch MercaSync](https://flyboi96.github.io/mercasync/)

The app is designed mobile-first and can be installed on an iPhone from Safari using **Share → Add to Home Screen**. No App Store purchase or subscription is required.

## Current development slice

- Separate month-style work calendar and weekly meal calendar
- Multi-day schedule exceptions, including a one-tap three-week trip range
- Shared weekly dinner-count control that immediately adjusts the plan and groceries
- Five-minute Weekend Reset that confirms only uncertain inventory, previews the generated menu, and opens a finished shopping list
- Explainable recipe ranking using ratings, favorites, recent history, schedule fit, pantry coverage, and variety
- Approved meal plans stay stable while shopping; schedule or preference changes intentionally reopen planning
- Shared biweekly Costco switch that routes immediate needs to King Soopers on off weeks
- Bulk-aware store optimization using projected demand, real package sizes, shelf life, and freezer suitability
- Shared editing for Alex's breakfast and Nathalia's snack quantities, including pause controls
- Real inventory creation for foods already at home
- Tap any dinner in Plan or Calendar to cook another recipe, use leftovers, eat out, or skip it; servings and groceries update together
- Add shared recipes with ingredients, steps, serving size, and an explicit Costco preference for durable bulk ingredients
- Add off-plan grocery items, move any item between stores, and choose exact King Soopers and Costco dates shown on both calendars
- Recipe favorites, ratings, notes, and history surface
- Shared inventory estimates with confirmation dates and automatic confidence decay
- One-tap inventory corrections with an exact quantity fallback
- Schedule-aware King Soopers and biweekly Costco lists
- Durable grocery completion that synchronizes both phones and reconciles purchases into inventory
- Cooked/skipped meal confirmation with reversible inventory consumption
- Alex's home breakfast and Nathalia's snacks included only when each person is home
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

Requirements: Node 22 or 24 and Java 21 or newer.

```bash
npm run firebase:emulators
npm run firebase:seed
npm run firebase:verify
npm run dev:firebase
```

The local seed creates only emulator data and prints credentials for the two local test accounts. Production accounts and household membership must be provisioned administratively; the app does not offer public registration.

Copy `.env.example` to `.env.local` when you need to override the defaults. Firebase web configuration may be exposed to the browser, but service-account keys and administrative credentials must never be placed in `NEXT_PUBLIC_*` variables or committed.

See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the audited functionality boundary and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for migration decisions.

## GitHub Pages deployment

The public repository deploys a static Firebase client to GitHub Pages. The
legacy Vinext/Sites/D1 build remains available while the remaining data
features migrate.

Before the first deployment:

1. In the GitHub repository, set **Settings → Pages → Source** to **GitHub Actions**.
2. Add the five `NEXT_PUBLIC_FIREBASE_*` values listed in `.env.example` as
   repository **Actions variables** under **Settings → Secrets and variables → Actions**.
3. In Firebase Authentication, add `flyboi96.github.io` to **Authorized domains**.

Pushes to `main` then test, build, and deploy `dist-pages`. Pull requests run
the same checks without publishing. Build locally with `npm run build:pages`
and preview the exact static output with `npm run preview:pages`.
