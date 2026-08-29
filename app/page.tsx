'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleException,
  deleteScheduleException,
  subscribeToScheduleExceptions,
  updateScheduleException,
} from '@/lib/data/schedule-repository';
import { saveDinnerTarget, saveMealPlan, subscribeToDinnerTarget, subscribeToSavedMealPlan } from '@/lib/data/meal-plan-repository';
import { subscribeToRecipes, updateRecipePreferences } from '@/lib/data/recipe-repository';
import { confirmInventoryItem, setInventoryQuantity, subscribeToInventory } from '@/lib/data/inventory-repository';
import { setGroceryItemPurchased, subscribeToGroceryRun, syncGroceryRun } from '@/lib/data/grocery-repository';
import { setMealCompletion, subscribeToMealCompletions } from '@/lib/data/meal-completion-repository';
import { mealPlanFingerprint } from '@/lib/domain/meal-plan';
import { mealCompletionId, type MealCompletion, type MealCompletionStatus, type MealTypeKey } from '@/lib/domain/meal-reconciliation';
import { buildGroceryNeeds, formatGroceryQuantity, type GroceryRunItem } from '@/lib/domain/grocery';
import { correctedInventoryQuantity, effectiveInventoryConfidence, STARTER_INVENTORY, type InventoryCorrection, type InventoryItem } from '@/lib/domain/inventory';
import { STARTER_RECIPES, type MealType, type Recipe } from '@/lib/domain/recipe';
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
  const [events, setEvents] = useState<ScheduleException[]>([]);
  const [store, setStore] = useState<'King Soopers' | 'Costco'>('King Soopers');
  const [toast, setToast] = useState('');
  const [savedPlanFingerprint, setSavedPlanFingerprint] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [dinnerTarget, setDinnerTarget] = useState(5);
  const auth = useHouseholdSession();
  const firebaseEnabled = usesFirebaseBackend();
  const week = useMemo(() => buildPlanningWeek(events, new Date(), 'America/Denver', dinnerTarget), [dinnerTarget, events]);
  const calculatedNeeds = useMemo(() => buildGroceryNeeds(week, recipeItems, inventory), [inventory, recipeItems, week]);
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
        detail: `${formatGroceryQuantity(need.quantity, need.unit)} · ${recipeSummary}${inventorySummary}`,
        store: need.store,
        checked: need.checked,
      };
    });
  }, [calculatedNeeds, firebaseEnabled, groceryRunReady, items, sharedGroceryItems]);
  const remaining = useMemo(() => displayItems.filter((item) => !item.checked).length, [displayItems]);
  const currentPlanFingerprint = useMemo(() => mealPlanFingerprint(week), [week]);
  const planIsSaved = savedPlanFingerprint === currentPlanFingerprint;
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
      setSavedPlanFingerprint,
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
    if (!firebaseEnabled || !auth.session) return;
    return subscribeToDinnerTarget(
      auth.session.householdId,
      setDinnerTarget,
      () => notify('Could not load the weekly dinner target.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  const persistPlan = async () => {
    setSavingPlan(true);
    try {
      await saveMealPlan(week, auth.session?.householdId);
      setSavedPlanFingerprint(currentPlanFingerprint);
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
    try { await saveDinnerTarget(target, auth.session?.householdId); notify(`Planning ${target} ${target === 1 ? 'dinner' : 'dinners'} to cook.`); }
    catch { setDinnerTarget(previous); notify('Could not save the dinner count.'); }
  };
  const title = active === 'Plan' ? 'Your week' : active;

  if (firebaseEnabled && auth.loading) return <LoadingView />;
  if (firebaseEnabled && !auth.session) return <SignInView error={auth.error} />;

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.label} onClick={() => setActive(item.label)} className={active === item.label ? 'nav-item active' : 'nav-item'}><span>{item.icon}</span>{item.label}{item.label === 'Groceries' && <em>{remaining}</em>}</button>)}</nav><div className="automation-card"><span className="pulse" /><div><strong>Planner is watching</strong><p>Next refresh Sunday, 4 PM</p></div></div><div className="people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span><p>{auth.session?.member.displayName || 'Alex & Nathalia'}<br/><small>{auth.session ? <button className="sign-out" onClick={() => signOutOfHousehold()}>Sign out</button> : 'Denver household'}</small></p></div></aside>
    <section className="content">
      <header className="mobile-header"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span><small className="version-badge">v{APP_VERSION}</small></div><div className="mobile-people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span></div></header>
      <header className="topbar"><div><p className="eyebrow">{formatLongDate()}</p><h1>{title}</h1><p>{active === 'Plan' ? 'Lunch and dinner, balanced around who’s home.' : 'Shared, current, and ready for both of you.'}</p></div>{active === 'Plan' && <button className={planIsSaved ? 'primary-button saved' : 'primary-button'} onClick={persistPlan} disabled={savingPlan || planIsSaved}><span>{planIsSaved ? '✓' : '↑'}</span> {savingPlan ? 'Saving…' : planIsSaved ? 'Plan saved' : savedPlanFingerprint ? 'Save update' : 'Save plan'}</button>}</header>
      {active === 'Plan' && <PlanView items={displayItems} inventory={inventory} week={week} dinnerTarget={dinnerTarget} setDinnerTarget={changeDinnerTarget} open={setActive} />}
      {active === 'Calendar' && <CalendarView events={events} week={week} recipes={recipeItems} completions={mealCompletions} householdId={auth.session?.householdId} onChanged={(changed) => setEvents((current) => [...current.filter((event) => event.id !== changed.id), changed].sort((a, b) => a.date.localeCompare(b.date)))} onDeleted={(id) => setEvents((current) => current.filter((event) => event.id !== id))} notify={notify} />}
      {active === 'Recipes' && <RecipesView recipes={recipeItems} householdId={auth.session?.householdId} onUpdated={(updated) => setRecipeItems((current) => current.map((recipe) => recipe.id === updated.id ? updated : recipe))} notify={notify} />}
      {active === 'Inventory' && <InventoryView inventory={inventory} householdId={auth.session?.householdId} notify={notify} />}
      {active === 'Groceries' && <GroceriesView items={displayItems} store={store} setStore={setStore} toggle={toggleItem} />}
    </section>
    <nav className="bottom-nav" aria-label="Mobile navigation">{nav.map((item) => <button key={item.label} className={active === item.label ? 'active' : ''} onClick={() => setActive(item.label)}><span>{item.icon}</span><small>{item.label === 'Groceries' ? 'List' : item.label}</small>{item.label === 'Groceries' && remaining > 0 && <em>{remaining}</em>}</button>)}</nav>
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </main>;
}

function PlanView({ items, inventory, week, dinnerTarget, setDinnerTarget, open }: { items: Grocery[]; inventory: InventoryItem[]; week: PlanningDay[]; dinnerTarget: number; setDinnerTarget: (target: number) => void; open: (tab: string) => void }) {
  const dinnerCount = week.filter((day) => day.meal.recipeId).length;
  const awayDays = week.filter((day) => !day.alex.isHome || !day.nathalia.isHome).length;
  const lateDays = week.filter((day) => day.alex.isLate || day.nathalia.isLate).length;
  const firstDinner = week.find((day) => day.meal.servings > 0) || week[0];
  const alexBreakfasts = week.filter((day) => day.alex.isHome).length;
  const nathaliaSnacks = week.filter((day) => day.nathalia.isHome).length;
  return <>
    <section className="dinner-target"><div><p className="eyebrow">THIS WEEK</p><strong>Dinners to cook</strong><small>The remaining nights become leftovers or dinner out.</small></div><div className="stepper"><button aria-label="Cook one fewer dinner" disabled={dinnerTarget === 0} onClick={() => setDinnerTarget(dinnerTarget - 1)}>−</button><output aria-live="polite">{dinnerTarget}</output><button aria-label="Cook one more dinner" disabled={dinnerTarget === 6} onClick={() => setDinnerTarget(dinnerTarget + 1)}>＋</button></div></section>
    <section className="today-card"><div><p className="eyebrow">NEXT DINNER · {firstDinner?.meal.servings || 0} SERVINGS</p><h2>{firstDinner?.meal.title}</h2><p>{firstDinner?.meal.effort} effort · {firstDinner?.meal.rationale}</p></div><button onClick={() => open('Calendar')}>View schedule</button></section>
    <section className="week-section"><div className="section-heading"><div><h2>{planningWeekLabel(week)}</h2><p>{dinnerCount} dinners to cook · {awayDays} away {awayDays === 1 ? 'day' : 'days'} · {lateDays} late {lateDays === 1 ? 'night' : 'nights'}</p></div><button className="text-button" onClick={() => open('Calendar')}>Calendar →</button></div><div className="week-grid">{week.map((day, index) => <article className={day.isToday || index === 0 ? 'day-card today' : 'day-card'} key={day.date}><div className="date"><span>{day.dayLabel}</span><strong>{day.dateLabel}</strong></div><div className="availability"><span className="mini-avatar alex">A</span><p>{day.alex.label}</p></div><div className="availability"><span className="mini-avatar nathalia">N</span><p>{day.nathalia.label}</p></div><div className={`meal ${day.meal.tone}`} title={day.meal.rationale}><small>{day.meal.label}</small><strong>{day.meal.title}</strong><span className="meal-meta">{day.meal.servings} {day.meal.servings === 1 ? 'serving' : 'servings'} · {day.meal.effort}</span></div></article>)}</div></section>
    <section className="dashboard-grid"><article className="panel tap-panel" onClick={() => open('Groceries')}><div className="panel-heading"><div><p className="eyebrow">NEXT RUN · SATURDAY</p><h2>Groceries</h2></div><span className="count-badge">{items.filter(i => !i.checked).length}</span></div><p className="panel-copy">King Soopers is ready. Costco cadence is still on the legacy list.</p><span className="panel-link">Open list →</span></article><article className="panel tap-panel" onClick={() => open('Inventory')}><div className="panel-heading"><div><p className="eyebrow">ESTIMATED ON HAND</p><h2>Kitchen pulse</h2></div><span className="count-badge warning">1</span></div><p className="panel-copy">{inventory[2]?.name || 'Greek yogurt'} needs one quick confirmation.</p><span className="panel-link">Review inventory →</span></article><article className="panel routine-panel"><div className="panel-heading"><div><p className="eyebrow">SCHEDULE-AWARE RHYTHM</p><h2>Recurring food</h2></div></div><div className="routine"><span className="avatar alex">A</span><div><strong>Home breakfast</strong><p>Eggs, oats, berries, yogurt</p></div><em>{alexBreakfasts}×</em></div><div className="routine"><span className="avatar nathalia">N</span><div><strong>Home snacks</strong><p>Fruit, cheese, almonds</p></div><em>{nathaliaSnacks}×</em></div></article></section>
  </>;
}
function CalendarView({ events, week, recipes, completions, householdId, onChanged, onDeleted, notify }: { events: ScheduleException[]; week: PlanningDay[]; recipes: Recipe[]; completions: MealCompletion[]; householdId?: string; onChanged: (changed: ScheduleException) => void; onDeleted: (id: string) => void; notify: (message: string) => void }) {
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
      <section className="work-month"><header><button aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><h2>{calendarMonthLabel(monthAnchor)}</h2><button aria-label="Next month" onClick={() => moveMonth(1)}>›</button></header><div className="month-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{monthDays.map((day) => { const dayEvents = events.filter((event) => scheduleExceptionApplies(event, day)); return <button key={day} className={`${day.slice(0, 7) === monthAnchor.slice(0, 7) ? '' : 'outside'} ${day === localDateForTimeZone(new Date()) ? 'today' : ''}`} onClick={() => showEditor(undefined, day)}><strong>{Number(day.slice(-2))}</strong><span className="month-events">{dayEvents.slice(0, 2).map((event) => <i className={event.personId} key={event.id}>{event.personId === 'alex' ? 'A' : 'N'} · {labels[event.kind]}</i>)}</span>{dayEvents.length > 2 && <small>+{dayEvents.length - 2}</small>}</button>; })}</div></section>
    </> : <>
      <div className="calendar-actions meal-calendar-head"><div><p className="eyebrow">FOOD CALENDAR</p><h2>Lunch, dinner & shopping</h2><p>Lunch stays extremely fast. Servings react automatically to the work calendar.</p></div></div>
      <div className="meal-week-calendar">{week.map((day, index) => {
        const lunchStatus = completions.find((item) => item.id === mealCompletionId(day.date, 'lunch'))?.status;
        const dinnerStatus = completions.find((item) => item.id === mealCompletionId(day.date, 'dinner'))?.status;
        return <article className={day.isToday ? 'meal-day today' : 'meal-day'} key={day.date}><header><span>{day.dayLabel}</span><strong>{day.dateLabel}</strong></header><div className="meal-slot lunch-slot"><small>LUNCH · {day.lunch.effort} · {day.lunch.servings} SERVINGS</small><strong>{day.lunch.servings ? day.lunch.title : 'Lunch off'}</strong><MealStatusControls status={lunchStatus} disabled={!day.lunch.recipeId} onChange={(status) => reconcileMeal(day, 'lunch', status)} /></div><div className={`meal-slot ${day.meal.tone}`}><small>DINNER · {day.meal.effort.toUpperCase()} · {day.meal.servings} SERVINGS</small><strong>{day.meal.title}</strong><MealStatusControls status={dinnerStatus} disabled={!day.meal.recipeId} onChange={(status) => reconcileMeal(day, 'dinner', status)} /></div>{index === 5 && <span className="shopping-chip">King Soopers</span>}</article>;
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
function RecipesView({ recipes, householdId, onUpdated, notify }: { recipes: Recipe[]; householdId?: string; onUpdated: (recipe: Recipe) => void; notify: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState<'all' | MealType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
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
    </div>
    <p className="recipe-count">{visible.length} shared {visible.length === 1 ? 'recipe' : 'recipes'} · favorites, ratings, and notes sync for both of you</p>
    <div className="recipe-grid">{visible.map((recipe) => <article className="recipe-card" key={recipe.id}><div className={`recipe-swatch ${recipe.color}`}><button aria-label={`${recipe.favorite ? 'Unstar' : 'Star'} ${recipe.name}`} onClick={() => updatePreference(recipe, { favorite: !recipe.favorite }, recipe.favorite ? 'Removed from favorites' : 'Saved as a favorite')}>{recipe.favorite ? '★' : '☆'}</button><span>{recipe.mealType === 'lunch' ? 'FAST LUNCH' : recipe.lateNightSuitable ? 'LATE-NIGHT READY' : recipe.method.toUpperCase()}</span></div><div className="recipe-body"><p className="stars" aria-label={`${recipe.rating} out of 5 stars`}>{'★'.repeat(recipe.rating)}<span>{'★'.repeat(5 - recipe.rating)}</span></p><h2>{recipe.name}</h2><p>{recipe.effortMinutes} min · {recipe.cuisine} · serves {recipe.servings}</p><small>{recipe.note || recipe.description}</small><button onClick={() => openRecipe(recipe)}>Ingredients & steps</button></div></article>)}</div>
    {visible.length === 0 && <div className="empty-recipes"><strong>No matching recipes</strong><p>Try a protein, cuisine, or “fast.”</p></div>}
    {selected && <div className="sheet-backdrop recipe-detail-backdrop" onClick={() => setSelectedId(null)}><section className="recipe-detail" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">{selected.mealType.toUpperCase()} · {selected.effortMinutes} MIN · SERVES {selected.servings}</p><h2>{selected.name}</h2></div><button aria-label="Close recipe" onClick={() => setSelectedId(null)}>×</button></div><p className="recipe-description">{selected.description}</p><div className="recipe-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="recipe-detail-grid"><section><h3>Ingredients</h3><ul>{selected.ingredients.map((item) => <li key={`${item.itemId}-${item.unit}`}><span>{item.name}</span><strong>{item.quantity} {item.unit}</strong></li>)}</ul></section><section><h3>Steps</h3><ol>{selected.instructions.map((instruction, index) => <li key={instruction}><span>{index + 1}</span>{instruction}</li>)}</ol></section></div><section className="recipe-preferences"><div><strong>Your shared rating</strong><div className="rating-buttons">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} aria-label={`Rate ${rating} stars`} className={rating <= selected.rating ? 'active' : ''} onClick={() => updatePreference(selected, { rating }, `Rated ${rating} stars`)}>★</button>)}</div></div><label>Shared note<textarea value={noteDraft} maxLength={500} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should we remember next time?" /></label><button className="save-recipe-note" onClick={() => updatePreference(selected, { note: noteDraft.trim() }, 'Recipe note saved')}>Save note</button></section></section></div>}
  </section>;
}
function InventoryView({ inventory, householdId, notify }: { inventory: InventoryItem[]; householdId?: string; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('');
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
  return <section className="inventory-page"><div className="confidence-key"><span className="pulse" />Confidence falls 2% per day after confirmation and changes shopping quantities.</div>{inventory.map(item => {
    const confidence = effectiveInventoryConfidence(item);
    return <article className="inventory-card" key={`${item.itemId}-${item.unit}`}><div><strong>{item.name}</strong><small>{formatGroceryQuantity(item.quantity, item.unit)} estimated</small></div><div className="confidence"><span style={{ width: `${confidence}%` }} /><small>{confidence}% sure</small></div><div className="inventory-actions"><button onClick={() => openCorrection(item)}>Adjust</button><button onClick={() => confirm(item)}>Looks right</button></div></article>;
  })}<button className="add-button" onClick={() => notify('Adding brand-new pantry items is next.')}>＋ Add an item</button>{editing && <div className="sheet-backdrop" onClick={() => setEditing(null)}><section className="schedule-sheet inventory-sheet" role="dialog" aria-modal="true" aria-label={`Adjust ${editing.name}`} onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">QUICK CORRECTION</p><h2>{editing.name}</h2></div><button aria-label="Close" onClick={() => setEditing(null)}>×</button></div><div className="inventory-presets">{([['out', 'Out'], ['half', 'About half'], ['same', 'Looks right'], ['more', 'More']] as const).map(([value, label]) => <button key={value} onClick={() => chooseCorrection(value)}>{label}</button>)}</div><label>Estimated quantity<input type="number" min="0" step="0.25" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><small>{editing.unit}</small></label><button className="save-schedule" onClick={saveCorrection}>Save correction</button><p className="sheet-note">This confirms the amount at 100% and immediately recalculates groceries.</p></section></div>}</section>;
}
function GroceriesView({ items, store, setStore, toggle }: { items: Grocery[]; store: 'King Soopers' | 'Costco'; setStore: (store: 'King Soopers' | 'Costco') => void; toggle: (id: string) => void }) {
  const visible = items.filter((item) => item.store === store);
  const remaining = visible.filter((item) => !item.checked).length;
  return <section className="groceries-page">
    <div className="store-tabs"><button className={store === 'King Soopers' ? 'active' : ''} onClick={() => setStore('King Soopers')}>King Soopers <span>{items.filter((item) => item.store === 'King Soopers' && !item.checked).length}</span></button><button className={store === 'Costco' ? 'active' : ''} onClick={() => setStore('Costco')}>Costco <span>{items.filter((item) => item.store === 'Costco' && !item.checked).length}</span></button></div>
    <div className="list-summary"><div><p className="eyebrow">{store === 'Costco' ? 'BIWEEKLY · TUE–THU' : 'WEEKLY · WEEKEND'}</p><h2>{store}</h2></div><p>{remaining} left</p></div>
    {visible.length > 0 ? <div className="shopping-list">{visible.map((item) => <button className={item.checked ? 'shopping-item checked' : 'shopping-item'} key={item.id} onClick={() => toggle(item.id)}><span className="big-check">✓</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>)}</div> : <div className="empty-groceries"><strong>Nothing needed here</strong><p>This week’s recipes are covered by the other store or estimated inventory.</p></div>}
    <div className="auto-note"><span className="pulse" /><p><strong>Calculated from this week</strong><br/>Schedule-aware recipe servings − compatible estimated inventory</p></div>
  </section>;
}
