# At Home: MVP product definition

## Outcome

At Home gives Alex and Nathalia one shared view of availability, meals, inventory confidence, and store-specific shopping. Its job is to ask fewer questions over time while keeping every automatic decision explainable and reversible.

## MVP

1. Shared calendar with home, late shift, work trip, day off, holiday, and away events.
2. Recipe library with ingredients, instructions, servings, star, 1–5 rating, notes, and cook history.
3. Inventory estimates by normalized ingredient, quantity, unit, confidence, last confirmation, and expiry.
4. Recurring consumption profiles that apply only when a person matches a schedule condition.
5. Weekly dinner plan for two, adjusted for actual diners and schedule constraints.
6. King Soopers weekly list and Costco biweekly list, each showing why an item was added.
7. Reconciliation: checked purchases add inventory; cooked meals subtract ingredients; skipped meals preserve inventory.
8. A small review queue only for decisions with meaningful uncertainty.

## UX

The home screen is the control plane: a seven-day household strip, next grocery run, kitchen confidence, and recurring-meal status. Secondary views progressively disclose details. Every inferred value displays confidence; every automated plan change keeps a rationale. High-frequency corrections take one tap.

## Architecture

- Responsive React/Vinext application deployed as a Cloudflare Worker.
- D1 relational database for household, calendar, recipe, inventory, plan, grocery, and transaction state.
- Server-side planning service with deterministic rules first and a future model-assisted ranking step behind a stable interface.
- Import adapters for calendar and optional Todoist data; adapters write normalized events and never own product state.
- Scheduled automation creates proposals, applies low-risk changes, and sends only exception summaries.

## Automation rules

1. Expand calendar and recurring profiles into expected diners and baseline consumption for the next 14 days.
2. Do not schedule a shared dinner unless both people are home; prefer leftovers or single-serving meals on solo and late-shift nights.
3. Rank recipes by household rating, recency diversity, schedule fit, pantry utilization, perishability, nutrition, and cuisine/texture variety.
4. Reserve inventory in expiry order. Use estimated quantity multiplied by confidence when deciding whether to buy.
5. Add the remaining ingredient delta to King Soopers unless it is a stable bulk staple, expected consumption crosses the Costco threshold, and the current week is a Costco week.
6. Run King Soopers planning each Thursday for the weekend. Run Costco planning every other Sunday for a Tuesday–Thursday shopping window.
7. When a grocery item is checked, create a purchase transaction and raise confidence. When a meal is marked cooked, create confirmed-consumption transactions. After its planned date passes without confirmation, reduce confidence rather than silently declaring consumption.
8. Ask for confirmation only when uncertainty could cause a duplicate bulk purchase, a missing core ingredient, or likely food waste.

## Incremental delivery

- Slice 1: recognizable weekly command center and durable relational model.
- Slice 2: calendar, recipe, inventory, and recurring-profile editing.
- Slice 3: deterministic plan generation, grocery delta, and reconciliation ledger.
- Slice 4: calendar import, notifications, ratings-driven learning, and optional Todoist adapter.
