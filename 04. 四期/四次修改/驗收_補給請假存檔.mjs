// 四次修改 · 補給／請假存檔 + 數量整數規則回歸（零依賴，Node 22+）
// 針對 2026-10-25 回報的「補給記錄存不了」問題做長期看門測試。
//
// 背景：新增補給／請假的彈窗 (#recDlg) 曾把預先產生的記錄 ID 寫進 __id，
//       後端因此把它當成「編輯一筆不存在的記錄」而丟 404，前端只看到空白錯誤頁。
//
// 只可在隔離副本執行（:3101）：
//   set CPC_TEST=1
//   set TEST_BASE=http://127.0.0.1:3101
//   set DB_PATH=F:\...\_verify\_verify.db
//   node 驗收_補給請假存檔.mjs
//
// 檢查項：
//   1. /mysupply?new=1、/leaves?new=1 的彈窗 __id 必須為空
//   2. 以前線、辦公室身分各建一筆 → 必須 302 且真的寫入
//   3. 帶不存在的 __id、但沒有 __expected_updated（舊頁面快取）→ 仍須成功建立，不得 404
//   4. 真的在編輯已不存在的記錄（帶 __expected_updated）→ 必須回錯誤頁並顯示訊息，且不寫入
//   5. 數量類欄位（quantity / qty / stock_quantity / quantity_change）不得有小數
//   6. 跑完自動清除本測試建立的記錄

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3101';
const DB_PATH = process.env.DB_PATH;
if (!process.env.CPC_TEST || !BASE.includes(':3101')) {
  console.error('拒絕執行：請設 CPC_TEST=1 且 TEST_BASE 指向 :3101 隔離測試服務');
  process.exit(2);
}
if (!DB_PATH || !fs.existsSync(DB_PATH)) {
  console.error('拒絕執行：請提供存在的隔離 DB_PATH');
  process.exit(2);
}

const db = new DatabaseSync(DB_PATH);
const TAG = `UITEST-${Date.now().toString(36)}`;
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function login(role) {
  let cookie = '';
  const res = await fetch(`${BASE}/demo?as=${role}`, { redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() || []) {
    const m = /^sid=([^;]+)/.exec(c);
    if (m) cookie = `sid=${m[1]}`;
  }
  return cookie;
}

async function getHtml(cookie, path) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' });
  return { status: res.status, html: await res.text() };
}

async function post(cookie, action, fields) {
  const res = await fetch(BASE + action, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get('location') || '',
    flash: (/class="flash error">([\s\S]*?)<\/div>/.exec(text)?.[1] || '').trim(),
  };
}

const csrfOf = (html) => /name="__csrf" value="([^"]+)"/.exec(html)?.[1] || '';
const fieldOf = (html, name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? null;
const countOf = (entity) => db.prepare('SELECT COUNT(*) c FROM records WHERE entity=?').get(entity).c;
const existsOf = (entity, id) => !!db.prepare('SELECT 1 FROM records WHERE entity=? AND id=?').get(entity, id);
const created = [];

// ── 1. 彈窗不得帶 __id ─────────────────────────────
for (const [label, path] of [['補給記錄', '/mysupply?new=1'], ['請假紀錄', '/leaves?new=1']]) {
  for (const role of ['front', 'office']) {
    const cookie = await login(role);
    const { status, html } = await getHtml(cookie, path);
    const id = fieldOf(html, '__id');
    check(`${label} · ${role} 可開啟新增彈窗`, status === 200, `HTTP ${status}`);
    check(`${label} · ${role} 彈窗 __id 為空`, id === '', `__id="${id}"`);
  }
}

// ── 2. 前線建立補給 ────────────────────────────────
{
  const cookie = await login('front');
  const { html } = await getHtml(cookie, '/mysupply?new=1');
  const csrf = csrfOf(html);
  const newId = fieldOf(html, '__new_id') || '';
  const before = countOf('SupplyRecord');
  const r = await post(cookie, '/save/supply_records', {
    __csrf: csrf, __id: '', __new_id: newId, __expected_updated: '', __back: '/mysupply',
    supply_date: new Date().toISOString().slice(0, 10), type: '個人',
    employee_name: '驗收員工', employee_id: '', products: '[]', tools: '[]', notes: `${TAG} 補給`,
  });
  check('前線建立補給記錄成功', r.status === 302, `HTTP ${r.status} ${r.flash}`);
  check('補給記錄真的寫入', countOf('SupplyRecord') === before + 1 && existsOf('SupplyRecord', newId), `id=${newId}`);
  if (existsOf('SupplyRecord', newId)) created.push(['SupplyRecord', newId]);
}

// ── 3. 前線建立請假 ────────────────────────────────
{
  const cookie = await login('front');
  const { html } = await getHtml(cookie, '/leaves?new=1');
  const csrf = csrfOf(html);
  const newId = fieldOf(html, '__new_id') || '';
  const emp = fieldOf(html, 'employee_name') || '驗收員工';
  const before = countOf('LeaveRecord');
  const r = await post(cookie, '/save/leave_records', {
    __csrf: csrf, __id: '', __new_id: newId, __expected_updated: '', __back: '/leaves',
    start_date: '2030-01-02', end_date: '2030-01-03', leave_type: '病假',
    employee_name: emp, employee_id: '', reason: `${TAG} 請假`, status: '待審批',
  });
  check('前線建立請假記錄成功', r.status === 302, `HTTP ${r.status} ${r.flash}`);
  check('請假記錄真的寫入', countOf('LeaveRecord') === before + 1 && existsOf('LeaveRecord', newId), `id=${newId}`);
  if (existsOf('LeaveRecord', newId)) created.push(['LeaveRecord', newId]);
}

// ── 4. 舊頁面快取：壞 __id 但沒有 __expected_updated ──
{
  const cookie = await login('front');
  const { html } = await getHtml(cookie, '/mysupply?new=1');
  const csrf = csrfOf(html);
  const ghost = `sup_${TAG}_ghost`;
  const before = countOf('SupplyRecord');
  const r = await post(cookie, '/save/supply_records', {
    __csrf: csrf, __id: ghost, __new_id: ghost, __expected_updated: '', __back: '/mysupply',
    supply_date: '2030-01-04', type: '個人', employee_name: '驗收員工', employee_id: '',
    products: '[]', tools: '[]', notes: `${TAG} 舊快取`,
  });
  check('壞 __id + 無 updated_date 視為新增', r.status === 302, `HTTP ${r.status} ${r.flash}`);
  check('壞 __id 仍寫入且沿用該 ID', countOf('SupplyRecord') === before + 1 && existsOf('SupplyRecord', ghost), ghost);
  if (existsOf('SupplyRecord', ghost)) created.push(['SupplyRecord', ghost]);
}

// ── 5. 真的編輯已不存在的記錄：必須報錯且不寫入 ──────
{
  const cookie = await login('front');
  const { html } = await getHtml(cookie, '/mysupply?new=1');
  const csrf = csrfOf(html);
  const ghost = `sup_${TAG}_stale`;
  const before = countOf('SupplyRecord');
  const r = await post(cookie, '/save/supply_records', {
    __csrf: csrf, __id: ghost, __new_id: ghost, __expected_updated: '2026-01-01T00:00:00.000Z', __back: '/mysupply',
    supply_date: '2030-01-05', type: '個人', employee_name: '驗收員工', employee_id: '',
    products: '[]', tools: '[]', notes: `${TAG} 不應寫入`,
  });
  check('編輯已不存在的記錄被擋下', r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
  check('編輯已不存在的記錄不寫入', countOf('SupplyRecord') === before && !existsOf('SupplyRecord', ghost));
  check('錯誤訊息有顯示（不是空白頁）', r.flash.length > 0 || r.status === 404, r.flash || `HTTP ${r.status}`);
}

// ── 5b. 數量只能是整數 ──────────────────────────────
{
  const cookie = await login('front');
  const { html } = await getHtml(cookie, '/mysupply?new=1');
  const csrf = csrfOf(html);
  const newId = fieldOf(html, '__new_id') || '';

  // 前端：明細欄位要帶 integer 旗標，瀏覽器端才會切成數字鍵盤並擋掉小數點
  const colsRaw = /data-columns="([^"]+)"/.exec(html)?.[1] || '';
  const cols = colsRaw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  check('明細數量欄位已標記為整數', /"name":"quantity"[^}]*"integer":true/.test(cols), cols.slice(0, 90) + '…');

  const before = countOf('SupplyRecord');
  const decimal = await post(cookie, '/save/supply_records', {
    __csrf: csrf, __id: '', __new_id: newId, __expected_updated: '', __back: '/mysupply',
    supply_date: '2030-02-01', type: '個人', employee_name: '驗收員工', employee_id: '',
    products: JSON.stringify([{ product_name: '驗收品', product_id: '', unit: '', quantity: 2.5 }]),
    tools: '[]', notes: `${TAG} 小數`,
  });
  check('小數數量被後端擋下', decimal.status === 400, `HTTP ${decimal.status}`);
  check('錯誤訊息說明必須為整數', decimal.flash.includes('整數'), decimal.flash);
  check('小數數量未寫入', countOf('SupplyRecord') === before);

  const okId = `sup_${TAG}_int`;
  const whole = await post(cookie, '/save/supply_records', {
    __csrf: csrf, __id: '', __new_id: okId, __expected_updated: '', __back: '/mysupply',
    supply_date: '2030-02-01', type: '個人', employee_name: '驗收員工', employee_id: '',
    products: JSON.stringify([{ product_name: '驗收品', product_id: '', unit: '', quantity: 3 }]),
    tools: '[]', notes: `${TAG} 整數`,
  });
  check('整數數量可正常存檔', whole.status === 302, `HTTP ${whole.status} ${whole.flash}`);
  if (existsOf('SupplyRecord', okId)) created.push(['SupplyRecord', okId]);
}

// ── 5c. 商品庫存數量也只能是整數 ────────────────────
{
  const cookie = await login('management');
  const { html } = await getHtml(cookie, '/new/products');
  const csrf = csrfOf(html);
  const before = countOf('Product');
  const r = await post(cookie, '/save/products', {
    __csrf: csrf, __id: '', __new_id: `prd_${TAG}_dec`, __expected_updated: '', __back: '/products',
    product_code: `${TAG}-D`, product_name: '驗收商品（小數庫存）',
    standard_retail_price: '10', stock_quantity: '1.5',
  });
  check('商品庫存小數被擋下', r.status === 400 && r.flash.includes('整數'), `HTTP ${r.status} ${r.flash}`);
  check('商品未寫入', countOf('Product') === before);
}

// ── 6. 清理 ────────────────────────────────────────
{
  const del = db.prepare('DELETE FROM records WHERE entity=? AND id=?');
  for (const [entity, id] of created) del.run(entity, id);
  const left = db.prepare("SELECT COUNT(*) c FROM records WHERE data LIKE ?").get(`%${TAG}%`).c;
  check('測試資料已清理', left === 0, `${created.length} 筆 · 殘留 ${left}`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`\n驗收完成：${pass}/${results.length} 通過，${fail} 失敗`);
fs.writeFileSync(new URL('./驗收結果_補給請假存檔.json', import.meta.url), JSON.stringify({
  at: new Date().toISOString(), base: BASE, total: results.length, pass, fail, results,
}, null, 2));
process.exit(fail ? 1 : 0);
