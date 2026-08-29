'use client';

import { useMemo, useState } from 'react';

const days = [
  { day: 'Mon', date: '31', alex: 'Home', nathalia: 'Home', meal: 'Miso salmon bowls', tone: 'sage' },
  { day: 'Tue', date: '1', alex: 'Late shift', nathalia: 'Home', meal: 'Lemony chicken orzo', tone: 'sun' },
  { day: 'Wed', date: '2', alex: 'Home', nathalia: 'Sacramento', meal: 'Leftovers', tone: 'clay' },
  { day: 'Thu', date: '3', alex: 'Day off', nathalia: 'Sacramento', meal: 'Harissa turkey pitas', tone: 'blue' },
  { day: 'Fri', date: '4', alex: 'Home', nathalia: 'Home', meal: 'Steak taco night', tone: 'berry' },
  { day: 'Sat', date: '5', alex: 'Home', nathalia: 'Home', meal: 'Dinner out', tone: 'ink' },
  { day: 'Sun', date: '6', alex: 'Home', nathalia: 'Home', meal: 'Ginger chicken soup', tone: 'sage' },
];

const groceries = [
  { name: 'Wild salmon', detail: '1 lb · Miso bowls', store: 'King Soopers', checked: false },
  { name: 'Baby spinach', detail: '1 bag · Orzo + breakfast', store: 'King Soopers', checked: false },
  { name: 'Persian cucumbers', detail: '5 · Bowls + pitas', store: 'King Soopers', checked: true },
  { name: 'Greek yogurt', detail: '32 oz · Low confidence at home', store: 'Costco', checked: false },
  { name: 'Chicken breast', detail: '6 lb · Refill freezer staple', store: 'Costco', checked: false },
];

const inventory = [
  { name: 'Jasmine rice', qty: '4.2 lb', confidence: 92 },
  { name: 'Eggs', qty: '8', confidence: 78 },
  { name: 'Greek yogurt', qty: '~1 cup', confidence: 34 },
];

export default function Home() {
  const [active, setActive] = useState('Plan');
  const [items, setItems] = useState(groceries);
  const [toast, setToast] = useState('');
  const remaining = useMemo(() => items.filter((item) => !item.checked).length, [items]);

  const toggleItem = (index: number) => setItems((current) => current.map((item, i) => i === index ? { ...item, checked: !item.checked } : item));
  const runPlanner = () => {
    setToast('Plan refreshed around 2 travel days and 1 late shift.');
    window.setTimeout(() => setToast(''), 3200);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A+N</span><span>At Home</span></div>
        <nav aria-label="Primary navigation">
          {['Plan', 'Calendar', 'Recipes', 'Inventory', 'Groceries'].map((item) => (
            <button key={item} onClick={() => setActive(item)} className={active === item ? 'nav-item active' : 'nav-item'}>
              <span className="nav-dot" />{item}{item === 'Groceries' && <em>{remaining}</em>}
            </button>
          ))}
        </nav>
        <div className="automation-card"><span className="pulse" /><div><strong>Planner is watching</strong><p>Next refresh Sunday, 4 PM</p></div></div>
        <div className="people"><span className="avatar alex">A</span><span className="avatar nathalia">N</span><p>Alex & Nathalia<br/><small>Denver household</small></p></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">HOUSEHOLD PLAN</p><h1>Good evening, you two.</h1><p>Here’s the week, balanced around who’s home.</p></div>
          <button className="primary-button" onClick={runPlanner}><span>↻</span> Refresh plan</button>
        </header>

        <section className="week-section">
          <div className="section-heading"><div><h2>August 31 – September 6</h2><p>5 dinners · 2 travel days · Costco week</p></div><button className="text-button">View calendar →</button></div>
          <div className="week-grid">
            {days.map((day, index) => (
              <article className={index === 0 ? 'day-card today' : 'day-card'} key={day.day}>
                <div className="date"><span>{day.day}</span><strong>{day.date}</strong></div>
                <div className="availability"><span className="mini-avatar alex">A</span><p>{day.alex}</p></div>
                <div className="availability"><span className="mini-avatar nathalia">N</span><p>{day.nathalia}</p></div>
                <div className={`meal ${day.tone}`}><small>DINNER</small><strong>{day.meal}</strong></div>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-grid">
          <article className="panel grocery-panel">
            <div className="panel-heading"><div><p className="eyebrow">NEXT RUN</p><h2>Groceries</h2></div><span className="date-pill">Sat, Sep 5</span></div>
            <div className="store-row"><div><span className="store-icon">K</span><strong>King Soopers</strong></div><p>{items.filter(i => i.store === 'King Soopers' && !i.checked).length} left</p></div>
            <div className="grocery-list">
              {items.filter(i => i.store === 'King Soopers').map((item) => {
                const index = items.indexOf(item);
                return <button className={item.checked ? 'grocery checked' : 'grocery'} key={item.name} onClick={() => toggleItem(index)}><span className="check">✓</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>;
              })}
            </div>
            <div className="store-row costco"><div><span className="store-icon">C</span><div><strong>Costco</strong><small>Biweekly · Sep 1–3 window</small></div></div><p>{items.filter(i => i.store === 'Costco' && !i.checked).length} items</p></div>
            <button className="wide-button" onClick={() => setActive('Groceries')}>Open full grocery list</button>
          </article>

          <article className="panel inventory-panel">
            <div className="panel-heading"><div><p className="eyebrow">ESTIMATED ON HAND</p><h2>Kitchen pulse</h2></div><button className="icon-button">＋</button></div>
            {inventory.map(item => <div className="inventory-row" key={item.name}><div><strong>{item.name}</strong><small>{item.qty}</small></div><div className="confidence"><span style={{ width: `${item.confidence}%` }} /><small>{item.confidence}% sure</small></div></div>)}
            <div className="insight"><span>✦</span><p><strong>One quick check would help</strong><br/>Confirm Greek yogurt before Costco and the next plan will reconcile itself.</p><button>Confirm</button></div>
          </article>

          <article className="panel routine-panel">
            <div className="panel-heading"><div><p className="eyebrow">DAILY RHYTHM</p><h2>Recurring meals</h2></div><button className="text-button">Edit</button></div>
            <div className="routine"><span className="avatar alex">A</span><div><strong>Alex’s home breakfast</strong><p>Eggs, oats, berries, Greek yogurt</p></div><em>5×</em></div>
            <div className="routine"><span className="avatar nathalia">N</span><div><strong>Nathalia’s work snacks</strong><p>Fruit, cheese, almonds</p></div><em>3×</em></div>
            <div className="automation-line"><span className="pulse" />Already included in this week’s quantities</div>
          </article>
        </section>
      </section>
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
