"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createScheduleException,
  deleteScheduleException,
  subscribeToScheduleExceptions,
  updateScheduleException,
} from "@/lib/data/schedule-repository";
import {
  saveCostcoWeek,
  saveDinnerTarget,
  saveMealPlan,
  subscribeToPlanningSettings,
  subscribeToSavedMealPlan,
} from "@/lib/data/meal-plan-repository";
import {
  clearMealOverride,
  movePlannedMeal,
  saveMealOverride,
  subscribeToMealOverrides,
} from "@/lib/data/meal-override-repository";
import {
  createRecipe,
  deleteRecipe,
  subscribeToRecipes,
  updateRecipe,
  updateRecipePreferences,
} from "@/lib/data/recipe-repository";
import {
  addInventoryItem,
  confirmInventoryItem,
  confirmInventoryItems,
  setInventoryQuantity,
  subscribeToInventory,
} from "@/lib/data/inventory-repository";
import {
  deleteStorePreference,
  saveStorePreference,
  subscribeToStorePreferences,
} from "@/lib/data/store-preference-repository";
import {
  deleteRecurringFood,
  saveRecurringProfile,
  subscribeToRecurringProfiles,
} from "@/lib/data/recurring-profile-repository";
import {
  addManualGroceryItem,
  moveGroceryItem,
  removeGroceryItem,
  setGroceryItemPurchased,
  subscribeToGroceryRun,
  syncGroceryRun,
  updateGroceryQuantity,
} from "@/lib/data/grocery-repository";
import {
  saveShoppingTrip,
  subscribeToShoppingTrips,
  type ShoppingTrip,
} from "@/lib/data/shopping-trip-repository";
import {
  approveAiProposal,
  formatRecipeIdea,
  rejectAiProposal,
  requestAiPlan,
  requestAiRecipes,
  reviewAiWeeklyDraft,
  saveFoodGoals,
  subscribeToAiPlanningBrief,
  subscribeToAiProposals,
  subscribeToAiRequests,
  subscribeToAiWeeklyDraft,
  subscribeToFoodGoals,
} from "@/lib/data/ai-planning-repository";
import {
  setMealCompletion,
  subscribeToMealCompletions,
} from "@/lib/data/meal-completion-repository";
import {
  planningInputFingerprint,
  type SavedMealPlanDay,
} from "@/lib/domain/meal-plan";
import {
  applyMealOverrides,
  type DinnerOverrideKind,
  type MealOverride,
} from "@/lib/domain/meal-override";
import {
  mealCompletionId,
  type MealCompletion,
  type MealCompletionStatus,
  type MealTypeKey,
} from "@/lib/domain/meal-reconciliation";
import {
  buildGroceryNeeds,
  formatGroceryQuantity,
  groceryNeedsFingerprint,
  type GroceryRunItem,
} from "@/lib/domain/grocery";
import {
  correctedInventoryQuantity,
  effectiveInventoryConfidence,
  inventoryCategory,
  inventoryDuplicateGroups,
  STARTER_INVENTORY,
  type InventoryCorrection,
  type InventoryItem,
} from "@/lib/domain/inventory";
import type { StorePreference, StoreName } from "@/lib/domain/store-preference";
import {
  STARTER_RECIPES,
  type MealType,
  type Recipe,
} from "@/lib/domain/recipe";
import {
  RECURRING_FOODS,
  recurringFoodOccurrences,
  type RecurringFood,
} from "@/lib/domain/recurring-consumption";
import {
  buildLocalPlanningSignals,
  DEFAULT_FOOD_GOALS,
  seasonForMonth,
  type AiGenerationRequest,
  type AiPlanningBrief,
  type AiRecipeProposal,
  type HouseholdFoodGoals,
} from "@/lib/domain/ai-planning";
import { generateSmartPlan } from "@/lib/domain/smart-planner";
import { applyStoreCadence, storeRunLabel } from "@/lib/domain/store-cadence";
import {
  addLocalDays,
  buildPlanningWeek,
  calendarMonthDays,
  calendarMonthLabel,
  formatLongDate,
  localDateForTimeZone,
  planningWeekLabel,
  scheduleExceptionApplies,
  type PlanningDay,
  type ScheduleException,
  type ScheduleExceptionKind,
} from "@/lib/domain/schedule";
import {
  signInToHousehold,
  signOutOfHousehold,
} from "@/lib/auth/household-auth";
import { useHouseholdSession } from "@/lib/auth/use-household-session";
import { usesFirebaseBackend } from "@/lib/firebase/client";
import { APP_VERSION } from "@/lib/version";
import { useConnectivity } from "@/lib/use-connectivity";
import { canonicalItemId, normalizeUnit } from "@/lib/domain/units";
import {
  applyWeeklyDraft,
  type AiWeeklyDraft,
} from "@/lib/domain/weekly-draft";

type Grocery = {
  id: string;
  name: string;
  detail: string;
  store: "King Soopers" | "Costco";
  checked: boolean;
  quantity?: number;
  unit?: string;
  manual?: boolean;
  storeReason?: string;
  sources?: string[];
  section?: string;
};
const fallbackGroceries: Grocery[] = [
  {
    id: "salmon",
    name: "Wild salmon",
    detail: "1 lb · Miso bowls",
    store: "King Soopers",
    checked: false,
  },
  {
    id: "spinach",
    name: "Baby spinach",
    detail: "1 bag · Orzo + breakfast",
    store: "King Soopers",
    checked: false,
  },
  {
    id: "cucumbers",
    name: "Persian cucumbers",
    detail: "5 · Bowls + pitas",
    store: "King Soopers",
    checked: true,
  },
  {
    id: "yogurt",
    name: "Greek yogurt",
    detail: "32 oz · Low confidence at home",
    store: "Costco",
    checked: false,
  },
  {
    id: "chicken",
    name: "Chicken breast",
    detail: "6 lb · Refill freezer staple",
    store: "Costco",
    checked: false,
  },
];
const nav = [
  { label: "Plan", icon: "⌂" },
  { label: "Calendar", icon: "□" },
  { label: "Recipes", icon: "◇" },
  { label: "Groceries", icon: "✓" },
  { label: "Settings", icon: "⚙" },
];

// The household's default Costco rhythm starts with the first Tuesday after
// this product launch and repeats every other Tuesday. A saved trip date always
// wins over this baseline.
function defaultCostcoTripDate(weekStart: string) {
  const tuesday = new Date(`${weekStart}T12:00:00Z`);
  tuesday.setUTCDate(tuesday.getUTCDate() + ((2 - tuesday.getUTCDay() + 7) % 7));
  const anchor = new Date("2026-09-01T12:00:00Z");
  const weeksFromAnchor = Math.round(
    (tuesday.getTime() - anchor.getTime()) / (7 * 86_400_000),
  );
  if (Math.abs(weeksFromAnchor) % 2 === 0) return tuesday.toISOString().slice(0, 10);
  tuesday.setUTCDate(tuesday.getUTCDate() + 7);
  return tuesday.toISOString().slice(0, 10);
}

export default function Home() {
  const [active, setActive] = useState("Plan");
  const [items, setItems] = useState<Grocery[]>(fallbackGroceries);
  const [inventory, setInventory] =
    useState<InventoryItem[]>(STARTER_INVENTORY);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [sharedGroceryItems, setSharedGroceryItems] = useState<
    GroceryRunItem[]
  >([]);
  const [mealCompletions, setMealCompletions] = useState<MealCompletion[]>([]);
  const [groceryRunReady, setGroceryRunReady] = useState(false);
  const [recipeItems, setRecipeItems] = useState<Recipe[]>(STARTER_RECIPES);
  const [recurringProfiles, setRecurringProfiles] =
    useState<RecurringFood[]>(RECURRING_FOODS);
  const [events, setEvents] = useState<ScheduleException[]>([]);
  const [mealOverrides, setMealOverrides] = useState<MealOverride[]>([]);
  const [shoppingTrips, setShoppingTrips] = useState<ShoppingTrip[]>([]);
  const [editingMeal, setEditingMeal] = useState<{
    date: string;
    mealType: MealTypeKey;
  } | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() =>
    localDateForTimeZone(new Date()),
  );
  const [store, setStore] = useState<"King Soopers" | "Costco">("King Soopers");
  const [toast, setToast] = useState("");
  const [savedPlan, setSavedPlan] = useState<{
    sourceFingerprint: string;
    days: SavedMealPlanDay[];
  } | null>(null);
  const [, setSavingPlan] = useState(false);
  const [dinnerTarget, setDinnerTarget] = useState(5);
  const [costcoThisWeek, setCostcoThisWeek] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [, setAiBrief] = useState<AiPlanningBrief | null>(null);
  const [aiRequest, setAiRequest] = useState<AiGenerationRequest | null>(null);
  const [aiDraft, setAiDraft] = useState<AiWeeklyDraft | null>(null);
  const [storePreferences, setStorePreferences] = useState<StorePreference[]>(
    [],
  );
  const [foodGoals, setFoodGoals] =
    useState<HouseholdFoodGoals>(DEFAULT_FOOD_GOALS);
  const connectivity = useConnectivity();
  const auth = useHouseholdSession();
  const firebaseEnabled = usesFirebaseBackend();
  const scheduleWeek = useMemo(
    () =>
      buildPlanningWeek(
        events,
        new Date(`${weekAnchor}T12:00:00`),
        "America/Denver",
        dinnerTarget,
      ),
    [dinnerTarget, events, weekAnchor],
  );
  const planningFingerprint = useMemo(
    () => planningInputFingerprint(scheduleWeek, recipeItems, mealOverrides),
    [mealOverrides, recipeItems, scheduleWeek],
  );
  const smartWeek = useMemo(
    () =>
      generateSmartPlan(
        scheduleWeek,
        recipeItems,
        inventory,
        mealCompletions,
      ),
    [inventory, mealCompletions, recipeItems, scheduleWeek],
  );
  const generatedWeek = useMemo(
    () => applyMealOverrides(smartWeek, mealOverrides, recipeItems),
    [mealOverrides, recipeItems, smartWeek],
  );
  const planningRecipes = useMemo(
    () =>
      aiDraft?.status === "proposed"
        ? [...recipeItems, ...(aiDraft.recipes || [])]
        : recipeItems,
    [aiDraft, recipeItems],
  );
  const proposedWeek = useMemo(
    () =>
      aiDraft?.status === "proposed"
        ? applyMealOverrides(
            applyWeeklyDraft(smartWeek, aiDraft),
            mealOverrides,
            planningRecipes,
          )
        : generatedWeek,
    [aiDraft, generatedWeek, mealOverrides, planningRecipes, smartWeek],
  );
  const week = useMemo(() => {
    if (
      aiDraft?.status === "proposed" ||
      resetOpen ||
      savedPlan?.sourceFingerprint !== planningFingerprint
    )
      return aiDraft?.status === "proposed" || resetOpen
        ? proposedWeek
        : generatedWeek;
    const savedByDate = new Map(savedPlan.days.map((day) => [day.date, day]));
    return scheduleWeek.map((day) => ({
      ...day,
      ...(savedByDate.get(day.date) || {}),
    }));
  }, [
    aiDraft,
    generatedWeek,
    planningFingerprint,
    proposedWeek,
    resetOpen,
    savedPlan,
    scheduleWeek,
  ]);
  const displayedTrips = useMemo(() => {
    const defaults: ShoppingTrip[] = [
      {
        id: `${week[0]?.date}--king-soopers`,
        store: "King Soopers",
        date: week[6]?.date || "",
      },
      {
        id: `${week[0]?.date}--costco`,
        store: "Costco",
        date: week[0]?.date ? defaultCostcoTripDate(week[0].date) : "",
      },
    ];
    return defaults.map(
      (fallback) =>
        shoppingTrips.find((trip) => trip.id === fallback.id) || fallback,
    );
  }, [shoppingTrips, week]);
  const costcoScheduledThisWeek = useMemo(() => {
    const costcoDate = displayedTrips.find((trip) => trip.store === "Costco")?.date;
    return Boolean(
      costcoDate &&
        week[0]?.date &&
        week[6]?.date &&
        costcoDate >= week[0].date &&
        costcoDate <= week[6].date,
    );
  }, [displayedTrips, week]);
  const calculatedNeeds = useMemo(
    () =>
      applyStoreCadence(
        buildGroceryNeeds(
          week,
          planningRecipes,
          inventory,
          new Date(),
          recurringProfiles,
        ),
        costcoScheduledThisWeek,
        storePreferences,
      ),
    [
      costcoScheduledThisWeek,
      inventory,
      planningRecipes,
      recurringProfiles,
      storePreferences,
      week,
    ],
  );
  // Grocery calculations can be recomputed during ordinary React renders.  Do
  // not turn those renders into Firestore transactions: one sync per distinct
  // week + grocery calculation is enough.
  const grocerySyncKey = useMemo(
    () => `${week[0]?.date || ""}:${groceryNeedsFingerprint(calculatedNeeds)}`,
    [calculatedNeeds, week],
  );
  const lastGrocerySyncKey = useRef<string | null>(null);
  const displayItems = useMemo(() => {
    if (!firebaseEnabled) return items;
    const needs = groceryRunReady
      ? sharedGroceryItems
      : calculatedNeeds.map((need) => ({
          ...need,
          checked: false,
          purchasedQuantity: 0,
          purchasedAt: null,
        }));
    return needs
      .map((need) => {
        const recipeSummary =
          need.sources.length <= 2
            ? need.sources.join(" + ")
            : `${need.sources.slice(0, 2).join(" + ")} + ${need.sources.length - 2} more`;
        const inventorySummary =
          need.inventoryUsed > 0
            ? ` · ${formatGroceryQuantity(need.inventoryUsed, need.unit)} on hand used`
            : "";
        return {
          id: need.id,
          name: need.name,
          detail: `${formatGroceryQuantity(need.quantity, need.unit)} · ${recipeSummary}${inventorySummary}`,
          store: need.store,
          checked: need.checked,
          quantity: need.quantity,
          unit: need.unit,
          manual: need.manual,
          storeReason: need.storeReason,
          sources: need.sources,
          section: need.section,
        };
      })
      .filter((need) => (need.quantity || 0) > 0);
  }, [
    calculatedNeeds,
    firebaseEnabled,
    groceryRunReady,
    items,
    sharedGroceryItems,
  ]);
  const remaining = useMemo(
    () => displayItems.filter((item) => !item.checked).length,
    [displayItems],
  );
  const planIsSaved =
    !resetOpen && savedPlan?.sourceFingerprint === planningFingerprint;
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    if (firebaseEnabled) return;
    fetch("/api/home")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.groceries?.length) setItems(data.groceries);
      })
      .catch(() => undefined);
  }, [firebaseEnabled]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToScheduleExceptions(
      auth.session?.householdId,
      setEvents,
      () => notify("Could not load the shared schedule."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToStorePreferences(
      auth.session?.householdId,
      setStorePreferences,
      () => notify("Could not load shopping preferences."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToFoodGoals(auth.session?.householdId, setFoodGoals, () =>
      notify("Could not load household food goals."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToMealOverrides(
      auth.session?.householdId,
      setMealOverrides,
      () => notify("Could not load meal changes."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToShoppingTrips(
      auth.session?.householdId,
      setShoppingTrips,
      () => notify("Could not load shopping dates."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToMealCompletions(
      auth.session?.householdId,
      setMealCompletions,
      () => notify("Could not load meal confirmations."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToInventory(
      auth.session?.householdId,
      (next) => {
        setInventory(next);
        setInventoryReady(true);
      },
      () => notify("Could not load shared inventory."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToGroceryRun(
      week[0].date,
      auth.session.householdId,
      (next) => {
        setSharedGroceryItems(next);
        setGroceryRunReady(true);
      },
      () => notify("Could not load the shared grocery run."),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToAiWeeklyDraft(
      auth.session.householdId,
      week[0].date,
      setAiDraft,
      () => notify("Could not load the AI weekly draft."),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToAiRequests(
      auth.session.householdId,
      week[0].date,
      setAiRequest,
      () => notify("Could not load AI automation status."),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    const weekStart = week[0]?.date;
    const householdId = auth.session?.householdId;
    if (!firebaseEnabled || !householdId || !weekStart || !inventoryReady)
      return;
    if (lastGrocerySyncKey.current === grocerySyncKey) return;

    // Set this before the asynchronous transaction. Snapshot updates triggered
    // by the write must not queue another identical transaction.
    lastGrocerySyncKey.current = grocerySyncKey;
    let cancelled = false;
    syncGroceryRun(calculatedNeeds, weekStart, householdId).catch(() => {
      // A temporary offline/quota failure remains safely retryable when the
      // next meaningful plan or inventory edit occurs.
      if (!cancelled && lastGrocerySyncKey.current === grocerySyncKey) {
        lastGrocerySyncKey.current = null;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    auth.session?.householdId,
    calculatedNeeds,
    firebaseEnabled,
    grocerySyncKey,
    inventoryReady,
    week,
  ]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToSavedMealPlan(
      week[0].date,
      auth.session.householdId,
      setSavedPlan,
      () => notify("Could not load the shared meal plan."),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToRecipes(auth.session?.householdId, setRecipeItems, () =>
      notify("Could not load the shared recipe library."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToRecurringProfiles(
      auth.session?.householdId,
      setRecurringProfiles,
      () => notify("Could not load recurring food routines."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session) return;
    return subscribeToPlanningSettings(
      auth.session.householdId,
      (settings) => {
        setDinnerTarget(settings.dinnerTarget);
        setCostcoThisWeek(settings.costcoThisWeek);
      },
      () => notify("Could not load the weekly planning settings."),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToAiPlanningBrief(
      auth.session.householdId,
      week[0].date,
      setAiBrief,
      () => notify("Could not load the smart weekly briefing."),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  const persistPlan = async (fingerprint = planningFingerprint) => {
    setSavingPlan(true);
    try {
      await saveMealPlan(week, fingerprint, auth.session?.householdId);
      setSavedPlan({
        sourceFingerprint: fingerprint,
        days: week.map(({ date, alex, nathalia, lunch, meal }) => ({
          date,
          alex,
          nathalia,
          lunch,
          meal,
        })),
      });
      notify("Weekly lunches and dinners saved for both of you.");
    } catch {
      notify("Could not save the shared plan.");
    } finally {
      setSavingPlan(false);
    }
  };
  const toggleItem = async (id: string) => {
    const current = displayItems.find((item) => item.id === id);
    if (!current) return;
    const checked = !current.checked;
    if (firebaseEnabled) {
      try {
        await setGroceryItemPurchased(
          week[0].date,
          id,
          checked,
          auth.session?.householdId,
        );
        notify(
          checked
            ? `${current.name} purchased and added to inventory.`
            : `${current.name} purchase undone.`,
        );
      } catch {
        notify("Could not sync that purchase. Try again.");
      }
      return;
    }
    setItems((all) =>
      all.map((item) => (item.id === id ? { ...item, checked } : item)),
    );
    try {
      const response = await fetch("/api/home", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, checked }),
      });
      if (!response.ok) throw new Error("save failed");
      notify(
        checked
          ? `${current.name} added to inventory`
          : `${current.name} returned to the list`,
      );
    } catch {
      setItems((all) =>
        all.map((item) =>
          item.id === id ? { ...item, checked: current.checked } : item,
        ),
      );
      notify("Could not save that change. Try again.");
    }
  };
  const changeDinnerTarget = async (target: number) => {
    const previous = dinnerTarget;
    setDinnerTarget(target);
    try {
      await saveDinnerTarget(target, costcoScheduledThisWeek, auth.session?.householdId);
      notify(
        `Planning ${target} ${target === 1 ? "dinner" : "dinners"} to cook.`,
      );
    } catch {
      setDinnerTarget(previous);
      notify("Could not save the dinner count.");
    }
  };
  const changeCostcoWeek = async (next: boolean) => {
    const previous = costcoThisWeek;
    setCostcoThisWeek(next);
    try {
      await saveCostcoWeek(next, dinnerTarget, auth.session?.householdId);
      notify(
        next
          ? "Costco run added for this week."
          : "Costco moved to next week. Immediate needs moved to King Soopers.",
      );
    } catch {
      setCostcoThisWeek(previous);
      notify("Could not save the Costco cadence.");
    }
  };
  const finishReset = async () => {
    let finalFingerprint = planningFingerprint;
    if (aiDraft?.status === "proposed") {
      const nextRecipes = [...recipeItems];
      for (const recipe of aiDraft.recipes || []) {
        if (!nextRecipes.some((existing) => existing.id === recipe.id)) {
          await createRecipe(recipe, auth.session?.householdId);
          nextRecipes.push(recipe);
        }
      }
      setRecipeItems(nextRecipes);
      finalFingerprint = planningInputFingerprint(
        scheduleWeek,
        nextRecipes,
        mealOverrides,
      );
      await reviewAiWeeklyDraft(
        week[0].date,
        "applied",
        auth.session?.householdId,
      );
    }
    await persistPlan(finalFingerprint);
    setResetOpen(false);
    setActive("Groceries");
  };
  const changeMeal = async (
    date: string,
    mealType: MealTypeKey,
    kind: DinnerOverrideKind,
    recipeId: string | null,
    servings: number | null,
  ) => {
    try {
      await saveMealOverride(
        { date, mealType, kind, recipeId, servings },
        auth.session?.householdId,
      );
      const id = mealType === "lunch" ? `${date}--lunch` : date;
      setMealOverrides((all) => [
        ...all.filter((item) => item.id !== id),
        { id, date, mealType, kind, recipeId, servings },
      ]);
      setEditingMeal(null);
      notify(
        `${mealType === "lunch" ? "Lunch" : "Dinner"} updated. Groceries recalculated.`,
      );
    } catch {
      notify("Could not update that meal.");
    }
  };
  const resetMeal = async (date: string, mealType: MealTypeKey) => {
    const id = mealType === "lunch" ? `${date}--lunch` : date;
    try {
      await clearMealOverride(date, mealType, auth.session?.householdId);
      setMealOverrides((all) => all.filter((item) => item.id !== id));
      setEditingMeal(null);
      notify(`Automatic ${mealType} restored.`);
    } catch {
      notify("Could not restore that meal.");
    }
  };
  const moveMeal = async (
    day: PlanningDay,
    mealType: MealTypeKey,
    targetDate: string,
  ) => {
    try {
      await movePlannedMeal(
        day,
        targetDate,
        mealType,
        auth.session?.householdId,
      );
      setEditingMeal(null);
      notify(
        `${mealType === "lunch" ? "Lunch" : "Dinner"} moved. Groceries recalculated.`,
      );
    } catch {
      notify("Could not move that meal. Choose a different open day.");
    }
  };
  const moveWeek = (days: number) => {
    setWeekAnchor((current) => addLocalDays(current, days));
    setSavedPlan(null);
    setGroceryRunReady(false);
    setSharedGroceryItems([]);
  };
  const title = active === "Plan" ? "Your week" : active;

  if (firebaseEnabled && auth.loading) return <LoadingView />;
  if (firebaseEnabled && !auth.session)
    return <SignInView error={auth.error} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MercaSync</span>
          <small className="version-badge">v{APP_VERSION}</small>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              key={item.label}
              onClick={() => setActive(item.label)}
              className={active === item.label ? "nav-item active" : "nav-item"}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.label === "Groceries" && <em>{remaining}</em>}
            </button>
          ))}
        </nav>
        <button
          className="automation-card"
          onClick={() => {
            setActive("Plan");
            setResetOpen(true);
          }}
        >
          <span className="pulse" />
          <div>
            <strong>Weekend reset</strong>
            <p>
              {planIsSaved
                ? "Week approved · tap to refresh"
                : "Ready in about 5 minutes"}
            </p>
          </div>
        </button>
        <div className="people">
          <span className="avatar alex">A</span>
          <span className="avatar nathalia">N</span>
          <p>
            {auth.session?.member.displayName || "Alex & Nathalia"}
            <br />
            <small>
              {auth.session ? (
                <button
                  className="sign-out"
                  onClick={() => signOutOfHousehold()}
                >
                  Sign out
                </button>
              ) : (
                "Denver household"
              )}
            </small>
          </p>
        </div>
      </aside>
      <section className="content">
        <header className="mobile-header">
          <div className="brand">
            <span className="brand-mark">M</span>
            <span>MercaSync</span>
            <small className="version-badge">v{APP_VERSION}</small>
          </div>
          <div className="mobile-people">
            <span className="avatar alex">A</span>
            <span className="avatar nathalia">N</span>
          </div>
        </header>
        <header className="topbar">
          <div>
            <p className="eyebrow">{formatLongDate()}</p>
            <h1>{title}</h1>
            <p>
              {active === "Plan"
                ? "One clear place to plan, cook, and shop."
                : "Shared, current, and ready for both of you."}
            </p>
          </div>
          {active === "Plan" && planIsSaved && (
            <span className="plan-saved-badge">✓ Week saved</span>
          )}
        </header>
        {(active === "Plan" ||
          active === "Calendar" ||
          active === "Groceries") && (
          <WeekNavigator
            week={week}
            onPrevious={() => moveWeek(-7)}
            onToday={() => setWeekAnchor(localDateForTimeZone(new Date()))}
            onNext={() => moveWeek(7)}
          />
        )}
        {active === "Plan" && (
          <WeeklyCheck
            items={displayItems}
            inventory={inventory}
            week={week}
            profiles={recurringProfiles}
            trips={displayedTrips}
            dinnerTarget={dinnerTarget}
            setDinnerTarget={changeDinnerTarget}
            goals={foodGoals}
            setGoals={setFoodGoals}
            householdId={auth.session?.householdId}
            aiDraft={aiDraft}
            approveWeek={finishReset}
            editRoutines={() => setRoutinesOpen(true)}
            editMeal={(date, mealType = "dinner") =>
              setEditingMeal({ date, mealType })
            }
            viewRecipe={(id) =>
              setViewingRecipe(
                planningRecipes.find((recipe) => recipe.id === id) || null,
              )
            }
            open={setActive}
          />
        )}
        {active === "Calendar" && (
          <CalendarView
            events={events}
            trips={displayedTrips}
            week={week}
            recipes={recipeItems}
            inventory={inventory}
            completions={mealCompletions}
            householdId={auth.session?.householdId}
            editMeal={(date, mealType) => setEditingMeal({ date, mealType })}
            viewRecipe={(id) =>
              setViewingRecipe(
                recipeItems.find((recipe) => recipe.id === id) || null,
              )
            }
            onChanged={(changed) =>
              setEvents((current) =>
                [
                  ...current.filter((event) => event.id !== changed.id),
                  changed,
                ].sort((a, b) => a.date.localeCompare(b.date)),
              )
            }
            onDeleted={(id) =>
              setEvents((current) => current.filter((event) => event.id !== id))
            }
            notify={notify}
          />
        )}
        {active === "Recipes" && (
          <RecipesView
            recipes={recipeItems}
            inventory={inventory}
            week={week}
            aiRequest={aiRequest}
            householdId={auth.session?.householdId}
            onUpdated={(updated) =>
              setRecipeItems((current) =>
                current.map((recipe) =>
                  recipe.id === updated.id ? updated : recipe,
                ),
              )
            }
            onCreated={(created) =>
              setRecipeItems((current) =>
                [
                  ...current.filter((recipe) => recipe.id !== created.id),
                  created,
                ].sort((a, b) => a.name.localeCompare(b.name)),
              )
            }
            onDeleted={(id) =>
              setRecipeItems((current) =>
                current.filter((recipe) => recipe.id !== id),
              )
            }
            notify={notify}
          />
        )}
        {active === "Inventory" && (
          <InventoryView
            inventory={inventory}
            householdId={auth.session?.householdId}
            notify={notify}
          />
        )}
        {active === "Groceries" && (
          <GroceriesView
            items={displayItems}
            week={week}
            trips={displayedTrips}
            householdId={auth.session?.householdId}
            store={store}
            setStore={setStore}
            toggle={toggleItem}
            costcoThisWeek={costcoScheduledThisWeek}
            preferences={storePreferences}
            notify={notify}
            openInventory={() => setActive("Inventory")}
          />
        )}
        {active === "Settings" && (
          <SettingsView
            email={auth.session?.user.email || ""}
            displayName={auth.session?.member.displayName || ""}
            connectivity={connectivity}
            costcoThisWeek={costcoScheduledThisWeek}
            setCostcoThisWeek={changeCostcoWeek}
            goals={foodGoals}
            setGoals={setFoodGoals}
            preferences={storePreferences}
            householdId={auth.session?.householdId}
            exportData={{
              events,
              recipes: recipeItems,
              inventory,
              recurringFoods: recurringProfiles,
              mealCompletions,
              storePreferences,
            }}
            notify={notify}
          />
        )}
      </section>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <button
            key={item.label}
            className={active === item.label ? "active" : ""}
            onClick={() => setActive(item.label)}
          >
            <span>{item.icon}</span>
            <small>{item.label === "Groceries" ? "List" : item.label}</small>
            {item.label === "Groceries" && remaining > 0 && (
              <em>{remaining}</em>
            )}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      {(!connectivity.online || connectivity.reconnected) && (
        <div
          className={
            connectivity.online ? "sync-banner online" : "sync-banner offline"
          }
          role="status"
          aria-live="polite"
        >
          <span>{connectivity.online ? "✓" : "↻"}</span>
          <div>
            <strong>
              {connectivity.online ? "Back online" : "You’re offline"}
            </strong>
            <small>
              {connectivity.online
                ? "Firebase is connected again."
                : "Cached plans remain available. Shopping and reconciliation changes require reconnection."}
            </small>
          </div>
        </div>
      )}
      {resetOpen && (
        <WeekendReset
          inventory={inventory}
          events={events}
          week={week}
          trips={displayedTrips}
          costcoThisWeek={costcoScheduledThisWeek}
          setCostcoThisWeek={changeCostcoWeek}
          dinnerTarget={dinnerTarget}
          setDinnerTarget={changeDinnerTarget}
          aiRequest={aiRequest}
          aiDraft={aiDraft}
          goals={foodGoals}
          onGoals={setFoodGoals}
          householdId={auth.session?.householdId}
          onEditMeal={(date) => {
            setResetOpen(false);
            setEditingMeal({ date, mealType: "dinner" });
          }}
          onClose={() => setResetOpen(false)}
          onFinish={finishReset}
          notify={notify}
        />
      )}
      {routinesOpen && (
        <RoutineEditor
          foods={recurringProfiles}
          recipes={planningRecipes}
          householdId={auth.session?.householdId}
          onClose={() => setRoutinesOpen(false)}
          onChanged={(food) =>
            setRecurringProfiles((all) =>
              [...all.filter((item) => item.id !== food.id), food].sort(
                (a, b) => a.name.localeCompare(b.name),
              ),
            )
          }
          onDeleted={(id) =>
            setRecurringProfiles((all) => all.filter((item) => item.id !== id))
          }
          notify={notify}
        />
      )}
      {editingMeal && (
        <MealActionSheet
          day={week.find((day) => day.date === editingMeal.date)!}
          week={week}
          mealType={editingMeal.mealType}
          recipes={recipeItems}
          hasOverride={mealOverrides.some(
            (item) =>
              item.date === editingMeal.date &&
              (item.mealType || "dinner") === editingMeal.mealType,
          )}
          onClose={() => setEditingMeal(null)}
          onSave={(kind, recipeId, servings) =>
            changeMeal(
              editingMeal.date,
              editingMeal.mealType,
              kind,
              recipeId,
              servings,
            )
          }
          onMove={(targetDate) =>
            moveMeal(
              week.find((day) => day.date === editingMeal.date)!,
              editingMeal.mealType,
              targetDate,
            )
          }
          onReset={() => resetMeal(editingMeal.date, editingMeal.mealType)}
        />
      )}
      {viewingRecipe && (
        <RecipeDetailSheet
          recipe={viewingRecipe}
          inventory={inventory}
          onClose={() => setViewingRecipe(null)}
        />
      )}
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeeklyCheck({ inventory, week, trips, dinnerTarget, setDinnerTarget, goals, setGoals, householdId, aiDraft, approveWeek, editRoutines, editMeal, viewRecipe, open }: any) {
  const [draft, setDraft] = useState(goals); const [person, setPerson] = useState<'alex' | 'nathalia'>('alex'); const [kind, setKind] = useState<ScheduleExceptionKind>('late_shift'); const [date, setDate] = useState(week[0]?.date || ''); const [endDate, setEndDate] = useState(week[0]?.date || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const saveGoals = async () => { setBusy(true); try { await saveFoodGoals(draft, householdId); setGoals(draft); } finally { setBusy(false); } };
  const addSchedule = async () => { if (endDate < date) { setError('The end date must be on or after the start date.'); return; } try { await createScheduleException({ personId: person, kind, date, endDate: endDate === date ? null : endDate, title: kind.replace('_', ' ') }, householdId); setError(''); } catch { setError('Could not save that schedule change.'); } };
  const generate = async () => { setBusy(true); setError(''); try { await requestAiPlan(week[0].date, seasonForMonth(new Date(`${week[0].date}T12:00:00`).getMonth()), householdId); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not build the week.'); } finally { setBusy(false); } };
  const approve = async () => { setBusy(true); try { await approveWeek(); } finally { setBusy(false); } };
  return <section className="weekly-check"><header><p className="eyebrow">WEEKEND RITUAL</p><h2>Weekly check</h2><p>Confirm the few exceptions; MercaSync carries the rest.</p></header><section className="week-at-glance"><h3>1. Week snapshot</h3><p>Your availability is shown beside every day, so the meals, servings, and effort make sense at a glance.</p><div className="simple-week">{week.map((day) => <article className="week-snapshot-day" key={day.date}><span>{day.dayLabel}<b>{day.dateLabel}</b></span><div className="snapshot-meals"><div className="snapshot-availability"><small><i className="mini-avatar alex">A</i> {day.alex.label}</small><small><i className="mini-avatar nathalia">N</i> {day.nathalia.label}</small></div><small>Lunch · {day.lunch.title}</small><button onClick={() => day.meal.recipeId && viewRecipe(day.meal.recipeId)}>{day.meal.title}</button><small>{day.meal.servings} servings · {day.meal.effort}</small></div><div className="snapshot-actions"><button className="change" onClick={() => editMeal(day.date, 'lunch')}>Lunch</button><button className="change" onClick={() => editMeal(day.date)}>Dinner</button></div></article>)}</div><button onClick={() => open('Calendar')}>Open meal calendar & mark meals done →</button></section><section><h3>2. Confirm what matters</h3><button onClick={() => open('Inventory')}>{inventory.filter((item) => effectiveInventoryConfidence(item) < 75).length || 'No'} inventory checks →</button><button onClick={editRoutines}>Breakfast & weekday lunch routines →</button></section><section><h3>3. Shape the week</h3><label>Dinners to cook<div className="stepper"><button onClick={() => setDinnerTarget(Math.max(0, dinnerTarget - 1))}>−</button><output>{dinnerTarget}</output><button onClick={() => setDinnerTarget(Math.min(6, dinnerTarget + 1))}>＋</button></div></label><label><input type="checkbox" checked={draft.proteinForward} onChange={(event) => setDraft({ ...draft, proteinForward: event.target.checked })}/> Protein-forward</label><label><input type="checkbox" checked={draft.vegetablesDaily} onChange={(event) => setDraft({ ...draft, vegetablesDaily: event.target.checked })}/> Vegetables daily</label><label>Flavor & goals<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="e.g. Mexican, bright Mediterranean, cozy pasta"/></label><label>Fastest weeknight dinner<input type="range" min="15" max="60" step="5" value={draft.maxWeeknightMinutes} onChange={(event) => setDraft({ ...draft, maxWeeknightMinutes: Number(event.target.value) })}/><small>{draft.maxWeeknightMinutes} minutes</small></label><label>How adventurous?<input type="range" min="1" max="5" value={draft.adventurousness} onChange={(event) => setDraft({ ...draft, adventurousness: Number(event.target.value) })}/><small>{draft.adventurousness}/5</small></label><label>Avoid ingredients<input value={draft.avoidIngredients} onChange={(event) => setDraft({ ...draft, avoidIngredients: event.target.value })} placeholder="Dislikes, allergies, hard no's"/></label><button onClick={saveGoals} disabled={busy}>Save food direction</button></section><section><h3>4. Add schedule exception</h3><select value={person} onChange={(event) => setPerson(event.target.value as 'alex' | 'nathalia')}><option value="alex">Alex</option><option value="nathalia">Nathalia</option></select><select value={kind} onChange={(event) => setKind(event.target.value as ScheduleExceptionKind)}><option value="late_shift">Working late</option><option value="work_trip">Work trip</option><option value="away">Away</option><option value="holiday">Holiday</option><option value="day_off">Day off</option></select><label>Starts<input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (endDate < event.target.value) setEndDate(event.target.value); }}/></label><label>Through <small>Use the same date for one day</small><input type="date" min={date} value={endDate} onChange={(event) => setEndDate(event.target.value)}/></label><button onClick={addSchedule}>Add schedule change</button></section><section><h3>5. Next shopping dates</h3><p>Pick your next trip dates. The Costco date automatically tells the grocery list whether bulk buys belong there.</p>{trips.map((trip: ShoppingTrip) => <label key={trip.store}>{trip.store}<input type="date" value={trip.date} onChange={(event) => saveShoppingTrip(trip.store, event.target.value, week[0].date, householdId)}/></label>)}</section>{error && <p className="plan-alert">{error}</p>}<button className="finish-reset" disabled={busy} onClick={generate}>{busy ? 'Building…' : aiDraft?.status === 'proposed' ? 'Regenerate our week' : 'Build our week'}</button>{aiDraft?.status === 'proposed' && <section><h3>6. Review, adjust & approve</h3><p>Use the snapshot above to move or replace any meal before approval.</p>{aiDraft.recipes?.map((recipe) => <details key={recipe.id}><summary>{recipe.name} · {recipe.effortMinutes} min</summary><p>{recipe.description}</p><ul>{recipe.ingredients.map((item) => <li key={item.itemId}>{item.quantity} {item.unit} {item.name}</li>)}</ul></details>)}<button className="finish-reset" disabled={busy} onClick={approve}>Approve week & build groceries →</button></section>}</section>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SimplePlanView({
  items,
  inventory,
  week,
  profiles,
  startReset,
  editRoutines,
  editMeal,
  viewRecipe,
  open,
  aiRequest,
}: {
  items: Grocery[];
  inventory: InventoryItem[];
  week: PlanningDay[];
  profiles: RecurringFood[];
  startReset: () => void;
  editRoutines: () => void;
  editMeal: (date: string) => void;
  viewRecipe: (id: string) => void;
  open: (tab: string) => void;
  aiRequest: AiGenerationRequest | null;
}) {
  const uncertain = inventory.filter(
    (item) => effectiveInventoryConfidence(item) < 75,
  ).length;
  const dinners = week.filter((day) => day.meal.recipeId).length;
  const failure =
    aiRequest?.status === "failed"
      ? aiRequest.errorMessage || "Generation could not start."
      : "";
  return (
    <section className="simple-plan">
      <button className="plan-week-hero" onClick={startReset}>
        <span>
          <small>START HERE</small>
          <strong>Plan next week</strong>
          <em>Inventory → schedule → meals → shopping</em>
        </span>
        <b>→</b>
      </button>
      {failure && (
        <div className="plan-alert" role="status">
          <span>!</span>
          <div>
            <strong>AI generation needs attention</strong>
            <p>{failure}</p>
          </div>
          <button onClick={startReset}>Open planner</button>
        </div>
      )}
      <div className="week-at-glance">
        <header>
          <div>
            <p className="eyebrow">YOUR CURRENT WEEK</p>
            <h2>
              {dinners} dinners · {items.filter((item) => !item.checked).length}{" "}
              groceries left
            </h2>
          </div>
          <button onClick={() => open("Calendar")}>Full calendar</button>
        </header>
        <div className="simple-week">
          {week.map((day) => (
            <article key={day.date}>
              <span>
                {day.dayLabel}
                <b>{day.dateLabel}</b>
              </span>
              <button
                disabled={!day.meal.recipeId}
                onClick={() =>
                  day.meal.recipeId && viewRecipe(day.meal.recipeId)
                }
              >
                {day.meal.title}
              </button>
              <small>
                {day.meal.servings} servings · {day.meal.effort}
              </small>
              <button className="change" onClick={() => editMeal(day.date)}>
                Change
              </button>
            </article>
          ))}
        </div>
      </div>
      <div className="simple-actions">
        <button onClick={() => open("Inventory")}>
          <span>◫</span>
          <strong>Inventory</strong>
          <small>
            {uncertain ? `${uncertain} quick checks` : "Looks current"}
          </small>
        </button>
        <button onClick={editRoutines}>
          <span>↻</span>
          <strong>Routines</strong>
          <small>
            {profiles.length
              ? `${profiles.length} saved`
              : "Add breakfast or lunch"}
          </small>
        </button>
        <button onClick={() => open("Groceries")}>
          <span>✓</span>
          <strong>Groceries</strong>
          <small>
            {items.filter((item) => !item.checked).length} remaining
          </small>
        </button>
      </div>
      <p className="plan-footnote">
        Set the number of dinners, shopping dates, food direction, and AI
        generation inside <strong>Plan next week</strong>.
      </p>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained temporarily for safe rollback during the navigation simplification
function PlanView({
  items,
  inventory,
  week,
  profiles,
  dinnerTarget,
  setDinnerTarget,
  startReset,
  editRoutines,
  editMeal,
  viewRecipe,
  open,
  aiBrief,
  aiRequest,
  householdId,
  notify,
}: {
  items: Grocery[];
  inventory: InventoryItem[];
  week: PlanningDay[];
  profiles: RecurringFood[];
  dinnerTarget: number;
  setDinnerTarget: (target: number) => void;
  startReset: () => void;
  editRoutines: () => void;
  editMeal: (date: string) => void;
  viewRecipe: (id: string) => void;
  open: (tab: string) => void;
  aiBrief: AiPlanningBrief | null;
  aiRequest: AiGenerationRequest | null;
  householdId?: string;
  notify: (message: string) => void;
}) {
  const dinnerCount = week.filter((day) => day.meal.recipeId).length;
  const awayDays = week.filter(
    (day) => !day.alex.isHome || !day.nathalia.isHome,
  ).length;
  const lateDays = week.filter(
    (day) => day.alex.isLate || day.nathalia.isLate,
  ).length;
  const firstDinner = week.find((day) => day.meal.servings > 0) || week[0];
  const [requesting, setRequesting] = useState(false);
  const aiBusy =
    requesting ||
    aiRequest?.status === "pending" ||
    aiRequest?.status === "processing";
  const aiStatus =
    aiRequest?.status === "pending"
      ? "Starting secure generation…"
      : aiRequest?.status === "processing"
        ? "AI is building your brief"
        : aiRequest?.status === "failed"
          ? "Last attempt failed — safe to retry"
          : aiRequest?.status === "completed"
            ? "AI brief ready"
            : "AI enhancement is optional";
  const signals = buildLocalPlanningSignals({
    lateDays,
    awayDays,
    uncertainInventory: inventory.filter(
      (item) => effectiveInventoryConfidence(item) < 75,
    ).length,
    groceryItems: items.filter((item) => !item.checked).length,
    costcoItems: items.filter(
      (item) => item.store === "Costco" && !item.checked,
    ).length,
  });
  const refreshBrief = async () => {
    setRequesting(true);
    try {
      await requestAiPlan(
        week[0].date,
        seasonForMonth(new Date(`${week[0].date}T12:00:00`).getMonth()),
        householdId,
      );
      notify("ChatGPT generation started. You can keep using the app.");
    } catch {
      notify(
        "The request was saved, but generation could not start. Try again.",
      );
    } finally {
      setRequesting(false);
    }
  };
  return (
    <>
      <section className="reset-card">
        <div>
          <p className="eyebrow">YOUR 5-MINUTE WEEKLY RITUAL</p>
          <h2>Reset the kitchen</h2>
          <p>
            Confirm only uncertain food, approve the best-fit meals, then shop
            from one finished list.
          </p>
        </div>
        <button onClick={startReset}>
          Start weekend reset <span>→</span>
        </button>
      </section>
      <section className="smart-brief">
        <div className="smart-brief-heading">
          <span className="chef-orb">✦</span>
          <div>
            <p className="eyebrow">SMART WEEKLY BRIEF</p>
            <h2>
              {aiBrief?.headline || "The few things worth your attention"}
            </h2>
            <p>
              {aiBrief?.summary ||
                "MercaSync handles the routine math and surfaces only useful exceptions."}
            </p>
            <span className={`ai-run-status ${aiRequest?.status || "idle"}`}>
              <i />
              {aiStatus}
            </span>
          </div>
          <button disabled={aiBusy} onClick={refreshBrief}>
            {aiBusy
              ? aiRequest?.status === "processing"
                ? "Working…"
                : "Queued…"
              : aiRequest?.status === "failed"
                ? "Retry"
                : aiBrief
                  ? "Refresh"
                  : "Ask AI"}
          </button>
        </div>
        <div className="signal-grid">
          {(aiBrief?.recommendations || signals).map((signal, index) => {
            const actionTab = "actionTab" in signal ? signal.actionTab : "Plan";
            const title = "title" in signal ? signal.title : signal.label;
            const detail =
              "rationale" in signal ? signal.rationale : signal.detail;
            return (
              <button
                key={"id" in signal ? signal.id : `${signal.category}-${index}`}
                className={
                  "tone" in signal
                    ? `signal-card ${signal.tone}`
                    : `signal-card ${signal.category}`
                }
                onClick={() => open(actionTab)}
              >
                <small>
                  {"category" in signal
                    ? signal.category
                    : index === 0
                      ? "NEXT ACTION"
                      : "ALREADY ADJUSTED"}
                </small>
                <strong>{title}</strong>
                <span>{detail}</span>
                <em>Review →</em>
              </button>
            );
          })}
        </div>
        <small className="smart-boundary">
          Quantities and store assignments use transparent MercaSync rules. AI
          adds context and suggestions; you stay in control.
        </small>
      </section>
      <section className="dinner-target">
        <div>
          <p className="eyebrow">THIS WEEK</p>
          <strong>Dinners to cook</strong>
          <small>The remaining nights become leftovers or dinner out.</small>
        </div>
        <div className="stepper">
          <button
            aria-label="Cook one fewer dinner"
            disabled={dinnerTarget === 0}
            onClick={() => setDinnerTarget(dinnerTarget - 1)}
          >
            −
          </button>
          <output aria-live="polite">{dinnerTarget}</output>
          <button
            aria-label="Cook one more dinner"
            disabled={dinnerTarget === 6}
            onClick={() => setDinnerTarget(dinnerTarget + 1)}
          >
            ＋
          </button>
        </div>
      </section>
      <section className="today-card">
        <div>
          <p className="eyebrow">
            NEXT DINNER · {firstDinner?.meal.servings || 0} SERVINGS
          </p>
          <h2>{firstDinner?.meal.title}</h2>
          <p>
            {firstDinner?.meal.effort} effort · {firstDinner?.meal.rationale}
          </p>
        </div>
        <button onClick={() => open("Calendar")}>View schedule</button>
      </section>
      <section className="week-section">
        <div className="section-heading">
          <div>
            <h2>{planningWeekLabel(week)}</h2>
            <p>
              {dinnerCount} dinners to cook · {awayDays} away{" "}
              {awayDays === 1 ? "day" : "days"} · {lateDays} late{" "}
              {lateDays === 1 ? "night" : "nights"}
            </p>
          </div>
          <button className="text-button" onClick={() => open("Calendar")}>
            Calendar →
          </button>
        </div>
        <div className="week-grid">
          {week.map((day, index) => (
            <article
              className={
                day.isToday || index === 0 ? "day-card today" : "day-card"
              }
              key={day.date}
            >
              <div className="date">
                <span>{day.dayLabel}</span>
                <strong>{day.dateLabel}</strong>
              </div>
              <div className="availability">
                <span className="mini-avatar alex">A</span>
                <p>{day.alex.label}</p>
              </div>
              <div className="availability">
                <span className="mini-avatar nathalia">N</span>
                <p>{day.nathalia.label}</p>
              </div>
              <div
                className={`meal ${day.meal.tone}`}
                title={day.meal.rationale}
              >
                <small>{day.meal.label}</small>
                <button
                  className="meal-recipe-link"
                  disabled={!day.meal.recipeId}
                  onClick={() =>
                    day.meal.recipeId && viewRecipe(day.meal.recipeId)
                  }
                >
                  {day.meal.title}
                </button>
                <span className="meal-meta">
                  {day.meal.servings}{" "}
                  {day.meal.servings === 1 ? "serving" : "servings"} ·{" "}
                  {day.meal.effort}
                </span>
                <button
                  className="meal-change-link"
                  onClick={() => editMeal(day.date)}
                >
                  Change
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="panel tap-panel" onClick={() => open("Groceries")}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SMART STORE SPLIT</p>
              <h2>Groceries</h2>
            </div>
            <span className="count-badge">
              {items.filter((i) => !i.checked).length}
            </span>
          </div>
          <p className="panel-copy">
            Bulk only goes to Costco when two-week demand and shelf life justify
            it.
          </p>
          <span className="panel-link">Open list →</span>
        </article>
        <article className="panel tap-panel" onClick={() => open("Inventory")}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ESTIMATED ON HAND</p>
              <h2>Kitchen pulse</h2>
            </div>
            <span className="count-badge warning">1</span>
          </div>
          <p className="panel-copy">
            {inventory[2]?.name || "Greek yogurt"} needs one quick confirmation.
          </p>
          <span className="panel-link">Review inventory →</span>
        </article>
        <article className="panel routine-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HOUSEHOLD HABITS</p>
              <h2>Recurring food</h2>
            </div>
            <button className="text-button" onClick={editRoutines}>
              Manage
            </button>
          </div>
          {profiles.slice(0, 4).map((food) => (
            <button
              className="routine recurring-row"
              key={food.id}
              onClick={editRoutines}
            >
              <span className="recurring-kind">
                {food.kind === "recipe" ? "R" : "＋"}
              </span>
              <div>
                <strong>{food.name}</strong>
                <p>
                  {food.enabled === false
                    ? "Paused"
                    : food.kind === "recipe"
                      ? "Recurring recipe"
                      : `${food.ingredient?.quantity || 0} ${food.ingredient?.unit || ""} each time`}
                </p>
              </div>
              <em>{recurringFoodOccurrences(food)}×</em>
            </button>
          ))}
          {profiles.length === 0 && (
            <p className="panel-copy">No recurring foods yet.</p>
          )}
          <button className="add-recurring-inline" onClick={editRoutines}>
            ＋ Add recurring food
          </button>
        </article>
      </section>
    </>
  );
}
function WeekNavigator({
  week,
  onPrevious,
  onToday,
  onNext,
}: {
  week: PlanningDay[];
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="week-navigator" aria-label="Choose planning week">
      <button aria-label="Previous week" onClick={onPrevious}>
        ‹
      </button>
      <button className="week-label" onClick={onToday}>
        <small>PLANNING WEEK</small>
        <strong>{planningWeekLabel(week)}</strong>
        <span>Tap to return to current week</span>
      </button>
      <button aria-label="Next week" onClick={onNext}>
        ›
      </button>
    </nav>
  );
}
function CalendarView({
  events,
  trips,
  week,
  recipes,
  inventory,
  completions,
  householdId,
  editMeal,
  viewRecipe,
  onChanged,
  onDeleted,
  notify,
}: {
  events: ScheduleException[];
  trips: ShoppingTrip[];
  week: PlanningDay[];
  recipes: Recipe[];
  inventory: InventoryItem[];
  completions: MealCompletion[];
  householdId?: string;
  editMeal: (date: string, mealType: MealTypeKey) => void;
  viewRecipe: (id: string) => void;
  onChanged: (changed: ScheduleException) => void;
  onDeleted: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [view, setView] = useState<"work" | "meals">("work");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleException | null>(null);
  const [personId, setPersonId] = useState<"alex" | "nathalia">("alex");
  const [kind, setKind] = useState<ScheduleExceptionKind>("late_shift");
  const [date, setDate] = useState(week[0]?.date || "");
  const [endDate, setEndDate] = useState(week[0]?.date || "");
  const [monthAnchor, setMonthAnchor] = useState(
    localDateForTimeZone(new Date()),
  );
  const [note, setNote] = useState("");
  const [feedbackRecipe, setFeedbackRecipe] = useState<Recipe | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const labels: Record<ScheduleExceptionKind, string> = {
    late_shift: "Late shift",
    work_trip: "Work trip",
    day_off: "Day off",
    holiday: "Holiday",
    home: "Home / available",
    away: "Away",
  };
  const showEditor = (event?: ScheduleException, selectedDate?: string) => {
    setEditing(event || null);
    setPersonId(event?.personId || "alex");
    setKind(event?.kind || "late_shift");
    const start = event?.date || selectedDate || week[0]?.date || "";
    setDate(start);
    setEndDate(event?.endDate || start);
    setNote(
      event?.title === labels[event?.kind || "late_shift"]
        ? ""
        : event?.title || "",
    );
    setOpen(true);
  };
  const save = async () => {
    if (endDate < date) {
      notify("The end date must be on or after the start date.");
      return;
    }
    const input = {
      personId,
      kind,
      date,
      endDate: endDate === date ? null : endDate,
      title: note.trim() || labels[kind],
    };
    try {
      if (editing) {
        await updateScheduleException(editing.id, input, householdId);
        onChanged({ ...editing, ...input });
      } else {
        onChanged(await createScheduleException(input, householdId));
      }
      setOpen(false);
      notify("Work calendar saved. The meal plan now reflects it.");
    } catch {
      notify("Could not save that schedule change.");
    }
  };
  const moveMonth = (offset: number) => {
    const next = new Date(`${monthAnchor.slice(0, 7)}-15T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    setMonthAnchor(next.toISOString().slice(0, 10));
  };
  const monthDays = calendarMonthDays(monthAnchor);
  const changeTripDate = async (store: StoreName, tripDate: string) => {
    try {
      await saveShoppingTrip(store, tripDate, week[0].date, householdId);
      notify(`${store} trip saved to both calendars.`);
    } catch {
      notify(`Could not save the ${store} trip.`);
    }
  };
  const remove = async (event: ScheduleException) => {
    if (!window.confirm(`Delete “${event.title}”?`)) return;
    try {
      await deleteScheduleException(event.id, householdId);
      onDeleted(event.id);
      notify("Schedule change deleted.");
    } catch {
      notify("Could not delete that schedule change.");
    }
  };
  const reconcileMeal = async (
    day: PlanningDay,
    mealType: MealTypeKey,
    requested: MealCompletionStatus,
  ) => {
    const current = completions.find(
      (item) => item.id === mealCompletionId(day.date, mealType),
    );
    const status = current?.status === requested ? null : requested;
    try {
      await setMealCompletion(
        day,
        mealType,
        status,
        recipes,
        inventory,
        householdId,
      );
      const messages: Record<MealCompletionStatus, string> = {
        cooked: "Cooked as planned. Inventory updated.",
        leftovers: "Leftovers recorded. Planned ingredients preserved.",
        eat_out: "Eating out recorded. Planned ingredients preserved.",
        skipped: "Meal skipped. Planned ingredients preserved.",
      };
      notify(status ? messages[status] : "Meal confirmation undone.");
      if (status === "cooked") {
        const planned = mealType === "lunch" ? day.lunch : day.meal;
        const recipe = recipes.find((item) => item.id === planned.recipeId);
        if (recipe) {
          setFeedbackRecipe(recipe);
          setFeedbackNote("");
        }
      }
    } catch {
      notify("Could not reconcile that meal.");
    }
  };
  return (
    <section className="calendar-page">
      <div
        className="calendar-switch"
        role="tablist"
        aria-label="Calendar type"
      >
        <button
          className={view === "work" ? "active" : ""}
          onClick={() => setView("work")}
          role="tab"
          aria-selected={view === "work"}
        >
          Work & availability
        </button>
        <button
          className={view === "meals" ? "active" : ""}
          onClick={() => setView("meals")}
          role="tab"
          aria-selected={view === "meals"}
        >
          Meals & shopping
        </button>
      </div>
      <section
        className="calendar-trip-planner"
        aria-label="Shopping trip dates"
      >
        <div>
          <p className="eyebrow">SHOPPING TRIPS</p>
          <h2>Choose when you’re going</h2>
          <p>These dates appear on both calendar views.</p>
        </div>
        {(["King Soopers", "Costco"] as StoreName[]).map((tripStore) => (
          <label key={tripStore}>
            <span>
              <strong>{tripStore}</strong>
              <small>
                {tripStore === "Costco"
                  ? "Prefer Tuesday–Thursday after work"
                  : "Usually over the weekend"}
              </small>
            </span>
            <input
              type="date"
              value={trips.find((trip) => trip.store === tripStore)?.date || ""}
              onChange={(event) =>
                changeTripDate(tripStore, event.target.value)
              }
            />
          </label>
        ))}
      </section>
      {view === "work" ? (
        <>
          <div className="calendar-actions">
            <div>
              <p className="eyebrow">ONLY THE UNUSUAL DAYS</p>
              <h2>Alex & Nathalia</h2>
              <p>
                Normal Monday–Friday routines stay assumed. Add holidays, trips,
                late work, and unusual days.
              </p>
            </div>
            <button className="add-schedule" onClick={() => showEditor()}>
              ＋ Add change
            </button>
          </div>
          {events.length > 0 && (
            <div className="event-strip">
              {events.map((event) => (
                <article key={event.id}>
                  <span className={`avatar ${event.personId}`}>
                    {event.personId === "alex" ? "A" : "N"}
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.date}
                      {event.endDate ? ` → ${event.endDate}` : ""} ·{" "}
                      {labels[event.kind]}
                    </small>
                  </div>
                  <div className="event-actions">
                    <button onClick={() => showEditor(event)}>Edit</button>
                    <button className="danger" onClick={() => remove(event)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <section className="work-month">
            <header>
              <button aria-label="Previous month" onClick={() => moveMonth(-1)}>
                ‹
              </button>
              <h2>{calendarMonthLabel(monthAnchor)}</h2>
              <button aria-label="Next month" onClick={() => moveMonth(1)}>
                ›
              </button>
            </header>
            <div className="month-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const dayEvents = events.filter((event) =>
                  scheduleExceptionApplies(event, day),
                );
                const dayTrips = trips.filter((trip) => trip.date === day);
                return (
                  <button
                    key={day}
                    className={`${day.slice(0, 7) === monthAnchor.slice(0, 7) ? "" : "outside"} ${day === localDateForTimeZone(new Date()) ? "today" : ""}`}
                    onClick={() => showEditor(undefined, day)}
                  >
                    <strong>{Number(day.slice(-2))}</strong>
                    <span className="month-events">
                      {dayEvents.slice(0, 2).map((event) => (
                        <i className={event.personId} key={event.id}>
                          {event.personId === "alex" ? "A" : "N"} ·{" "}
                          {labels[event.kind]}
                        </i>
                      ))}
                      {dayTrips.map((trip) => (
                        <i className="shopping" key={trip.id}>
                          🛒 {trip.store}
                        </i>
                      ))}
                    </span>
                    {dayEvents.length > 2 && (
                      <small>+{dayEvents.length - 2}</small>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="calendar-actions meal-calendar-head">
            <div>
              <p className="eyebrow">FOOD CALENDAR</p>
              <h2>Lunch, dinner & shopping</h2>
              <p>
                Lunch stays extremely fast. Servings react automatically to the
                work calendar.
              </p>
            </div>
          </div>
          <div className="meal-week-calendar">
            {week.map((day) => {
              const lunchStatus = completions.find(
                (item) => item.id === mealCompletionId(day.date, "lunch"),
              )?.status;
              const dinnerStatus = completions.find(
                (item) => item.id === mealCompletionId(day.date, "dinner"),
              )?.status;
              const dayTrips = trips.filter((trip) => trip.date === day.date);
              return (
                <article
                  className={day.isToday ? "meal-day today" : "meal-day"}
                  key={day.date}
                >
                  <header>
                    <span>{day.dayLabel}</span>
                    <strong>{day.dateLabel}</strong>
                  </header>
                  <div className="meal-slot lunch-slot">
                    <small>
                      LUNCH · {day.lunch.effort} · {day.lunch.servings} SERVINGS
                    </small>
                    <button
                      className="meal-title-button"
                      onClick={() =>
                        day.lunch.recipeId
                          ? viewRecipe(day.lunch.recipeId)
                          : editMeal(day.date, "lunch")
                      }
                    >
                      {day.lunch.servings ? day.lunch.title : "Lunch off"}
                    </button>
                    <button
                      className="calendar-change"
                      onClick={() => editMeal(day.date, "lunch")}
                    >
                      Change lunch
                    </button>
                    <MealStatusControls
                      status={lunchStatus}
                      disabled={!day.lunch.recipeId}
                      onChange={(status) => reconcileMeal(day, "lunch", status)}
                    />
                  </div>
                  <div className={`meal-slot ${day.meal.tone}`}>
                    <small>
                      DINNER · {day.meal.effort.toUpperCase()} ·{" "}
                      {day.meal.servings} SERVINGS
                    </small>
                    <button
                      className="meal-title-button"
                      onClick={() =>
                        day.meal.recipeId
                          ? viewRecipe(day.meal.recipeId)
                          : editMeal(day.date, "dinner")
                      }
                    >
                      {day.meal.title}
                    </button>
                    <button
                      className="calendar-change"
                      onClick={() => editMeal(day.date, "dinner")}
                    >
                      Change dinner
                    </button>
                    <MealStatusControls
                      status={dinnerStatus}
                      disabled={!day.meal.recipeId}
                      onChange={(status) =>
                        reconcileMeal(day, "dinner", status)
                      }
                    />
                  </div>
                  {dayTrips.map((trip) => (
                    <span className="shopping-chip" key={trip.id}>
                      {trip.store}
                    </span>
                  ))}
                </article>
              );
            })}
          </div>
        </>
      )}
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <section
            className="schedule-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              editing ? "Edit schedule change" : "Add schedule change"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">ONE-TIME EXCEPTION</p>
                <h2>{editing ? "Edit" : "Add"} schedule change</h2>
              </div>
              <button aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <label>
              Who
              <select
                value={personId}
                onChange={(event) =>
                  setPersonId(event.target.value as "alex" | "nathalia")
                }
              >
                <option value="alex">Alex</option>
                <option value="nathalia">Nathalia</option>
              </select>
            </label>
            <label>
              What changed
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ScheduleExceptionKind)
                }
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <div className="date-picks">
                {[week[0], week[1], week[5]].filter(Boolean).map((day) => (
                  <button
                    type="button"
                    className={date === day.date ? "active" : ""}
                    key={day.date}
                    onClick={() => {
                      setDate(day.date);
                      setEndDate(day.date);
                    }}
                  >
                    {day.dayLabel}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  const next = event.target.value;
                  setEndDate(endDate <= date ? next : endDate);
                  setDate(next);
                }}
              />
            </label>
            <label>
              Ends <small>use the same date for one day</small>
              <input
                type="date"
                min={date}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="range-shortcut"
              onClick={() => setEndDate(addLocalDays(date, 20))}
            >
              Set a 3-week trip
            </button>
            <label>
              Short note <small>optional</small>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  kind === "work_trip" ? "e.g. Sacramento" : "e.g. home by 8:30"
                }
              />
            </label>
            <button className="save-schedule" onClick={save}>
              Save schedule change
            </button>
            <p className="sheet-note">
              One entry covers every day in the range and immediately updates
              lunch servings, dinner servings, and dinner effort.
            </p>
          </section>
        </div>
      )}
      {feedbackRecipe && (
        <div className="sheet-backdrop" onClick={() => setFeedbackRecipe(null)}>
          <section
            className="schedule-sheet feedback-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Feedback for ${feedbackRecipe.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">HELP THE NEXT PLAN</p>
                <h2>How was {feedbackRecipe.name}?</h2>
              </div>
              <button
                aria-label="Skip feedback"
                onClick={() => setFeedbackRecipe(null)}
              >
                ×
              </button>
            </div>
            <div className="feedback-choices">
              {(
                [
                  ["Not again", 1],
                  ["Good", 4],
                  ["Loved it", 5],
                ] as const
              ).map(([label, rating]) => (
                <button
                  key={label}
                  onClick={async () => {
                    await updateRecipePreferences(
                      feedbackRecipe.id,
                      {
                        rating,
                        note: feedbackNote.trim() || feedbackRecipe.note,
                      },
                      householdId,
                    );
                    setFeedbackRecipe(null);
                    notify("Feedback saved for future plans.");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              What should change next time? <small>optional</small>
              <textarea
                value={feedbackNote}
                onChange={(event) => setFeedbackNote(event.target.value)}
                placeholder="More sauce, less salt, add crunch…"
              />
            </label>
            <p className="sheet-note">
              Your rating and note influence future deterministic ranking and AI
              generation.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}

function MealStatusControls({
  status,
  disabled,
  onChange,
}: {
  status?: MealCompletionStatus;
  disabled: boolean;
  onChange: (status: MealCompletionStatus) => void;
}) {
  if (disabled) return null;
  return (
    <div className="meal-status">
      <button
        className={status === "cooked" ? "active" : ""}
        onClick={() => onChange("cooked")}
      >
        {status === "cooked" ? "✓ Cooked" : "Cooked"}
      </button>
      <button
        className={status === "leftovers" ? "active alternate" : ""}
        onClick={() => onChange("leftovers")}
      >
        {status === "leftovers" ? "✓ Leftovers" : "Leftovers"}
      </button>
      <button
        className={status === "eat_out" ? "active alternate" : ""}
        onClick={() => onChange("eat_out")}
      >
        {status === "eat_out" ? "✓ Ate out" : "Ate out"}
      </button>
      <button
        className={status === "skipped" ? "active skipped" : ""}
        onClick={() => onChange("skipped")}
      >
        {status === "skipped" ? "✓ Skipped" : "Skip"}
      </button>
    </div>
  );
}

function LoadingView() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MercaSync</span>
          <small className="version-badge">v{APP_VERSION}</small>
        </div>
        <p>Opening your household…</p>
      </section>
    </main>
  );
}

function SignInView({ error }: { error: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(error);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await signInToHousehold(email, password);
    } catch {
      setMessage("Could not sign in. Check the account and try again.");
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MercaSync</span>
          <small className="version-badge">v{APP_VERSION}</small>
        </div>
        <p className="eyebrow">PRIVATE HOUSEHOLD</p>
        <h1>Welcome home</h1>
        <p>Sign in as Alex or Nathalia to open the shared plan.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <span className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {message && (
          <p className="auth-error" role="alert">
            {message}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
function SimpleRecipeLab({
  goals,
  proposals,
  inventory,
  week,
  aiRequest,
  householdId,
  onGoals,
  onApproved,
  notify,
}: {
  goals: HouseholdFoodGoals;
  proposals: AiRecipeProposal[];
  inventory: InventoryItem[];
  week: PlanningDay[];
  aiRequest: AiGenerationRequest | null;
  householdId?: string;
  onGoals: (goals: HouseholdFoodGoals) => void;
  onApproved: (recipe: Recipe) => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goals);
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState("");
  const save = async () => {
    setWorking(true);
    try {
      await saveFoodGoals(draft, householdId);
      onGoals(draft);
      setEditing(false);
      notify("AI instructions saved.");
    } catch {
      notify("Could not save the instructions.");
    } finally {
      setWorking(false);
    }
  };
  const generate = async () => {
    setWorking(true);
    setLocalError("");
    try {
      await requestAiRecipes(
        week[0].date,
        seasonForMonth(new Date().getMonth()),
        householdId,
      );
      notify("Generation started.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation could not start.";
      setLocalError(message);
      notify(message);
    } finally {
      setWorking(false);
    }
  };
  const review = async (proposal: AiRecipeProposal, approved: boolean) => {
    setWorking(true);
    try {
      if (approved) {
        await approveAiProposal(proposal, householdId);
        onApproved(proposal.recipe);
        notify("Recipe added.");
      } else {
        await rejectAiProposal(proposal.id, householdId);
        notify("Idea dismissed.");
      }
    } catch {
      notify("Could not save that decision.");
    } finally {
      setWorking(false);
    }
  };
  const status =
    localError ||
    (aiRequest?.status === "failed"
      ? aiRequest.errorMessage || "Generation could not start."
      : aiRequest?.status === "processing"
        ? "Creating ideas now…"
        : aiRequest?.status === "pending"
          ? "Starting secure generation…"
          : "");
  return (
    <section className="recipe-lab">
      <header>
        <div>
          <p className="eyebrow">OPTIONAL AI</p>
          <h2>Recipe lab</h2>
          <p>
            Create ideas from your instructions. Inventory is context—not a goal
            or command.
          </p>
        </div>
        <button
          onClick={() => {
            setDraft(goals);
            setEditing(true);
          }}
        >
          Edit instructions
        </button>
      </header>
      <div className="instruction-summary">
        <span>
          {goals.proteinForward ? "Protein-forward" : "Flexible protein"}
        </span>
        <span>
          {goals.vegetablesDaily ? "Vegetables daily" : "Flexible vegetables"}
        </span>
        <span>≤ {goals.maxWeeknightMinutes} min</span>
      </div>
      <p className="goal-copy">
        {goals.notes}
        {goals.avoidIngredients ? ` Avoid: ${goals.avoidIngredients}.` : ""}
      </p>
      {status && (
        <p
          className={
            aiRequest?.status === "failed" || localError
              ? "lab-status failed"
              : "lab-status"
          }
        >
          {status}
        </p>
      )}
      <button
        className="lab-generate"
        disabled={
          working ||
          aiRequest?.status === "pending" ||
          aiRequest?.status === "processing"
        }
        onClick={generate}
      >
        {working ? "Starting…" : "Generate recipe ideas"}
      </button>
      <small>For the complete weekly menu, use Plan → Plan next week.</small>
      {proposals.length > 0 && (
        <div className="lab-proposals">
          {proposals.map((proposal) => (
            <article key={proposal.id}>
              <div>
                <strong>{proposal.recipe.name}</strong>
                <p>{proposal.whyItFits}</p>
              </div>
              <div>
                <button
                  disabled={working}
                  onClick={() => review(proposal, false)}
                >
                  Dismiss
                </button>
                <button
                  disabled={working}
                  onClick={() => review(proposal, true)}
                >
                  Add recipe
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(false)}>
          <section
            className="schedule-sheet goals-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="AI food instructions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">YOUR INSTRUCTIONS</p>
                <h2>What should ChatGPT optimize?</h2>
              </div>
              <button aria-label="Close" onClick={() => setEditing(false)}>
                ×
              </button>
            </div>
            <div className="goal-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={draft.proteinForward}
                  onChange={(event) =>
                    setDraft({ ...draft, proteinForward: event.target.checked })
                  }
                />
                <span>
                  <strong>Protein-forward</strong>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.vegetablesDaily}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      vegetablesDaily: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Vegetables daily</strong>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.seasonalPriority}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      seasonalPriority: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Seasonal priority</strong>
                </span>
              </label>
            </div>
            <label>
              Maximum weeknight minutes
              <input
                type="number"
                min="10"
                max="90"
                value={draft.maxWeeknightMinutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    maxWeeknightMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Avoid ingredients
              <input
                value={draft.avoidIngredients}
                onChange={(event) =>
                  setDraft({ ...draft, avoidIngredients: event.target.value })
                }
                placeholder="Dislikes, allergies, hard no's"
              />
            </label>
            <label>
              Flavor direction and goals
              <textarea
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                placeholder="Bold flavors, Mediterranean, spicy, lighter fish…"
              />
            </label>
            <button className="save-schedule" disabled={working} onClick={save}>
              {working ? "Saving…" : "Save instructions"}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained temporarily for safe rollback during the Recipe Lab simplification
function AiRecipeStudio({
  goals,
  proposals,
  inventory,
  week,
  aiRequest,
  householdId,
  onGoals,
  onApproved,
  notify,
}: {
  goals: HouseholdFoodGoals;
  proposals: AiRecipeProposal[];
  inventory: InventoryItem[];
  week: PlanningDay[];
  aiRequest: AiGenerationRequest | null;
  householdId?: string;
  onGoals: (goals: HouseholdFoodGoals) => void;
  onApproved: (recipe: Recipe) => void;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draft, setDraft] = useState(goals);
  const [working, setWorking] = useState("");
  const season = seasonForMonth(new Date().getMonth());
  const usefulInventory = inventory
    .filter(
      (item) => item.quantity > 0 && effectiveInventoryConfidence(item) >= 80,
    )
    .sort(
      (a, b) =>
        effectiveInventoryConfidence(b) - effectiveInventoryConfidence(a),
    )
    .slice(0, 4);
  const lateNights = week.filter(
    (day) => day.alex.isLate || day.nathalia.isLate,
  ).length;
  const awayDays = week.filter(
    (day) => !day.alex.isHome || !day.nathalia.isHome,
  ).length;
  const saveGoals = async () => {
    setWorking("goals");
    try {
      await saveFoodGoals(draft, householdId);
      onGoals(draft);
      setEditingGoals(false);
      notify("Household food goals saved.");
    } catch {
      notify("Could not save food goals.");
    } finally {
      setWorking("");
    }
  };
  const request = async () => {
    setWorking("request");
    try {
      await requestAiRecipes(week[0].date, season, householdId);
      notify(
        "ChatGPT generation started. Ideas will appear here automatically.",
      );
    } catch {
      notify(
        "The request was saved, but generation could not start. Try again.",
      );
    } finally {
      setWorking("");
    }
  };
  const approve = async (proposal: AiRecipeProposal) => {
    setWorking(proposal.id);
    try {
      await approveAiProposal(proposal, householdId);
      onApproved(proposal.recipe);
      notify(`${proposal.recipe.name} added to your recipes.`);
    } catch {
      notify("Could not approve that proposal.");
    } finally {
      setWorking("");
    }
  };
  const reject = async (proposal: AiRecipeProposal) => {
    setWorking(proposal.id);
    try {
      await rejectAiProposal(proposal.id, householdId);
      notify("Proposal dismissed.");
    } catch {
      notify("Could not dismiss that proposal.");
    } finally {
      setWorking("");
    }
  };
  const aiBusy =
    working === "request" ||
    aiRequest?.status === "pending" ||
    aiRequest?.status === "processing";
  const requestStatus =
    aiRequest?.status === "pending"
      ? "Starting secure generation…"
      : aiRequest?.status === "processing"
        ? "Generating now · usually about a minute"
        : aiRequest?.status === "failed"
          ? aiRequest.errorMessage ||
            "Generation could not start. Try once more."
          : aiRequest?.status === "completed"
            ? "Latest request completed"
            : "Ready when you are";
  return (
    <section className="ai-studio">
      <button
        className="ai-studio-hero"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chef-orb">✦</span>
        <span>
          <small>CHATGPT KITCHEN</small>
          <strong>
            {proposals.length
              ? `${proposals.length} fresh ${proposals.length === 1 ? "idea" : "ideas"} to review`
              : "Recipe ideas grounded in real life"}
          </strong>
          <em>
            {season} · {usefulInventory.length} useful pantry signals ·{" "}
            {lateNights} late nights · {awayDays} away days
          </em>
        </span>
        <b>{open ? "−" : "＋"}</b>
      </button>
      {open && (
        <div className="ai-studio-body">
          <div className="ai-brief">
            <div>
              <p className="eyebrow">WHAT CHATGPT WILL USE</p>
              <h3>Your planning brief</h3>
            </div>
            <button
              onClick={() => {
                setDraft(goals);
                setEditingGoals(true);
              }}
            >
              Edit goals
            </button>
            <div className="brief-chips">
              <span>
                {goals.proteinForward ? "Protein-forward" : "Flexible protein"}
              </span>
              <span>
                {goals.vegetablesDaily
                  ? "Vegetables daily"
                  : "Flexible vegetables"}
              </span>
              <span>≤ {goals.maxWeeknightMinutes} min</span>
              <span>Adventure {goals.adventurousness}/5</span>
              <span>{season} produce</span>
              {usefulInventory.map((item) => (
                <span key={`${item.itemId}-${item.unit}`}>Use {item.name}</span>
              ))}
            </div>
            <p>
              {goals.notes}
              {goals.avoidIngredients
                ? ` Avoid: ${goals.avoidIngredients}.`
                : ""}
            </p>
            <span className={`recipe-ai-status ${aiRequest?.status || "idle"}`}>
              {requestStatus}
            </span>
            <button className="ask-chatgpt" disabled={aiBusy} onClick={request}>
              {aiBusy
                ? aiRequest?.status === "processing"
                  ? "Working…"
                  : "Queued…"
                : aiRequest?.status === "failed"
                  ? "Retry smart planning"
                  : "Ask ChatGPT for 3 ideas"}
            </button>
            <small className="automation-explainer">
              Requests are processed securely by automation. Nothing affects
              groceries until you approve a recipe.
            </small>
          </div>
          {proposals.length > 0 ? (
            <div className="proposal-grid">
              {proposals.map((proposal) => (
                <article key={proposal.id}>
                  <p className="eyebrow">
                    AI PROPOSAL · {proposal.recipe.effortMinutes} MIN
                  </p>
                  <h3>{proposal.recipe.name}</h3>
                  <p>{proposal.whyItFits}</p>
                  <div className="proposal-highlights">
                    {proposal.inventoryHighlights.map((item) => (
                      <span key={item}>Pantry · {item}</span>
                    ))}
                    {proposal.seasonalHighlights.map((item) => (
                      <span key={item}>Seasonal · {item}</span>
                    ))}
                  </div>
                  <details>
                    <summary>Ingredients & steps</summary>
                    <ul>
                      {proposal.recipe.ingredients.map((item) => (
                        <li key={`${item.itemId}-${item.unit}`}>
                          {item.quantity} {item.unit} {item.name}
                        </li>
                      ))}
                    </ul>
                    <ol>
                      {proposal.recipe.instructions.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                  <div className="proposal-actions">
                    <button
                      disabled={working === proposal.id}
                      onClick={() => reject(proposal)}
                    >
                      Not for us
                    </button>
                    <button
                      disabled={working === proposal.id}
                      onClick={() => approve(proposal)}
                    >
                      Add recipe
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ai-empty">
              <span>✦</span>
              <div>
                <strong>No proposals waiting</strong>
                <p>
                  Queue a request now, or let the Sunday automation bring
                  seasonal ideas.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {editingGoals && (
        <div className="sheet-backdrop" onClick={() => setEditingGoals(false)}>
          <section
            className="schedule-sheet goals-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Household food goals"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">HOUSEHOLD FOOD COMPASS</p>
                <h2>What should ChatGPT optimize?</h2>
              </div>
              <button aria-label="Close" onClick={() => setEditingGoals(false)}>
                ×
              </button>
            </div>
            <div className="goal-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={draft.proteinForward}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      proteinForward: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Protein-forward</strong>
                  <small>Center satisfying protein sources</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.vegetablesDaily}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      vegetablesDaily: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Vegetables daily</strong>
                  <small>Build produce into the meal</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.seasonalPriority}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      seasonalPriority: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Seasonal priority</strong>
                  <small>Favor what is good right now</small>
                </span>
              </label>
            </div>
            <label>
              Maximum weeknight minutes
              <input
                type="range"
                min="15"
                max="60"
                step="5"
                value={draft.maxWeeknightMinutes}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    maxWeeknightMinutes: Number(event.target.value),
                  }))
                }
              />
              <output>{draft.maxWeeknightMinutes} minutes</output>
            </label>
            <label>
              Food adventurousness
              <input
                type="range"
                min="1"
                max="5"
                value={draft.adventurousness}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    adventurousness: Number(event.target.value),
                  }))
                }
              />
              <output>{draft.adventurousness}/5</output>
            </label>
            <label>
              Avoid ingredients
              <input
                value={draft.avoidIngredients}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    avoidIngredients: event.target.value,
                  }))
                }
                placeholder="Allergies, dislikes, hard no's"
              />
            </label>
            <label>
              Anything else
              <textarea
                value={draft.notes}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, notes: event.target.value }))
                }
              />
            </label>
            <button
              className="save-schedule"
              disabled={working === "goals"}
              onClick={saveGoals}
            >
              {working === "goals" ? "Saving…" : "Save food goals"}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
function RecipeDetailSheet({
  recipe,
  inventory,
  onClose,
  preferences,
}: {
  recipe: Recipe;
  inventory: InventoryItem[];
  onClose: () => void;
  preferences?: React.ReactNode;
}) {
  const [servings, setServings] = useState(recipe.servings);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", close);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);
  const factor = servings / recipe.servings;
  const coverage = recipe.ingredients.filter((ingredient) =>
    inventory.some(
      (item) =>
        canonicalItemId(item.itemId) === canonicalItemId(ingredient.itemId) &&
        item.quantity > 0,
    ),
  ).length;
  return (
    <div className="sheet-backdrop recipe-detail-backdrop" onClick={onClose}>
      <section
        className="recipe-detail"
        role="dialog"
        aria-modal="true"
        aria-label={recipe.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">
              {recipe.mealType.toUpperCase()} · {recipe.effortMinutes} MIN
            </p>
            <h2>{recipe.name}</h2>
          </div>
          <button autoFocus aria-label="Close recipe" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="recipe-description">{recipe.description}</p>
        <div className="recipe-context">
          <span>
            <strong>
              {coverage}/{recipe.ingredients.length}
            </strong>
            <small>ingredients at home</small>
          </span>
          <span>
            <strong>{recipe.lateNightSuitable ? "Yes" : "No"}</strong>
            <small>late-night fit</small>
          </span>
          <div className="stepper">
            <button
              aria-label="One fewer serving"
              disabled={servings <= 1}
              onClick={() => setServings(servings - 1)}
            >
              −
            </button>
            <output>{servings}</output>
            <button
              aria-label="One more serving"
              disabled={servings >= 12}
              onClick={() => setServings(servings + 1)}
            >
              ＋
            </button>
            <small>servings</small>
          </div>
        </div>
        <div className="recipe-tags">
          {recipe.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="recipe-detail-grid">
          <section>
            <h3>Ingredients</h3>
            <ul>
              {recipe.ingredients.map((item) => {
                const atHome = inventory.some(
                  (stock) =>
                    canonicalItemId(stock.itemId) ===
                      canonicalItemId(item.itemId) && stock.quantity > 0,
                );
                return (
                  <li key={`${item.itemId}-${item.unit}`}>
                    <span>
                      {atHome ? "✓ " : ""}
                      {item.name}
                      <small>{atHome ? " estimated at home" : " needed"}</small>
                    </span>
                    <strong>
                      {Math.round(item.quantity * factor * 100) / 100}{" "}
                      {item.unit}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h3>Steps</h3>
            <ol>
              {recipe.instructions.map((instruction, index) => (
                <li key={`${index}-${instruction}`}>
                  <span>{index + 1}</span>
                  {instruction}
                </li>
              ))}
            </ol>
          </section>
        </div>
        {preferences}
      </section>
    </div>
  );
}

function RecipesView({
  recipes,
  inventory,
  week,
  aiRequest,
  householdId,
  onUpdated,
  onCreated,
  onDeleted,
  notify,
}: {
  recipes: Recipe[];
  inventory: InventoryItem[];
  week: PlanningDay[];
  aiRequest: AiGenerationRequest | null;
  householdId?: string;
  onUpdated: (recipe: Recipe) => void;
  onCreated: (recipe: Recipe) => void;
  onDeleted: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [mealType, setMealType] = useState<"all" | MealType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [goals, setGoals] = useState<HouseholdFoodGoals>(DEFAULT_FOOD_GOALS);
  const [proposals, setProposals] = useState<AiRecipeProposal[]>([]);
  useEffect(
    () =>
      subscribeToFoodGoals(householdId, setGoals, () =>
        notify("Could not load food goals."),
      ),
    [householdId, notify],
  );
  useEffect(
    () =>
      subscribeToAiProposals(householdId, setProposals, () =>
        notify("Could not load ChatGPT proposals."),
      ),
    [householdId, notify],
  );
  const selected = recipes.find((recipe) => recipe.id === selectedId) || null;
  const visible = recipes.filter((recipe) => {
    const matchesType = mealType === "all" || recipe.mealType === mealType;
    const haystack =
      `${recipe.name} ${recipe.cuisine} ${recipe.protein} ${recipe.tags.join(" ")}`.toLowerCase();
    return matchesType && haystack.includes(query.trim().toLowerCase());
  });
  const updatePreference = async (
    recipe: Recipe,
    changes: Partial<Pick<Recipe, "favorite" | "rating" | "note">>,
    message: string,
  ) => {
    const updated = { ...recipe, ...changes };
    onUpdated(updated);
    try {
      await updateRecipePreferences(recipe.id, changes, householdId);
      notify(message);
    } catch {
      onUpdated(recipe);
      notify("Could not save that recipe change.");
    }
  };
  const openRecipe = (recipe: Recipe) => {
    setSelectedId(recipe.id);
    setNoteDraft(recipe.note);
  };
  return (
    <section className="recipes-page">
      <SimpleRecipeLab
        goals={goals}
        proposals={proposals}
        week={week}
        aiRequest={aiRequest}
        householdId={householdId}
        onGoals={setGoals}
        onApproved={onCreated}
        notify={notify}
      />
      <div className="recipe-tools">
        <label>
          <span>Search recipes</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chicken, fish, fast…"
          />
        </label>
        <div
          className="recipe-filters"
          role="tablist"
          aria-label="Recipe meal type"
        >
          {(["all", "dinner", "lunch"] as const).map((value) => (
            <button
              key={value}
              className={mealType === value ? "active" : ""}
              onClick={() => setMealType(value)}
              role="tab"
              aria-selected={mealType === value}
            >
              {value === "all"
                ? "All"
                : value === "dinner"
                  ? "Dinners"
                  : "Fast lunches"}
            </button>
          ))}
        </div>
        <button className="add-recipe-button" onClick={() => setAdding(true)}>
          ＋ Add recipe
        </button>
      </div>
      <p className="recipe-count">
        {visible.length} shared {visible.length === 1 ? "recipe" : "recipes"} ·
        favorites, ratings, and notes sync for both of you
      </p>
      <div className="recipe-grid">
        {visible.map((recipe) => (
          <article className="recipe-card" key={recipe.id}>
            <div className={`recipe-swatch ${recipe.color}`}>
              <button
                aria-label={`${recipe.favorite ? "Unstar" : "Star"} ${recipe.name}`}
                onClick={() =>
                  updatePreference(
                    recipe,
                    { favorite: !recipe.favorite },
                    recipe.favorite
                      ? "Removed from favorites"
                      : "Saved as a favorite",
                  )
                }
              >
                {recipe.favorite ? "★" : "☆"}
              </button>
              <span>
                {recipe.mealType === "lunch"
                  ? "FAST LUNCH"
                  : recipe.lateNightSuitable
                    ? "LATE-NIGHT READY"
                    : recipe.method.toUpperCase()}
              </span>
            </div>
            <div className="recipe-body">
              <p
                className="stars"
                aria-label={`${recipe.rating} out of 5 stars`}
              >
                {"★".repeat(recipe.rating)}
                <span>{"★".repeat(5 - recipe.rating)}</span>
              </p>
              <h2>{recipe.name}</h2>
              <p>
                {recipe.effortMinutes} min · {recipe.cuisine} · serves{" "}
                {recipe.servings}
              </p>
              <small>{recipe.note || recipe.description}</small>
              <button onClick={() => openRecipe(recipe)}>
                Ingredients & steps
              </button>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="empty-recipes">
          <strong>No matching recipes</strong>
          <p>Try a protein, cuisine, or “fast.”</p>
        </div>
      )}
      {selected && (
        <div className="recipe-admin-actions">
          <button
            onClick={() => {
              setEditing(selected);
              setSelectedId(null);
            }}
          >
            Edit recipe
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (!window.confirm(`Delete “${selected.name}”?`)) return;
              try {
                await deleteRecipe(selected.id, householdId);
                onDeleted(selected.id);
                setSelectedId(null);
                notify("Recipe deleted.");
              } catch {
                notify("Could not delete that recipe.");
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
      {selected && (
        <div
          className="sheet-backdrop recipe-detail-backdrop"
          onClick={() => setSelectedId(null)}
        >
          <section
            className="recipe-detail"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">
                  {selected.mealType.toUpperCase()} · {selected.effortMinutes}{" "}
                  MIN · SERVES {selected.servings}
                </p>
                <h2>{selected.name}</h2>
              </div>
              <button
                aria-label="Close recipe"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
            <p className="recipe-description">{selected.description}</p>
            <div className="recipe-tags">
              {selected.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="recipe-detail-grid">
              <section>
                <h3>Ingredients</h3>
                <ul>
                  {selected.ingredients.map((item) => (
                    <li key={`${item.itemId}-${item.unit}`}>
                      <span>{item.name}</span>
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Steps</h3>
                <ol>
                  {selected.instructions.map((instruction, index) => (
                    <li key={instruction}>
                      <span>{index + 1}</span>
                      {instruction}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <section className="recipe-preferences">
              <div>
                <strong>Your shared rating</strong>
                <div className="rating-buttons">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      aria-label={`Rate ${rating} stars`}
                      className={rating <= selected.rating ? "active" : ""}
                      onClick={() =>
                        updatePreference(
                          selected,
                          { rating },
                          `Rated ${rating} stars`,
                        )
                      }
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Shared note
                <textarea
                  value={noteDraft}
                  maxLength={500}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="What should we remember next time?"
                />
              </label>
              <button
                className="save-recipe-note"
                onClick={() =>
                  updatePreference(
                    selected,
                    { note: noteDraft.trim() },
                    "Recipe note saved",
                  )
                }
              >
                Save note
              </button>
            </section>
          </section>
        </div>
      )}
      {(adding || editing) && (
        <RecipeCreator
          existing={editing}
          householdId={householdId}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onCreated={(recipe) => {
            if (editing) onUpdated(recipe);
            else onCreated(recipe);
            setAdding(false);
            setEditing(null);
            notify(
              editing
                ? "Recipe updated."
                : "Recipe added to your shared library.",
            );
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

function RecipeCreator({
  existing,
  householdId,
  onClose,
  onCreated,
  notify,
}: {
  existing?: Recipe | null;
  householdId?: string;
  onClose: () => void;
  onCreated: (recipe: Recipe) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [mealType, setMealType] = useState<MealType>(
    existing?.mealType || "dinner",
  );
  const [minutes, setMinutes] = useState(existing?.effortMinutes || 25);
  const [servings, setServings] = useState(existing?.servings || 2);
  const [description, setDescription] = useState(existing?.description || "");
  const [ingredients, setIngredients] = useState(
    existing?.ingredients
      .map(
        (item) =>
          `${item.name} | ${item.quantity} | ${item.unit} | ${item.store === "costco" ? "Costco" : "King"}`,
      )
      .join("\n") || "",
  );
  const [steps, setSteps] = useState(existing?.instructions.join("\n") || "");
  const [saving, setSaving] = useState(false);
  const [idea, setIdea] = useState("");
  const [formatting, setFormatting] = useState(false);
  const formatIdea = async () => {
    setFormatting(true);
    try {
      const formatted = await formatRecipeIdea(idea, householdId);
      setName(formatted.name);
      setMealType(formatted.mealType);
      setMinutes(formatted.effortMinutes);
      setServings(formatted.servings);
      setDescription(formatted.description);
      setIngredients(formatted.ingredients.map((item) => `${item.name} | ${item.quantity} | ${item.unit} | ${item.store === "costco" ? "Costco" : "King"}`).join("\n"));
      setSteps(formatted.instructions.join("\n"));
      notify("Recipe formatted. Review it, then save it to the library.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not format that recipe idea.");
    } finally {
      setFormatting(false);
    }
  };
  const save = async () => {
    const parsedIngredients = ingredients
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [ingredientName, quantity = "1", unit = "each", store = "king"] =
          line.split("|").map((part) => part.trim());
        return {
          itemId: canonicalItemId(ingredientName),
          name: ingredientName,
          quantity: Math.max(0.01, Number(quantity) || 1),
          unit: normalizeUnit(unit),
          store: store.toLowerCase().includes("costco")
            ? ("costco" as const)
            : ("king_soopers" as const),
        };
      });
    const instructions = steps
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      !name.trim() ||
      parsedIngredients.length === 0 ||
      instructions.length === 0
    ) {
      notify("Add a name, at least one ingredient, and one step.");
      return;
    }
    const recipe: Recipe = {
      id:
        existing?.id ||
        `${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`,
      name: name.trim(),
      mealType,
      description: description.trim() || "A shared household recipe.",
      cuisine: existing?.cuisine || "House favorite",
      protein: existing?.protein || "Mixed",
      method: existing?.method || (mealType === "lunch" ? "Quick" : "Cook"),
      effortMinutes: minutes,
      servings,
      lateNightSuitable: minutes <= 25,
      tags:
        existing?.tags ||
        (mealType === "lunch"
          ? ["fast lunch"]
          : minutes <= 25
            ? ["fast", "late night"]
            : ["home cooked"]),
      ingredients: parsedIngredients,
      instructions,
      favorite: existing?.favorite || false,
      rating: existing?.rating || 3,
      note: existing?.note || "",
      color: existing?.color || "sage",
    };
    setSaving(true);
    try {
      if (existing) await updateRecipe(recipe, householdId);
      else await createRecipe(recipe, householdId);
      onCreated(recipe);
    } catch {
      notify("Could not save that recipe.");
      setSaving(false);
    }
  };
  return (
    <div className="sheet-backdrop recipe-detail-backdrop" onClick={onClose}>
      <section
        className="schedule-sheet recipe-creator"
        role="dialog"
        aria-modal="true"
        aria-label="Add recipe"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">SHARED LIBRARY</p>
            <h2>Add a recipe</h2>
          </div>
          <button aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {!existing && <section className="recipe-idea-helper"><p className="eyebrow">QUICK IDEA</p><h3>Describe it naturally</h3><textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="My work sandwich: 2 slices sourdough, 3 slices turkey, 1 slice Swiss, sliced jarred jalapeños."/><button className="save-schedule" disabled={formatting || !idea.trim()} onClick={formatIdea}>{formatting ? "Formatting…" : "Format with AI"}</button><small>AI fills the recipe below; you review and save it.</small></section>}
        <label>
          Recipe name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ginger chicken bowls"
          />
        </label>
        <div className="creator-grid">
          <label>
            Meal
            <select
              value={mealType}
              onChange={(event) => setMealType(event.target.value as MealType)}
            >
              <option value="dinner">Dinner</option>
              <option value="lunch">Fast lunch</option>
            </select>
          </label>
          <label>
            Minutes
            <input
              type="number"
              min="1"
              value={minutes}
              onChange={(event) =>
                setMinutes(Math.max(1, Number(event.target.value)))
              }
            />
          </label>
          <label>
            Servings
            <input
              type="number"
              min="1"
              max="12"
              value={servings}
              onChange={(event) =>
                setServings(Math.max(1, Number(event.target.value)))
              }
            />
          </label>
        </div>
        <label>
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What makes it good?"
          />
        </label>
        <label>
          Ingredients{" "}
          <small>one per line: name | quantity | unit | store</small>
          <textarea
            value={ingredients}
            onChange={(event) => setIngredients(event.target.value)}
            placeholder={
              "Chicken breast | 1 | lb | Costco\nBroccoli | 12 | oz | King"
            }
          />
        </label>
        <p className="creator-hint">
          Use Costco for long-lasting bulk staples; leave the store blank for
          King Soopers—especially produce.
        </p>
        <label>
          Steps <small>one per line</small>
          <textarea
            value={steps}
            onChange={(event) => setSteps(event.target.value)}
            placeholder={
              "Season and brown the chicken.\nRoast the broccoli.\nServe together."
            }
          />
        </label>
        <button className="save-schedule" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Add recipe"}
        </button>
      </section>
    </div>
  );
}
function MealActionSheet({
  day,
  week,
  mealType,
  recipes,
  hasOverride,
  onClose,
  onSave,
  onMove,
  onReset,
}: {
  day: PlanningDay;
  week: PlanningDay[];
  mealType: MealTypeKey;
  recipes: Recipe[];
  hasOverride: boolean;
  onClose: () => void;
  onSave: (
    kind: DinnerOverrideKind,
    recipeId: string | null,
    servings: number,
  ) => void;
  onMove: (targetDate: string) => void;
  onReset: () => void;
}) {
  const planned = mealType === "lunch" ? day.lunch : day.meal;
  const matchingRecipes = recipes.filter(
    (recipe) => recipe.mealType === mealType,
  );
  const plannedTitle = planned.title.toLowerCase();
  const [kind, setKind] = useState<DinnerOverrideKind>(
    planned.recipeId
      ? "recipe"
      : plannedTitle.includes("leftover")
        ? "leftovers"
        : plannedTitle.includes("out")
          ? "eat_out"
          : "skip",
  );
  const [recipeId, setRecipeId] = useState(
    planned.recipeId || matchingRecipes[0]?.id || "",
  );
  const [servings, setServings] = useState(Math.max(1, planned.servings || 2));
  const [moving, setMoving] = useState(false);
  const [targetDate, setTargetDate] = useState(
    week.find((candidate) => candidate.date !== day.date)?.date || "",
  );
  const selected = recipes.find((recipe) => recipe.id === recipeId);
  return (
    <div className="sheet-backdrop meal-action-backdrop" onClick={onClose}>
      <section
        className="schedule-sheet meal-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${mealType} for ${day.dayLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">
              {day.dayLabel.toUpperCase()} · {mealType.toUpperCase()}
            </p>
            <h2>{planned.title}</h2>
          </div>
          <button aria-label="Close meal actions" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="meal-kind-grid">
          {(
            [
              ["recipe", mealType === "lunch" ? "Choose lunch" : "Cook"],
              ["leftovers", "Leftovers"],
              ["eat_out", "Eat out"],
              ["skip", `No ${mealType}`],
            ] as const
          ).map(([value, label]) => (
            <button
              className={kind === value ? "active" : ""}
              key={value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {kind === "recipe" && (
          <>
            <label>
              Choose recipe
              <select
                value={recipeId}
                onChange={(event) => setRecipeId(event.target.value)}
              >
                {matchingRecipes.map((recipe) => (
                  <option value={recipe.id} key={recipe.id}>
                    {recipe.name} · {recipe.effortMinutes} min
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <details className="inline-recipe" open>
                <summary>Ingredients & instructions</summary>
                <p>{selected.description}</p>
                <h3>Ingredients</h3>
                <ul>
                  {selected.ingredients.map((item) => (
                    <li key={`${item.itemId}-${item.unit}`}>
                      <span>{item.name}</span>
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                    </li>
                  ))}
                </ul>
                <h3>Steps</h3>
                <ol>
                  {selected.instructions.map((step, index) => (
                    <li key={step}>
                      {index + 1}. {step}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}{" "}
        {kind !== "skip" && (
          <div className="meal-serving-row">
            <span>
              <strong>Servings</strong>
              <small>Adjust grocery quantities automatically</small>
            </span>
            <div className="stepper">
              <button
                aria-label="One fewer serving"
                disabled={servings === 1}
                onClick={() => setServings(servings - 1)}
              >
                −
              </button>
              <output>{servings}</output>
              <button
                aria-label="One more serving"
                disabled={servings === 8}
                onClick={() => setServings(servings + 1)}
              >
                ＋
              </button>
            </div>
          </div>
        )}
        <button
          className="save-schedule"
          onClick={() =>
            onSave(
              kind,
              kind === "recipe" ? recipeId : null,
              kind === "skip" ? 0 : servings,
            )
          }
        >
          Save {mealType}
        </button>
        {planned.recipeId && (
          <button
            className="move-meal-button"
            onClick={() => setMoving((value) => !value)}
          >
            Move this {mealType} to another day
          </button>
        )}
        {moving && (
          <div className="move-meal-picker">
            <label>
              Move to
              <select
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              >
                {week
                  .filter((candidate) => candidate.date !== day.date)
                  .map((candidate) => (
                    <option value={candidate.date} key={candidate.date}>
                      {candidate.dayLabel} {candidate.dateLabel} ·{" "}
                      {
                        (mealType === "lunch"
                          ? candidate.lunch
                          : candidate.meal
                        ).title
                      }
                    </option>
                  ))}
              </select>
            </label>
            <button onClick={() => onMove(targetDate)}>
              Move and recalculate groceries
            </button>
          </div>
        )}
        {hasOverride && (
          <button className="restore-auto" onClick={onReset}>
            Restore automatic choice
          </button>
        )}
      </section>
    </div>
  );
}
function RoutineEditor({
  foods,
  recipes,
  householdId,
  onClose,
  onChanged,
  onDeleted,
  notify,
}: {
  foods: RecurringFood[];
  recipes: Recipe[];
  householdId?: string;
  onClose: () => void;
  onChanged: (food: RecurringFood) => void;
  onDeleted: (id: string) => void;
  notify: (message: string) => void;
}) {
  const blank = (id: string): RecurringFood => ({
    id,
    name: "",
    kind: "item",
    timesPerWeek: 5,
    enabled: true,
    person: "both",
    mealType: "grocery",
    weekdays: [0, 1, 2, 3, 4],
    onlyWhenHome: true,
    recipeId: recipes[0]?.id || null,
    servings: 2,
    ingredient: {
      itemId: "",
      name: "",
      quantity: 1,
      unit: "each",
      store: "king_soopers",
    },
  });
  const [selectedId, setSelectedId] = useState(foods[0]?.id || "new");
  const [draft, setDraft] = useState<RecurringFood>(
    () => foods[0] || blank(`recurring-${crypto.randomUUID()}`),
  );
  const [saving, setSaving] = useState(false);
  const select = (id: string) => {
    const food = foods.find((item) => item.id === id);
    if (food) {
      setSelectedId(id);
      setDraft(food);
    }
  };
  const startNew = () => {
    const next = blank(`recurring-${crypto.randomUUID()}`);
    setSelectedId("new");
    setDraft(next);
  };
  const save = async () => {
    const selectedRecipe = recipes.find(
      (recipe) => recipe.id === draft.recipeId,
    );
    const name =
      draft.kind === "recipe"
        ? selectedRecipe?.name || draft.name
        : draft.name.trim();
    const ingredient =
      draft.kind === "item" && draft.ingredient
        ? {
            ...draft.ingredient,
            name,
            itemId: canonicalItemId(name),
            unit: normalizeUnit(draft.ingredient.unit),
          }
        : null;
    if (!name || (draft.kind === "item" && !ingredient?.unit)) {
      notify("Add an item name and unit.");
      return;
    }
    const saved = {
      ...draft,
      name,
      ingredient,
      person: draft.person || ("both" as const),
      mealType: draft.mealType || ("grocery" as const),
      weekdays: draft.weekdays || [0, 1, 2, 3, 4],
      onlyWhenHome: draft.onlyWhenHome !== false,
      timesPerWeek: Math.max(0, Math.min(21, Math.round(draft.timesPerWeek))),
    };
    setSaving(true);
    try {
      await saveRecurringProfile(saved, householdId);
      onChanged(saved);
      notify(`${name} will occur ${saved.timesPerWeek}× per week.`);
      onClose();
    } catch {
      notify("Could not save that recurring food.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (selectedId === "new") {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await deleteRecurringFood(draft.id, householdId);
      onDeleted(draft.id);
      notify(`${draft.name} removed from recurring food.`);
      onClose();
    } catch {
      notify("Could not remove that recurring food.");
      setSaving(false);
    }
  };
  return (
    <div className="sheet-backdrop routine-backdrop" onClick={onClose}>
      <section
        className="schedule-sheet routine-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Manage recurring food"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">AUTOMATIC ROUTINES</p>
            <h2>Breakfasts, lunches & staples</h2>
          </div>
          <button aria-label="Close routines" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="sheet-intro">Set the shared breakfast once, then give Alex and Nathalia their own lunch routines. Schedule exceptions automatically remove a person’s routine when they are away.</p>
        <div className="routine-templates"><button onClick={() => { const next = blank(`recurring-${crypto.randomUUID()}`); next.name = "Shared breakfast"; next.person = "both"; next.mealType = "breakfast"; next.timesPerWeek = 7; next.weekdays = [0, 1, 2, 3, 4, 5, 6]; setSelectedId("new"); setDraft(next); }}>＋ Shared breakfast</button><button onClick={() => { const next = blank(`recurring-${crypto.randomUUID()}`); next.name = "Alex weekday lunch"; next.person = "alex"; next.mealType = "lunch"; next.timesPerWeek = 5; next.weekdays = [0, 1, 2, 3, 4]; next.servings = 1; setSelectedId("new"); setDraft(next); }}>＋ Alex lunch</button><button onClick={() => { const next = blank(`recurring-${crypto.randomUUID()}`); next.name = "Nathalia weekday lunch"; next.person = "nathalia"; next.mealType = "lunch"; next.timesPerWeek = 5; next.weekdays = [0, 1, 2, 3, 4]; next.servings = 1; setSelectedId("new"); setDraft(next); }}>＋ Nathalia lunch</button></div>
        <div className="recurring-picker">
          {foods.map((food) => (
            <button
              className={selectedId === food.id ? "active" : ""}
              key={food.id}
              onClick={() => select(food.id)}
            >
              <strong>{food.name}</strong>
              <small>
                {food.person || "both"} · {food.mealType || food.kind} ·{" "}
                {food.timesPerWeek}×
              </small>
            </button>
          ))}
          <button
            className={selectedId === "new" ? "active add" : "add"}
            onClick={startNew}
          >
            ＋ New
          </button>
        </div>
        <div className="routine-context">
          <label>
            For whom?
            <select
              value={draft.person || "both"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  person: event.target.value as RecurringFood["person"],
                }))
              }
            >
              <option value="both">Both</option>
              <option value="alex">Alex</option>
              <option value="nathalia">Nathalia</option>
            </select>
          </label>
          <label>
            When?
            <select
              value={draft.mealType || "grocery"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  mealType: event.target.value as RecurringFood["mealType"],
                }))
              }
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
              <option value="grocery">General staple</option>
            </select>
          </label>
        </div>
        <label className="home-only">
          <input
            type="checkbox"
            checked={draft.onlyWhenHome !== false}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                onlyWhenHome: event.target.checked,
              }))
            }
          />{" "}
          Only count this when that person is home
        </label>
        <div className="meal-kind-grid recurring-types">
          <button
            className={draft.kind === "item" ? "active" : ""}
            onClick={() =>
              setDraft((current) => ({ ...current, kind: "item" }))
            }
          >
            Grocery item
          </button>
          <button
            className={draft.kind === "recipe" ? "active" : ""}
            onClick={() =>
              setDraft((current) => ({ ...current, kind: "recipe" }))
            }
          >
            Recipe
          </button>
        </div>
        {draft.kind === "recipe" ? (
          <>
            <label>
              Recipe
              <select
                value={draft.recipeId || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recipeId: event.target.value,
                  }))
                }
              >
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Servings each time
              <input
                type="number"
                min="1"
                max="12"
                value={draft.servings || 2}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    servings: Math.max(1, Number(event.target.value)),
                  }))
                }
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Item
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Greek yogurt"
              />
            </label>
            <div className="recurring-item-grid">
              <label>
                Amount each time
                <input
                  type="number"
                  min="0.01"
                  step="0.25"
                  value={draft.ingredient?.quantity || 1}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ingredient: {
                        ...(current.ingredient || {
                          itemId: "",
                          name: "",
                          unit: "each",
                          store: "king_soopers",
                        }),
                        quantity: Math.max(0.01, Number(event.target.value)),
                      },
                    }))
                  }
                />
              </label>
              <label>
                Unit
                <input
                  value={draft.ingredient?.unit || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ingredient: {
                        ...(current.ingredient || {
                          itemId: "",
                          name: "",
                          quantity: 1,
                          store: "king_soopers",
                        }),
                        unit: event.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label>
                Preferred store
                <select
                  value={draft.ingredient?.store || "king_soopers"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ingredient: {
                        ...(current.ingredient || {
                          itemId: "",
                          name: "",
                          quantity: 1,
                          unit: "each",
                        }),
                        store: event.target.value as "king_soopers" | "costco",
                      },
                    }))
                  }
                >
                  <option value="king_soopers">King Soopers</option>
                  <option value="costco">Costco</option>
                </select>
              </label>
            </div>
          </>
        )}
        <label className="weekly-frequency">
          <span>
            <strong>Times per week</strong>
            <small>Usually 5 for a weekday lunch, 7 for breakfast</small>
          </span>
          <div className="stepper">
            <button
              disabled={draft.timesPerWeek <= 0}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  timesPerWeek: current.timesPerWeek - 1,
                }))
              }
            >
              −
            </button>
            <output>{draft.timesPerWeek}</output>
            <button
              disabled={draft.timesPerWeek >= 21}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  timesPerWeek: current.timesPerWeek + 1,
                }))
              }
            >
              ＋
            </button>
          </div>
        </label>
        <button className="save-schedule" disabled={saving} onClick={save}>
          {saving
            ? "Saving…"
            : selectedId === "new"
              ? "Add routine"
              : "Save changes"}
        </button>
        {selectedId !== "new" && (
          <button
            className="delete-recurring"
            disabled={saving}
            onClick={remove}
          >
            Remove routine
          </button>
        )}
      </section>
    </div>
  );
}
function WeekendReset({
  events,
  week,
  trips,
  costcoThisWeek,
  setCostcoThisWeek,
  dinnerTarget,
  setDinnerTarget,
  aiRequest,
  aiDraft,
  goals,
  onGoals,
  householdId,
  onEditMeal,
  onClose,
  onFinish,
  notify,
}: {
  events: ScheduleException[];
  week: PlanningDay[];
  trips: ShoppingTrip[];
  costcoThisWeek: boolean;
  setCostcoThisWeek: (next: boolean) => void;
  dinnerTarget: number;
  setDinnerTarget: (target: number) => void;
  aiRequest: AiGenerationRequest | null;
  aiDraft: AiWeeklyDraft | null;
  goals: HouseholdFoodGoals;
  onGoals: (goals: HouseholdFoodGoals) => void;
  householdId?: string;
  onEditMeal: (date: string) => void;
  onClose: () => void;
  onFinish: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [reviewItems] = useState(() =>
    inventory
      .filter((item) => effectiveInventoryConfidence(item) < 75)
      .sort(
        (a, b) =>
          effectiveInventoryConfidence(a) - effectiveInventoryConfidence(b),
      ),
  );
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return reviewItems.length === 0 ? 1 : 0;
    const saved = Number(
      window.sessionStorage.getItem(`mercasync-reset-${week[0]?.date}`),
    );
    return Number.isInteger(saved) && saved >= 0 && saved <= 5
      ? saved
      : reviewItems.length === 0
        ? 1
        : 0;
  });
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [goalDraft, setGoalDraft] = useState(goals);
  const [schedulePerson, setSchedulePerson] = useState<'alex' | 'nathalia'>('alex');
  const [scheduleKind, setScheduleKind] = useState<ScheduleExceptionKind>('late_shift');
  const [scheduleDate, setScheduleDate] = useState(week[0]?.date || '');
  const addScheduleHere = async () => { try { await createScheduleException({ personId: schedulePerson, kind: scheduleKind, date: scheduleDate, endDate: null, title: scheduleKind.replace('_', ' ') }, householdId); notify('Schedule change saved.'); } catch { notify('Could not save that schedule change.'); } };
  const current = reviewItems[index];
  const weekEvents = events.filter((event) =>
    week.some((day) => scheduleExceptionApplies(event, day.date)),
  );
  const stepNames = [
    "Inventory",
    "Schedule",
    "Direction",
    "Shopping",
    "Build week",
    "Approve",
  ];
  useEffect(() => {
    window.sessionStorage.setItem(
      `mercasync-reset-${week[0]?.date}`,
      String(step),
    );
  }, [step, week]);
  const advance = () => setStep((value) => Math.min(5, value + 1));
  const review = async (correction: InventoryCorrection) => {
    if (!current) {
      advance();
      return;
    }
    setSaving(true);
    try {
      if (correction === "same")
        await confirmInventoryItem(current, householdId);
      else
        await setInventoryQuantity(
          current,
          correctedInventoryQuantity(current.quantity, correction),
          householdId,
        );
      if (index + 1 >= reviewItems.length) setStep(1);
      else setIndex((value) => value + 1);
    } catch {
      notify(`Could not update ${current.name}.`);
    } finally {
      setSaving(false);
    }
  };
  const askAi = async () => {
    setRequesting(true);
    setAiError("");
    try {
      await requestAiPlan(
        week[0].date,
        seasonForMonth(new Date(`${week[0].date}T12:00:00`).getMonth()),
        householdId,
      );
      notify("ChatGPT is building the week now.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation could not start.";
      setAiError(message);
      notify(message);
    } finally {
      setRequesting(false);
    }
  };
  const finish = async () => {
    setSaving(true);
    try {
      await onFinish();
      window.sessionStorage.removeItem(`mercasync-reset-${week[0]?.date}`);
    } finally {
      setSaving(false);
    }
  };
  const aiBusy =
    requesting ||
    aiRequest?.status === "pending" ||
    aiRequest?.status === "processing";
  const moveTrip = async (store: "King Soopers" | "Costco", date: string) => {
    try {
      await saveShoppingTrip(store, date, week[0].date, householdId);
      notify(`${store} trip saved.`);
    } catch {
      notify("Could not save that shopping date.");
    }
  };
  return (
    <div className="sheet-backdrop reset-backdrop" onClick={onClose}>
      <section
        className="reset-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Weekend kitchen reset"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">PLAN THE WEEK · {step + 1} OF 6</p>
            <h2>{stepNames[step]}</h2>
          </div>
          <button
            aria-label="Close reset; progress will be saved"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="reset-steps" aria-label="Reset progress">
          {stepNames.map((name, position) => (
            <span
              className={
                position === step ? "active" : position < step ? "done" : ""
              }
              key={name}
            >
              <i>{position < step ? "✓" : position + 1}</i>
              <small>{name}</small>
            </span>
          ))}
        </div>
        {step === 0 &&
          (current ? (
            <>
              <p className="reset-counter">
                {reviewItems.length - index} uncertain{" "}
                {reviewItems.length - index === 1 ? "item" : "items"} left
              </p>
              <article className="reset-item">
                <small>
                  {effectiveInventoryConfidence(current)}% CONFIDENCE
                </small>
                <h3>{current.name}</h3>
                <p>
                  We estimate{" "}
                  {formatGroceryQuantity(current.quantity, current.unit)}. What
                  do you see?
                </p>
              </article>
              <div className="reset-choices">
                <button disabled={saving} onClick={() => review("out")}>
                  Out
                </button>
                <button disabled={saving} onClick={() => review("half")}>
                  About half
                </button>
                <button disabled={saving} onClick={() => review("same")}>
                  Looks right
                </button>
                <button disabled={saving} onClick={() => review("more")}>
                  More
                </button>
              </div>
              <button
                className="reset-skip"
                onClick={() =>
                  index + 1 >= reviewItems.length
                    ? setStep(1)
                    : setIndex((value) => value + 1)
                }
              >
                Not sure — skip
              </button>
            </>
          ) : (
            <ResetContinue
              title="Inventory looks current"
              detail="There are no low-confidence items that need confirmation."
              onContinue={advance}
            />
          ))}
        {step === 1 && (
          <>
            <div className="reset-summary">
              <strong>
                {weekEvents.length
                  ? `${weekEvents.length} unusual schedule ${weekEvents.length === 1 ? "entry" : "entries"}`
                  : "Normal home week"}
              </strong>
              <p>
                {weekEvents.length
                  ? "These exceptions already changed servings and meal effort."
                  : "No unusual workdays or trips are saved for this week."}
              </p>
              {weekEvents.map((event) => (
                <div key={event.id}>
                  <span className={`mini-avatar ${event.personId}`}>
                    {event.personId === "alex" ? "A" : "N"}
                  </span>
                  <b>{event.title}</b>
                  <small>
                    {event.date}
                    {event.endDate ? ` → ${event.endDate}` : ""}
                  </small>
                </div>
              ))}
            </div>
            <div className="planner-schedule-editor"><strong>Add a schedule change</strong><div><select value={schedulePerson} onChange={(event) => setSchedulePerson(event.target.value as 'alex' | 'nathalia')}><option value="alex">Alex</option><option value="nathalia">Nathalia</option></select><select value={scheduleKind} onChange={(event) => setScheduleKind(event.target.value as ScheduleExceptionKind)}><option value="late_shift">Working late</option><option value="work_trip">Work trip</option><option value="away">Away</option><option value="holiday">Holiday</option><option value="day_off">Day off</option></select><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></div><button className="reset-secondary" onClick={addScheduleHere}>Add schedule change</button></div>
            <ResetFooter step={step} setStep={setStep} onNext={advance} />
          </>
        )}
        {step === 2 && (
          <>
            <div className="reset-dinners">
              <div>
                <strong>How many dinners should we cook?</strong>
                <small>
                  AI uses leftovers and eating out for the other nights.
                </small>
              </div>
              <div className="stepper">
                <button
                  aria-label="Cook one fewer dinner"
                  disabled={dinnerTarget === 0 || saving}
                  onClick={() => setDinnerTarget(dinnerTarget - 1)}
                >
                  −
                </button>
                <output>{dinnerTarget}</output>
                <button
                  aria-label="Cook one more dinner"
                  disabled={dinnerTarget === 6 || saving}
                  onClick={() => setDinnerTarget(dinnerTarget + 1)}
                >
                  ＋
                </button>
              </div>
            </div>
            <div className="reset-summary"><strong>Food direction</strong><label><input type="checkbox" checked={goalDraft.proteinForward} onChange={(event) => setGoalDraft({ ...goalDraft, proteinForward: event.target.checked })} /> Protein-forward</label><label><input type="checkbox" checked={goalDraft.vegetablesDaily} onChange={(event) => setGoalDraft({ ...goalDraft, vegetablesDaily: event.target.checked })} /> Vegetables daily</label><label>Flavor direction<textarea value={goalDraft.notes} onChange={(event) => setGoalDraft({ ...goalDraft, notes: event.target.value })} /></label><button className="reset-secondary" onClick={async () => { await saveFoodGoals(goalDraft, householdId); onGoals(goalDraft); notify('Food direction saved.'); }}>Save food direction</button></div>
            <ResetFooter step={step} setStep={setStep} onNext={advance} />
          </>
        )}
        {step === 3 && (
          <>
            <div className="reset-summary">
              <strong>Choose the trips before building the list</strong>
              <p>
                Produce and small perishables favor King Soopers. Durable,
                frequently used bulk items favor Costco when this trip is
                enabled.
              </p>
            </div>
            {trips.map((trip) => (
              <label className="reset-trip" key={trip.store}>
                <span>
                  <strong>{trip.store}</strong>
                  <small>
                    {trip.store === "Costco"
                      ? "Best Tue–Thu after work"
                      : "Normal weekend shop"}
                  </small>
                </span>
                <input
                  type="date"
                  value={trip.date}
                  onChange={(event) => moveTrip(trip.store, event.target.value)}
                />
              </label>
            ))}
            <button
              className={
                costcoThisWeek ? "costco-toggle active" : "costco-toggle"
              }
              onClick={() => setCostcoThisWeek(!costcoThisWeek)}
            >
              <span>{costcoThisWeek ? "✓" : "○"}</span>
              <span>
                <strong>
                  {costcoThisWeek
                    ? "Include Costco this week"
                    : "Skip Costco this week"}
                </strong>
                <small>Immediate needs move to King Soopers when skipped</small>
              </span>
            </button>
            <ResetFooter step={step} setStep={setStep} onNext={advance} />
          </>
        )}
        {step === 4 && (
          <>
            <div className={`reset-ai ${aiRequest?.status || "idle"}`}>
              <span className="chef-orb">✦</span>
              <div>
                <strong>
                  {aiDraft?.status === "proposed"
                    ? aiDraft.headline
                    : aiRequest?.status === "processing"
                      ? "AI is building all 14 meal slots"
                      : aiRequest?.status === "pending"
                        ? "Starting your weekly draft"
                        : aiRequest?.status === "failed" || aiError
                          ? "Generation needs attention"
                          : "Ready to design the week"}
                </strong>
                <p>
                  {aiDraft?.status === "proposed"
                    ? aiDraft.summary
                    : aiError ||
                      aiRequest?.errorMessage ||
                      "One request creates lunches, dinners, leftovers, new recipes, and schedule-aware day assignments."}
                </p>
              </div>
            </div>
            <button
              className="reset-secondary"
              disabled={aiBusy}
              onClick={askAi}
            >
              {aiBusy
                ? "Building your week…"
                : aiDraft?.status === "proposed"
                  ? "Regenerate the whole week"
                  : aiRequest?.status === "failed" || aiError
                    ? "Try once more"
                    : "Generate my week now"}
            </button>
            {aiDraft?.status === "proposed" && aiDraft.recipes && <div className="draft-review">{aiDraft.recipes.map((recipe) => <details key={recipe.id}><summary>{recipe.name} · {recipe.effortMinutes} min</summary><p>{recipe.description}</p><h3>Ingredients</h3><ul>{recipe.ingredients.map((item) => <li key={`${item.itemId}-${item.unit}`}>{item.quantity} {item.unit} {item.name}</li>)}</ul><h3>Steps</h3><ol>{recipe.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol></details>)}</div>}
            {aiDraft?.status === "proposed" && (
              <div className="reset-menu draft-review">
                {week.map((day) => (
                  <button key={day.date} onClick={() => onEditMeal(day.date)}>
                    <span>{day.dayLabel}</span>
                    <strong>{day.meal.title}</strong>
                    <small>{day.meal.rationale}</small>
                    <em>Change</em>
                  </button>
                ))}
              </div>
            )}
            <p className="sheet-note">
              Nothing changes until you approve. If AI is unavailable, continue
              with the reliable schedule-aware plan.
            </p>
            <ResetFooter
              step={step}
              setStep={setStep}
              onNext={advance}
              nextLabel={
                aiDraft?.status === "proposed"
                  ? "Review & approve"
                  : "Continue with smart plan"
              }
            />
          </>
        )}
        {step === 5 && (
          <>
            <div className="reset-ready">
              <span>✓</span>
              <p>
                {dinnerTarget} dinners, {weekEvents.length} schedule exceptions,{" "}
                {costcoThisWeek ? "two shopping trips" : "one shopping trip"},
                and{" "}
                {aiDraft?.status === "proposed"
                  ? "an AI-designed week"
                  : "the reliable smart plan"}{" "}
                are ready. Approval freezes the plan and calculates the list.
              </p>
            </div>
            <div className="reset-final-grid">
              <span>
                <strong>{dinnerTarget}</strong>
                <small>dinners</small>
              </span>
              <span>
                <strong>14</strong>
                <small>meal slots</small>
              </span>
              <span>
                <strong>
                  {aiDraft?.status === "proposed" ? "AI" : "Rules"}
                </strong>
                <small>draft source</small>
              </span>
            </div>
            <button className="finish-reset" disabled={saving} onClick={finish}>
              {saving
                ? "Saving shared week…"
                : "Approve week & build groceries →"}
            </button>
            <button
              className="reset-back"
              disabled={saving}
              onClick={() => setStep(4)}
            >
              ← Back
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function ResetContinue({
  title,
  detail,
  onContinue,
}: {
  title: string;
  detail: string;
  onContinue: () => void;
}) {
  return (
    <div className="reset-ready">
      <span>✓</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      <button className="finish-reset" onClick={onContinue}>
        Continue →
      </button>
    </div>
  );
}
function ResetFooter({
  step,
  setStep,
  onNext,
  nextLabel = "Continue",
}: {
  step: number;
  setStep: (step: number) => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="reset-footer">
      <button onClick={() => setStep(Math.max(0, step - 1))}>← Back</button>
      <button onClick={onNext}>{nextLabel} →</button>
    </div>
  );
}
function SettingsView({
  email,
  displayName,
  connectivity,
  costcoThisWeek,
  setCostcoThisWeek,
  goals,
  setGoals,
  preferences,
  householdId,
  exportData,
  notify,
}: {
  email: string;
  displayName: string;
  connectivity: { online: boolean; reconnected: boolean };
  costcoThisWeek: boolean;
  setCostcoThisWeek: (next: boolean) => void;
  goals: HouseholdFoodGoals;
  setGoals: (goals: HouseholdFoodGoals) => void;
  preferences: StorePreference[];
  householdId?: string;
  exportData: object;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(goals);
  const [saving, setSaving] = useState(false);
  const persistGoals = async () => {
    setSaving(true);
    try {
      await saveFoodGoals(draft, householdId);
      setGoals(draft);
      notify("Household food goals saved.");
    } catch {
      notify("Could not save food goals.");
    } finally {
      setSaving(false);
    }
  };
  const changePreference = async (
    preference: StorePreference,
    preferredStore: StorePreference["preferredStore"],
  ) => {
    try {
      await saveStorePreference({ ...preference, preferredStore }, householdId);
      notify(`${preference.name} preference updated.`);
    } catch {
      notify("Could not update that store preference.");
    }
  };
  const forgetPreference = async (preference: StorePreference) => {
    try {
      await deleteStorePreference(preference.itemId, householdId);
      notify(`${preference.name} returned to automatic store selection.`);
    } catch {
      notify("Could not remove that preference.");
    }
  };
  const downloadExport = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            version: APP_VERSION,
            household: "MercaSync",
            ...exportData,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mercasync-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Private household export downloaded.");
  };
  return (
    <section className="settings-page">
      <article className="status-card">
        <div>
          <span
            className={connectivity.online ? "status-dot online" : "status-dot"}
          />
          <div>
            <p className="eyebrow">HOUSEHOLD STATUS</p>
            <h2>
              {connectivity.online
                ? "Synced and ready"
                : "Offline — cached view"}
            </h2>
            <p>
              {displayName} · {email}
            </p>
          </div>
        </div>
        <span className="settings-version">v{APP_VERSION}</span>
      </article>
      <div className="settings-grid">
        <article className="settings-card">
          <p className="eyebrow">FOOD DIRECTION</p>
          <h2>What “healthy and fun” means</h2>
          <label className="settings-toggle">
            <span>
              <strong>Protein-forward</strong>
              <small>
                Prioritize a substantial protein in meal suggestions
              </small>
            </span>
            <input
              type="checkbox"
              checked={draft.proteinForward}
              onChange={(event) =>
                setDraft({ ...draft, proteinForward: event.target.checked })
              }
            />
          </label>
          <label className="settings-toggle">
            <span>
              <strong>Vegetables daily</strong>
              <small>Favor meals with meaningful produce</small>
            </span>
            <input
              type="checkbox"
              checked={draft.vegetablesDaily}
              onChange={(event) =>
                setDraft({ ...draft, vegetablesDaily: event.target.checked })
              }
            />
          </label>
          <label className="settings-toggle">
            <span>
              <strong>Seasonal ingredients</strong>
              <small>Use seasonal options when practical</small>
            </span>
            <input
              type="checkbox"
              checked={draft.seasonalPriority}
              onChange={(event) =>
                setDraft({ ...draft, seasonalPriority: event.target.checked })
              }
            />
          </label>
          <label>
            Maximum weeknight minutes
            <input
              type="number"
              min="10"
              max="90"
              value={draft.maxWeeknightMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  maxWeeknightMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Avoid ingredients
            <input
              value={draft.avoidIngredients}
              onChange={(event) =>
                setDraft({ ...draft, avoidIngredients: event.target.value })
              }
              placeholder="Allergies, dislikes, or exclusions"
            />
          </label>
          <label>
            Planning notes
            <textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
          <button
            className="save-settings"
            disabled={saving}
            onClick={persistGoals}
          >
            {saving ? "Saving…" : "Save food goals"}
          </button>
        </article>
        <article className="settings-card">
          <p className="eyebrow">SHOPPING RHYTHM</p>
          <h2>Stores and bulk rules</h2>
          <button
            className={
              costcoThisWeek ? "costco-toggle active" : "costco-toggle"
            }
            onClick={() => setCostcoThisWeek(!costcoThisWeek)}
          >
            <span>{costcoThisWeek ? "✓" : "○"}</span>
            <span>
              <strong>
                {costcoThisWeek ? "Costco this week" : "No Costco this week"}
              </strong>
              <small>Biweekly trips are best Tuesday–Thursday after work</small>
            </span>
          </button>
          {preferences.length ? (
            <div className="preference-list">
              {preferences.map((preference) => (
                <div key={preference.id}>
                  <span>
                    <strong>{preference.name}</strong>
                    <small>
                      {preference.bulkMode === "never"
                        ? "Weekly-size purchase"
                        : "Household store memory"}
                    </small>
                  </span>
                  <select
                    aria-label={`Preferred store for ${preference.name}`}
                    value={preference.preferredStore}
                    onChange={(event) =>
                      changePreference(
                        preference,
                        event.target.value as StorePreference["preferredStore"],
                      )
                    }
                  >
                    <option value="auto">Automatic</option>
                    <option value="King Soopers">King Soopers</option>
                    <option value="Costco">Costco</option>
                  </select>
                  <button
                    aria-label={`Forget preference for ${preference.name}`}
                    onClick={() => forgetPreference(preference)}
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-empty">
              No remembered item choices yet. Use “Move & remember” from a
              grocery item to teach MercaSync.
            </p>
          )}
        </article>
        <article className="settings-card">
          <p className="eyebrow">AUTOMATION & PRIVACY</p>
          <h2>You remain in control</h2>
          <ul className="trust-list">
            <li>
              <strong>Rules do the math</strong>
              <span>
                Schedule, servings, inventory, and store splitting remain
                deterministic.
              </span>
            </li>
            <li>
              <strong>ChatGPT suggests</strong>
              <span>
                AI can propose seasonal recipes and planning context, but cannot
                approve changes.
              </span>
            </li>
            <li>
              <strong>Private household</strong>
              <span>
                Firestore access is restricted to authenticated household
                members.
              </span>
            </li>
          </ul>
          <button className="export-button" onClick={downloadExport}>
            Download my household data
          </button>
          <button
            className="signout-settings"
            onClick={() => signOutOfHousehold()}
          >
            Sign out
          </button>
        </article>
      </div>
    </section>
  );
}
function InventoryView({
  inventory,
  householdId,
  notify,
}: {
  inventory: InventoryItem[];
  householdId?: string;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "low" | "recent">(
    "review",
  );
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [quantity, setQuantity] = useState("");
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newUnit, setNewUnit] = useState("each");
  const [usingItem, setUsingItem] = useState<InventoryItem | null>(null);
  const [usedAmount, setUsedAmount] = useState("1");
  const confirm = async (item: InventoryItem) => {
    try {
      await confirmInventoryItem(item, householdId);
      notify(`${item.name} confirmed at 100%.`);
    } catch {
      notify(`Could not confirm ${item.name}.`);
    }
  };
  const openCorrection = (item: InventoryItem) => {
    setEditing(item);
    setQuantity(String(item.quantity));
  };
  const openUse = (item: InventoryItem) => {
    setUsingItem(item);
    setUsedAmount(String(Math.min(1, item.quantity)));
  };
  const recordUse = async () => {
    if (!usingItem) return;
    const amount = Number(usedAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > usingItem.quantity) {
      notify(`Enter an amount up to ${usingItem.quantity} ${usingItem.unit}.`);
      return;
    }
    const remaining = Math.round((usingItem.quantity - amount) * 100) / 100;
    try {
      await setInventoryQuantity(usingItem, remaining, householdId);
      notify(remaining === 0 ? `${usingItem.name} marked finished.` : `${amount} ${usingItem.unit} of ${usingItem.name} used.`);
      setUsingItem(null);
    } catch {
      notify(`Could not update ${usingItem.name}.`);
    }
  };
  const finishUsing = async () => {
    if (!usingItem) return;
    try {
      await setInventoryQuantity(usingItem, 0, householdId);
      notify(`${usingItem.name} marked finished.`);
      setUsingItem(null);
    } catch {
      notify(`Could not update ${usingItem.name}.`);
    }
  };
  const chooseCorrection = (correction: InventoryCorrection) => {
    if (!editing) return;
    setQuantity(
      String(correctedInventoryQuantity(editing.quantity, correction)),
    );
  };
  const saveCorrection = async () => {
    if (!editing) return;
    const next = Number(quantity);
    if (!Number.isFinite(next) || next < 0) {
      notify("Enter a quantity of zero or more.");
      return;
    }
    try {
      await setInventoryQuantity(editing, next, householdId);
      notify(
        next === 0
          ? `${editing.name} removed from inventory.`
          : `${editing.name} corrected and confirmed.`,
      );
      setEditing(null);
    } catch {
      notify(`Could not update ${editing.name}.`);
    }
  };
  const addItem = async () => {
    const amount = Number(newQuantity);
    try {
      await addInventoryItem(newName, amount, newUnit, householdId);
      notify(`${newName.trim()} added to shared inventory.`);
      setAdding(false);
      setNewName("");
      setNewQuantity("");
      setNewUnit("each");
    } catch {
      notify("Enter a valid item, quantity, and unit.");
    }
  };
  const duplicates = inventoryDuplicateGroups(inventory);
  const reviewCount = inventory.filter((item) => effectiveInventoryConfidence(item) < 75).length;
  const visible = inventory.filter((item) => {
    if (
      !`${item.name} ${inventoryCategory(item)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
      return false;
    const confidence = effectiveInventoryConfidence(item);
    if (filter === "review") return confidence < 75;
    if (filter === "low") return item.quantity <= 1;
    if (filter === "recent")
      return (
        !!item.lastConfirmedAt &&
        openedAt - new Date(item.lastConfirmedAt).getTime() < 7 * 86_400_000
      );
    return true;
  });
  const confirmVisible = async () => {
    setConfirmingAll(true);
    try {
      await confirmInventoryItems(visible, householdId);
      notify(
        `${visible.length} inventory ${visible.length === 1 ? "item" : "items"} confirmed.`,
      );
    } catch {
      notify("Could not confirm this inventory group.");
    } finally {
      setConfirmingAll(false);
    }
  };
  return (
    <section className="inventory-page">
      <div className="confidence-key">
        <span className="pulse" />
        Confidence falls 2% per day after confirmation and changes shopping
        quantities.
      </div>
      <section className="weekend-inventory-check">
        <div>
          <p className="eyebrow">WEEKEND KITCHEN CHECK</p>
          <h2>{reviewCount ? `${reviewCount} things to confirm` : "Inventory is current"}</h2>
          <p>Review the uncertain items before building groceries; use the full list only when you want a deeper pantry reset.</p>
        </div>
        <div>
          <button onClick={() => { setFilter("review"); setQuery(""); }}>Review uncertain</button>
          <button onClick={() => { setFilter("all"); setQuery(""); }}>Deep check</button>
          <button onClick={() => inventory[0] ? openUse(inventory[0]) : notify("Add something to inventory first.")}>I used something</button>
        </div>
      </section>
      <div className="inventory-toolbar">
        <label>
          <span>Find inventory</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search food or category"
          />
        </label>
        <div className="inventory-filters">
          {(
            [
              ["review", "Needs review"],
              ["low", "Running low"],
              ["recent", "Recent"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {duplicates.length > 0 && (
        <div className="duplicate-warning" role="status">
          <strong>Possible duplicate inventory</strong>
          <span>
            {duplicates
              .map((group) =>
                group.map((item) => `${item.name} (${item.unit})`).join(" + "),
              )
              .join(", ")}
          </span>
          <small>
            Keep both only when the units represent separate packages.
          </small>
        </div>
      )}
      <div className="inventory-result-heading">
        <p>
          <strong>{visible.length}</strong>{" "}
          {filter === "review" ? "quick checks" : "items"}
        </p>
        {visible.length > 1 && (
          <button disabled={confirmingAll} onClick={confirmVisible}>
            {confirmingAll ? "Confirming…" : `Confirm all ${visible.length}`}
          </button>
        )}
      </div>
      {visible.map((item) => {
        const confidence = effectiveInventoryConfidence(item);
        return (
          <article
            className="inventory-card"
            key={`${item.itemId}-${item.unit}`}
          >
            <div>
              <span className="inventory-category">
                {inventoryCategory(item)}
              </span>
              <strong>{item.name}</strong>
              <small>
                {formatGroceryQuantity(item.quantity, item.unit)} estimated
              </small>
            </div>
            <div className="confidence">
              <span style={{ width: `${confidence}%` }} />
              <small>{confidence}% sure</small>
            </div>
            <div className="inventory-actions">
              <button onClick={() => openUse(item)}>Used</button>
              <button onClick={() => openCorrection(item)}>Adjust</button>
              <button onClick={() => confirm(item)}>Looks right</button>
            </div>
          </article>
        );
      })}
      {visible.length === 0 && (
        <div className="inventory-empty">
          <strong>
            {filter === "review"
              ? "Inventory is reviewed"
              : "No matching items"}
          </strong>
          <p>
            {filter === "review"
              ? "Nothing needs your attention right now."
              : "Try another filter or search."}
          </p>
        </div>
      )}
      <button className="add-button" onClick={() => setAdding(true)}>
        ＋ Add an item we already have
      </button>
      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <section
            className="schedule-sheet inventory-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Adjust ${editing.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">QUICK CORRECTION</p>
                <h2>{editing.name}</h2>
              </div>
              <button aria-label="Close" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="inventory-presets">
              {(
                [
                  ["out", "Out"],
                  ["half", "About half"],
                  ["same", "Looks right"],
                  ["more", "More"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} onClick={() => chooseCorrection(value)}>
                  {label}
                </button>
              ))}
            </div>
            <label>
              Estimated quantity
              <input
                autoFocus
                type="number"
                min="0"
                step="0.25"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              <small>{editing.unit}</small>
            </label>
            <button className="save-schedule" onClick={saveCorrection}>
              Save correction
            </button>
            <p className="sheet-note">
              This confirms the amount at 100% and immediately recalculates
              groceries.
            </p>
          </section>
        </div>
      )}
      {usingItem && (
        <div className="sheet-backdrop" onClick={() => setUsingItem(null)}>
          <section className="schedule-sheet inventory-sheet" role="dialog" aria-modal="true" aria-label={`Record using ${usingItem.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-heading"><div><p className="eyebrow">QUICK INVENTORY UPDATE</p><h2>Used {usingItem.name}</h2></div><button aria-label="Close" onClick={() => setUsingItem(null)}>×</button></div>
            <p className="sheet-note">You have about {formatGroceryQuantity(usingItem.quantity, usingItem.unit)}. This immediately updates the grocery math.</p>
            <label>What did you use?<select value={`${usingItem.itemId}:${usingItem.unit}`} onChange={(event) => { const next = inventory.find((item) => `${item.itemId}:${item.unit}` === event.target.value); if (next) openUse(next); }}>{inventory.map((item) => <option key={`${item.itemId}:${item.unit}`} value={`${item.itemId}:${item.unit}`}>{item.name} · {formatGroceryQuantity(item.quantity, item.unit)}</option>)}</select></label>
            <label>Amount used<input autoFocus type="number" min="0.01" max={usingItem.quantity} step="0.25" inputMode="decimal" value={usedAmount} onChange={(event) => setUsedAmount(event.target.value)} /><small>{usingItem.unit}</small></label>
            <button className="save-schedule" onClick={recordUse}>Record used amount</button>
            <button className="delete-recurring" onClick={finishUsing}>Finished it</button>
          </section>
        </div>
      )}
      {adding && (
        <div className="sheet-backdrop" onClick={() => setAdding(false)}>
          <section
            className="schedule-sheet inventory-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Add inventory item"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">WHAT IS ALREADY HOME?</p>
                <h2>Add inventory</h2>
              </div>
              <button aria-label="Close" onClick={() => setAdding(false)}>
                ×
              </button>
            </div>
            <label>
              Item name
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Brown rice"
              />
            </label>
            <div className="add-inventory-grid">
              <label>
                Quantity
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  inputMode="decimal"
                  value={newQuantity}
                  onChange={(event) => setNewQuantity(event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Unit
                <select
                  value={newUnit}
                  onChange={(event) => setNewUnit(event.target.value)}
                >
                  <option value="each">each</option>
                  <option value="lb">lb</option>
                  <option value="oz">oz</option>
                  <option value="cup">cup</option>
                  <option value="can">can</option>
                  <option value="tbsp">tbsp</option>
                </select>
              </label>
            </div>
            <button className="save-schedule" onClick={addItem}>
              Add & confirm
            </button>
            <p className="sheet-note">
              New items start at 100% confidence and immediately reduce matching
              grocery needs.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
function GroceriesView({
  items,
  week,
  trips,
  householdId,
  store,
  setStore,
  toggle,
  costcoThisWeek,
  preferences,
  notify,
  openInventory,
}: {
  items: Grocery[];
  week: PlanningDay[];
  trips: ShoppingTrip[];
  householdId?: string;
  store: StoreName;
  setStore: (store: StoreName) => void;
  toggle: (id: string) => void;
  costcoThisWeek: boolean;
  preferences: StorePreference[];
  notify: (message: string) => void;
  openInventory: () => void;
}) {
  const visible = items.filter((item) => item.store === store);
  const remaining = visible.filter((item) => !item.checked).length;
  const completed = visible.length - remaining;
  const grocerySections = (["Produce", "Protein", "Dairy", "Pantry", "Frozen", "Household", "Personal care & health", "Other"] as const)
    .map((name) => ({ name, items: visible.filter((item) => (item.section || inventoryCategory(item)) === name) }))
    .filter((section) => section.items.length > 0);
  const trip = trips.find((candidate) => candidate.store === store);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("each");
  const [note, setNote] = useState("");
  const [editingItem, setEditingItem] = useState<Grocery | null>(null);
  const [editedQuantity, setEditedQuantity] = useState(1);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<Grocery | null>(null);
  const changeTripDate = async (date: string) => {
    try {
      await saveShoppingTrip(store, date, week[0].date, householdId);
      notify(`${store} trip moved. Both calendars updated.`);
    } catch {
      notify("Could not save that shopping date.");
    }
  };
  const addItem = async () => {
    try {
      await addManualGroceryItem(
        week[0].date,
        { name, quantity, unit, store, note },
        householdId,
      );
      setName("");
      setQuantity(1);
      setUnit("each");
      setNote("");
      setAddOpen(false);
      notify(`${name.trim()} added to ${store}.`);
    } catch {
      notify("Add an item name, quantity, and unit.");
    }
  };
  const moveItem = async (remember: boolean) => {
    if (!movingItem) return;
    const destination =
      movingItem.store === "Costco" ? "King Soopers" : "Costco";
    try {
      await moveGroceryItem(
        week[0].date,
        movingItem.id,
        destination,
        householdId,
      );
      if (remember)
        await saveStorePreference(
          {
            itemId: canonicalItemId(movingItem.id || movingItem.name),
            name: movingItem.name,
            preferredStore: destination,
            bulkMode: destination === "Costco" ? "auto" : "never",
            packageQuantity: null,
            packageUnit: null,
            shelfLifeDays: null,
            freezable: false,
          },
          householdId,
        );
      setMovingItem(null);
      notify(
        `${movingItem.name} moved to ${destination}${remember ? " and remembered" : " for this week"}.`,
      );
    } catch {
      notify("Could not move that item.");
    }
  };
  const editItem = (item: Grocery) => {
    setEditingItem(item);
    setEditedQuantity(item.quantity || 1);
  };
  const saveQuantity = async () => {
    if (!editingItem) return;
    try {
      await updateGroceryQuantity(
        week[0].date,
        editingItem.id,
        editedQuantity,
        householdId,
      );
      setEditingItem(null);
      notify(`${editingItem.name} quantity updated.`);
    } catch {
      notify("Could not update that quantity.");
    }
  };
  const buyActualQuantity = async () => {
    if (!editingItem) return;
    try {
      await setGroceryItemPurchased(
        week[0].date,
        editingItem.id,
        true,
        householdId,
        editedQuantity,
      );
      setEditingItem(null);
      notify(
        `${editedQuantity} ${editingItem.unit} of ${editingItem.name} added to inventory.`,
      );
    } catch {
      notify("Could not record that purchase.");
    }
  };
  const removeItem = async () => {
    if (!editingItem) return;
    try {
      await removeGroceryItem(week[0].date, editingItem.id, householdId);
      setEditingItem(null);
      notify(`${editingItem.name} removed for this week.`);
    } catch {
      notify("Could not remove that item.");
    }
  };
  return (
    <section className="groceries-page">
      <div className="store-tabs">
        <button
          className={store === "King Soopers" ? "active" : ""}
          onClick={() => setStore("King Soopers")}
        >
          King Soopers{" "}
          <span>
            {
              items.filter(
                (item) => item.store === "King Soopers" && !item.checked,
              ).length
            }
          </span>
        </button>
        <button
          className={store === "Costco" ? "active" : ""}
          onClick={() => setStore("Costco")}
        >
          Costco{" "}
          <span>
            {
              items.filter((item) => item.store === "Costco" && !item.checked)
                .length
            }
          </span>
        </button>
      </div>
      <div className="list-summary">
        <div>
          <p className="eyebrow">
            {trip?.date
              ? `PLANNED · ${new Date(`${trip.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
              : storeRunLabel(week, store, costcoThisWeek)}
          </p>
          <h2>{store}</h2>
        </div>
        <div className="shopping-progress" aria-label={`${completed} of ${visible.length} items checked`}>
          <strong>{completed}/{visible.length}</strong>
          <small>{remaining ? `${remaining} left` : "Done"}</small>
          <span><i style={{ width: `${visible.length ? (completed / visible.length) * 100 : 0}%` }} /></span>
        </div>
      </div>
      <label className="shopping-date">
        <span>
          <strong>Shopping date</strong>
          <small>Shown on work and meal calendars</small>
        </span>
        <input
          type="date"
          value={trip?.date || ""}
          onChange={(event) => changeTripDate(event.target.value)}
        />
      </label>
      <button className="add-grocery-button" onClick={() => setAddOpen(true)}>
        ＋ Add something we need
      </button>
      {visible.length > 0 ? (
        <div className="shopping-list">
          {grocerySections.map((section) => (<section className="grocery-section" key={section.name}><h3>{section.name}</h3>{section.items.map((item) => (
            <article
              className={
                item.checked ? "shopping-item-row checked" : "shopping-item-row"
              }
              key={item.id}
            >
              <button
                className="shopping-check"
                onClick={() => toggle(item.id)}
              >
                <span className="big-check">✓</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
              <div className="grocery-row-actions">
                <button
                  onClick={() =>
                    setExplainingId(explainingId === item.id ? null : item.id)
                  }
                >
                  Why here?
                </button>
                <button onClick={() => editItem(item)}>Edit</button>
                <button onClick={() => setMovingItem(item)}>Move</button>
              </div>
              {explainingId === item.id && (
                <div className="store-explanation">
                  <span>◎</span>
                  <p>
                    <strong>
                      {item.store === "Costco"
                        ? "Bulk buy makes sense"
                        : "Weekly-size buy makes sense"}
                    </strong>
                    {item.storeReason ||
                    (item.manual && item.detail) ||
                    preferences.some(
                      (preference) =>
                        preference.itemId === canonicalItemId(item.id),
                    )
                      ? "This follows your remembered household preference."
                      : "This follows the current shelf-life and quantity rules."}
                  </p>
                </div>
              )}
            </article>
          ))}</section>))}
        </div>
      ) : (
        <div className="empty-groceries">
          <strong>Nothing needed here</strong>
          <p>
            This week’s recipes are covered by the other store or estimated
            inventory.
          </p>
        </div>
      )}
      <div className="auto-note">
        <span className="pulse" />
        <p>
          <strong>Calculated from this week</strong>
          <br />
          Schedule-aware recipe servings − compatible estimated inventory
        </p>
      </div>
      <button className="grocery-inventory-handoff" onClick={openInventory}>
        <span>◫</span>
        <span><strong>Update inventory after shopping</strong><small>Confirm what is actually home or record something you used.</small></span>
        <b>→</b>
      </button>
      {addOpen && (
        <div className="sheet-backdrop" onClick={() => setAddOpen(false)}>
          <section
            className="schedule-sheet grocery-adder"
            role="dialog"
            aria-modal="true"
            aria-label="Add grocery item"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">{store.toUpperCase()}</p>
                <h2>Add grocery item</h2>
              </div>
              <button aria-label="Close" onClick={() => setAddOpen(false)}>
                ×
              </button>
            </div>
            <label>
              What do you need?
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Greek yogurt"
              />
            </label>
            <div className="creator-grid">
              <label>
                Quantity
                <input
                  type="number"
                  min="0.01"
                  step="0.25"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>
              <label>
                Unit
                <input
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder="each, lb, oz"
                />
              </label>
            </div>
            <label>
              Note <small>optional</small>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For breakfast"
              />
            </label>
            <button className="save-schedule" onClick={addItem}>
              Add to {store}
            </button>
          </section>
        </div>
      )}
      {editingItem && (
        <div className="sheet-backdrop" onClick={() => setEditingItem(null)}>
          <section
            className="schedule-sheet grocery-adder"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingItem.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">
                  {editingItem.checked ? "PURCHASED" : "IN THE STORE"}
                </p>
                <h2>{editingItem.name}</h2>
              </div>
              <button aria-label="Close" onClick={() => setEditingItem(null)}>
                ×
              </button>
            </div>
            <label>
              {editingItem.checked
                ? "Recorded quantity"
                : "Quantity in your cart"}
              <input
                type="number"
                min="0.01"
                step="0.25"
                value={editedQuantity}
                onChange={(event) =>
                  setEditedQuantity(Number(event.target.value))
                }
              />
              <small>{editingItem.unit}</small>
            </label>
            {!editingItem.checked && (
              <button className="save-schedule" onClick={buyActualQuantity}>
                Bought this amount ✓
              </button>
            )}
            <button className="remember-store" onClick={saveQuantity}>
              Update needed quantity only
            </button>
            <button className="delete-recurring" onClick={removeItem}>
              Didn’t get it — remove this week
            </button>
            <p className="sheet-note">
              The amount actually purchased—not the suggestion—is added to
              inventory.
            </p>
          </section>
        </div>
      )}
      {movingItem && (
        <div className="sheet-backdrop" onClick={() => setMovingItem(null)}>
          <section
            className="schedule-sheet move-store-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Move ${movingItem.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">STORE CHOICE</p>
                <h2>Move {movingItem.name}</h2>
              </div>
              <button aria-label="Close" onClick={() => setMovingItem(null)}>
                ×
              </button>
            </div>
            <p>
              Move it to{" "}
              {movingItem.store === "Costco" ? "King Soopers" : "Costco"} for
              just this list, or teach MercaSync what your household normally
              prefers.
            </p>
            <button className="save-schedule" onClick={() => moveItem(false)}>
              Move this week only
            </button>
            <button className="remember-store" onClick={() => moveItem(true)}>
              Move & remember for future weeks
            </button>
            <p className="sheet-note">
              Remembered choices remain editable in Settings. Produce still
              defaults to King Soopers unless you explicitly remember Costco.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
