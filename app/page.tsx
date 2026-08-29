'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleException,
  deleteScheduleException,
  subscribeToScheduleExceptions,
  updateScheduleException,
} from '@/lib/data/schedule-repository';
import { saveCostcoWeek, saveDinnerTarget, saveMealPlan, subscribeToPlanningSettings, subscribeToSavedMealPlan } from '@/lib/data/meal-plan-repository';
import { clearMealOverride, saveMealOverride, subscribeToMealOverrides } from '@/lib/data/meal-override-repository';
import { createRecipe, subscribeToRecipes, updateRecipePreferences } from '@/lib/data/recipe-repository';
import { addInventoryItem, confirmInventoryItem, setInventoryQuantity, subscribeToInventory } from '@/lib/data/inventory-repository';
import { saveRecurringProfile, subscribeToRecurringProfiles } from '@/lib/data/recurring-profile-repository';
import { addManualGroceryItem, moveGroceryItem, setGroceryItemPurchased, subscribeToGroceryRun, syncGroceryRun } from '@/lib/data/grocery-repository';
import { saveShoppingTrip, subscribeToShoppingTrips, type ShoppingTrip } from '@/lib/data/shopping-trip-repository';
import { setMealCompletion, subscribeToMealCompletions } from '@/lib/data/meal-completion-repository';
import { planningInputFingerprint, type SavedMealPlanDay } from '@/lib/domain/meal-plan';
import { applyMealOverrides, type DinnerOverrideKind, type MealOverride } from '@/lib/domain/meal-override';
import { mealCompletionId, type MealCompletion, type MealCompletionStatus, type MealTypeKey } from '@/lib/domain/meal-reconciliation';
import { buildGroceryNeeds, formatGroceryQuantity, type GroceryRunItem } from '@/lib/domain/grocery';
import { correctedInventoryQuantity, effectiveInventoryConfidence, STARTER_INVENTORY, type InventoryCorrection, type InventoryItem } from '@/lib/domain/inventory';
import { STARTER_RECIPES, type MealType, type Recipe } from '@/lib/domain/recipe';
import { RECURRING_PROFILES, recurringProfileOccurrences, type RecurringConsumptionProfile } from '@/lib/domain/recurring-consumption';
import { generateSmartPlan } from '@/lib/domain/smart-planner';
import { applyStoreCadence, storeRunLabel } from '@/lib/domain/store-cadence';
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
} from '@/lib/domain/schedule';
import {
  signInToHousehold,
  signOutOfHousehold,
} from '@/lib/auth/household-auth';
import { useHouseholdSession } from '@/lib/auth/use-household-session';
import { usesFirebaseBackend } from '@/lib/firebase/client';
import { APP_VERSION } from '@/lib/version';

type Grocery = { id: string; name: string; detail: string; store: 'King Soopers' | 'Costco'; checked: boolean };
const fallbackGroceries: Grocery[] = [
  { id: 'salmon', name: 'Wild salmon', detail: '1 lb · Miso bowls', store: 'King Soopers', checked: false },
  { id: 'spinach', name: 'Baby spinach', detail: '1 bag · Orzo + breakfast', store: 'King Soopers', checked: false },
  { id: 'cucumbers', name: 'Persian cucumbers', detail: '5 · Bowls + pitas', store: 'King Soopers', checked: true },
  { id: 'yogurt', name: 'Greek yogurt', detail: '32 oz · Low confidence at home', store: 'Costco', checked: false },
  { id: 'chicken', name: 'Chicken breast', detail: '6 lb · Refill freezer staple', store: 'Costco', checked: false },
];
const nav = [{ label: 'Plan', icon: '⌂' }, { label: 'Calendar', icon: '□' }, { label: 'Recipes', icon: '◇' }, { label: 'Inventory', icon: '◫' }, { label: 'Groceries', icon: '✓' }];

export default function Home() {
  const [active, setActive] = useState('Plan');
  const [items, setItems] = useState<Grocery[]>(fallbackGroceries);
  const [inventory, setInventory] = useState<InventoryItem[]>(STARTER_INVENTORY);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [sharedGroceryItems, setSharedGroceryItems] = useState<GroceryRunItem[]>([]);
  const [mealCompletions, setMealCompletions] = useState<MealCompletion[]>([]);
  const [groceryRunReady, setGroceryRunReady] = useState(false);
  const [recipeItems, setRecipeItems] = useState<Recipe[]>(STARTER_RECIPES);
  const [recurringProfiles, setRecurringProfiles] = useState<RecurringConsumptionProfile[]>(RECURRING_PROFILES);
  const [events, setEvents] = useState<ScheduleException[]>([]);
  const [mealOverrides, setMealOverrides] = useState<MealOverride[]>([]);
  const [shoppingTrips, setShoppingTrips] = useState<ShoppingTrip[]>([]);
  const [editingMealDate, setEditingMealDate] = useState<string | null>(null);
  const [store, setStore] = useState<'King Soopers' | 'Costco'>('King Soopers');
  const [toast, setToast] = useState('');
  const [savedPlan, setSavedPlan] = useState<{ sourceFingerprint: string; days: SavedMealPlanDay[] } | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [dinnerTarget, setDinnerTarget] = useState(5);
  const [costcoThisWeek, setCostcoThisWeek] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const auth = useHouseholdSession();
  const firebaseEnabled = usesFirebaseBackend();
  const scheduleWeek = useMemo(() => buildPlanningWeek(events, new Date(), 'America/Denver', dinnerTarget), [dinnerTarget, events]);
  const planningFingerprint = useMemo(() => planningInputFingerprint(scheduleWeek, recipeItems, mealOverrides), [mealOverrides, recipeItems, scheduleWeek]);
  const generatedWeek = useMemo(() => applyMealOverrides(generateSmartPlan(scheduleWeek, recipeItems, inventory, mealCompletions), mealOverrides, recipeItems), [inventory, mealCompletions, mealOverrides, recipeItems, scheduleWeek]);
  const week = useMemo(() => {
    if (resetOpen || savedPlan?.sourceFingerprint !== planningFingerprint) return generatedWeek;
    const savedByDate = new Map(savedPlan.days.map((day) => [day.date, day]));
    return scheduleWeek.map((day) => ({ ...day, ...(savedByDate.get(day.date) || {}) }));
  }, [generatedWeek, planningFingerprint, resetOpen, savedPlan, scheduleWeek]);
  const displayedTrips = useMemo(() => {
    const defaults: ShoppingTrip[] = [
      { id: `${week[0]?.date}--king-soopers`, store: 'King Soopers', date: week[5]?.date || '' },
      { id: `${week[0]?.date}--costco`, store: 'Costco', date: week[2]?.date || '' },
    ];
    return defaults.map((fallback) => shoppingTrips.find((trip) => trip.id === fallback.id) || fallback);
  }, [shoppingTrips, week]);
  const calculatedNeeds = useMemo(() => applyStoreCadence(buildGroceryNeeds(week, recipeItems, inventory, new Date(), recurringProfiles), costcoThisWeek), [costcoThisWeek, inventory, recipeItems, recurringProfiles, week]);
  const displayItems = useMemo(() => {
    if (!firebaseEnabled) return items;
    const needs = groceryRunReady ? sharedGroceryItems : calculatedNeeds.map((need) => ({ ...need, checked: false, purchasedQuantity: 0, purchasedAt: null }));
    return needs.map((need) => {
      const recipeSummary = need.sources.length <= 2
        ? need.sources.join(' + ')
        : `${need.sources.slice(0, 2).join(' + ')} + ${need.sources.length - 2} more`;
      const inventorySummary = need.inventoryUsed > 0
        ? ` · ${formatGroceryQuantity(need.inventoryUsed, need.unit)} on hand used`
        : '';
      return {
        id: need.id,
        name: need.name,
        detail: `${formatGroceryQuantity(need.quantity, need.unit)} · ${recipeSummary}${inventorySummary} · ${need.storeReason}`,
        store: need.store,
        checked: need.checked,
      };
    });
  }, [calculatedNeeds, firebaseEnabled, groceryRunReady, items, sharedGroceryItems]);
  const remaining = useMemo(() => displayItems.filter((item) => !item.checked).length, [displayItems]);
  const planIsSaved = !resetOpen && savedPlan?.sourceFingerprint === planningFingerprint;
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    if (firebaseEnabled) return;
    fetch('/api/home').then((response) => response.ok ? response.json() : null).then((data) => { if (data?.groceries?.length) setItems(data.groceries); }).catch(() => undefined);
  }, [firebaseEnabled]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToScheduleExceptions(
      auth.session?.householdId,
      setEvents,
      () => notify('Could not load the shared schedule.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToMealOverrides(auth.session?.householdId, setMealOverrides, () => notify('Could not load meal changes.'));
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToShoppingTrips(auth.session?.householdId, setShoppingTrips, () => notify('Could not load shopping dates.'));
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToMealCompletions(
      auth.session?.householdId,
      setMealCompletions,
      () => notify('Could not load meal confirmations.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToInventory(
      auth.session?.householdId,
      (next) => { setInventory(next); setInventoryReady(true); },
      () => notify('Could not load shared inventory.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToGroceryRun(
      week[0].date,
      auth.session.householdId,
      (next) => { setSharedGroceryItems(next); setGroceryRunReady(true); },
      () => notify('Could not load the shared grocery run.'),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0] || !inventoryReady) return;
    syncGroceryRun(calculatedNeeds, week[0].date, auth.session.householdId)
      .catch(() => notify('Could not refresh the shared grocery run.'));
  }, [auth.session, calculatedNeeds, firebaseEnabled, inventoryReady, notify, week]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session || !week[0]) return;
    return subscribeToSavedMealPlan(
      week[0].date,
      auth.session.householdId,
      setSavedPlan,
      () => notify('Could not load the shared meal plan.'),
    );
  }, [auth.session, firebaseEnabled, notify, week]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToRecipes(
      auth.session?.householdId,
      setRecipeItems,
      () => notify('Could not load the shared recipe library.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToRecurringProfiles(auth.session?.householdId, setRecurringProfiles, () => notify('Could not load recurring food routines.'));
  }, [auth.session, firebaseEnabled, notify]);
  useEffect(() => {
    if (!firebaseEnabled || !auth.session) return;
    return subscribeToPlanningSettings(
      auth.session.householdId,
      (settings) => { setDinnerTarget(settings.dinnerTarget); setCostcoThisWeek(settings.costcoThisWeek); },
      () => notify('Could not load the weekly planning settings.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  const persistPlan = async () => {
    setSavingPlan(true);
    try {
      await saveMealPlan(week, planningFingerprint, auth.session?.householdId);
      setSavedPlan({ sourceFingerprint: planningFingerprint, days: week.map(({ date, alex, nathalia, lunch, meal }) => ({ date, alex, nathalia, lunch, meal })) });
      notify('Weekly lunches and dinners saved for both of you.');
    } catch { notify('Could not save the shared plan.'); }
    finally { setSavingPlan(false); }
  };
  const toggleItem = async (id: string) => {
    const current = displayItems.find((item) => item.id === id); if (!current) return;
    const checked = !current.checked;
    if (firebaseEnabled) {
      try {
        await setGroceryItemPurchased(week[0].date, id, checked, auth.session?.householdId);
        notify(checked ? `${current.name} purchased and added to inventory.` : `${current.name} purchase undone.`);
      } catch { notify('Could not sync that purchase. Try again.'); }
      return;
    }
    setItems((all) => all.map((item) => item.id === id ? { ...item, checked } : item));
    try {
      const response = await fetch('/api/home', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, checked }) });
      if (!response.ok) throw new Error('save failed');
      notify(checked ? `${current.name} added to inventory` : `${current.name} returned to the list`);
    } catch { setItems((all) => all.map((item) => item.id === id ? { ...item, checked: current.checked } : item)); notify('Could not save that change. Try again.'); }
  };
  const changeDinnerTarget = async (target: number) => {
    const previous = dinnerTarget;
    setDinnerTarget(target);
    try { await saveDinnerTarget(target, costcoThisWeek, auth.session?.householdId); notify(`Planning ${target} ${target === 1 ? 'dinner' : 'dinners'} to cook.`); }
    catch { setDinnerTarget(previous); notify('Could not save the dinner count.'); }
  };
  const changeCostcoWeek = async (next: boolean) => {
    const previous = costcoThisWeek;
    setCostcoThisWeek(next);
    try { await saveCostcoWeek(next, dinnerTarget, auth.session?.householdId); notify(next ? 'Costco run added for this week.' : 'Costco moved to next week. Immediate needs moved to King Soopers.'); }
    catch { setCostcoThisWeek(previous); notify('Could not save the Costco cadence.'); }
  };
  const finishReset = async () => {
    await persistPlan();
    setResetOpen(false);
    setActive('Groceries');
  };
  const changeMeal = async (date: string, kind: DinnerOverrideKind, recipeId: string | null, servings: number | null) => {
    try {
      await saveMealOverride({ date, kind, recipeId, servings }, auth.session?.householdId);
      setMealOverrides((all) => [...all.filter((item) => item.date !== date), { id: date, date, kind, recipeId, servings }]);
      setEditingMealDate(null);
      notify('Dinner updated. Groceries recalculated.');
    } catch { notify('Could not update that dinner.'); }
  };
  const resetMeal = async (date: string) => {
    try { await clearMealOverride(date, auth.session?.householdId); setMealOverrides((all) => all.filter((item) => item.date !== date)); setEditingMealDate(null); notify('Automatic dinner restored.'); }
    catch { notify('Could not restore that dinner.'); }
  };
  const title = active === 'Plan' ? 'Your week' : active;

  if (firebaseEnabled && auth.loading) return <LoadingView />;
  if (firebaseEnabled && !auth.session) return <SignInView error={auth.error} />;

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.label} onClick={() => setActive(item.label)} className={active === item.label ? 'nav-item active' : 'nav-item'}><span>{item.icon}</span>{item.label}{item.label === 'Groceries' && <em>{remaining}</em>}</button>)}</nav><button className="automation-card" onClick={() => { setActive('Plan'); setResetOpen(true); }}><span className="pulse" /><div><strong>Weekend reset</strong><p>{planIsSaved ? 'Week approved · tap to refresh' : 'Ready in about 5 minutes'}</p></div></button><div className="people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span><p>{auth.session?.member.displayName || 'Alex & Nathalia'}<br/><small>{auth.session ? <button className="sign-out" onClick={() => signOutOfHousehold()}>Sign out</button> : 'Denver household'}</small></p></div></aside>
    <section className="content">
      <header className="mobile-header"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><div className="mobile-people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span></div></header>
      <header className="topbar"><div><p className="eyebrow">{formatLongDate()}</p><h1>{title}</h1><p>{active === 'Plan' ? 'Lunch and dinner, balanced around who’s home.' : 'Shared, current, and ready for both of you.'}</p></div>{active === 'Plan' && <button className={planIsSaved ? 'primary-button saved' : 'primary-button'} onClick={persistPlan} disabled={savingPlan || planIsSaved}><span>{planIsSaved ? '✓' : '↑'}</span> {savingPlan ? 'Saving…' : planIsSaved ? 'Plan saved' : savedPlan ? 'Save update' : 'Save plan'}</button>}</header>
      {active === 'Plan' && <PlanView items={displayItems} inventory={inventory} week={week} profiles={recurringProfiles} dinnerTarget={dinnerTarget} setDinnerTarget={changeDinnerTarget} startReset={() => setResetOpen(true)} editRoutines={() => setRoutinesOpen(true)} editMeal={setEditingMealDate} open={setActive} />}
      {active === 'Calendar' && <CalendarView events={events} trips={displayedTrips} week={week} recipes={recipeItems} completions={mealCompletions} householdId={auth.session?.householdId} editMeal={setEditingMealDate} onChanged={(changed) => setEvents((current) => [...current.filter((event) => event.id !== changed.id), changed].sort((a, b) => a.date.localeCompare(b.date)))} onDeleted={(id) => setEvents((current) => current.filter((event) => event.id !== id))} notify={notify} />}
      {active === 'Recipes' && <RecipesView recipes={recipeItems} householdId={auth.session?.householdId} onUpdated={(updated) => setRecipeItems((current) => current.map((recipe) => recipe.id === updated.id ? updated : recipe))} onCreated={(created) => setRecipeItems((current) => [...current.filter((recipe) => recipe.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)))} notify={notify} />}
      {active === 'Inventory' && <InventoryView inventory={inventory} householdId={auth.session?.householdId} notify={notify} />}
      {active === 'Groceries' && <GroceriesView items={displayItems} week={week} trips={displayedTrips} householdId={auth.session?.householdId} store={store} setStore={setStore} toggle={toggleItem} costcoThisWeek={costcoThisWeek} setCostcoThisWeek={changeCostcoWeek} notify={notify} />}
    </section>
    <nav className="bottom-nav" aria-label="Mobile navigation">{nav.map((item) => <button key={item.label} className={active === item.label ? 'active' : ''} onClick={() => setActive(item.label)}><span>{item.icon}</span><small>{item.label === 'Groceries' ? 'List' : item.label}</small>{item.label === 'Groceries' && remaining > 0 && <em>{remaining}</em>}</button>)}</nav>
    {toast && <div className="toast" role="status">✓ {toast}</div>}
    {resetOpen && <WeekendReset inventory={inventory} week={week} dinnerTarget={dinnerTarget} setDinnerTarget={changeDinnerTarget} householdId={auth.session?.householdId} onClose={() => setResetOpen(false)} onFinish={finishReset} notify={notify} />}
    {routinesOpen && <RoutineEditor profiles={recurringProfiles} householdId={auth.session?.householdId} onClose={() => setRoutinesOpen(false)} onSaved={(profile) => setRecurringProfiles((all) => all.map((item) => item.id === profile.id ? profile : item))} notify={notify} />}
    {editingMealDate && <MealActionSheet day={week.find((day) => day.date === editingMealDate)!} recipes={recipeItems} hasOverride={mealOverrides.some((item) => item.date === editingMealDate)} onClose={() => setEditingMealDate(null)} onSave={(kind, recipeId, servings) => changeMeal(editingMealDate, kind, recipeId, servings)} onReset={() => resetMeal(editingMealDate)} />}
  </main>;
}

function PlanView({ items, inventory, week, profiles, dinnerTarget, setDinnerTarget, startReset, editRoutines, editMeal, open }: { items: Grocery[]; inventory: InventoryItem[]; week: PlanningDay[]; profiles: RecurringConsumptionProfile[]; dinnerTarget: number; setDinnerTarget: (target: number) => void; startReset: () => void; editRoutines: () => void; editMeal: (date: string) => void; open: (tab: string) => void }) {
  const dinnerCount = week.filter((day) => day.meal.recipeId).length;
  const awayDays = week.filter((day) => !day.alex.isHome || !day.nathalia.isHome).length;
  const lateDays = week.filter((day) => day.alex.isLate || day.nathalia.isLate).length;
  const firstDinner = week.find((day) => day.meal.servings > 0) || week[0];
  const alexBreakfasts = recurringProfileOccurrences(profiles.find((profile) => profile.personId === 'alex') || RECURRING_PROFILES[0], week);
  const nathaliaSnacks = recurringProfileOccurrences(profiles.find((profile) => profile.personId === 'nathalia') || RECURRING_PROFILES[1], week);
  return <>
    <section className="reset-card"><div><p className="eyebrow">YOUR 5-MINUTE WEEKLY RITUAL</p><h2>Reset the kitchen</h2><p>Confirm only uncertain food, approve the best-fit meals, then shop from one finished list.</p></div><button onClick={startReset}>Start weekend reset <span>→</span></button></section>
    <section className="dinner-target"><div><p className="eyebrow">THIS WEEK</p><strong>Dinners to cook</strong><small>The remaining nights become leftovers or dinner out.</small></div><div className="stepper"><button aria-label="Cook one fewer dinner" disabled={dinnerTarget === 0} onClick={() => setDinnerTarget(dinnerTarget - 1)}>−</button><output aria-live="polite">{dinnerTarget}</output><button aria-label="Cook one more dinner" disabled={dinnerTarget === 6} onClick={() => setDinnerTarget(dinnerTarget + 1)}>＋</button></div></section>
    <section className="today-card"><div><p className="eyebrow">NEXT DINNER · {firstDinner?.meal.servings || 0} SERVINGS</p><h2>{firstDinner?.meal.title}</h2><p>{firstDinner?.meal.effort} effort · {firstDinner?.meal.rationale}</p></div><button onClick={() => open('Calendar')}>View schedule</button></section>
    <section className="week-section"><div className="section-heading"><div><h2>{planningWeekLabel(week)}</h2><p>{dinnerCount} dinners to cook · {awayDays} away {awayDays === 1 ? 'day' : 'days'} · {lateDays} late {lateDays === 1 ? 'night' : 'nights'}</p></div><button className="text-button" onClick={() => open('Calendar')}>Calendar →</button></div><div className="week-grid">{week.map((day, index) => <article className={day.isToday || index === 0 ? 'day-card today' : 'day-card'} key={day.date}><div className="date"><span>{day.dayLabel}</span><strong>{day.dateLabel}</strong></div><div className="availability"><span className="mini-avatar alex">A</span><p>{day.alex.label}</p></div><div className="availability"><span className="mini-avatar nathalia">N</span><p>{day.nathalia.label}</p></div><button className={`meal ${day.meal.tone}`} title={day.meal.rationale} onClick={() => editMeal(day.date)}><small>{day.meal.label} · TAP TO CHANGE</small><strong>{day.meal.title}</strong><span className="meal-meta">{day.meal.servings} {day.meal.servings === 1 ? 'serving' : 'servings'} · {day.meal.effort}</span></button></article>)}</div></section>
    <section className="dashboard-grid"><article className="panel tap-panel" onClick={() => open('Groceries')}><div className="panel-heading"><div><p className="eyebrow">SMART STORE SPLIT</p><h2>Groceries</h2></div><span className="count-badge">{items.filter(i => !i.checked).length}</span></div><p className="panel-copy">Bulk only goes to Costco when two-week demand and shelf life justify it.</p><span className="panel-link">Open list →</span></article><article className="panel tap-panel" onClick={() => open('Inventory')}><div className="panel-heading"><div><p className="eyebrow">ESTIMATED ON HAND</p><h2>Kitchen pulse</h2></div><span className="count-badge warning">1</span></div><p className="panel-copy">{inventory[2]?.name || 'Greek yogurt'} needs one quick confirmation.</p><span className="panel-link">Review inventory →</span></article><article className="panel routine-panel"><div className="panel-heading"><div><p className="eyebrow">SCHEDULE-AWARE RHYTHM</p><h2>Recurring food</h2></div><button className="text-button" onClick={editRoutines}>Edit</button></div>{profiles.map((profile) => <div className="routine" key={profile.id}><span className={`avatar ${profile.personId}`}>{profile.personId === 'alex' ? 'A' : 'N'}</span><div><strong>{profile.name}</strong><p>{profile.enabled === false ? 'Paused' : profile.ingredients.map((item) => item.name).join(', ')}</p></div><em>{profile.personId === 'alex' ? alexBreakfasts : nathaliaSnacks}×</em></div>)}</article></section>
  </>;
}
function CalendarView({ events, trips, week, recipes, completions, householdId, editMeal, onChanged, onDeleted, notify }: { events: ScheduleException[]; trips: ShoppingTrip[]; week: PlanningDay[]; recipes: Recipe[]; completions: MealCompletion[]; householdId?: string; editMeal: (date: string) => void; onChanged: (changed: ScheduleException) => void; onDeleted: (id: string) => void; notify: (message: string) => void }) {
  const [view, setView] = useState<'work' | 'meals'>('work');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleException | null>(null);
  const [personId, setPersonId] = useState<'alex' | 'nathalia'>('alex');
  const [kind, setKind] = useState<ScheduleExceptionKind>('late_shift');
  const [date, setDate] = useState(week[0]?.date || '');
  const [endDate, setEndDate] = useState(week[0]?.date || '');
  const [monthAnchor, setMonthAnchor] = useState(localDateForTimeZone(new Date()));
  const [note, setNote] = useState('');
  const labels: Record<ScheduleExceptionKind, string> = { late_shift: 'Late shift', work_trip: 'Work trip', day_off: 'Day off', holiday: 'Holiday', home: 'Home / available', away: 'Away' };
  const showEditor = (event?: ScheduleException, selectedDate?: string) => {
    setEditing(event || null);
    setPersonId(event?.personId || 'alex');
    setKind(event?.kind || 'late_shift');
    const start = event?.date || selectedDate || week[0]?.date || '';
    setDate(start);
    setEndDate(event?.endDate || start);
    setNote(event?.title === labels[event?.kind || 'late_shift'] ? '' : event?.title || '');
    setOpen(true);
  };
  const save = async () => {
    if (endDate < date) { notify('The end date must be on or after the start date.'); return; }
    const input = { personId, kind, date, endDate: endDate === date ? null : endDate, title: note.trim() || labels[kind] };
    try {
      if (editing) {
        await updateScheduleException(editing.id, input, householdId);
        onChanged({ ...editing, ...input });
      } else {
        onChanged(await createScheduleException(input, householdId));
      }
      setOpen(false);
      notify('Work calendar saved. The meal plan now reflects it.');
    } catch { notify('Could not save that schedule change.'); }
  };
  const moveMonth = (offset: number) => {
    const next = new Date(`${monthAnchor.slice(0, 7)}-15T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    setMonthAnchor(next.toISOString().slice(0, 10));
  };
  const monthDays = calendarMonthDays(monthAnchor);
  const remove = async (event: ScheduleException) => {
    if (!window.confirm(`Delete “${event.title}”?`)) return;
    try {
      await deleteScheduleException(event.id, householdId);
      onDeleted(event.id);
      notify('Schedule change deleted.');
    } catch { notify('Could not delete that schedule change.'); }
  };
  const reconcileMeal = async (day: PlanningDay, mealType: MealTypeKey, requested: MealCompletionStatus) => {
    const current = completions.find((item) => item.id === mealCompletionId(day.date, mealType));
    const status = current?.status === requested ? null : requested;
    try {
      await setMealCompletion(day, mealType, status, recipes, householdId);
      notify(status === 'cooked' ? 'Meal eaten. Inventory updated.' : status === 'skipped' ? 'Meal skipped. Inventory preserved.' : 'Meal confirmation undone.');
    } catch { notify('Could not reconcile that meal.'); }
  };
  return <section className="calendar-page">
    <div className="calendar-switch" role="tablist" aria-label="Calendar type">
      <button className={view === 'work' ? 'active' : ''} onClick={() => setView('work')} role="tab" aria-selected={view === 'work'}>Work & availability</button>
      <button className={view === 'meals' ? 'active' : ''} onClick={() => setView('meals')} role="tab" aria-selected={view === 'meals'}>Meals & shopping</button>
    </div>
    {view === 'work' ? <>
      <div className="calendar-actions"><div><p className="eyebrow">ONLY THE UNUSUAL DAYS</p><h2>Alex & Nathalia</h2><p>Normal Monday–Friday routines stay assumed. Add holidays, trips, late work, and unusual days.</p></div><button className="add-schedule" onClick={() => showEditor()}>＋ Add change</button></div>
      {events.length > 0 && <div className="event-strip">{events.map(event => <article key={event.id}><span className={`avatar ${event.personId}`}>{event.personId === 'alex' ? 'A' : 'N'}</span><div><strong>{event.title}</strong><small>{event.date}{event.endDate ? ` → ${event.endDate}` : ''} · {labels[event.kind]}</small></div><div className="event-actions"><button onClick={() => showEditor(event)}>Edit</button><button className="danger" onClick={() => remove(event)}>Delete</button></div></article>)}</div>}
      <section className="work-month"><header><button aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><h2>{calendarMonthLabel(monthAnchor)}</h2><button aria-label="Next month" onClick={() => moveMonth(1)}>›</button></header><div className="month-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{monthDays.map((day) => { const dayEvents = events.filter((event) => scheduleExceptionApplies(event, day)); const dayTrips = trips.filter((trip) => trip.date === day); return <button key={day} className={`${day.slice(0, 7) === monthAnchor.slice(0, 7) ? '' : 'outside'} ${day === localDateForTimeZone(new Date()) ? 'today' : ''}`} onClick={() => showEditor(undefined, day)}><strong>{Number(day.slice(-2))}</strong><span className="month-events">{dayEvents.slice(0, 2).map((event) => <i className={event.personId} key={event.id}>{event.personId === 'alex' ? 'A' : 'N'} · {labels[event.kind]}</i>)}{dayTrips.map((trip) => <i className="shopping" key={trip.id}>🛒 {trip.store}</i>)}</span>{dayEvents.length > 2 && <small>+{dayEvents.length - 2}</small>}</button>; })}</div></section>
    </> : <>
      <div className="calendar-actions meal-calendar-head"><div><p className="eyebrow">FOOD CALENDAR</p><h2>Lunch, dinner & shopping</h2><p>Lunch stays extremely fast. Servings react automatically to the work calendar.</p></div></div>
      <div className="meal-week-calendar">{week.map((day) => {
        const lunchStatus = completions.find((item) => item.id === mealCompletionId(day.date, 'lunch'))?.status;
        const dinnerStatus = completions.find((item) => item.id === mealCompletionId(day.date, 'dinner'))?.status;
        const dayTrips = trips.filter((trip) => trip.date === day.date);
        return <article className={day.isToday ? 'meal-day today' : 'meal-day'} key={day.date}><header><span>{day.dayLabel}</span><strong>{day.dateLabel}</strong></header><div className="meal-slot lunch-slot"><small>LUNCH · {day.lunch.effort} · {day.lunch.servings} SERVINGS</small><strong>{day.lunch.servings ? day.lunch.title : 'Lunch off'}</strong><MealStatusControls status={lunchStatus} disabled={!day.lunch.recipeId} onChange={(status) => reconcileMeal(day, 'lunch', status)} /></div><div className={`meal-slot ${day.meal.tone}`}><small>DINNER · {day.meal.effort.toUpperCase()} · {day.meal.servings} SERVINGS</small><button className="meal-title-button" onClick={() => editMeal(day.date)}>{day.meal.title}</button><MealStatusControls status={dinnerStatus} disabled={!day.meal.recipeId} onChange={(status) => reconcileMeal(day, 'dinner', status)} /></div>{dayTrips.map((trip) => <span className="shopping-chip" key={trip.id}>{trip.store}</span>)}</article>;
      })}</div>
    </>}
    {open && <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="schedule-sheet" role="dialog" aria-modal="true" aria-label={editing ? 'Edit schedule change' : 'Add schedule change'} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">ONE-TIME EXCEPTION</p><h2>{editing ? 'Edit' : 'Add'} schedule change</h2></div><button aria-label="Close" onClick={() => setOpen(false)}>×</button></div><label>Who<select value={personId} onChange={(event) => setPersonId(event.target.value as 'alex' | 'nathalia')}><option value="alex">Alex</option><option value="nathalia">Nathalia</option></select></label><label>What changed<select value={kind} onChange={(event) => setKind(event.target.value as ScheduleExceptionKind)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Starts<div className="date-picks">{[week[0], week[1], week[5]].filter(Boolean).map(day => <button type="button" className={date === day.date ? 'active' : ''} key={day.date} onClick={() => { setDate(day.date); setEndDate(day.date); }}>{day.dayLabel}</button>)}</div><input type="date" value={date} onChange={(event) => { const next = event.target.value; setEndDate(endDate <= date ? next : endDate); setDate(next); }} /></label><label>Ends <small>use the same date for one day</small><input type="date" min={date} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" className="range-shortcut" onClick={() => setEndDate(addLocalDays(date, 20))}>Set a 3-week trip</button><label>Short note <small>optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === 'work_trip' ? 'e.g. Sacramento' : 'e.g. home by 8:30'} /></label><button className="save-schedule" onClick={save}>Save schedule change</button><p className="sheet-note">One entry covers every day in the range and immediately updates lunch servings, dinner servings, and dinner effort.</p></section></div>}
  </section>;
}

function MealStatusControls({ status, disabled, onChange }: { status?: MealCompletionStatus; disabled: boolean; onChange: (status: MealCompletionStatus) => void }) {
  if (disabled) return null;
  return <div className="meal-status"><button className={status === 'cooked' ? 'active' : ''} onClick={() => onChange('cooked')}>{status === 'cooked' ? '✓ Eaten' : 'Eaten'}</button><button className={status === 'skipped' ? 'active skipped' : ''} onClick={() => onChange('skipped')}>{status === 'skipped' ? '✓ Skipped' : 'Skip'}</button></div>;
}

function LoadingView() {
  return <main className="auth-shell"><section className="auth-card"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><p>Opening your household…</p></section></main>;
}

function SignInView({ error }: { error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(error);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try { await signInToHousehold(email, password); }
    catch { setMessage('Could not sign in. Check the account and try again.'); setSubmitting(false); }
  };
  return <main className="auth-shell"><form className="auth-card" onSubmit={submit}><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><p className="eyebrow">PRIVATE HOUSEHOLD</p><h1>Welcome home</h1><p>Sign in as Alex or Nathalia to open the shared plan.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Hide' : 'Show'}</button></span></label>{message && <p className="auth-error" role="alert">{message}</p>}<button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
function RecipesView({ recipes, householdId, onUpdated, onCreated, notify }: { recipes: Recipe[]; householdId?: string; onUpdated: (recipe: Recipe) => void; onCreated: (recipe: Recipe) => void; notify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState<'all' | MealType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const selected = recipes.find((recipe) => recipe.id === selectedId) || null;
  const visible = recipes.filter((recipe) => {
    const matchesType = mealType === 'all' || recipe.mealType === mealType;
    const haystack = `${recipe.name} ${recipe.cuisine} ${recipe.protein} ${recipe.tags.join(' ')}`.toLowerCase();
    return matchesType && haystack.includes(query.trim().toLowerCase());
  });
  const updatePreference = async (recipe: Recipe, changes: Partial<Pick<Recipe, 'favorite' | 'rating' | 'note'>>, message: string) => {
    const updated = { ...recipe, ...changes };
    onUpdated(updated);
    try {
      await updateRecipePreferences(recipe.id, changes, householdId);
      notify(message);
    } catch {
      onUpdated(recipe);
      notify('Could not save that recipe change.');
    }
  };
  const openRecipe = (recipe: Recipe) => {
    setSelectedId(recipe.id);
    setNoteDraft(recipe.note);
  };
  return <section className="recipes-page">
    <div className="recipe-tools">
      <label><span>Search recipes</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chicken, fish, fast…" /></label>
      <div className="recipe-filters" role="tablist" aria-label="Recipe meal type">{(['all', 'dinner', 'lunch'] as const).map((value) => <button key={value} className={mealType === value ? 'active' : ''} onClick={() => setMealType(value)} role="tab" aria-selected={mealType === value}>{value === 'all' ? 'All' : value === 'dinner' ? 'Dinners' : 'Fast lunches'}</button>)}</div>
      <button className="add-recipe-button" onClick={() => setAdding(true)}>＋ Add recipe</button>
    </div>
    <p className="recipe-count">{visible.length} shared {visible.length === 1 ? 'recipe' : 'recipes'} · favorites, ratings, and notes sync for both of you</p>
    <div className="recipe-grid">{visible.map((recipe) => <article className="recipe-card" key={recipe.id}><div className={`recipe-swatch ${recipe.color}`}><button aria-label={`${recipe.favorite ? 'Unstar' : 'Star'} ${recipe.name}`} onClick={() => updatePreference(recipe, { favorite: !recipe.favorite }, recipe.favorite ? 'Removed from favorites' : 'Saved as a favorite')}>{recipe.favorite ? '★' : '☆'}</button><span>{recipe.mealType === 'lunch' ? 'FAST LUNCH' : recipe.lateNightSuitable ? 'LATE-NIGHT READY' : recipe.method.toUpperCase()}</span></div><div className="recipe-body"><p className="stars" aria-label={`${recipe.rating} out of 5 stars`}>{'★'.repeat(recipe.rating)}<span>{'★'.repeat(5 - recipe.rating)}</span></p><h2>{recipe.name}</h2><p>{recipe.effortMinutes} min · {recipe.cuisine} · serves {recipe.servings}</p><small>{recipe.note || recipe.description}</small><button onClick={() => openRecipe(recipe)}>Ingredients & steps</button></div></article>)}</div>
    {visible.length === 0 && <div className="empty-recipes"><strong>No matching recipes</strong><p>Try a protein, cuisine, or “fast.”</p></div>}
    {selected && <div className="sheet-backdrop recipe-detail-backdrop" onClick={() => setSelectedId(null)}><section className="recipe-detail" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">{selected.mealType.toUpperCase()} · {selected.effortMinutes} MIN · SERVES {selected.servings}</p><h2>{selected.name}</h2></div><button aria-label="Close recipe" onClick={() => setSelectedId(null)}>×</button></div><p className="recipe-description">{selected.description}</p><div className="recipe-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="recipe-detail-grid"><section><h3>Ingredients</h3><ul>{selected.ingredients.map((item) => <li key={`${item.itemId}-${item.unit}`}><span>{item.name}</span><strong>{item.quantity} {item.unit}</strong></li>)}</ul></section><section><h3>Steps</h3><ol>{selected.instructions.map((instruction, index) => <li key={instruction}><span>{index + 1}</span>{instruction}</li>)}</ol></section></div><section className="recipe-preferences"><div><strong>Your shared rating</strong><div className="rating-buttons">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} aria-label={`Rate ${rating} stars`} className={rating <= selected.rating ? 'active' : ''} onClick={() => updatePreference(selected, { rating }, `Rated ${rating} stars`)}>★</button>)}</div></div><label>Shared note<textarea value={noteDraft} maxLength={500} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should we remember next time?" /></label><button className="save-recipe-note" onClick={() => updatePreference(selected, { note: noteDraft.trim() }, 'Recipe note saved')}>Save note</button></section></section></div>}
    {adding && <RecipeCreator householdId={householdId} onClose={() => setAdding(false)} onCreated={(recipe) => { onCreated(recipe); setAdding(false); notify('Recipe added to your shared library.'); }} notify={notify} />}
  </section>;
}

function RecipeCreator({ householdId, onClose, onCreated, notify }: { householdId?: string; onClose: () => void; onCreated: (recipe: Recipe) => void; notify: (message: string) => void }) {
  const [name, setName] = useState(''); const [mealType, setMealType] = useState<MealType>('dinner'); const [minutes, setMinutes] = useState(25); const [servings, setServings] = useState(2); const [description, setDescription] = useState(''); const [ingredients, setIngredients] = useState(''); const [steps, setSteps] = useState(''); const [saving, setSaving] = useState(false);
  const save = async () => {
    const parsedIngredients = ingredients.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [ingredientName, quantity = '1', unit = 'each', store = 'king'] = line.split('|').map((part) => part.trim()); return { itemId: ingredientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: ingredientName, quantity: Math.max(0.01, Number(quantity) || 1), unit: unit.toLowerCase(), store: store.toLowerCase().includes('costco') ? 'costco' as const : 'king_soopers' as const }; });
    const instructions = steps.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!name.trim() || parsedIngredients.length === 0 || instructions.length === 0) { notify('Add a name, at least one ingredient, and one step.'); return; }
    const recipe: Recipe = { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`, name: name.trim(), mealType, description: description.trim() || 'A shared household recipe.', cuisine: 'House favorite', protein: 'Mixed', method: mealType === 'lunch' ? 'Quick' : 'Cook', effortMinutes: minutes, servings, lateNightSuitable: minutes <= 25, tags: mealType === 'lunch' ? ['fast lunch'] : minutes <= 25 ? ['fast', 'late night'] : ['home cooked'], ingredients: parsedIngredients, instructions, favorite: false, rating: 3, note: '', color: 'sage' };
    setSaving(true); try { await createRecipe(recipe, householdId); onCreated(recipe); } catch { notify('Could not save that recipe.'); setSaving(false); }
  };
  return <div className="sheet-backdrop recipe-detail-backdrop" onClick={onClose}><section className="schedule-sheet recipe-creator" role="dialog" aria-modal="true" aria-label="Add recipe" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">SHARED LIBRARY</p><h2>Add a recipe</h2></div><button aria-label="Close" onClick={onClose}>×</button></div><label>Recipe name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ginger chicken bowls" /></label><div className="creator-grid"><label>Meal<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}><option value="dinner">Dinner</option><option value="lunch">Fast lunch</option></select></label><label>Minutes<input type="number" min="1" value={minutes} onChange={(event) => setMinutes(Math.max(1, Number(event.target.value)))} /></label><label>Servings<input type="number" min="1" max="12" value={servings} onChange={(event) => setServings(Math.max(1, Number(event.target.value)))} /></label></div><label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What makes it good?" /></label><label>Ingredients <small>one per line: name | quantity | unit | store</small><textarea value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder={'Chicken breast | 1 | lb | Costco\nBroccoli | 12 | oz | King'} /></label><p className="creator-hint">Use Costco for long-lasting bulk staples; leave the store blank for King Soopers—especially produce.</p><label>Steps <small>one per line</small><textarea value={steps} onChange={(event) => setSteps(event.target.value)} placeholder={'Season and brown the chicken.\nRoast the broccoli.\nServe together.'} /></label><button className="save-schedule" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Add recipe'}</button></section></div>;
}
function MealActionSheet({ day, recipes, hasOverride, onClose, onSave, onReset }: { day: PlanningDay; recipes: Recipe[]; hasOverride: boolean; onClose: () => void; onSave: (kind: DinnerOverrideKind, recipeId: string | null, servings: number) => void; onReset: () => void }) {
  const dinnerRecipes = recipes.filter((recipe) => recipe.mealType === 'dinner');
  const [kind, setKind] = useState<DinnerOverrideKind>(day.meal.recipeId ? 'recipe' : day.meal.title.toLowerCase().includes('leftover') ? 'leftovers' : day.meal.label === 'OUT' ? 'eat_out' : 'skip');
  const [recipeId, setRecipeId] = useState(day.meal.recipeId || dinnerRecipes[0]?.id || '');
  const [servings, setServings] = useState(Math.max(1, day.meal.servings || 2));
  const selected = recipes.find((recipe) => recipe.id === recipeId);
  return <div className="sheet-backdrop meal-action-backdrop" onClick={onClose}><section className="schedule-sheet meal-action-sheet" role="dialog" aria-modal="true" aria-label={`Dinner for ${day.dayLabel}`} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">{day.dayLabel.toUpperCase()} · DINNER</p><h2>{day.meal.title}</h2></div><button aria-label="Close meal actions" onClick={onClose}>×</button></div><div className="meal-kind-grid">{([['recipe', 'Cook'], ['leftovers', 'Leftovers'], ['eat_out', 'Eat out'], ['skip', 'No dinner']] as const).map(([value, label]) => <button className={kind === value ? 'active' : ''} key={value} onClick={() => setKind(value)}>{label}</button>)}</div>{kind === 'recipe' && <><label>Choose recipe<select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>{dinnerRecipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name} · {recipe.effortMinutes} min</option>)}</select></label>{selected && <details className="inline-recipe" open><summary>Ingredients & instructions</summary><p>{selected.description}</p><h3>Ingredients</h3><ul>{selected.ingredients.map((item) => <li key={`${item.itemId}-${item.unit}`}><span>{item.name}</span><strong>{item.quantity} {item.unit}</strong></li>)}</ul><h3>Steps</h3><ol>{selected.instructions.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}</ol></details>}</>} {kind !== 'skip' && <div className="meal-serving-row"><span><strong>Servings</strong><small>Adjust grocery quantities automatically</small></span><div className="stepper"><button aria-label="One fewer serving" disabled={servings === 1} onClick={() => setServings(servings - 1)}>−</button><output>{servings}</output><button aria-label="One more serving" disabled={servings === 8} onClick={() => setServings(servings + 1)}>＋</button></div></div>}<button className="save-schedule" onClick={() => onSave(kind, kind === 'recipe' ? recipeId : null, kind === 'skip' ? 0 : servings)}>Save dinner</button>{hasOverride && <button className="restore-auto" onClick={onReset}>Restore automatic choice</button>}</section></div>;
}
function RoutineEditor({ profiles, householdId, onClose, onSaved, notify }: { profiles: RecurringConsumptionProfile[]; householdId?: string; onClose: () => void; onSaved: (profile: RecurringConsumptionProfile) => void; notify: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id || '');
  const [draft, setDraft] = useState<RecurringConsumptionProfile>(profiles[0] || RECURRING_PROFILES[0]);
  const [saving, setSaving] = useState(false);
  const select = (id: string) => { setSelectedId(id); setDraft(profiles.find((profile) => profile.id === id) || profiles[0]); };
  const changeQuantity = (index: number, value: string) => setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(0, Number(value) || 0) } : item) }));
  const save = async () => {
    setSaving(true);
    try { await saveRecurringProfile(draft, householdId); onSaved(draft); notify(`${draft.name} updated. Groceries recalculated.`); onClose(); }
    catch { notify('Could not save that routine.'); }
    finally { setSaving(false); }
  };
  return <div className="sheet-backdrop routine-backdrop" onClick={onClose}><section className="schedule-sheet routine-sheet" role="dialog" aria-modal="true" aria-label="Edit recurring food" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">AUTOMATIC EVERY HOME DAY</p><h2>Recurring food</h2></div><button aria-label="Close routines" onClick={onClose}>×</button></div><div className="routine-tabs">{profiles.map((profile) => <button className={selectedId === profile.id ? 'active' : ''} key={profile.id} onClick={() => select(profile.id)}>{profile.personId === 'alex' ? 'Alex' : 'Nathalia'}</button>)}</div><label className="routine-enabled"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>{draft.name}</strong><small>Include whenever {draft.personId === 'alex' ? 'Alex' : 'Nathalia'} is home</small></span></label><div className="routine-ingredients">{draft.ingredients.map((item, index) => <label key={`${item.itemId}-${item.unit}`}><span>{item.name}<small>per home day</small></span><span className="quantity-input"><input type="number" min="0" step="0.25" inputMode="decimal" value={item.quantity} onChange={(event) => changeQuantity(index, event.target.value)} /><em>{item.unit}</em></span></label>)}</div><button className="save-schedule" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save routine'}</button><p className="sheet-note">These quantities multiply by home days and flow directly into the store optimizer.</p></section></div>;
}
function WeekendReset({ inventory, week, dinnerTarget, setDinnerTarget, householdId, onClose, onFinish, notify }: { inventory: InventoryItem[]; week: PlanningDay[]; dinnerTarget: number; setDinnerTarget: (target: number) => void; householdId?: string; onClose: () => void; onFinish: () => Promise<void>; notify: (message: string) => void }) {
  const [reviewItems] = useState(() => inventory.filter((item) => effectiveInventoryConfidence(item) < 75).sort((a, b) => effectiveInventoryConfidence(a) - effectiveInventoryConfidence(b)));
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const current = reviewItems[index];
  const review = async (correction: InventoryCorrection) => {
    if (!current) return;
    setSaving(true);
    try {
      if (correction === 'same') await confirmInventoryItem(current, householdId);
      else await setInventoryQuantity(current, correctedInventoryQuantity(current.quantity, correction), householdId);
      setIndex((value) => value + 1);
    } catch { notify(`Could not update ${current.name}.`); }
    finally { setSaving(false); }
  };
  const finish = async () => { setSaving(true); try { await onFinish(); } finally { setSaving(false); } };
  return <div className="sheet-backdrop reset-backdrop" onClick={onClose}><section className="reset-sheet" role="dialog" aria-modal="true" aria-label="Weekend kitchen reset" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">WEEKEND RESET</p><h2>{current ? 'Quick pantry check' : 'Your week is ready'}</h2></div><button aria-label="Close reset" onClick={onClose}>×</button></div>{current ? <><div className="reset-progress"><span style={{ width: `${((index + 1) / reviewItems.length) * 100}%` }}/></div><p className="reset-counter">Only {reviewItems.length - index} uncertain {reviewItems.length - index === 1 ? 'item' : 'items'} need you</p><article className="reset-item"><small>{effectiveInventoryConfidence(current)}% CONFIDENCE</small><h3>{current.name}</h3><p>We estimate {formatGroceryQuantity(current.quantity, current.unit)}. What do you see?</p></article><div className="reset-choices"><button disabled={saving} onClick={() => review('out')}>Out</button><button disabled={saving} onClick={() => review('half')}>About half</button><button disabled={saving} onClick={() => review('same')}>Looks right</button><button disabled={saving} onClick={() => review('more')}>More</button></div><button className="reset-skip" onClick={() => setIndex((value) => value + 1)}>Not sure — skip</button></> : <><div className="reset-ready"><span>✓</span><p>Inventory reviewed. MercaSync chose varied, schedule-fit recipes and recalculated both stores.</p></div><div className="reset-dinners"><div><strong>Dinners to cook</strong><small>Everything else becomes leftovers or dinner out.</small></div><div className="stepper"><button aria-label="Cook one fewer dinner" disabled={dinnerTarget === 0 || saving} onClick={() => setDinnerTarget(dinnerTarget - 1)}>−</button><output>{dinnerTarget}</output><button aria-label="Cook one more dinner" disabled={dinnerTarget === 6 || saving} onClick={() => setDinnerTarget(dinnerTarget + 1)}>＋</button></div></div><div className="reset-menu">{week.filter((day) => day.meal.recipeId).map((day) => <div key={day.date}><span>{day.dayLabel}</span><strong>{day.meal.title}</strong><small>{day.meal.rationale}</small></div>)}</div><button className="finish-reset" disabled={saving} onClick={finish}>{saving ? 'Finishing…' : 'Approve week & open groceries →'}</button></>}</section></div>;
}
function InventoryView({ inventory, householdId, notify }: { inventory: InventoryItem[]; householdId?: string; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('each');
  const confirm = async (item: InventoryItem) => {
    try { await confirmInventoryItem(item, householdId); notify(`${item.name} confirmed at 100%.`); }
    catch { notify(`Could not confirm ${item.name}.`); }
  };
  const openCorrection = (item: InventoryItem) => { setEditing(item); setQuantity(String(item.quantity)); };
  const chooseCorrection = (correction: InventoryCorrection) => {
    if (!editing) return;
    setQuantity(String(correctedInventoryQuantity(editing.quantity, correction)));
  };
  const saveCorrection = async () => {
    if (!editing) return;
    const next = Number(quantity);
    if (!Number.isFinite(next) || next < 0) { notify('Enter a quantity of zero or more.'); return; }
    try { await setInventoryQuantity(editing, next, householdId); notify(`${editing.name} corrected and confirmed.`); setEditing(null); }
    catch { notify(`Could not update ${editing.name}.`); }
  };
  const addItem = async () => {
    const amount = Number(newQuantity);
    try { await addInventoryItem(newName, amount, newUnit, householdId); notify(`${newName.trim()} added to shared inventory.`); setAdding(false); setNewName(''); setNewQuantity(''); setNewUnit('each'); }
    catch { notify('Enter a valid item, quantity, and unit.'); }
  };
  return <section className="inventory-page"><div className="confidence-key"><span className="pulse" />Confidence falls 2% per day after confirmation and changes shopping quantities.</div>{inventory.map(item => {
    const confidence = effectiveInventoryConfidence(item);
    return <article className="inventory-card" key={`${item.itemId}-${item.unit}`}><div><strong>{item.name}</strong><small>{formatGroceryQuantity(item.quantity, item.unit)} estimated</small></div><div className="confidence"><span style={{ width: `${confidence}%` }} /><small>{confidence}% sure</small></div><div className="inventory-actions"><button onClick={() => openCorrection(item)}>Adjust</button><button onClick={() => confirm(item)}>Looks right</button></div></article>;
  })}<button className="add-button" onClick={() => setAdding(true)}>＋ Add an item</button>{editing && <div className="sheet-backdrop" onClick={() => setEditing(null)}><section className="schedule-sheet inventory-sheet" role="dialog" aria-modal="true" aria-label={`Adjust ${editing.name}`} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">QUICK CORRECTION</p><h2>{editing.name}</h2></div><button aria-label="Close" onClick={() => setEditing(null)}>×</button></div><div className="inventory-presets">{([['out', 'Out'], ['half', 'About half'], ['same', 'Looks right'], ['more', 'More']] as const).map(([value, label]) => <button key={value} onClick={() => chooseCorrection(value)}>{label}</button>)}</div><label>Estimated quantity<input type="number" min="0" step="0.25" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><small>{editing.unit}</small></label><button className="save-schedule" onClick={saveCorrection}>Save correction</button><p className="sheet-note">This confirms the amount at 100% and immediately recalculates groceries.</p></section></div>}{adding && <div className="sheet-backdrop" onClick={() => setAdding(false)}><section className="schedule-sheet inventory-sheet" role="dialog" aria-modal="true" aria-label="Add inventory item" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">WHAT IS ALREADY HOME?</p><h2>Add inventory</h2></div><button aria-label="Close" onClick={() => setAdding(false)}>×</button></div><label>Item name<input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Brown rice" /></label><div className="add-inventory-grid"><label>Quantity<input type="number" min="0" step="0.25" inputMode="decimal" value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} placeholder="0" /></label><label>Unit<select value={newUnit} onChange={(event) => setNewUnit(event.target.value)}><option value="each">each</option><option value="lb">lb</option><option value="oz">oz</option><option value="cup">cup</option><option value="can">can</option><option value="tbsp">tbsp</option></select></label></div><button className="save-schedule" onClick={addItem}>Add & confirm</button><p className="sheet-note">New items start at 100% confidence and immediately reduce matching grocery needs.</p></section></div>}</section>;
}
function GroceriesView({ items, week, trips, householdId, store, setStore, toggle, costcoThisWeek, setCostcoThisWeek, notify }: { items: Grocery[]; week: PlanningDay[]; trips: ShoppingTrip[]; householdId?: string; store: 'King Soopers' | 'Costco'; setStore: (store: 'King Soopers' | 'Costco') => void; toggle: (id: string) => void; costcoThisWeek: boolean; setCostcoThisWeek: (next: boolean) => void; notify: (message: string) => void }) {
  const visible = items.filter((item) => item.store === store);
  const remaining = visible.filter((item) => !item.checked).length;
  const trip = trips.find((candidate) => candidate.store === store);
  const [addOpen, setAddOpen] = useState(false); const [name, setName] = useState(''); const [quantity, setQuantity] = useState(1); const [unit, setUnit] = useState('each'); const [note, setNote] = useState('');
  const changeTripDate = async (date: string) => { try { await saveShoppingTrip(store, date, week[0].date, householdId); notify(`${store} trip moved. Both calendars updated.`); } catch { notify('Could not save that shopping date.'); } };
  const addItem = async () => { try { await addManualGroceryItem(week[0].date, { name, quantity, unit, store, note }, householdId); setName(''); setQuantity(1); setUnit('each'); setNote(''); setAddOpen(false); notify(`${name.trim()} added to ${store}.`); } catch { notify('Add an item name, quantity, and unit.'); } };
  const moveItem = async (item: Grocery) => { const destination = item.store === 'Costco' ? 'King Soopers' : 'Costco'; try { await moveGroceryItem(week[0].date, item.id, destination, householdId); notify(`${item.name} moved to ${destination}.`); } catch { notify('Could not move that item.'); } };
  return <section className="groceries-page">
    <div className="store-tabs"><button className={store === 'King Soopers' ? 'active' : ''} onClick={() => setStore('King Soopers')}>King Soopers <span>{items.filter((item) => item.store === 'King Soopers' && !item.checked).length}</span></button><button className={store === 'Costco' ? 'active' : ''} onClick={() => setStore('Costco')}>Costco <span>{items.filter((item) => item.store === 'Costco' && !item.checked).length}</span></button></div>
    <div className="list-summary"><div><p className="eyebrow">{storeRunLabel(week, store, costcoThisWeek)}</p><h2>{store}</h2></div><p>{remaining} left</p></div>
    <label className="shopping-date"><span><strong>Shopping date</strong><small>Shown on work and meal calendars</small></span><input type="date" value={trip?.date || ''} onChange={(event) => changeTripDate(event.target.value)} /></label>
    {store === 'Costco' && <button className={costcoThisWeek ? 'costco-toggle active' : 'costco-toggle'} onClick={() => setCostcoThisWeek(!costcoThisWeek)}><span>{costcoThisWeek ? '✓' : '○'}</span><span><strong>{costcoThisWeek ? 'Costco is happening this week' : 'Costco is next week'}</strong><small>{costcoThisWeek ? 'Tuesday–Thursday after work' : 'Tap if plans changed; immediate needs are at King Soopers'}</small></span></button>}
    <button className="add-grocery-button" onClick={() => setAddOpen(true)}>＋ Add something we need</button>
    {visible.length > 0 ? <div className="shopping-list">{visible.map((item) => <article className={item.checked ? 'shopping-item-row checked' : 'shopping-item-row'} key={item.id}><button className="shopping-check" onClick={() => toggle(item.id)}><span className="big-check">✓</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button><button className="move-store" onClick={() => moveItem(item)}>Move to {store === 'Costco' ? 'King Soopers' : 'Costco'}</button></article>)}</div> : <div className="empty-groceries"><strong>Nothing needed here</strong><p>This week’s recipes are covered by the other store or estimated inventory.</p></div>}
    <div className="auto-note"><span className="pulse" /><p><strong>Calculated from this week</strong><br/>Schedule-aware recipe servings − compatible estimated inventory</p></div>
    {addOpen && <div className="sheet-backdrop" onClick={() => setAddOpen(false)}><section className="schedule-sheet grocery-adder" role="dialog" aria-modal="true" aria-label="Add grocery item" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">{store.toUpperCase()}</p><h2>Add grocery item</h2></div><button aria-label="Close" onClick={() => setAddOpen(false)}>×</button></div><label>What do you need?<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Greek yogurt" /></label><div className="creator-grid"><label>Quantity<input type="number" min="0.01" step="0.25" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="each, lb, oz" /></label></div><label>Note <small>optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="For breakfast" /></label><button className="save-schedule" onClick={addItem}>Add to {store}</button></section></div>}
  </section>;
}
