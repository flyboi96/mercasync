import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

const ingredients = [
  ['salmon', 'Wild salmon', 'protein', 'lb', 'King Soopers', 0], ['spinach', 'Baby spinach', 'produce', 'bag', 'King Soopers', 0],
  ['cucumbers', 'Persian cucumbers', 'produce', 'count', 'King Soopers', 0], ['yogurt', 'Greek yogurt', 'dairy', 'oz', 'Costco', 1],
  ['chicken', 'Chicken breast', 'protein', 'lb', 'Costco', 1], ['rice', 'Jasmine rice', 'grain', 'lb', 'Costco', 1],
  ['eggs', 'Eggs', 'dairy', 'count', 'Costco', 1], ['berries', 'Frozen berries', 'fruit', 'cup', 'Costco', 1],
] as const;
const groceries = [
  ['salmon', 'salmon', 1, 'lb', 0, '1 lb · Miso bowls'], ['spinach', 'spinach', 1, 'bag', 0, '1 bag · Orzo + breakfast'],
  ['cucumbers', 'cucumbers', 5, 'count', 1, '5 · Bowls + pitas'], ['yogurt', 'yogurt', 32, 'oz', 0, '32 oz · Low confidence at home'],
  ['chicken', 'chicken', 6, 'lb', 0, '6 lb · Refill freezer staple'],
] as const;

async function ensureSeeded() {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM ingredients').first<{ count: number }>();
  if ((count?.count || 0) > 0) return;
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO people (id,name,color,timezone) VALUES ('alex','Alex','#315f4b','America/Denver')"),
    db.prepare("INSERT OR IGNORE INTO people (id,name,color,timezone) VALUES ('nathalia','Nathalia','#874c52','America/Denver')"),
    db.prepare("INSERT OR IGNORE INTO grocery_runs (id,store,window_start,window_end,cadence,status) VALUES ('king-week','King Soopers','2026-09-05','2026-09-05','weekly','ready')"),
    db.prepare("INSERT OR IGNORE INTO grocery_runs (id,store,window_start,window_end,cadence,status) VALUES ('costco-week','Costco','2026-09-01','2026-09-03','biweekly','ready')"),
    ...ingredients.map((row) => db.prepare('INSERT OR IGNORE INTO ingredients (id,name,category,base_unit,preferred_store,costco_eligible) VALUES (?,?,?,?,?,?)').bind(...row)),
  ]);
  await db.batch(groceries.map((row) => db.prepare('INSERT OR IGNORE INTO grocery_items (id,run_id,ingredient_id,required_quantity,unit,checked,reason_json) VALUES (?,?,?,?,?,?,?)').bind(row[0], ['yogurt', 'chicken'].includes(row[0]) ? 'costco-week' : 'king-week', row[1], row[2], row[3], row[4], JSON.stringify({ detail: row[5] }))));
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO inventory_lots (id,ingredient_id,estimated_quantity,unit,confidence,source) VALUES ('rice-lot','rice',4.2,'lb',0.92,'starting estimate')"),
    db.prepare("INSERT OR IGNORE INTO inventory_lots (id,ingredient_id,estimated_quantity,unit,confidence,source) VALUES ('eggs-lot','eggs',8,'count',0.78,'starting estimate')"),
    db.prepare("INSERT OR IGNORE INTO inventory_lots (id,ingredient_id,estimated_quantity,unit,confidence,source) VALUES ('yogurt-lot','yogurt',8,'oz',0.34,'starting estimate')"),
    db.prepare("INSERT OR IGNORE INTO inventory_lots (id,ingredient_id,estimated_quantity,unit,confidence,source) VALUES ('berries-lot','berries',3,'cup',0.66,'starting estimate')"),
  ]);
}

export async function GET() {
  await ensureSeeded();
  const groceryResult = await env.DB.prepare("SELECT gi.id,i.name,json_extract(gi.reason_json,'$.detail') AS detail,gr.store,gi.checked FROM grocery_items gi JOIN ingredients i ON i.id=gi.ingredient_id JOIN grocery_runs gr ON gr.id=gi.run_id ORDER BY gr.store DESC,i.name").all();
  const inventoryResult = await env.DB.prepare("SELECT i.name,printf('%g %s',l.estimated_quantity,l.unit) AS qty,CAST(ROUND(l.confidence*100) AS INTEGER) AS confidence FROM inventory_lots l JOIN ingredients i ON i.id=l.ingredient_id ORDER BY l.confidence DESC").all();
  return NextResponse.json({ groceries: groceryResult.results.map((row) => ({ ...row, checked: Boolean(row.checked) })), inventory: inventoryResult.results });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string; checked?: boolean };
  if (!body.id || typeof body.checked !== 'boolean') return NextResponse.json({ error: 'Invalid grocery update' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id FROM grocery_items WHERE id=?').bind(body.id).first();
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  await env.DB.prepare('UPDATE grocery_items SET checked=? WHERE id=?').bind(body.checked ? 1 : 0, body.id).run();
  return NextResponse.json({ ok: true });
}
