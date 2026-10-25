#!/usr/bin/env node
/**
 * 一次修改 · 營運管理改造 · 自動驗收腳本
 * ------------------------------------------------------------------
 * 用途：驗證「排班彈窗 / PO＋合約聯動 / 合約下拉可搜 / 車輛費用 / 請假審批 /
 *       補給記錄 / 排班Excel 新增工作欄 / 導航折疊與單一高亮」是否仍然正常。
 *
 * 特性：零依賴（只用 Node 18+ 內建 fetch），不需要 playwright。
 *
 * ⚠ 會寫入測試記錄（id 以 sch_verify_ / ct_verify_ / lv_verify_ 等開頭）。
 *   請務必對「資料庫副本」執行，不要對正式庫跑：
 *
 *   1) 產生副本（在 系统代码 目錄）：
 *      node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data.db');db.exec(`VACUUM INTO 'verify-copy.db'`)"
 *   2) 用副本啟動第二個實例：
 *      set DB_PATH=%cd%\verify-copy.db && set PORT=3101 && set CPC_AUTO_IMPORT=0 && node server.mjs
 *   3) 另開一個終端跑：
 *      node verify-operation.mjs http://127.0.0.1:3101
 *
 * 用法：node verify-operation.mjs [baseUrl] [--force]
 */

const BASE = (process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://127.0.0.1:3101').replace(/\/$/, '');
const FORCE = process.argv.includes('--force');

if (/:3000\/?$/.test(BASE) && !FORCE) {
  console.error('拒絕執行：偵測到正式服務埠 3000。此腳本會寫入測試記錄，請改用副本實例（建議 3101），或加 --force 自負風險。');
  process.exit(2);
}

let cookie = '';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  :: ' + extra : ''}`);
};

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    ...options,
    headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) },
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return res;
}
const page = async (path) => {
  const res = await req(path);
  return { status: res.status, text: await res.text() };
};
const csrfOf = (html) => (html.match(/name="__csrf" value="([^"]+)"/) || [])[1] || '';
const post = (fields) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) body.set(k, v == null ? '' : String(v));
  return { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
};

console.log(`\n目標：${BASE}\n${'─'.repeat(64)}`);

// ── 0. 登入與基本可用性
const login = await req('/demo?as=management');
check('管理層 demo 登入', login.status === 302 || login.status === 200);

const sched = await page('/schedules');
check('GET /schedules 200', sched.status === 200, `status=${sched.status}`);
const csrf = csrfOf(sched.text);
check('取得 CSRF', !!csrf);

// ── 1. 導航折疊 + 單一高亮
const groups = sched.text.match(/<details class="navgrp"[^>]*>/g) || [];
const opened = groups.filter((g) => /\sopen/.test(g));
const onCount = (sched.text.match(/class="on" href=/g) || []).length;
check('導航 6 個分組', groups.length === 6, `n=${groups.length}`);
check('預設僅展開當前分組', opened.length === 1 && /營運管理/.test(opened[0]), opened.join(','));
check('僅一條菜單高亮', onCount === 1, `on=${onCount}`);

// ── 2. 排班彈窗（頁內 dialog，不跳頁）
check('排班頁內嵌彈窗', sched.text.includes('id="schedDlg"') && sched.text.includes('data-dlg-open="schedDlg"'));
check('工作列表列定義含 PO/合約選擇器',
  sched.text.includes('data-source=\\"purchase_orders\\"') || sched.text.includes('&quot;source&quot;:&quot;purchase_orders&quot;'),
  'data-columns JSON');

// ── 3. 建立排班（合約聯動 + 多選員工）
const contractPickId = await (async () => {
  const res = await req('/api/pick?source=contracts');
  const list = await res.json();
  return Array.isArray(list) && list.length ? list[0].id : '';
})();
check('picker：合約源可查', !!contractPickId);

const workItems = [{
  contract_id: contractPickId, contract_number: 'VERIFY-CON', work_name: '驗收-滅鼠',
  work_location: '驗收地點', work_unit_name: '標準(香港)清潔滅蟲有限公司',
  contact_person: '驗收員', contact_phone: '0000 0000', service_type: '定期',
  start_time: '09:00', end_time: '11:00', notes: '自動驗收', status: '待執行',
}];
const saveSched = await req('/save/schedules', post({
  __csrf: csrf, __id: '', __new_id: 'sch_verify_001', __expected_updated: '', __back: '/schedules?m=2026-10&date=2026-10-20',
  schedule_date: '2026-10-20', vehicle_plate: 'TG4278', color: '#d1fae5',
  assigned_employees: JSON.stringify([{ id: 'verify-emp', label: '驗收員', name: '驗收員' }]),
  work_items: JSON.stringify(workItems), total_hours: '', status: '待執行', notes: '排班驗收',
}));
check('POST /save/schedules 302', saveSched.status === 302, `status=${saveSched.status}`);
const afterSched = await page('/schedules?m=2026-10&date=2026-10-20');
check('日曆/日詳情出現新排班', /驗收-滅鼠|驗收地點/.test(afterSched.text));

// ── 4. 合約表單：客戶搜尋 + 下拉可搜
const conForm = await page('/new/contracts');
check('合約表單有客戶選擇器', conForm.text.includes('data-source="customers"'));
check('合約表單有工作細則選擇器', conForm.text.includes('data-source="work_instructions"'));
check('下拉改為可輸入搜索（datalist）', conForm.text.includes('<datalist id="dl_f_pest_type">'));
check('已移除「紀錄模式」', !conForm.text.includes('f_record_mode'));
const conCsrf = csrfOf(conForm.text);
const saveCon = await req('/save/contracts', post({
  __csrf: conCsrf, __id: '', __new_id: 'ct_verify_001', __expected_updated: '', __back: '/contracts',
  contract_number: 'VERIFY-2026-001', contract_name: '驗收合約_自動化', customer_name: '城市清潔有限公司',
  customer_id: 'verify-customer', customer_code: 'C0167', contact_person: '驗收員', contact_phone: '0000 0000',
  work_unit_name: '標準(香港)清潔滅蟲有限公司', work_unit_id: '', quotation_id: '', quotation_number: '', po_number: 'PO-VERIFY-1',
  work_location: '驗收地址', service_address: '', work_content: '滅鼠',
  work_instructions: JSON.stringify([{ id: 'w1', label: '滅鼠' }]),
  service_type: '滅鼠', pest_type: '老鼠', region: '九龍', contract_start_date: '2026-11-01', contract_end_date: '2027-10-31',
  service_frequency: '每月一次', total_amount: '1200', payment_terms: '', contract_status: '生效中', notes: '',
}));
check('POST /save/contracts 302', saveCon.status === 302, `status=${saveCon.status}`);
const conList = await page('/contracts?q=VERIFY-2026-001');
check('合約列表可查到新合約', conList.text.includes('VERIFY-2026-001'));

// ── 5. 請假：管理層審批
const leaveForm = await page('/new/leave_records');
check('請假表單有員工選擇器', leaveForm.text.includes('data-source="employees"'));
const lvCsrf = csrfOf(leaveForm.text);
const saveLeave = await req('/save/leave_records', post({
  __csrf: lvCsrf, __id: '', __new_id: 'lv_verify_001', __expected_updated: '', __back: '/leaves',
  employee_name: '驗收員', employee_id: '', leave_type: '年假',
  start_date: '2026-11-02', end_date: '2026-11-04', total_days: '3', reason: '自動驗收', status: '待審批', notes: '',
}));
check('POST /save/leave_records 302', saveLeave.status === 302);
const decide = await req('/leaves/lv_verify_001/decide', post({ __csrf: lvCsrf, status: '已批准', __back: '/leaves' }));
check('管理層可批准請假', decide.status === 302, `status=${decide.status}`);
const leaveView = await page('/view/leave_records/lv_verify_001');
check('請假狀態已變為已批准', leaveView.text.includes('已批准'));

// ── 6. 補給記錄（產品／工具選擇器 + 前線可新增）
const supForm = await page('/new/supply_records');
check('補給表單有產品選擇器', /&quot;source&quot;:&quot;products&quot;/.test(supForm.text));
check('補給表單有工具提示源', /&quot;source&quot;:&quot;tools&quot;/.test(supForm.text));
check('補給位置為可搜下拉（個人/車牌）', supForm.text.includes('<datalist id="dl_f_type">') && supForm.text.includes('TG4278'));
const supCsrf = csrfOf(supForm.text);
const saveSup = await req('/save/supply_records', post({
  __csrf: supCsrf, __id: '', __new_id: 'sp_verify_001', __expected_updated: '', __back: '/mysupply',
  supply_date: '2026-10-20', employee_name: '驗收員', employee_id: '', type: 'TG4278',
  products: JSON.stringify([{ product_id: 'p1', product_name: '驗收產品', unit: '支', quantity: 2 }]),
  tools: JSON.stringify([{ tool_name: '手套', quantity: 1 }]), notes: '補給驗收',
}));
check('POST /save/supply_records 302', saveSup.status === 302);
const supList = await page('/mysupply');
check('補給列表可查到新記錄', supList.text.includes('補給驗收'));

// ── 7. 車輛費用 + 車輛詳情費用區塊
const vehForm = await page('/new/vehicle_expenses');
check('費用表單車牌為選擇器', vehForm.text.includes('data-source="vehicles"'));
check('費用表單已無「郵件訊息 ID」', !vehForm.text.includes('email_message_id'));
const vehCsrf = csrfOf(vehForm.text);
const saveVeh = await req('/save/vehicle_expenses', post({
  __csrf: vehCsrf, __id: '', __new_id: 've_verify_001', __expected_updated: '', __back: '/vehicles',
  vehicle_plate: 'TG4278', expense_type: '隧道費', expense_date: '2026-10-20', expense_time: '09:30',
  amount: '38', location: '西隧', reference_number: 'VERIFY-REF', source: '手動', notes: '費用驗收',
}));
check('POST /save/vehicle_expenses 302', saveVeh.status === 302);
const vehList = await page('/vehicles');
const vid = (vehList.text.match(/\/view\/vehicles\/([A-Za-z0-9_]+)/) || [])[1];
if (vid) {
  const detail = await page(`/view/vehicles/${vid}`);
  check('車輛詳情有車輛費用區塊', detail.text.includes('車輛費用'));
  check('車輛詳情有添加費用記錄', detail.text.includes('添加費用記錄'));
} else check('車輛詳情有車輛費用區塊', false, '找不到車輛 id');

// ── 8. 排班Excel 新增工作欄
const excel = await page('/excelschedule?date=2026-10-20');
check('排班Excel 有「新增工作欄」', excel.text.includes('新增工作欄') && excel.text.includes('id="schedDlg"'));
check('排班Excel 彈窗預填日期', /name="schedule_date"[^>]*value="2026-10-20"/.test(excel.text));

// ── 9. 列印與其他頁面未被打壞
for (const path of ['/contracts', '/vehicles', '/leaves', '/monthlyattendance', '/inventory', '/stockcounts', '/recurringschedules']) {
  const res = await req(path);
  check(`GET ${path} 200`, res.status === 200, `status=${res.status}`);
}

// ── 總結
const failed = results.filter((r) => !r.ok);
console.log(`${'─'.repeat(64)}`);
console.log(`共 ${results.length} 項，PASS ${results.length - failed.length}，FAIL ${failed.length}`);
if (failed.length) {
  console.log('\n失敗項：');
  for (const f of failed) console.log(` - ${f.name}${f.extra ? ' :: ' + f.extra : ''}`);
}
process.exit(failed.length ? 1 : 0);
