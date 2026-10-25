// 二次修改 · 自動驗收腳本（零依賴，Node 22+）
// 只可在隔離副本上跑：必須是 3101 端口 + 非正式 data.db
// 用法：
//   set PORT=3101
//   set DB_PATH=F:\04 STANDARD CPC SYSTEM\04. 四期\系统代码\_verify.db
//   set CPC_UPLOAD_DIR=...\_verify-uploads
//   node server.mjs
//   （另一個窗口）
//   set CPC_TEST=1
//   set TEST_BASE=http://127.0.0.1:3101
//   set DB_PATH=...\_verify.db
//   node verify-operation-2.mjs

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
const results = [];
const runId = Date.now().toString(36);
const created = { contracts: [], stock_counts: [], product: null, productStock: 0 };

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

let cookie = '';
async function req(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(BASE + path, { redirect: 'manual', ...options, headers });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) {
    const sid = /^sid=([^;]+)/.exec(c);
    if (sid) cookie = `sid=${sid[1]}`;
  }
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get('location') || '' };
}
const csrfOf = (html) => (/name="__csrf"\s+value="([^"]+)"/.exec(html) || [])[1] || '';
const has = (html, s) => html.includes(s);
const record = (id) => {
  const row = db.prepare('SELECT data,deleted FROM records WHERE id=?').get(id);
  return row ? { ...JSON.parse(row.data), __deleted: !!row.deleted } : null;
};
const productById = (id) => JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Product' AND id=?").get(id).data);

async function login(role) {
  cookie = '';
  const res = await req(`/demo?as=${role}`);
  return res.status === 302;
}

const run = async () => {
  // ── A. 頁面可用性 ────────────────────────────────
  check('登入頁可開', (await req('/login')).status === 200);
  check('管理層登入', await login('management'));

  const pages = [
    ['/schedules', '排班管理'], ['/contracts', '合約列表'], ['/vehicles', '車輛管理'],
    ['/inventory', '庫存管理'], ['/inventory?tab=counts', '盤點頁'], ['/purchaseorders', '採購單管理'],
    ['/trash', '回收桶'], ['/stockcounts', '盤點記錄'], ['/recurringschedules', '定期排程'],
  ];
  const html = {};
  for (const [path, label] of pages) {
    const res = await req(path);
    html[path] = res.text;
    check(`${label} 200`, res.status === 200, String(res.status));
  }

  const customer = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Customer' AND deleted=0 LIMIT 1").get().data);
  check('客戶詳情（新版）200', (await req(`/view/customers/${customer.id}`)).status === 200);

  // ── B. 版面與功能標記 ────────────────────────────
  check('合約頁內建彈窗', has(html['/contracts'], 'id="contractDlg"'));
  check('合約表單不再顯示客戶 ID 欄', !has(html['/contracts'], 'for="f_customer_id"'));
  check('合約客戶 ID 以隱藏欄位保存', /type="hidden" name="customer_id"/.test(html['/contracts']));
  check('合約彈窗含文件上傳', has(html['/contracts'], '合約文件'));
  check('合約自動命名提示', has(html['/contracts'], '合約名稱（自動生成）'));

  const po = html['/purchaseorders'];
  for (const label of ['編輯', '轉為發票', '刪除', '前往排班']) check(`採購單操作列有「${label}」`, has(po, `>${label}<`));
  check('採購單名稱可點進詳情', /class="tlink" href="\/view\/purchase_orders\//.test(po));
  check('採購單客戶可點進客戶詳情', /class="tlink" href="\/view\/customers\//.test(po));

  check('車輛列表可點車牌開彈窗', /data-vehicle-card="/.test(html['/vehicles']));
  check('車輛類型欄已移除', !has(html['/vehicles'], '<th>車輛類型</th>'));
  const vehicle = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Vehicle' AND deleted=0 LIMIT 1").get().data);
  const vcard = await req(`/vehicle-card/${vehicle.id}`);
  check('車輛彈窗片段 200', vcard.status === 200);
  check('車輛彈窗含費用年月篩選', has(vcard.text, 'vcYear') && has(vcard.text, 'vcMonth'));

  check('盤點項目數為可讀格式', /[0-9]+ 項/.test(html['/inventory?tab=counts']));
  check('盤點頁不再輸出結構化 JSON 按鈕', !has(html['/inventory?tab=counts'], '查看結構化資料'));
  check('盤點與庫存聯動說明', has(html['/inventory?tab=counts'], '盤點與庫存如何聯動'));

  check('回收桶有批次還原', has(html['/trash'], '還原選取'));
  check('回收桶有批次永久刪除', has(html['/trash'], '永久刪除選取'));
  check('回收桶顯示回收時間欄', has(html['/trash'], '移至回收桶時間'));

  check('主欄目字體已加大加粗', /\.navgrp>summary\{[^}]*font-size:13px;font-weight:700/.test(html['/vehicles']));

  // ── C. 權限 ──────────────────────────────────
  await login('office');
  const officeContracts = (await req('/contracts')).text;
  check('辦公室看不到匯出 CSV 按鈕', !has(officeContracts, '匯出 CSV'));
  check('辦公室仍有新增合約', has(officeContracts, 'data-dlg-open="contractDlg"'));
  check('辦公室直接下載 CSV 被拒 403', (await req('/export/contracts.csv')).status === 403);
  check('辦公室可進回收桶', (await req('/trash')).status === 200);

  await login('front');
  check('前線不可進回收桶 403', (await req('/trash')).status === 403);

  await login('management');
  check('管理層可下載 CSV', (await req('/export/contracts.csv')).status === 200);

  // ── D. 端到端：合約 → 回收桶 → 還原 ─────────────
  const cpage = (await req('/contracts')).text;
  const csrf = csrfOf(cpage);
  const cid = `con_V2${runId}`;
  const name = `CON-VERIFY-${runId}`;
  const saveContract = await req('/save/contracts', {
    method: 'POST',
    body: new URLSearchParams({
      __csrf: csrf, __id: '', __new_id: cid, __expected_updated: '', __back: '/contracts',
      contract_number: name, contract_name: '', customer_name: customer.customer_name || '測試客戶',
      customer_id: customer.id, work_location: '測試地點', work_content: '滅鼠',
      contract_start_date: '2026-11-01', contract_end_date: '2027-10-31',
      service_frequency: '每月一次', total_amount: '1200', contract_status: '生效中',
    }).toString(),
  });
  created.contracts.push(cid);
  const saved = record(cid);
  check('新增合約成功', saveContract.status === 302 && !!saved);
  check('合約名稱自動生成四段', saved && saved.contract_name === `${name}_${customer.customer_name}_測試地點_滅鼠`, saved?.contract_name);
  check('隱藏客戶 ID 有保存', saved && saved.customer_id === customer.id);

  await req(`/delete/contracts/${cid}`, { method: 'POST', body: new URLSearchParams({ __csrf: csrf }).toString() });
  const trashed = record(cid);
  check('刪除後進回收桶', trashed && trashed.__deleted === true);
  check('寫入回收時間', !!trashed?.deleted_at, trashed?.deleted_at);
  check('寫入操作人', !!trashed?.deleted_by, trashed?.deleted_by);
  check('回收桶列出該合約', has((await req('/trash?module=contracts')).text, name));

  await req('/trash/restore', { method: 'POST', body: new URLSearchParams({ __csrf: csrf, item: `contracts|${cid}`, __module: 'contracts' }).toString() });
  const restored = record(cid);
  check('還原成功', restored && restored.__deleted === false);
  check('還原後清除回收時間', !restored?.deleted_at);

  // ── E. 端到端：盤點過賬 → 刪除沖銷 → 還原重過賬 ──
  const product = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Product' AND deleted=0 AND CAST(json_extract(data,'$.stock_quantity') AS INTEGER) >= 3 LIMIT 1").get().data);
  created.product = product.id;
  created.productStock = Number(product.stock_quantity || 0);
  const before = created.productStock;
  const scid = `sc_V2${runId}`;
  const items = JSON.stringify([{ product_id: product.id, product_name: product.product_name, product_code: product.product_code, system_quantity: before, actual_quantity: before - 3, difference: -3 }]);
  const scSave = await req('/save/stock_counts', {
    method: 'POST',
    body: new URLSearchParams({
      __csrf: csrf, __new_id: scid, __back: '/inventory?tab=counts', count_number: `CN-V2-${runId}`,
      count_date: '2026-10-25', completed_by: '驗收腳本', status: '已完成', items, notes: 'verify-operation-2',
    }).toString(),
  });
  created.stock_counts.push(scid);
  const afterCount = productById(product.id).stock_quantity;
  check('盤點建立並過賬', scSave.status === 302 && Number(afterCount) === before - 3, `${before} → ${afterCount}`);

  await req(`/delete/stock_counts/${scid}`, { method: 'POST', body: new URLSearchParams({ __csrf: csrf }).toString() });
  const afterDelete = productById(product.id).stock_quantity;
  const scDeleted = record(scid);
  check('刪除盤點自動沖銷庫存', Number(afterDelete) === before, `${afterCount} → ${afterDelete}`);
  check('盤點標記為已沖銷', scDeleted?.stock_reversed === true);

  await req('/trash/restore', { method: 'POST', body: new URLSearchParams({ __csrf: csrf, item: `stock_counts|${scid}`, __module: 'stock_counts' }).toString() });
  const afterRestore = productById(product.id).stock_quantity;
  check('還原盤點重新過賬', Number(afterRestore) === before - 3, `${afterDelete} → ${afterRestore}`);
  const adjustments = db.prepare("SELECT data FROM records WHERE entity='StockAdjustment'").all()
    .map((r) => JSON.parse(r.data)).filter((d) => String(d.reference_number || '').includes(`CN-V2-${runId}`));
  check('沖銷／重過賬留下調整單', adjustments.length >= 3, `${adjustments.length} 張`);

  // ── F. 清理（只恢復本腳本造成的變動） ─────────────
  const p = productById(product.id);
  p.stock_quantity = created.productStock;
  db.prepare('UPDATE records SET data=? WHERE entity=? AND id=?').run(JSON.stringify(p), 'Product', product.id);
  for (const id of [...created.contracts, ...created.stock_counts]) {
    const row = db.prepare('SELECT entity FROM records WHERE id=?').get(id);
    if (row) db.prepare('DELETE FROM records WHERE entity=? AND id=?').run(row.entity, id);
  }
  db.prepare("DELETE FROM records WHERE entity='StockAdjustment' AND data LIKE ?").run(`%CN-V2-${runId}%`);
  check('測試資料已清理', true, `產品庫存回復 ${created.productStock}`);

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n驗收完成：${pass}/${results.length} 通過，${fail} 失敗`);
  const out = process.env.TEST_OUTPUT || 'verify-operation-2.json';
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), base: BASE, pass, fail, results }, null, 2));
  console.log(`報告：${out}`);
  process.exit(fail ? 1 : 0);
};

run().catch((error) => {
  console.error('腳本異常：', error);
  process.exit(1);
});
