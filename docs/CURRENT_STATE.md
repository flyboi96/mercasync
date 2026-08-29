# MercaSync current-state audit

Audited on August 28, 2026 at commit `af6ec9c` (`main`).

## What works today

- The Vinext application builds and serves a responsive, installable web-app shell.
- The manifest, 192 px and 512 px icons, standalone display mode, iPhone safe-area padding, and mobile bottom navigation are present.
- A Cloudflare D1 migration defines people, schedule events, recipes, ingredients, inventory lots and transactions, recurring profiles, meal plans, grocery runs, and grocery items.
- `GET /api/home` seeds and reads five grocery items and four inventory estimates from D1.
- `PATCH /api/home` persists grocery checked state.
- `POST /api/home` validates and persists one-day schedule exceptions for Alex or Nathalia.
- The Calendar UI can create schedule exceptions and the Groceries UI uses optimistic updates with rollback on failure.

## What is still sample or inert

- The visible August 31–September 6 week, availability labels, dinners, colors, summary counts, date header, and “tonight” card are hard-coded.
- Saved schedule exceptions appear in a separate strip but do not change the visible schedule, servings, effort, groceries, or inventory consumption.
- Recipe favorites, ratings, notes, cooking history, and recipe details are in-memory sample content.
- Recurring breakfasts and snacks are display-only.
- Inventory confirmation and editing only show toasts.
- Grocery requirements and store assignment are seeded, not calculated. Checking a purchase does not create an inventory transaction despite the success toast.
- Plan refresh and automation timing are display-only. There is no scheduled job.
- There is no authentication, household authorization, Firebase integration, automated test suite, or CI/deployment workflow in the repository.
- There is no service worker or offline cache beyond the installable PWA manifest.

## Verification baseline

- `npm run lint`: passes.
- `npm run build`: passes; routes are `/` and `/api/home`.
- Local `/`: returns HTTP 200.
- Local `/api/home`: returns HTTP 200 after the checked-in D1 migration is manually applied.
- Fresh local development initially returns HTTP 500 from `/api/home` because no script applies `drizzle/0000_rainy_dark_beast.sql` to the local D1 database.
- `npm audit`: reports 16 advisories (4 moderate, 12 high). No automatic major-version fix was applied during this audit.

Interactive browser QA could not run during the audit because no browser backend was connected. The mobile CSS and rendered runtime were inspected, but physical-device and interactive viewport checks remain required before deployment.

## GitHub Pages deployment update

Added after the original audit:

- Authentication and schedule exceptions use Firebase in the static Pages build.
- The visible seven-day schedule, dinner servings, and dinner effort derive from
  saved schedule exceptions and are covered by domain tests.
- A separate `/mercasync/` static PWA build preserves the legacy Vinext/D1 build.
- GitHub Actions tests and builds pull requests, then deploys `main` to Pages.
- Shared recipes, deterministic schedule-aware grocery calculation, grocery-run
  completion, purchase-to-inventory reconciliation, and inventory confirmation
  are now backed by Firestore in the Pages build.
- Grocery completion synchronizes across both signed-in phones. A completed item
  adds its suggested quantity to inventory and creates a reversible purchase
  transaction.
- Inventory confidence decays by two points per day and affects how much stock is
  subtracted from shopping needs. Confirmation resets confidence to 100%.
- Inventory quantities can be corrected with quick presets or an exact amount.
- Recipe-backed lunches and dinners can be marked eaten or skipped. Eaten meals
  subtract serving-scaled ingredients, while undo restores those deductions.
- Alex's breakfast and Nathalia's snack profile now contribute to grocery needs
  only on days each person is home.
- Recurring-profile editing, adding arbitrary inventory items, and scheduled
  automation remain incomplete.

## Version 0.11 planning update

- The work calendar is now a six-row month grid. Tapping a day opens the schedule editor and exceptions are shown directly on every affected date.
- A schedule exception can cover an inclusive range. The editor includes a one-tap three-week range for work trips, and one saved record drives every affected lunch and dinner.
- The meals view is a separate seven-day calendar with lunch, dinner, shopping, and eaten/skipped controls.
- The household can choose zero through six dinners to cook for the week. The shared setting is stored in Firestore and automatically changes the meal plan and calculated grocery needs.
- Long-trip expansion, adjustable dinner selection, and month-grid boundaries are covered by domain tests.

## Version 0.12 weekly reset update

- The Plan view now starts a guided Weekend Reset that presents only inventory below 75% confidence, using four one-tap corrections plus a skip path.
- After review, the reset previews the proposed dinners, allows a final dinner-count adjustment, saves the approved plan, and opens the calculated grocery list.
- Dinner recipes are selected from the shared library by deterministic ratings, favorites, schedule fit, recent history, pantry coverage, and variety rules. Each choice includes a plain-language rationale.
- Approved plans are frozen against routine inventory and purchase updates. Schedule, dinner-count, and recipe-preference changes deliberately invalidate approval and produce a fresh draft.
- Costco cadence is a shared household setting. Costco ingredients stay at Costco during a run week and move to King Soopers during an off week so immediate needs remain purchasable.
- Planner ranking, approval invalidation, and store-cadence behavior are covered by domain tests.

## Migration boundary

The Sites/D1 deployment remains intact until Firebase reaches feature parity and data can be migrated. New product code should depend on domain types and repository interfaces rather than importing D1 or Firebase throughout the UI. During migration, D1 remains the legacy fallback and Firebase is enabled explicitly by configuration.
