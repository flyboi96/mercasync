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
  title
  location
  createdBy
  createdAt
```

Firestore rules authorize reads and writes by checking the signed-in UID against the household's `memberIds`. Clients cannot add themselves to a household or change membership.

## Schedule planning boundary

Schedule expansion and dinner adaptation are pure domain rules. The UI supplies a seven-day date range plus persisted exceptions and receives derived daily availability, diner count, effort, servings, and an explanation. This keeps planning deterministic and testable and prevents either Firebase or D1 details from leaking into meal-planning code.

Normal days mean both people are home. Exceptions override that baseline for one person and date. Away and work-trip exceptions remove that diner. Late shifts keep the diner but reduce effort and favor leftovers or fast meals. Home, day-off, and holiday overrides restore normal availability.

## Deferred hosting decision

Firebase deployment is deliberately deferred until local Auth and Firestore workflows pass. The current app uses Vinext and Cloudflare-specific build plugins. Firebase's current guidance recommends App Hosting for full-stack Next.js applications, while classic Hosting is best suited to static assets unless dynamic work is delegated. Before adding GitHub Actions, the application must either have a verified static Firebase Hosting build or adopt a supported full-stack Firebase target. No current Sites deployment is removed while that decision is validated.
