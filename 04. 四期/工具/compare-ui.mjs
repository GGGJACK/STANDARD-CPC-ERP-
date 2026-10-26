import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 倉庫根：本腳本位於 <root>/04. 四期/工具/。可用 CPC_ROOT 覆蓋。
const ROOT = process.env.CPC_ROOT ? path.resolve(process.env.CPC_ROOT) : path.resolve(HERE, '..', '..');
const CDP = process.env.CPC_CDP || 'http://127.0.0.1:9222';
const SITE = process.env.CPC_SITE || 'http://127.0.0.1:3100';
const ORIGINAL_FILE = process.env.CPC_ORIGINAL || path.join(ROOT, '03. 三期', '_交互审计.json');
const ORIGINAL = JSON.parse(fs.readFileSync(ORIGINAL_FILE, 'utf8'));
const OUT = process.env.CPC_OUT || path.join(ROOT, '.test-artifacts');
fs.mkdirSync(OUT, { recursive: true });
const routeMap = {
  '/dashboard': '/mywork', '/mywork': '/mywork', '/workschedule': '/workschedule', '/monthlyattendance': '/monthlyattendance',
  '/PersonalSettings': '/me', '/usermanagement': '/users', '/leaverecords': '/leaves', '/EmailTemplates': '/emailtemplates',
  '/addresslibrary': '/addresses', '/ExcelSchedule': '/excelschedule',
};
const required = {
  '/pestcontrolwork': { btns: ['今日工作', '所有工作', '按年', '按月', '按日'], selects: ['所有狀態', '所有種類'] },
  '/serviceplans': { btns: ['新增服務計劃', '全港', '香港', '九龍', '新界', '離島', '未分類', '已結束'] },
  '/mysupply': { btns: ['新增記錄', '全部', 'TG4278', 'WR7935', 'WS6355', 'ZK2944', '個人'] },
  '/customers': { btns: ['匯出CSV', '匯入CSV', '新增客戶', '上一頁'], selects: ['全部類型', '主客戶'] },
  '/quotations': { btns: ['垃圾桶', '導出CSV', '導入CSV', '批量導入', '新增報價單'], selects: ['全部年份', '全部類型', '全部階段', '全部員工', '全部工作單位', '全部投標方式'] },
  '/purchaseorders': { btns: ['新增採購單', '全部', '服務', '產品', '工程滿意紙', '上一頁'], selects: ['全部年份', '全部月份', '全部狀態', '全部工作狀態'] },
  '/deliverynotes': { btns: ['回收筒', '新增送貨單', '查看', '上一頁'], selects: ['全部狀態', '全部年份', '全部月份'] },
  '/products': { btns: ['導出CSV', '導入CSV', '貨單', '新增產品'], selects: ['全部分類'] },
  '/inventory': { btns: ['新增盤點', '補錄歷史送貨單庫存', '庫存調整', '庫存列表', '調整記錄', '盤點記錄'] },
  '/services': { btns: ['導出CSV', '匯入CSV', '新增服務'] },
  '/suppliers': { btns: ['匯出CSV', '匯入CSV', '新增供應商', '上一頁'], selects: ['全部產品'] },
  '/schedules': { btns: ['打印', '新增排班'] },
  '/ExcelSchedule': { btns: ['重新載入', '儲存全部', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] },
  '/contracts': { btns: ['新增合約', '導入CSV', '匯出CSV'], selects: ['全部年份', '全部月份'] },
  '/vehicles': { btns: ['易通行費用匯入', '新增車輛', '添加費用記錄', 'TG4278', 'WR7935', 'WS6355', 'ZK2944'] },
  '/leaverecords': { btns: ['新增請假記錄'], selects: ['2026年', '選擇月份'] },
  '/monthlyattendance': { btns: ['保存', '導出CSV', '導出PDF'], selects: ['2026年', '10月'] },
  '/invoices': { btns: ['匯出CSV', '新增發票'], selects: ['全部類型', '全部狀態'] },
  '/receipts': { btns: ['新增收據'] },
  '/settings': { btns: ['上傳Logo', '上傳簽名', '上傳印章', '保存設置'] },
  '/PersonalSettings': { btns: ['上傳/更換頭像', '儲存姓名', '修改密碼'] },
  '/usermanagement': { btns: ['用戶', '發送邀請'] },
  '/employees': { btns: ['導入CSV', '新增員工', '所有員工', '在職', '離職'] },
  '/workunits': { btns: ['新增工作單位'] },
  '/EmailTemplates': { btns: ['新增範本', '通用', '保存範本'] },
  '/addresslibrary': { btns: ['匯出', '新增地址'] },
  '/workinstructions': { btns: ['匯出CSV', '新增工作細則', '編輯', '刪除'] },
  '/pesticides': { btns: ['新增藥物'] },
};

const targets = (await (await fetch(`${CDP}/json/list`)).json()).filter((t) => t.type === 'page');
const page = targets[0];
if (!page) throw new Error('沒有 Edge CDP 頁面');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let seq = 0; const pending = new Map();
ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result?.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result?.result?.value;
}
const PROBE = `(() => {
  const vis=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  const txt=(el)=>(el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ');
  const main=document.querySelector('main')||document.body;
  const btns=[...main.querySelectorAll('button,[role=button],a.btn,summary')].filter(vis).map(txt).filter(t=>t&&t.length<60);
  const inputs=[...main.querySelectorAll('input')].filter(vis).map(i=>i.placeholder||i.name||i.type).filter(Boolean);
  const selects=[...main.querySelectorAll('select,button[role=combobox],[role=combobox]')].filter(vis).map(e=>e.tagName==='SELECT'?(e.querySelector('option:checked')?.textContent||e.querySelector('option')?.textContent||e.name):txt(e)).filter(Boolean);
  const th=[...main.querySelectorAll('table thead th,.calendar-head')].map(txt).filter(Boolean);
  const firstRow=main.querySelector('table tbody tr');
  const rowActions=firstRow?[...firstRow.querySelectorAll('button,a')].map(txt).filter(Boolean):[];
  const rowCols=firstRow?[...firstRow.querySelectorAll('td')].map(txt).filter(Boolean).slice(0,14):[];
  const pager=(main.innerText.match(/(共\\s*[\\d,]+\\s*[筆条個项條]|[\\d,]+\\s*\\/\\s*[\\d,]+|第\\s*\\d+\\s*頁|上一頁|下一頁)/g)||[]).slice(0,5);
  const heads=[...document.querySelectorAll('h1,h2')].map(txt).filter(Boolean).slice(0,4);
  return JSON.stringify({heads,btns:[...new Set(btns)].slice(0,30),inputs:[...new Set(inputs)].slice(0,10),selects:[...new Set(selects)].slice(0,12),th:th.slice(0,18),rowCols,rowActions:[...new Set(rowActions)].slice(0,8),pager});
})()`;
// 已確認的產品決策：這些欄位／按鈕在本地是刻意移除或改名，不對照原系統。
// 每一條都要能追到決策記錄（會議九問、施工順序表、四輪改造），不許隨手加。
const intentional = {
  '/vehicles': { th: ['車輛類型'] },            // 四期：移除車輛類型選單與表頭欄位
  '/serviceplans': { btns: ['新增服務計劃'] },  // 三次修改：一約一計劃，只從合約列表新增
  '/pestcontrolwork': { selects: ['所有種類'] }, // 文案精確化為「所有害蟲種類」
  '/mysupply': { btns: ['新增記錄'] },           // 文案精確化為「新增補給記錄」
  '/purchaseorders': { btns: ['工程滿意紙'] },   // 移至列表行操作與 PO 詳情頁，不放頂部工具欄
};

const norm = (value) => String(value || '').toLowerCase().replace(/[\s（）()「」]/g, '').replace('匯出', '導出').replace('匯入', '導入').replace('回收筒', '垃圾桶');
const has = (actual, wanted) => actual.some((value) => norm(value).includes(norm(wanted)) || norm(wanted).includes(norm(value)) && norm(wanted).length > 2);
const results = [];
await send('Page.navigate', { url: `${SITE}/demo?as=management` });
await sleep(1500);
for (const original of ORIGINAL) {
  const route = routeMap[original.route] || original.route;
  process.stdout.write(`${original.num} ${original.label} ... `);
  await send('Page.navigate', { url: SITE + route });
  let info = null;
  for (let i = 0; i < 18; i++) {
    await sleep(700);
    const raw = await ev(PROBE);
    if (raw) { info = JSON.parse(raw); if (info.heads.length && !info.heads.includes('登入')) break; }
  }
  await sleep(500);
  const raw = await ev(PROBE); if (raw) info = JSON.parse(raw);
  const req = required[original.route] || {};
  const skip = intentional[original.route] || {};
  const missingTh = (original.th || []).filter((th) => !has(info?.th || [], th) && !(skip.th || []).includes(th));
  const missingBtns = (req.btns || []).filter((btn) => !has(info?.btns || [], btn) && !(skip.btns || []).includes(btn));
  const missingSelects = (req.selects || []).filter((sel) => !has(info?.selects || [], sel) && !(skip.selects || []).includes(sel));
  const pass = !!info && !missingTh.length && !missingBtns.length && !missingSelects.length;
  results.push({ num: original.num, label: original.label, originalRoute: original.route, localRoute: route, pass, missingTh, missingBtns, missingSelects, local: info });
  console.log(pass ? 'OK' : `差異 表頭${missingTh.length} 按鈕${missingBtns.length} 篩選${missingSelects.length}`);
}
for (const [route, file] of [['/quotations', 'local-quotations.png'], ['/customers', 'local-customers.png']]) {
  await send('Page.navigate', { url: SITE + route }); await sleep(1500);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (shot?.data) fs.writeFileSync(`${OUT}/${file}`, Buffer.from(shot.data, 'base64'));
}
fs.writeFileSync(`${OUT}/ui-comparison.json`, JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, total: results.length, results }, null, 2));
console.log(`\nDOM 對照：${results.filter((r) => r.pass).length}/${results.length} 通過`);
console.log(`${OUT}/ui-comparison.json`);
process.exit(0);
