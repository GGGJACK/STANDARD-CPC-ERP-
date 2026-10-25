// 三次修改 · 前線員工自動驗收（零依賴，Node 22+）
// 只可在隔離副本跑：必須是 3101 端口 + 非正式 data.db
//   set PORT=3101 & set DB_PATH=...\_verify.db & set CPC_UPLOAD_DIR=...\_verify-uploads
//   node server.mjs
//   set CPC_TEST=1 & set TEST_BASE=http://127.0.0.1:3101 & set DB_PATH=...\_verify.db
//   node verify-frontline.mjs

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
const ids = { schedules: [], leave: `leave_${runId}`, supply: [`sup_${runId}`, `sup_o_${runId}`], expense: `vexp_${runId}` };
const tag = `VERIFY-${runId}`;
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const has = (html, text) => String(html).includes(text);
const count = (html, needle) => String(html).split(needle).length - 1;
const numOf = (html, re) => {
  const m = re.exec(String(html));
  return m ? Number(String(m[1]).replace(/[^\d]/g, '')) : 0;
};

let cookie = '';
async function req(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(BASE + path, { redirect: 'manual', ...options, headers });
  for (const c of res.headers.getSetCookie?.() || []) {
    const sid = /^sid=([^;]+)/.exec(c);
    if (sid) cookie = `sid=${sid[1]}`;
  }
  return { status: res.status, text: await res.text(), location: res.headers.get('location') || '' };
}
const csrfOf = (html) => (/name="__csrf"\s+value="([^"]+)"/.exec(html) || [])[1] || (/<meta name="csrf" content="([^"]+)"/.exec(html) || [])[1] || '';
const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)).toString();
const record = (id) => {
  const row = db.prepare('SELECT data,deleted FROM records WHERE id=?').get(id);
  return row ? { ...JSON.parse(row.data), __deleted: !!row.deleted } : null;
};
async function login(role) {
  cookie = '';
  const res = await req(`/demo?as=${role}`);
  return res.status === 302;
}
const sidebar = (html) => ((/<aside[\s\S]*?<\/aside>/.exec(html) || [''])[0]).replace(/<[^>]+>/g, '\n');

const run = async () => {
  // ── A. 登入與導航 ────────────────────────────────
  check('登入頁可開', (await req('/login')).status === 200);
  check('前線登入', await login('front'));
  const mywork = (await req('/mywork')).text;
  const nav = sidebar(mywork);
  check('前線員工組只剩滅蟲工作／我的出勤／補給記錄', has(nav, '滅蟲工作') && has(nav, '我的出勤') && has(nav, '補給記錄') && !has(nav, '工作排班') && !has(nav, '上班打卡') && !has(nav, '我的排班'), nav.replace(/\s+/g, ' ').slice(0, 120));
  check('營運管理給前線四項：服務計劃／服務報告／車輛／請假', has(nav, '服務計劃') && has(nav, '服務報告') && has(nav, '車輛管理') && has(nav, '請假紀錄'));
  check('前線看不到排班管理／定期排程／合約列表／月度出勤／排班Excel', !has(nav, '排班管理') && !has(nav, '定期服務排程') && !has(nav, '合約列表') && !has(nav, '月度出勤表') && !has(nav, '排班Excel'));
  check('前線設置沒有回收桶', !has(nav, '回收桶'));

  for (const path of ['/schedules', '/recurringschedules', '/excelschedule', '/trash', '/contracts']) {
    check(`前線 ${path} 被拒 403`, (await req(path)).status === 403);
  }
  const checkin = await req('/checkin');
  check('/checkin 導向我的出勤', checkin.status === 302 && checkin.location === '/myattendance', checkin.location);
  const workschedule = await req('/workschedule');
  check('/workschedule 導向我的工作排班', workschedule.status === 302 && workschedule.location.includes('tab=schedule'), workschedule.location);

  // ── B. 我的工作／我的出勤 ────────────────────────
  check('我的工作有三個頁簽', has(mywork, '今日工作') && has(mywork, '本月工作') && has(mywork, '排班日曆'));
  const schedTab = (await req('/mywork?tab=schedule&m=' + today.slice(0, 7))).text;
  check('我的工作可看到排班日曆', count(schedTab, 'calendar-cell') >= 28 && has(schedTab, '日詳情'));
  const attendance = (await req('/myattendance')).text;
  check('打卡已併入我的出勤', has(attendance, '上班打卡') && has(attendance, '今日狀態') && has(attendance, 'action="/checkin"'));

  // ── C. 服務計劃 ──────────────────────────────────
  const contract = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Contract' AND data LIKE '%C-2026-0001%' LIMIT 1").get().data);
  const plans = (await req('/serviceplans')).text;
  check('服務計劃頁沒有新增入口', !has(plans, '新增服務計劃'));
  check('前線服務計劃沒有編輯入口', !has(plans, '?edit=') && has(plans, '唯讀'));
  const detail = await req(`/serviceplans/${contract.id}`);
  check('服務計劃詳情不再 404', detail.status === 200 && !has(detail.text, '找不到該服務計劃紀錄日'), String(detail.status));
  check('詳情電話由客戶檔回填', /<dt>聯絡電話<\/dt><dd>([^<]*)<\/dd>/.test(detail.text) && !/<dt>聯絡電話<\/dt><dd>\s*—/.test(detail.text));
  check('前線詳情不顯示合約金額', !has(detail.text, '合約金額'));

  await login('office');
  const officePlans = (await req('/serviceplans')).text;
  check('辦公室服務計劃仍有鉛筆編輯', has(officePlans, '?edit='));
  const planDlg = (await req(`/serviceplans?edit=${contract.id}`)).text;
  check('鉛筆打開服務子集彈窗', has(planDlg, 'id="planDlg"') && has(planDlg, '編輯服務安排'));
  check('子集彈窗含害蟲／用藥／地區／服務種類', has(planDlg, 'name="pest_type"') && has(planDlg, 'name="pesticides"') && has(planDlg, 'name="region"') && has(planDlg, 'name="service_type"'));
  check('子集彈窗不顯示合約總額欄位', !has(planDlg, 'for="f_total_amount"') && has(planDlg, 'type="hidden" name="total_amount"'));
  const contractDlg = (await req(`/contracts?edit=${contract.id}`)).text;
  check('合約彈窗是全集：含害蟲／用藥／地區與合約總額', has(contractDlg, 'name="pest_type"') && has(contractDlg, 'name="pesticides"') && has(contractDlg, 'name="region"') && has(contractDlg, 'id="f_total_amount"'));
  check('辦公室導航回收桶在設置', has(sidebar(officePlans), '回收桶'));

  // ── D. 服務報告 ──────────────────────────────────
  await login('front');
  const reports = (await req('/servicereports')).text;
  check('前線看到全部服務報告', /共\s*2\s*筆/.test(reports), (reports.match(/共\s*\d+\s*筆[^<]*/) || [''])[0]);
  check('前線服務報告唯讀且無新增', has(reports, '唯讀') && !has(reports, '新增服務報告'));
  const reportId = db.prepare("SELECT id FROM records WHERE entity='WorkRecord' LIMIT 1").get().id;
  const reportDetail = (await req(`/servicereport/${reportId}`)).text;
  check('前線可開服務報告詳情且不可改', has(reportDetail, '服務工作報告') && !has(reportDetail, '移至回收筒') && !has(reportDetail, '產生公開報告連結'));

  // ── E. 滅蟲工作 ──────────────────────────────────
  const pcw = (await req('/pestcontrolwork')).text;
  check('滅蟲工作預設今日', has(pcw, '工作清單') && numOf(pcw, /共\s*([\d,]+)\s*項/) < 5000, String(numOf(pcw, /共\s*([\d,]+)\s*項/)));
  const pcwAll = (await req('/pestcontrolwork?tab=all')).text;
  const total = numOf(pcwAll, /共\s*([\d,]+)\s*項/);
  check('滅蟲工作全員可見（>13000 項）', total > 13000, String(total));
  check('滅蟲工作分頁每頁 100', count(pcwAll, '<tr>') - 1 <= 101 && /第 1 \/ \d+ 頁/.test(pcwAll));
  check('服務類型四選篩選', has(pcwAll, '所有服務類型') && has(pcwAll, '>定期<') && has(pcwAll, '>單次<') && has(pcwAll, '>臨時<') && has(pcwAll, '>緊急<'));

  // ── F. 補給與請假 ────────────────────────────────
  const supply = (await req('/mysupply')).text;
  const plate = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Vehicle' LIMIT 1").get().data).plate_number;
  check('補給新增是彈窗', has(supply, 'id="recDlg"') && has(supply, 'data-dlg-open="recDlg"'));
  check('補給位置可選車牌', has(supply, `value="${plate}"`));
  check('補給有員工篩選', has(supply, 'name="employee_name"'));
  check('前線補給有匯出 CSV', has(supply, '匯出 CSV'));
  const leaves = (await req('/leaves')).text;
  check('請假新增是彈窗且有匯出 CSV', has(leaves, 'id="recDlg"') && has(leaves, '匯出 CSV'));

  // ── G. 建立測試資料（排班／請假／補給／車輛費用）──
  await login('office');
  const schedPage = (await req(`/schedules?date=${today}`)).text;
  const schedCsrf = csrfOf(schedPage);
  const schId = `sch_${runId}`;
  ids.schedules.push(schId);
  const schedRes = await req('/save/schedules', {
    method: 'POST',
    body: form({
      __csrf: schedCsrf, __new_id: schId, __back: `/schedules?date=${today}`,
      schedule_date: today,
      assigned_employees: JSON.stringify([{ employee_id: '', employee_name: '盧力峰', employee_nickname: '' }]),
      work_items: JSON.stringify([{ work_name: tag, work_location: '驗收測試地點', service_type: '臨時', pest_types: [{ id: '蚊 (Mosquitoes)', label: '蚊 (Mosquitoes)', name: '蚊 (Mosquitoes)' }], start_time: '09:00', end_time: '10:00' }]),
      status: '待執行', total_hours: 1,
    }),
  });
  check('建立含害蟲種類的臨時排班', schedRes.status === 302, String(schedRes.status));

  await login('front');
  const todayWork = (await req('/pestcontrolwork')).text;
  check('今日工作顯示新排班與害蟲種類', has(todayWork, tag) && has(todayWork, '蚊 (Mosquitoes)') && has(todayWork, '臨時'));
  const filterType = await req('/pestcontrolwork?tab=all&stype=' + encodeURIComponent('臨時'));
  check('按服務類型「臨時」篩選', has(filterType.text, tag) && !has(filterType.text, '共 12,969 項'));
  const filterPest = await req('/pestcontrolwork?tab=all&type=' + encodeURIComponent('蚊 (Mosquitoes)'));
  check('按害蟲種類篩選', has(filterPest.text, tag));

  // 請假：偽造他人姓名，伺服器應強制回本人
  const leavePage = (await req('/leaves?new=1')).text;
  const leaveRes = await req('/save/leave_records', {
    method: 'POST',
    body: form({
      __csrf: csrfOf(leavePage), __new_id: ids.leave, __back: '/leaves',
      employee_name: '陳小明', employee_id: 'someone-else', leave_type: '年假',
      start_date: '2026-11-02', end_date: '2026-11-04', reason: tag, status: '已批准',
    }),
  });
  const leaveRow = record(ids.leave);
  check('請假新增成功', leaveRes.status === 302 && !!leaveRow);
  check('前線請假強制本人', leaveRow?.employee_name === '盧力峰' && leaveRow?.employee_id === 'u-front', `${leaveRow?.employee_name}/${leaveRow?.employee_id}`);
  check('請假天數自動計算 3 天', Number(leaveRow?.total_days) === 3, String(leaveRow?.total_days));
  check('前線請假狀態強制待審批', leaveRow?.status === '待審批', leaveRow?.status);
  const leaveList = (await req('/leaves')).text;
  check('前線只看到自己的請假', has(leaveList, tag) && !has(leaveList, '袁賡') && !has(leaveList, 'Melody'));

  // 補給：前線一筆（車牌），辦公室替袁賡一筆
  const supplyPage = (await req('/mysupply?new=1')).text;
  const supRes = await req('/save/supply_records', {
    method: 'POST',
    body: form({
      __csrf: csrfOf(supplyPage), __new_id: ids.supply[0], __back: '/mysupply',
      supply_date: today, employee_name: '別人', type: plate,
      products: JSON.stringify([{ product_name: '驗收測試藥', quantity: 2, unit: '支' }]),
      tools: JSON.stringify([{ tool_name: '噴壺', quantity: 1 }]), notes: tag,
    }),
  });
  const supRow = record(ids.supply[0]);
  check('補給新增成功且強制本人', supRes.status === 302 && supRow?.employee_name === '盧力峰', supRow?.employee_name);
  check('補給位置可存車牌', supRow?.type === plate, supRow?.type);

  await login('office');
  const officeSupply = (await req('/mysupply?new=1')).text;
  await req('/save/supply_records', {
    method: 'POST',
    body: form({
      __csrf: csrfOf(officeSupply), __new_id: ids.supply[1], __back: '/mysupply',
      supply_date: today, employee_name: '袁賡', type: '個人',
      products: JSON.stringify([{ product_name: '別人的補給品', quantity: 1 }]), notes: tag,
    }),
  });
  await login('front');
  const supplyAll = (await req('/mysupply')).text;
  check('前線補給看全部員工', has(supplyAll, '袁賡') && has(supplyAll, '別人的補給品') && has(supplyAll, tag));

  // 車輛費用
  const vehicle = JSON.parse(db.prepare("SELECT data FROM records WHERE entity='Vehicle' LIMIT 1").get().data);
  const vehicleId = db.prepare("SELECT id FROM records WHERE entity='Vehicle' LIMIT 1").get().id;
  const expPage = await req(`/new/vehicle_expenses?vehicleId=${vehicleId}`);
  check('前線可開新增車輛費用', expPage.status === 200 && has(expPage.text, `value="${vehicle.plate_number}"`));
  const expRes = await req('/save/vehicle_expenses', {
    method: 'POST',
    body: form({
      __csrf: csrfOf(expPage.text), __new_id: ids.expense, __back: '/vehicles',
      vehicle_plate: vehicle.plate_number, expense_type: '隧道費', expense_date: today,
      amount: '88.5', location: '紅隧', notes: tag,
    }),
  });
  check('前線新增車輛費用成功', expRes.status === 302 && !!record(ids.expense), String(expRes.status));
  const card = (await req(`/vehicle-card/${vehicleId}`)).text;
  check('車輛費用金額對前線可見', has(card, '88.5') && !has(card, '•••••'));
  check('前線不可修改車輛費用', (await req(`/edit/vehicle_expenses/${ids.expense}`)).status === 403);

  // 刪除限制
  const delCsrf = csrfOf((await req(`/vehicle-card/${vehicleId}`)).text) || csrfOf((await req('/vehicles')).text);
  const delRes = await req(`/delete/vehicle_expenses/${ids.expense}`, { method: 'POST', body: form({ __csrf: delCsrf }) });
  check('前線不可刪除車輛費用', delRes.status === 403, String(delRes.status));

  // CSV 例外範圍
  check('前線可匯出請假 CSV', (await req('/export/leave_records.csv')).status === 200);
  check('前線可匯出補給 CSV', (await req('/export/supply_records.csv')).status === 200);
  check('前線不可匯出客戶 CSV', (await req('/export/customers.csv')).status === 403);
  await login('office');
  check('辦公室仍不可匯出請假 CSV', (await req('/export/leave_records.csv')).status === 403);
  await login('accounting');
  check('會計不可進回收桶', (await req('/trash')).status === 403);
  check('會計導航沒有回收桶', !has(sidebar((await req('/mywork')).text), '回收桶'));
  await login('management');
  check('管理層匯出不受影響', (await req('/export/customers.csv')).status === 200);

  // ── H. 回歸：舊頁面仍可開 ────────────────────────
  await login('management');
  for (const path of ['/', '/schedules', '/contracts', '/purchaseorders', '/deliverynotes', '/inventory', '/trash', '/recurringschedules', '/settings']) {
    check(`回歸 ${path} 200`, (await req(path)).status === 200);
  }

  // ── I. 清理測試資料 ──────────────────────────────
  const allIds = [...ids.schedules, ids.leave, ...ids.supply, ids.expense];
  const stmt = db.prepare('DELETE FROM records WHERE id=?');
  for (const id of allIds) stmt.run(id);
  check('測試資料已清理', allIds.every((id) => !record(id)), `${allIds.length} 筆`);

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  const output = {
    at: new Date().toISOString(), base: BASE, total: results.length, pass, fail,
    results,
  };
  fs.writeFileSync(new URL('./驗收結果_三次修改.json', import.meta.url), JSON.stringify(output, null, 2));
  console.log(`\n驗收完成：${pass}/${results.length} 通過，${fail} 失敗`);
  if (fail) process.exitCode = 1;
};

run().catch((error) => {
  console.error('驗收腳本異常：', error);
  process.exit(1);
});
