// 四期 · 第四次修改 · 頁面冒煙測試（零依賴，Node 22+）
// 用途：以四個角色登入隔離服務，逐頁載入，檢查渲染是否異常。
// 只可在隔離副本執行（:3101），不會寫入資料庫。
//
//   set CPC_TEST=1
//   set TEST_BASE=http://127.0.0.1:3101
//   node 回歸腳本_頁面冒煙.mjs
//
// 檢查項：
//   1. HTTP 狀態 < 500
//   2. 渲染內容不含 undefined / NaN
//   3. 單頁內 class="pagehead" 不超過 1 個
//   4. <div> 與 </div> 數量配平

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3101';
if (!process.env.CPC_TEST || !BASE.includes(':3101')) {
  console.error('拒絕執行：請設 CPC_TEST=1 且 TEST_BASE 指向 :3101 隔離測試服務');
  process.exit(2);
}

const PAGES = [
  '/', '/mywork', '/pestcontrolwork', '/serviceplans', '/servicereports',
  '/vehicles', '/leaves', '/schedules', '/recurringschedules', '/contracts',
  '/monthlyattendance', '/excelschedule', '/inventory', '/stockcounts',
  '/invoices', '/receipts', '/payments', '/bills', '/accounting', '/receivables',
  '/generalledger', '/accounts', '/customers', '/leads', '/followups',
  '/quotations', '/purchaseorders', '/deliverynotes', '/products', '/services',
  '/suppliers', '/myattendance', '/mysupply', '/me', '/users', '/employees',
  '/workunits', '/workinstructions', '/pesticides', '/emailtemplates',
  '/addresses', '/announcements', '/trash', '/settings',
];
const ROLES = ['management', 'office', 'front', 'accounting'];

let problems = [];
let loads = 0;

for (const role of ROLES) {
  let cookie = '';
  const login = await fetch(`${BASE}/demo?as=${role}`, { redirect: 'manual' });
  for (const c of login.headers.getSetCookie?.() || []) {
    const m = /^sid=([^;]+)/.exec(c);
    if (m) cookie = `sid=${m[1]}`;
  }
  if (!cookie) {
    problems.push(`${role} :: 登入失敗，未取得 session`);
    continue;
  }
  for (const path of PAGES) {
    loads += 1;
    const res = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' });
    const html = await res.text();
    const issues = [];
    if (res.status >= 500) issues.push(`HTTP ${res.status}`);
    if (/undefined<\/|>undefined<|NaN</.test(html)) issues.push('undefined/NaN 渲染');
    if ((html.match(/class="pagehead"/g) || []).length > 1) issues.push('pagehead 重複');
    const open = (html.match(/<div\b/g) || []).length;
    const close = (html.match(/<\/div>/g) || []).length;
    if (open !== close) issues.push(`div 不配平 ${open}/${close}`);
    if (issues.length) problems.push(`${role} ${path} :: ${issues.join('; ')}`);
  }
}

console.log(problems.length ? problems.join('\n') : 'ALL CLEAN');
console.log(`檢查頁數：${loads}　問題：${problems.length}`);
process.exit(problems.length ? 1 : 0);
