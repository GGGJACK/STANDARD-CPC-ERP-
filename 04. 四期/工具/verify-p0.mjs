// P0 修復驗證：SEC-01 / SEC-02 / DAT-03 / STK-06
// 零依賴（node:sqlite + 內置 fetch）。全程跑在 VACUUM INTO 出來的隔離副本上，
// 不碰正式 data.db；跑完自動關服務、刪副本。
//
// 用法：node verify-p0.mjs [port]
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('F:/04 STANDARD CPC SYSTEM/04. 四期/系统代码');
const OUT_DIR = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/out';
const PORT = Number(process.argv[2] || process.env.PORT || 3104);
const BASE = `http://127.0.0.1:${PORT}`;
const RUN = path.join(OUT_DIR, `p0-verify-run-${Date.now()}`);
const QUOTATION_ID = '6adb139979ea83c2dd11cc2f';

fs.mkdirSync(RUN, { recursive: true });
const dbPath = path.join(RUN, 'data.db');
const upDir = path.join(RUN, 'uploads');
fs.mkdirSync(upDir, { recursive: true });

const results = [];
const check = (id, ok, detail) => results.push({ id, ok: !!ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child = null;
const stop = () => { if (child && !child.killed) { try { child.kill(); } catch {} } };
process.on('exit', stop);

// 一致副本：VACUUM INTO 會把 WAL 裡的未合併寫入一起帶走
{
  const src = new DatabaseSync(path.join(SRC, 'data.db'));
  src.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
  src.close();
}

const openDb = (readOnly = false) => new DatabaseSync(dbPath, { readOnly });
const readRecord = (entity, id) => {
  const db = openDb(true);
  const row = db.prepare('SELECT data FROM records WHERE entity=? AND id=?').get(entity, id);
  db.close();
  return row ? JSON.parse(row.data) : null;
};
const listRecords = (entity) => {
  const db = openDb(true);
  const rows = db.prepare('SELECT data FROM records WHERE entity=?').all(entity).map((r) => JSON.parse(r.data));
  db.close();
  return rows;
};

async function waitReady(ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

async function login(role) {
  const res = await fetch(`${BASE}/demo?as=${role}`, { redirect: 'manual' });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookie = String(raw[0] || res.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error(`登入失敗 ${role}：HTTP ${res.status}`);
  return cookie;
}

async function get(pathname, cookie) {
  const r = await fetch(BASE + pathname, { headers: { cookie }, redirect: 'manual' });
  return { status: r.status, text: await r.text() };
}

async function post(pathname, cookie, fields) {
  const r = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
  return { status: r.status, text: await r.text(), location: r.headers.get('location') || '' };
}

const csrfFrom = (html) => (html.match(/name="__csrf" value="([^"]+)"/) || [])[1] || '';
const hasCost = (rows) => rows.some((r) => r.fill && Object.hasOwn(r.fill, 'cost_price'));

try {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: SRC,
    env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, CPC_UPLOAD_DIR: upDir, CPC_AUTO_IMPORT: '0', CPC_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {});

  if (!(await waitReady())) throw new Error(`服務未在 ${PORT} 啟動`);

  const front = await login('front');
  const office = await login('office');
  const mgmt = await login('management');

  // ---------- SEC-01：選擇器越權 ----------
  const a1 = await get('/api/pick?source=customers&limit=5', front);
  check('SEC-01a', a1.status === 403, `front → customers 期望 403，實得 ${a1.status}`);

  const a2 = await get('/api/pick?source=products&limit=5', front);
  let j2 = []; try { j2 = JSON.parse(a2.text); } catch {}
  const leak2 = j2.some((r) => r.fill && Object.hasOwn(r.fill, 'cost_price'));
  check('SEC-01b', a2.status === 200 && !leak2,
    `front → products 期望 200 且無 cost_price（補給要選產品，不能一刀切 403），實得 ${a2.status}，洩漏=${leak2}`);

  const a3 = await get('/api/pick?source=products&limit=5', office);
  let j3 = []; try { j3 = JSON.parse(a3.text); } catch {}
  check('SEC-01c', a3.status === 200 && j3.length > 0 && !hasCost(j3),
    `office → products ${a3.status}，${j3.length} 條，cost_price 洩漏=${hasCost(j3)}`);

  const a4 = await get('/api/pick?source=products&limit=5', mgmt);
  let j4 = []; try { j4 = JSON.parse(a4.text); } catch {}
  check('SEC-01d', a4.status === 200 && hasCost(j4),
    `management → products ${a4.status}，應含 cost_price，實得 ${hasCost(j4)}`);

  // 例外：前線補給／請假要選人，不能因權限收緊而擋住
  const a5 = await get('/api/pick?source=employees&limit=5', front);
  check('SEC-01e', a5.status === 200, `front → employees 期望 200（補給／請假要用），實得 ${a5.status}`);

  {
    const db = openDb(true);
    const n = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='pick'").get().c;
    db.close();
    check('SEC-01f', n >= 3, `audit_log 應有 pick 記錄，實得 ${n} 條`);
  }

  // ---------- SEC-02：編輯表單金額掩碼 ----------
  const e1 = await get(`/edit/quotations/${QUOTATION_ID}`, office);
  // 只看「可見控件」：hidden 必須保留原值，否則保存會把金額清空，
  // 所以不能用 includes('value="7500"') 這種粗判據（會把 hidden 也判成洩漏）。
  const visibleLeak = [...e1.text.matchAll(/<input[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('value="7500"') && !/type="hidden"/.test(tag));
  check('SEC-02a', e1.status === 200 && visibleLeak.length === 0,
    `office 編輯頁可見控件帶明文 7500 的個數 ${visibleLeak.length}${visibleLeak.length ? `：${visibleLeak[0].slice(0, 140)}` : ''}`);
  check('SEC-02b', e1.text.includes('•••••'), 'office 編輯頁應有 ••••• 佔位符');
  check('SEC-02c', /name="total_amount" value="7500"/.test(e1.text), 'hidden 應保留原值 7500，避免保存時清空');

  const e2 = await get(`/edit/quotations/${QUOTATION_ID}`, mgmt);
  check('SEC-02d', e2.status === 200 && e2.text.includes('value="7500"'), 'management 編輯頁應見真實金額');

  // ---------- DAT-03：重名客戶不再猜 ----------
  const pg = await get('/new/delivery_notes', office);
  const csrf = csrfFrom(pg.text);
  check('DAT-03csr', !!csrf, `取得 CSRF（/new/delivery_notes HTTP ${pg.status}）`);

  const d1 = await post('/save/delivery_notes', office, { __csrf: csrf, customer_name: '房屋署', customer_id: '' });
  check('DAT-03a', d1.status === 409, `同名客戶（房屋署 ×4）應回 409，實得 ${d1.status}`);
  check('DAT-03b', /同名/.test(d1.text), '提示應說明「同名」並要求選擇');

  const d2 = await post('/save/delivery_notes', office, { __csrf: csrf, customer_name: '不存在的客戶ZZZ', customer_id: '' });
  check('DAT-03c', d2.status !== 409, `不同名客戶不應被 409 攔截，實得 ${d2.status}`);

  // ---------- STK-06：盤點沖銷不再清零 ----------
  const products = listRecords('Product').filter((p) => Number(p.stock_quantity) >= 10);
  const product = products[0];
  check('STK-06pre', !!product, products.length ? `選用產品 ${product.product_code} ${product.product_name}，庫存 ${product.stock_quantity}` : '找不到庫存 ≥10 的產品');

  if (product) {
    const before = Number(product.stock_quantity);
    const target = before - 3;
    const pg2 = await get('/new/stock_counts', mgmt);
    const csrf2 = csrfFrom(pg2.text);
    const items = [{ product_id: product.id, product_name: product.product_name, product_code: product.product_code, actual_quantity: target }];
    const save = await post('/save/stock_counts', mgmt, {
      __csrf: csrf2,
      count_date: new Date().toISOString().slice(0, 10),
      status: '已完成',
      items: JSON.stringify(items),
      notes: 'P0 驗證用盤點',
    });
    const newId = (save.location.match(/\/view\/stock_counts\/([^/?#]+)/) || [])[1] || '';
    check('STK-06a', save.status === 302 && !!newId, `建立並過賬盤點（HTTP ${save.status}，id=${newId || '無'}）`);

    if (newId) {
      const savedCount = readRecord('StockCount', newId);
      const diff = savedCount && Array.isArray(savedCount.items) ? savedCount.items[0].difference : undefined;
      check('STK-06b', diff === -3, `盤點單 items[0].difference 應為 -3（落庫快照），實得 ${JSON.stringify(diff)}`);

      const afterPost = readRecord('Product', product.id);
      check('STK-06c', Number(afterPost.stock_quantity) === target,
        `過賬後庫存應 ${before} → ${target}，實得 ${afterPost.stock_quantity}`);

      const del = await post(`/delete/stock_counts/${newId}`, mgmt, { __csrf: csrf2 });
      const afterDel = readRecord('Product', product.id);
      check('STK-06d', Number(afterDel.stock_quantity) === before,
        `刪除（沖銷）後庫存應回到 ${before}，實得 ${afterDel.stock_quantity}（HTTP ${del.status}）`);
    }
  }
} catch (error) {
  check('RUN', false, `驗證中斷：${error.message}`);
} finally {
  stop();
  await sleep(400);
}

const passed = results.filter((r) => r.ok).length;
const summary = { at: new Date().toISOString(), port: PORT, total: results.length, passed, failed: results.length - passed, results };
fs.writeFileSync(path.join(OUT_DIR, 'p0-verify-result.json'), JSON.stringify(summary, null, 2));

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(12)} ${r.detail}`);
console.log(`\n${passed}/${results.length} 通過 · 副本 ${RUN}`);
try { fs.rmSync(RUN, { recursive: true, force: true }); } catch {}
process.exit(passed === results.length ? 0 : 1);
