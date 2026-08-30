# MercaSync architecture decisions

## Incremental Firebase migration

MercaSync will migrate data capabilities independently instead of replacing the deployment stack in one step.

1. Keep the current Vinext, Sites, and D1 path operational.
2. Add the Firebase modular web SDK behind a small client initialization module.
3. Put authentication and schedule persistence behind product-facing modules.
4. Use the Firebase Authentication and Cloud Firestore emulators by default for local Firebase work.
5. Enable production Firebase only when the public web configuration is supplied and the backend selection is explicit.
6. Provision the two production accounts and household membership administratively; the private app will offer sign-in, not public account creation.
7. Migrate and verify existing D1 data before removing any D1 route, schema, migration, or hosting configuration.

Firebase web configuration values identify a Firebase project and are not administrative credentials. Service-account keys and Admin SDK credentials must never be included in client bundles or committed files.

## Household data model

The first household is a shared document with exactly two member profiles:

```text
households/{householdId}
  name
  timezone
  memberIds: [alexUid, nathaliaUid]

households/{householdId}/members/{uid}
  personId: alex | nathalia
  displayName
  color

households/{householdId}/scheduleExceptions/{exceptionId}
  personId
  kind
  date
  endDate: optional inclusive final date
  title
  location
  createdBy
  createdAt

households/{householdId}/inventory/{itemIdAndUnit}
  itemId
  name
  quantity
  unit
  confidence
  lastConfirmedAt

households/{householdId}/groceryRuns/{weekStart}
  calculationFingerprint
  items: [calculated need + checked purchase state]

households/{householdId}/inventoryTransactions/{weekAndItem}
  kind: purchase
  quantity
  unit
  groceryRunId

households/{householdId}/mealCompletions/{dateAndMealType}
  date
  mealType
  recipeId
  servings
  status: cooked | skipped
  deductions

households/{householdId}/planningSettings/current
  dinnerTarget: 0..6
  costcoThisWeek
  updatedBy
  updatedAt

households/{householdId}/recurringFoods/{foodId}
households/{householdId}/aiSettings/foodGoals
households/{householdId}/aiGenerationRequests/{requestId}
households/{householdId}/aiRecipeProposals/{proposalId}
  personId: alex | nathalia
  name
  enabled
  condition: home
  ingredients: [normalized ingredient and per-home-day quantity]
  updatedBy
  updatedAt
```

Firestore rules authorize reads and writes by checking the signed-in UID against the household's `memberIds`. Clients cannot add themselves to a household or change membership.

## Schedule planning boundary

Schedule expansion and dinner adaptation are pure domain rules. The UI supplies a seven-day date range plus persisted exceptions and receives derived daily availability, diner count, effort, servings, and an explanation. This keeps planning deterministic and testable and prevents either Firebase or D1 details from leaking into meal-planning code.

Normal days mean both people are home. Exceptions override that baseline for one person over one date or an inclusive date range. Away and work-trip exceptions remove that diner. Late shifts keep the diner but reduce effort and favor leftovers or fast meals. Home, day-off, and holiday overrides restore normal availability. The shared dinner target selects how many recipe dinners to cook; remaining at-home nights become leftovers while the established dinner-out night remains separate.

Recipe selection is deterministic and explainable. The planner scores shared dinner recipes using ratings, favorites, late-night suitability, recent cooking, pantry coverage, and cuisine/protein/method variety. A Weekend Reset uses current inventory to generate a draft, then saves an approved plan. The approved plan remains stable while purchases change inventory; schedule, dinner-count, or recipe-preference changes invalidate it and produce a new draft.

The shared Costco-week setting represents the household's biweekly cadence without a paid scheduler. Store assignment is calculated after recipe, routine, and inventory deltas. Costco is selected only when projected demand uses enough of a known bulk package and the product is shelf-stable, keeps for at least two weeks, or freezes well. Shelf-stable goods may justify a lower two-week package share than refrigerated food. During off weeks, immediate requirements route to King Soopers so the weekly plan never depends on a skipped bulk run. Every grocery row explains its assignment.

## Grocery and inventory reconciliation

The weekly grocery run is a Firestore snapshot of deterministic recipe needs. Refreshing a run replaces pending calculations while preserving completed purchases. Checking an item uses one Firestore transaction to mark the shared item complete, increase the matching inventory estimate, raise confidence to 100%, and record an idempotent purchase transaction. Undo reverses that quantity and removes the ledger entry.

Inventory confidence decays in the pure domain layer by two percentage points per elapsed day, with a 10% floor. Grocery subtraction uses quantity multiplied by effective confidence, so uncertain stock creates a visible shopping delta without a paid background process. Confirming an item resets its timestamp and confidence for both users.

Inventory quantity corrections are shared Firestore updates. The quick controls map to deterministic values (out, half, unchanged, or 50% more), retain an exact numeric fallback, and reset confidence because a person has just inspected the item.

Meal confirmation is stored separately from the generated plan. Marking a recipe-backed lunch or dinner cooked atomically subtracts its serving-scaled ingredients and records confirmed consumption. Marking it skipped preserves inventory; undoing cooked status restores the exact stored deductions.

Recurring consumption is shared Firestore data independent of a specific household member. Each record represents either one grocery item or one shared recipe, with an editable weekly frequency. Grocery calculations multiply the item amount or recipe servings by that frequency, then subtract estimated inventory and apply store policy. Legacy person-specific profiles are read once for a non-destructive migration and no longer drive calculations afterward.

AI planning is asynchronous and approval-gated. The public client may edit constrained household goals, create pending requests, and review advice and recipe proposals. It cannot call OpenAI or create proposals. A GitHub Actions worker holds the OpenAI and Firebase Admin credentials, assembles a bounded brief from goals, inventory, recipe names, schedule exceptions, current groceries, season, and store policy, requests schema-constrained output, and writes a weekly brief plus recipe proposals. Only an authenticated household member may approve or reject a recipe; approval copies it into the existing recipe collection. Advice is navigational and never directly mutates schedule, inventory, or shopping state.

Grocery quantities and primary store assignment remain deterministic. Package unit, projected two-week demand, shelf life, freezeability, Costco cadence, and produce freshness are evaluated in domain code. AI may explain or flag those results but cannot overwrite them. This preserves useful operation when AI is unavailable and makes every store decision inspectable and correctable.

Ingredient identity and units are normalized at data-entry and calculation boundaries. Compatible mass and volume units are converted before inventory subtraction or confirmed meal consumption; incompatible dimensions are never guessed. Meal outcome changes restore any previous deductions before applying new ones, which makes Cooked and Undo idempotent.

The Firebase web client uses persistent local caching for readable household state. The UI explicitly reports offline and reconnected states. Transactional shopping and meal-reconciliation changes require connectivity and are described that way; the interface does not claim an offline mutation was saved when Firestore could not commit it.

## Static GitHub Pages deployment

GitHub Pages is the no-billing production target. The deployed PWA is a
client-only React build that communicates directly with Firebase Authentication
and Cloud Firestore. Firestore rules, not repository visibility or client-side
route guards, enforce household authorization.

The Pages build is intentionally separate from the legacy Vinext/Sites build:

- `npm run build` continues to produce the existing Cloudflare-compatible app.
- `npm run build:pages` produces static files under `/mercasync/`.
- The Pages build always selects Firebase and refuses to build without a real
  Firebase web configuration.
- No service-account key, Admin SDK credential, account email, password, or UID
  belongs in the client build or GitHub configuration.

The D1 API and Sites configuration remain in the repository until all durable
features have a verified Firestore replacement and migration path.
