'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleException,
  subscribeToScheduleExceptions,
} from '@/lib/data/schedule-repository';
import {
  buildPlanningWeek,
  formatLongDate,
  planningWeekLabel,
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

type Grocery = { id: string; name: string; detail: string; store: 'King Soopers' | 'Costco'; checked: boolean };
type Inventory = { name: string; qty: string; confidence: number };
const fallbackGroceries: Grocery[] = [
  { id: 'salmon', name: 'Wild salmon', detail: '1 lb · Miso bowls', store: 'King Soopers', checked: false },
  { id: 'spinach', name: 'Baby spinach', detail: '1 bag · Orzo + breakfast', store: 'King Soopers', checked: false },
  { id: 'cucumbers', name: 'Persian cucumbers', detail: '5 · Bowls + pitas', store: 'King Soopers', checked: true },
  { id: 'yogurt', name: 'Greek yogurt', detail: '32 oz · Low confidence at home', store: 'Costco', checked: false },
  { id: 'chicken', name: 'Chicken breast', detail: '6 lb · Refill freezer staple', store: 'Costco', checked: false },
];
const fallbackInventory: Inventory[] = [
  { name: 'Jasmine rice', qty: '4.2 lb', confidence: 92 }, { name: 'Eggs', qty: '8', confidence: 78 },
  { name: 'Greek yogurt', qty: '~1 cup', confidence: 34 }, { name: 'Frozen berries', qty: '~3 cups', confidence: 66 },
];
const recipes = [
  { name: 'Miso salmon bowls', meta: '25 min · Japanese-inspired', rating: 5, note: 'Alex: extra cucumber next time', color: 'sage' },
  { name: 'Lemony chicken orzo', meta: '30 min · One pan', rating: 4, note: 'Great late-shift dinner', color: 'sun' },
  { name: 'Harissa turkey pitas', meta: '20 min · Mediterranean', rating: 5, note: 'Nathalia favorite', color: 'blue' },
  { name: 'Steak taco night', meta: '35 min · Fun dinner', rating: 5, note: 'Keep the charred salsa', color: 'berry' },
];
const nav = [{ label: 'Plan', icon: '⌂' }, { label: 'Calendar', icon: '□' }, { label: 'Recipes', icon: '◇' }, { label: 'Inventory', icon: '◫' }, { label: 'Groceries', icon: '✓' }];

export default function Home() {
  const [active, setActive] = useState('Plan');
  const [items, setItems] = useState<Grocery[]>(fallbackGroceries);
  const [inventory, setInventory] = useState<Inventory[]>(fallbackInventory);
  const [events, setEvents] = useState<ScheduleException[]>([]);
  const [store, setStore] = useState<'King Soopers' | 'Costco'>('King Soopers');
  const [toast, setToast] = useState('');
  const auth = useHouseholdSession();
  const firebaseEnabled = usesFirebaseBackend();
  const week = useMemo(() => buildPlanningWeek(events), [events]);
  const remaining = useMemo(() => items.filter((item) => !item.checked).length, [items]);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    if (firebaseEnabled) return;
    fetch('/api/home').then((response) => response.ok ? response.json() : null).then((data) => { if (data?.groceries?.length) setItems(data.groceries); if (data?.inventory?.length) setInventory(data.inventory); }).catch(() => undefined);
  }, [firebaseEnabled]);
  useEffect(() => {
    if (firebaseEnabled && !auth.session) return;
    return subscribeToScheduleExceptions(
      auth.session?.householdId,
      setEvents,
      () => notify('Could not load the shared schedule.'),
    );
  }, [auth.session, firebaseEnabled, notify]);
  const toggleItem = async (id: string) => {
    const current = items.find((item) => item.id === id); if (!current) return;
    const checked = !current.checked;
    setItems((all) => all.map((item) => item.id === id ? { ...item, checked } : item));
    if (firebaseEnabled) {
      notify('Updated for this session. Shared grocery sync is not migrated yet.');
      return;
    }
    try {
      const response = await fetch('/api/home', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, checked }) });
      if (!response.ok) throw new Error('save failed');
      notify(checked ? `${current.name} added to inventory` : `${current.name} returned to the list`);
    } catch { setItems((all) => all.map((item) => item.id === id ? { ...item, checked: current.checked } : item)); notify('Could not save that change. Try again.'); }
  };
  const title = active === 'Plan' ? 'Your week' : active;

  if (firebaseEnabled && auth.loading) return <LoadingView />;
  if (firebaseEnabled && !auth.session) return <SignInView error={auth.error} />;

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span></div><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.label} onClick={() => setActive(item.label)} className={active === item.label ? 'nav-item active' : 'nav-item'}><span>{item.icon}</span>{item.label}{item.label === 'Groceries' && <em>{remaining}</em>}</button>)}</nav><div className="automation-card"><span className="pulse" /><div><strong>Planner is watching</strong><p>Next refresh Sunday, 4 PM</p></div></div><div className="people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span><p>{auth.session?.member.displayName || 'Alex & Nathalia'}<br/><small>{auth.session ? <button className="sign-out" onClick={() => signOutOfHousehold()}>Sign out</button> : 'Denver household'}</small></p></div></aside>
    <section className="content">
      <header className="mobile-header"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span></div><div className="mobile-people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span></div></header>
      <header className="topbar"><div><p className="eyebrow">{formatLongDate()}</p><h1>{title}</h1><p>{active === 'Plan' ? 'Balanced around who’s home.' : 'Shared, current, and ready for both of you.'}</p></div><button className="primary-button" onClick={() => notify('The visible plan is already current with saved schedule changes.')}><span>↻</span> Refresh plan</button></header>
      {active === 'Plan' && <PlanView items={items} inventory={inventory} week={week} open={setActive} />}
      {active === 'Calendar' && <CalendarView events={events} week={week} householdId={auth.session?.householdId} onCreated={(created) => setEvents((current) => [...current.filter((event) => event.id !== created.id), created].sort((a, b) => a.date.localeCompare(b.date)))} notify={notify} />}
      {active === 'Recipes' && <RecipesView notify={notify} />}
      {active === 'Inventory' && <InventoryView inventory={inventory} notify={notify} />}
      {active === 'Groceries' && <GroceriesView items={items} store={store} setStore={setStore} toggle={toggleItem} />}
    </section>
    <nav className="bottom-nav" aria-label="Mobile navigation">{nav.map((item) => <button key={item.label} className={active === item.label ? 'active' : ''} onClick={() => setActive(item.label)}><span>{item.icon}</span><small>{item.label === 'Groceries' ? 'List' : item.label}</small>{item.label === 'Groceries' && remaining > 0 && <em>{remaining}</em>}</button>)}</nav>
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </main>;
}

function PlanView({ items, inventory, week, open }: { items: Grocery[]; inventory: Inventory[]; week: PlanningDay[]; open: (tab: string) => void }) {
  const dinnerCount = week.filter((day) => day.meal.label === 'DINNER' && day.meal.title !== 'Leftovers').length;
  const awayDays = week.filter((day) => !day.alex.isHome || !day.nathalia.isHome).length;
  const lateDays = week.filter((day) => day.alex.isLate || day.nathalia.isLate).length;
  const firstDinner = week.find((day) => day.meal.servings > 0) || week[0];
  return <><section className="today-card"><div><p className="eyebrow">NEXT DINNER · {firstDinner?.meal.servings || 0} SERVINGS</p><h2>{firstDinner?.meal.title}</h2><p>{firstDinner?.meal.effort} effort · {firstDinner?.meal.rationale}</p></div><button onClick={() => open('Calendar')}>View schedule</button></section><section className="week-section"><div className="section-heading"><div><h2>{planningWeekLabel(week)}</h2><p>{dinnerCount} dinner ideas · {awayDays} away {awayDays === 1 ? 'day' : 'days'} · {lateDays} late {lateDays === 1 ? 'night' : 'nights'}</p></div><button className="text-button" onClick={() => open('Calendar')}>Calendar →</button></div><div className="week-grid">{week.map((day, index) => <article className={day.isToday || index === 0 ? 'day-card today' : 'day-card'} key={day.date}><div className="date"><span>{day.dayLabel}</span><strong>{day.dateLabel}</strong></div><div className="availability"><span className="mini-avatar alex">A</span><p>{day.alex.label}</p></div><div className="availability"><span className="mini-avatar nathalia">N</span><p>{day.nathalia.label}</p></div><div className={`meal ${day.meal.tone}`} title={day.meal.rationale}><small>{day.meal.label}</small><strong>{day.meal.title}</strong><span className="meal-meta">{day.meal.servings} {day.meal.servings === 1 ? 'serving' : 'servings'} · {day.meal.effort}</span></div></article>)}</div></section><section className="dashboard-grid"><article className="panel tap-panel" onClick={() => open('Groceries')}><div className="panel-heading"><div><p className="eyebrow">NEXT RUN · SATURDAY</p><h2>Groceries</h2></div><span className="count-badge">{items.filter(i => !i.checked).length}</span></div><p className="panel-copy">King Soopers is ready. Costco cadence is still on the legacy list.</p><span className="panel-link">Open list →</span></article><article className="panel tap-panel" onClick={() => open('Inventory')}><div className="panel-heading"><div><p className="eyebrow">ESTIMATED ON HAND</p><h2>Kitchen pulse</h2></div><span className="count-badge warning">1</span></div><p className="panel-copy">{inventory[2]?.name || 'Greek yogurt'} needs one quick confirmation.</p><span className="panel-link">Review inventory →</span></article><article className="panel routine-panel"><div className="panel-heading"><div><p className="eyebrow">DAILY RHYTHM</p><h2>Recurring meals</h2></div></div><div className="routine"><span className="avatar alex">A</span><div><strong>Home breakfast</strong><p>Eggs, oats, berries, yogurt</p></div><em>5×</em></div><div className="routine"><span className="avatar nathalia">N</span><div><strong>Work snacks</strong><p>Fruit, cheese, almonds</p></div><em>3×</em></div></article></section></>;
}
function CalendarView({ events, week, householdId, onCreated, notify }: { events: ScheduleException[]; week: PlanningDay[]; householdId?: string; onCreated: (created: ScheduleException) => void; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState<'alex' | 'nathalia'>('alex');
  const [kind, setKind] = useState<ScheduleExceptionKind>('late_shift');
  const [date, setDate] = useState(week[0]?.date || '');
  const [note, setNote] = useState('');
  const labels: Record<ScheduleExceptionKind, string> = { late_shift: 'Late shift', work_trip: 'Work trip', day_off: 'Day off', holiday: 'Holiday', home: 'Home / available', away: 'Away' };
  const save = async () => {
    const title = note.trim() || labels[kind];
    try {
      const created = await createScheduleException({ personId, kind, date, title }, householdId);
      onCreated(created);
      setOpen(false); setNote(''); notify('Schedule saved. Servings and effort are updated.');
    } catch { notify('Could not save that schedule change.'); }
  };
  return <section className="calendar-page"><div className="calendar-actions"><div><p className="eyebrow">AVAILABILITY DRIVES THE PLAN</p><h2>Schedule exceptions</h2><p>Add only what is unusual. Normal home days are assumed.</p></div><button className="add-schedule" onClick={() => setOpen(true)}>＋ Add change</button></div>
    {events.length > 0 && <div className="event-strip">{events.map(event => <article key={event.id}><span className={`avatar ${event.personId}`}>{event.personId === 'alex' ? 'A' : 'N'}</span><div><strong>{event.title}</strong><small>{event.date} · {labels[event.kind] || event.kind}</small></div></article>)}</div>}
    <div className="stack-list">{week.map((day) => <article className="schedule-row" key={day.date}><div className="schedule-date"><strong>{day.dateLabel}</strong><span>{day.dayLabel}</span></div><div className="schedule-people"><p><span className="mini-avatar alex">A</span><strong>Alex</strong><small>{day.alex.label}</small></p><p><span className="mini-avatar nathalia">N</span><strong>Nathalia</strong><small>{day.nathalia.label}</small></p></div><div className={`schedule-meal ${day.meal.tone}`} title={day.meal.rationale}><small>{day.meal.label} · {day.meal.servings} {day.meal.servings === 1 ? 'SERVING' : 'SERVINGS'} · {day.meal.effort.toUpperCase()}</small><strong>{day.meal.title}</strong></div></article>)}</div>
    {open && <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="schedule-sheet" role="dialog" aria-modal="true" aria-label="Add schedule change" onClick={(event) => event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">ONE-TIME EXCEPTION</p><h2>Add schedule change</h2></div><button aria-label="Close" onClick={() => setOpen(false)}>×</button></div><label>Who<select value={personId} onChange={(event) => setPersonId(event.target.value as 'alex' | 'nathalia')}><option value="alex">Alex</option><option value="nathalia">Nathalia</option></select></label><label>What changed<select value={kind} onChange={(event) => setKind(event.target.value as ScheduleExceptionKind)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Short note <small>optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === 'work_trip' ? 'e.g. Sacramento' : 'e.g. home by 8:30'} /></label><button className="save-schedule" onClick={save}>Save schedule change</button><p className="sheet-note">MercaSync updates dinner effort and servings immediately. Grocery quantities remain on the legacy planner for now.</p></section></div>}
  </section>;
}

function LoadingView() {
  return <main className="auth-shell"><section className="auth-card"><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span></div><p>Opening your household…</p></section></main>;
}

function SignInView({ error }: { error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(error);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try { await signInToHousehold(email, password); }
    catch { setMessage('Could not sign in. Check the account and try again.'); setSubmitting(false); }
  };
  return <main className="auth-shell"><form className="auth-card" onSubmit={submit}><div className="brand"><span className="brand-mark">M</span><span>MercaSync</span></div><p className="eyebrow">PRIVATE HOUSEHOLD</p><h1>Welcome home</h1><p>Sign in as Alex or Nathalia to open the shared plan.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message && <p className="auth-error" role="alert">{message}</p>}<button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
function RecipesView({ notify }: { notify: (message: string) => void }) { const [stars, setStars] = useState<string[]>(['Miso salmon bowls', 'Harissa turkey pitas']); return <section className="recipe-grid">{recipes.map((recipe) => <article className="recipe-card" key={recipe.name}><div className={`recipe-swatch ${recipe.color}`}><button aria-label={`Star ${recipe.name}`} onClick={() => { setStars(s => s.includes(recipe.name) ? s.filter(x => x !== recipe.name) : [...s, recipe.name]); notify(stars.includes(recipe.name) ? 'Removed from favorites' : 'Saved as a favorite'); }}>{stars.includes(recipe.name) ? '★' : '☆'}</button><span>Cooked 2 weeks ago</span></div><div className="recipe-body"><p className="stars">{'★'.repeat(recipe.rating)}<span>{'★'.repeat(5 - recipe.rating)}</span></p><h2>{recipe.name}</h2><p>{recipe.meta}</p><small>{recipe.note}</small><button onClick={() => notify('Recipe detail is next in development.')}>Open recipe</button></div></article>)}</section>; }
function InventoryView({ inventory, notify }: { inventory: Inventory[]; notify: (message: string) => void }) { return <section className="inventory-page"><div className="confidence-key"><span className="pulse" />Confidence falls gradually when planned meals aren’t confirmed.</div>{inventory.map(item => <article className="inventory-card" key={item.name}><div><strong>{item.name}</strong><small>{item.qty}</small></div><div className="confidence"><span style={{ width: `${item.confidence}%` }} /><small>{item.confidence}% sure</small></div><button onClick={() => notify(`${item.name} confirmed.`)}>Confirm</button></article>)}<button className="add-button" onClick={() => notify('Inventory editing is next in development.')}>＋ Add an item</button></section>; }
function GroceriesView({ items, store, setStore, toggle }: { items: Grocery[]; store: 'King Soopers' | 'Costco'; setStore: (store: 'King Soopers' | 'Costco') => void; toggle: (id: string) => void }) { const visible = items.filter(item => item.store === store); return <section className="groceries-page"><div className="store-tabs"><button className={store === 'King Soopers' ? 'active' : ''} onClick={() => setStore('King Soopers')}>King Soopers <span>{items.filter(i => i.store === 'King Soopers' && !i.checked).length}</span></button><button className={store === 'Costco' ? 'active' : ''} onClick={() => setStore('Costco')}>Costco <span>{items.filter(i => i.store === 'Costco' && !i.checked).length}</span></button></div><div className="list-summary"><div><p className="eyebrow">{store === 'Costco' ? 'BIWEEKLY · SEP 1–3' : 'WEEKLY · SATURDAY'}</p><h2>{store}</h2></div><p>{visible.filter(i => !i.checked).length} left</p></div><div className="shopping-list">{visible.map(item => <button className={item.checked ? 'shopping-item checked' : 'shopping-item'} key={item.id} onClick={() => toggle(item.id)}><span className="big-check">✓</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>)}</div><div className="auto-note"><span className="pulse" /><p><strong>Built automatically</strong><br/>Recipes + routines − estimated inventory</p></div></section>; }
