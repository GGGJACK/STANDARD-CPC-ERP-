// 由 plan.mjs + 測試結果_基線.json 生成可交付 HTML 方案
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { META, PRIORITY_DEF, TYPE_DEF, MODULES, REQUIREMENTS, CHAINS } from './plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(HERE, '測試結果_基線.json');
const data = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : null;
const results = data?.results || [];
const byId = new Map();
for (const r of results) {
  if (!byId.has(r.id)) byId.set(r.id, []);
  byId.get(r.id).push(r);
}
const caseIds = new Set(MODULES.flatMap((m) => m.cases.map((c) => c.id)));
const allCases = MODULES.flatMap((m) => m.cases.map((c) => ({ ...c, module: m.code, moduleName: m.name })));
const autoCases = allCases.filter((c) => byId.has(c.id)).length;
const manualCases = allCases.length - autoCases;
const priorityCount = { P0: 0, P1: 0, P2: 0 };
for (const c of allCases) priorityCount[c.p] = (priorityCount[c.p] || 0) + 1;
const summary = data?.summary;
const navCount = 46; // 由下方實際計算覆蓋

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const badge = (p) => `<span class="pill p-${p.toLowerCase()}">${p}</span>`;
const typeBadge = (t) => `<span class="tag">${esc(t)}</span>`;
const statusOf = (id) => {
  const rows = byId.get(id) || [];
  if (!rows.length) return '<span class="muted">手工</span>';
  const fail = rows.filter((r) => !r.pass).length;
  return fail ? `<span class="st-fail">FAIL ${fail}/${rows.length}</span>` : `<span class="st-pass">PASS ${rows.length}/${rows.length}</span>`;
};

const ROOT = {
  'STK-06': {
    level: 'S1', cause: '盤點過賬時，明細的 system_quantity / difference 只寫進記憶體 data.items，沒有寫進落庫後的 saved.items；刪除沖銷時 item.difference 缺失，回退為 actual − 0（12 − 0），把庫存從 12 直接沖成 0。',
    fix: '在 saveStockCount 裡對 saved.items 同步寫入 system_quantity/difference，或 reverseStockCount 改讀盤點單上保存的 difference 快照；補一條「刪除已過賬盤點後庫存 = 盤點前」的回歸用例。',
    evidence: 'ADJ 記錄：before 12 → change −12 → after 0；再次還原 +12 → 12，掩蓋了第一次的錯誤。',
  },
  'QUO-05': {
    level: 'S2', cause: 'convertQuotation 建立的 PO 物件沒有 po_number 鍵；defaultNumber 用 Object.hasOwn 判斷，直接跳過編號生成，po_name 也因缺編號而空白。',
    fix: '在 PO 物件先放 po_number: ""（或顯式呼叫編號生成），再 recalculate；補「轉換後 PO 編號/名稱為非空」回歸。',
    evidence: 'PO 詳情可開，但列表 PO 名稱、編號欄空白；required 欄位被轉換路徑繞過。',
  },
  'PERM-06': {
    level: 'S2', cause: 'NAV 對 /stockcounts 使用 BACK_OFFICE（含 accounting），但實體 stock_counts 的 viewRoles 是 OFFICE_ADMIN（不含 accounting），菜單可見、頁面 403。',
    fix: '兩處角色來源合一：NAV 改喫 ENTITIES[key].viewRoles，或把 stock_counts 開放給 accounting；加菜單—路由一致性檢查。',
    evidence: 'accounting 側欄有「盤點記錄」，點進去 403。',
  },
  'PERM-03': {
    level: 'S3', cause: 'GET /new/<entity> 只校驗查看權限，會計可打開合約新增表單，但提交時 editRoles 攔截。',
    fix: 'entityForm 入口改 assertEntity(user, cfg, true)，與 POST 保持一致；避免填完才被拒。',
    evidence: 'accounting /new/contracts = 200，POST /save/contracts = 403。',
  },
  'INV-07': {
    level: 'S3', cause: 'collectReceipt 寫入狀態字面量「部分收款」，但發票狀態字典/篩選器是「部分付款」。',
    fix: '改為「部分付款」；把狀態值收斂為常量，避免多處硬編碼。',
    evidence: '40/100 收款後 status=部分收款，列表 pill 與篩選器都認不出。',
  },
  'STK-09': {
    level: 'S3', cause: '盤點/送貨自動生成的調整單物件沒有 adjustment_number 鍵，defaultNumber 因 hasOwn 判斷跳過。',
    fix: '生成調整單時先補 adjustment_number: ""，或在 store.save 前統一補鍵。',
    evidence: '自動調整單 adjustment_number 空白，列表無編號可追溯。',
  },
  'SCH-07': {
    level: 'S3', cause: '排班 total_hours 只在定期排程生成時按 estimated_hours 匯總；手動排班的工作項有起止時間，但前後端都沒有計算。',
    fix: 'saveSchedule 內按 start_time/end_time 差值匯總（跨日另計），前端同步顯示。',
    evidence: '09:00–11:00 + 13:00–14:30，total_hours 為空。',
  },
  'DAT-02': {
    level: 'S2', cause: '歷史匯入的 22 張報價只有表頭金額（如 9,000），明細單價/小計為 0 或缺失；新邏輯以明細重算，打開再保存會把金額歸零。',
    fix: '匯入層補明細或保留「表頭金額優先」旗標；對 22 張做一次性核對，修復前禁止直接編輯。',
    evidence: 'SQP-2026-0230：subtotal 0、total 9,000、items 單價 0；全庫 22/1,826 同類。',
  },
};

function caseRow(c) {
  const auto = statusOf(c.id);
  return `<tr>
    <td class="mono">${esc(c.id)}</td>
    <td><b>${esc(c.title)}</b></td>
    <td>${badge(c.p)}</td>
    <td>${typeBadge(c.t)}</td>
    <td><div class="pre">${esc(c.pre)}</div><ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></td>
    <td>${esc(c.expect)}</td>
    <td class="nowrap">${auto}</td>
  </tr>`;
}

function moduleSection(m, idx) {
  const executed = m.cases.filter((c) => byId.has(c.id)).length;
  return `<section class="module" id="m-${m.code}">
    <div class="mhead">
      <div><span class="mcode">${m.code}</span><h3>${esc(m.name)}</h3></div>
      <div class="mmeta"><span>用例 <b>${m.cases.length}</b></span><span>自動化 <b>${executed}/${m.cases.length}</b></span><span>風險 <b class="risk-${m.risk === '極高' ? 'x' : m.risk === '高' ? 'h' : 'm'}">${m.risk}</b></span></div>
    </div>
    <p class="goal"><b>目標：</b>${esc(m.goal)}　<b>自動化覆蓋：</b>${esc(m.auto)}</p>
    <div class="tablewrap"><table class="cases"><colgroup><col style="width:70px"><col style="width:156px"><col style="width:50px"><col style="width:52px"><col style="width:310px"><col style="width:300px"><col style="width:70px"></colgroup><thead><tr><th>ID</th><th>測試項</th><th>級別</th><th>方法</th><th>前置與步驟</th><th>預期結果 / 判定標準</th><th>狀態</th></tr></thead><tbody>${m.cases.map(caseRow).join('')}</tbody></table></div>
  </section>`;
}

// 權限矩陣（由實測 matrix 生成）
function permissionMatrix() {
  const list = data?.matrix?.list || [];
  const form = data?.matrix?.form || [];
  if (!list.length) return '<p class="muted">未找到實測矩陣（先執行 run-tests.mjs）。</p>';
  const keys = [...new Set(list.map((x) => x.key))];
  const cell = (role, key) => {
    const l = list.find((x) => x.role === role && x.key === key);
    const f = form.find((x) => x.role === role && x.key === key);
    if (!l && !f) return '<td class="muted">—</td>';
    const lv = l ? l.status : '—';
    const fv = f ? f.status : '—';
    const bad = (l && !l.pass) || (f && !f.pass);
    return `<td class="${bad ? 'cellbad' : ''}"><span class="${lv === 200 ? 'ok' : 'no'}">${lv}</span> / <span class="${fv === 200 ? 'ok' : 'no'}">${fv}</span></td>`;
  };
  return `<div class="scroll"><table class="matrix"><thead><tr><th>實體 key</th><th>路徑</th>${['front', 'office', 'accounting', 'management'].map((r) => `<th>${ { front: '前線', office: '辦公室', accounting: '會計', management: '管理層' }[r] }</th>`).join('')}</tr></thead><tbody>${keys.map((k) => {
    const row = list.find((x) => x.key === k);
    return `<tr><td class="mono">${esc(k)}</td><td class="mono">${esc(row?.path || '')}</td>${['front', 'office', 'accounting', 'management'].map((r) => cell(r, k)).join('')}</tr>`;
  }).join('')}</tbody></table></div>
  <p class="legend"><span class="ok">200</span> = 可進入（查看 / 新增表單）；<span class="no">403</span> = 被拒；<span class="cellbad">底色</span> = 與設定不一致，需判定。格式：<b>列表 / 表單</b>。</p>`;
}

function navMatrix() {
  const rows = data?.matrix?.nav || [];
  if (!rows.length) return '';
  const paths = [...new Set(rows.map((x) => x.path))];
  const roleCell = (path, role) => {
    const r = rows.find((x) => x.path === path && x.role === role);
    if (!r) return '<td class="muted">—</td>';
    if (r.expected === r.actual) return `<td class="${r.actual ? 'ok' : 'muted'}">${r.actual ? '顯示' : '隱藏'}</td>`;
    return `<td class="cellbad">${r.actual ? '顯示' : '隱藏'}≠設定</td>`;
  };
  return `<div class="scroll"><table class="matrix"><thead><tr><th>菜單</th>${['front', 'office', 'accounting', 'management'].map((r) => `<th>${ROLE_CN[r]}</th>`).join('')}</tr></thead><tbody>${paths.map((p) => {
    const item = rows.find((x) => x.path === p);
    return `<tr><td><span class="mono">${esc(p)}</span> ${esc(item?.label || '')}</td>${['front', 'office', 'accounting', 'management'].map((r) => roleCell(p, r)).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
}

const ROLE_CN = { front: '前線', office: '辦公室', accounting: '會計', management: '管理層' };

function failuresTable() {
  const fails = results.filter((r) => !r.pass);
  if (!fails.length) return '<p class="ok">本次基線 0 失敗。</p>';
  return `<table class="fail"><thead><tr><th style="width:70px">ID</th><th style="width:44px">級別</th><th style="width:180px">現象</th><th>根因（已定位到代碼路徑）</th><th style="width:250px">修復建議</th></tr></thead><tbody>${fails.map((r) => {
    const root = ROOT[r.id] || { level: r.priority === 'P0' ? 'S2' : r.priority === 'P1' ? 'S3' : 'S4', cause: '待定位', fix: '待排期' };
    return `<tr><td class="mono">${esc(r.id)}</td><td><b class="sev">${root.level}</b></td><td><b>${esc(r.title)}</b><div class="small muted">${esc(r.actual)}</div></td><td>${esc(root.cause)}${root.evidence ? `<div class="small muted">證據：${esc(root.evidence)}</div>` : ''}</td><td>${esc(root.fix)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function moduleStats() {
  const rows = [];
  for (const m of MODULES) {
    const rs = results.filter((r) => r.module === m.code);
    if (!rs.length) { rows.push({ m, total: 0, pass: 0 }); continue; }
    rows.push({ m, total: rs.length, pass: rs.filter((r) => r.pass).length });
  }
  return rows;
}

function bar(pass, total) {
  const p = pct(pass, total);
  return `<div class="bar"><i style="width:${p}%"></i></div><span class="small">${pass}/${total} · ${p}%</span>`;
}

const modulesWithStats = moduleStats();

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(META.title)}</title>
<style>
:root{--brand:#0f766e;--brand-2:#0b5f58;--brand-50:#ecfdf5;--ink:#0f172a;--ink-2:#334155;--muted:#64748b;--line:#e4e9f0;--bg:#f6f8fb;--card:#fff;--bad:#b42318;--bad-50:#fef3f2;--ok:#067647;--warn:#b54708;--warn-50:#fffaeb;--r:12px;--r-sm:8px;--mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.7 "Microsoft YaHei","PingFang TC","Noto Sans CJK SC",system-ui,sans-serif}
a{color:var(--brand);text-decoration:none}
.layout{display:grid;grid-template-columns:256px minmax(0,1fr);gap:0;max-width:1500px;margin:0 auto}
aside{position:sticky;top:0;height:100vh;overflow:auto;padding:26px 18px 40px 24px;border-right:1px solid var(--line);background:#fff}
aside .brand{display:flex;gap:10px;align-items:center;margin-bottom:6px}
aside .logo{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#2563eb,#0d9488);color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px}
aside b{display:block;font-size:14px;line-height:1.3}
aside .ver{color:var(--muted);font-size:11px}
nav{margin-top:22px;font-size:12.5px}
nav a{display:block;padding:6px 10px;border-radius:7px;color:var(--ink-2)}
nav a:hover{background:var(--brand-50);color:var(--brand-2)}
nav .grp{margin:14px 0 4px;padding:0 10px;font-size:11px;letter-spacing:.08em;color:var(--muted);font-weight:700}
main{padding:38px 44px 90px;min-width:0}
h1{font-size:29px;line-height:1.3;margin:0 0 8px;letter-spacing:-.01em}
h2{font-size:20px;margin:46px 0 14px;padding-top:20px;border-top:1px solid var(--line)}
h3{font-size:15px;margin:0}
h4{font-size:13.5px;margin:20px 0 8px}
.sub{color:var(--muted);font-size:13px}
.lead{font-size:15px;color:var(--ink-2);max-width:980px}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
.chip{background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 11px;font-size:12px;color:var(--ink-2)}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:22px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 16px 14px}
.card .k{font-size:11.5px;color:var(--muted);letter-spacing:.02em}
.card .v{font-size:27px;font-weight:700;line-height:1.25;margin-top:3px}
.card .n{font-size:11.5px;color:var(--muted)}
.card.ok .v{color:var(--ok)}.card.bad .v{color:var(--bad)}
.verdict{background:#fff;border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:10px;padding:16px 18px;margin:18px 0}
.verdict b{color:var(--bad)}
.note{background:var(--warn-50);border:1px solid #fedf89;border-radius:10px;padding:12px 14px;color:#7a2e0e;font-size:13px;margin:14px 0}
.good{background:var(--brand-50);border:1px solid #b7e4d8;border-radius:10px;padding:12px 14px;color:#0b4f47;font-size:13px;margin:14px 0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:12.5px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#f8fafc;color:#334155;font-weight:600;white-space:nowrap;position:sticky;top:0;z-index:1}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#fbfdff}
.mono{font-family:var(--mono);font-size:11.5px;white-space:nowrap}
.nowrap{white-space:nowrap}
.muted{color:var(--muted)}
.small{font-size:11.5px;line-height:1.55}
.ok{color:var(--ok);font-weight:600}.no{color:var(--bad);font-weight:600}
.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid transparent}
.p-p0{background:var(--bad-50);color:var(--bad);border-color:#fecdca}
.p-p1{background:var(--warn-50);color:var(--warn);border-color:#fedf89}
.p-p2{background:#eef2f7;color:#475569;border-color:#dbe3ec}
.tag{display:inline-block;padding:1px 6px;border-radius:5px;background:#f1f5f9;color:#475569;font-size:11px}
.st-pass{color:var(--ok);font-weight:700;font-size:11.5px;white-space:nowrap}
.st-fail{color:var(--bad);font-weight:700;font-size:11.5px;white-space:nowrap}
.sev{color:var(--bad);font-family:var(--mono)}
.steps{margin:3px 0 0;padding-left:16px;color:var(--ink-2)}.steps li{margin:1px 0}
.pre{color:var(--muted);font-size:11.5px}
.module{margin:28px 0 34px;scroll-margin-top:20px}
.mhead{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;border-bottom:2px solid var(--line);padding-bottom:8px;margin-bottom:8px}
.mhead>div:first-child{display:flex;align-items:center;gap:10px}
.mcode{font-family:var(--mono);font-size:11px;background:var(--brand-50);color:var(--brand-2);padding:3px 7px;border-radius:6px;font-weight:700}
.mmeta{display:flex;gap:14px;font-size:11.5px;color:var(--muted);white-space:nowrap}
.mmeta b{color:var(--ink-2)}
.risk-x{color:var(--bad)}.risk-h{color:var(--warn)}.risk-m{color:var(--ink-2)}
.goal{font-size:12px;color:var(--muted);margin:6px 0 10px}
.tablewrap{overflow:auto;border-radius:10px}
.cases{min-width:1000px;table-layout:fixed}
.cases td{font-size:12px;line-height:1.55}
.cases td:nth-child(5){min-width:0}
.scroll{overflow:auto;max-height:640px;border-radius:10px}
.matrix td,.matrix th{text-align:center;white-space:nowrap}
.matrix td:first-child,.matrix th:first-child,.matrix td:nth-child(2),.matrix th:nth-child(2){text-align:left}
.cellbad{background:#fff1f3}
.legend{font-size:11.5px;color:var(--muted);margin:8px 2px 0}
.bar{height:6px;background:#eef2f7;border-radius:999px;overflow:hidden;margin:2px 0 3px;min-width:80px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#0d9488,#2563eb)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.panel h4{margin-top:0}
ul.tight{margin:6px 0 0;padding-left:18px}ul.tight li{margin:3px 0}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto;font:12px/1.7 var(--mono);margin:10px 0}
code{font-family:var(--mono);font-size:11.5px;background:#f1f5f9;padding:1px 5px;border-radius:4px}
pre code{background:none;padding:0;font-size:inherit}
.chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 16px}
.chain .node{background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 9px;font-size:12px}
.chain .arr{color:var(--muted);font-size:12px}
.state{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;margin:6px 0 14px}
.state .s{border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 10px}
.state .s.bad{color:var(--bad);border-color:#fecdca;background:var(--bad-50)}
.toc-note{font-size:11px;color:var(--muted);margin-top:18px;padding-top:12px;border-top:1px solid var(--line)}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px}
@media (max-width:1080px){.layout{grid-template-columns:1fr}aside{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--line)}nav{columns:2}main{padding:26px 20px 70px}.cards{grid-template-columns:1fr 1fr}.grid2{grid-template-columns:1fr}}
@media print{.cases{min-width:0;table-layout:auto;font-size:8.5pt}body{background:#fff}aside{display:none}.layout{display:block}main{padding:0;max-width:none}h2{page-break-after:avoid}.module{page-break-inside:auto}tr{page-break-inside:avoid}.tablewrap,.scroll{overflow:visible;max-height:none}pre{white-space:pre-wrap}}
</style>
</head>
<body>
<div class="layout">
<aside>
  <div class="brand"><div class="logo">CPC</div><div><b>測試設計與驗收</b><span class="ver">${esc(META.version)} · ${esc(META.date)}</span></div></div>
  <nav>
    <div class="grp">總覽</div>
    <a href="#s0">0 · 結論摘要</a>
    <a href="#s1">1 · 對象與範圍</a>
    <a href="#s2">2 · 驗收依據</a>
    <a href="#s3">3 · 設計方法</a>
    <a href="#s4">4 · 分層與自動化</a>
    <div class="grp">執行</div>
    <a href="#s5">5 · 環境與數據</a>
    <a href="#s6">6 · 判定與缺陷</a>
    <a href="#s7">7 · 詳細用例</a>
    ${MODULES.map((m) => `<a href="#m-${m.code}" style="padding-left:20px">${m.code} · ${esc(m.name)}</a>`).join('')}
    <div class="grp">驗證</div>
    <a href="#s8">8 · 權限矩陣</a>
    <a href="#s9">9 · 業務鏈</a>
    <a href="#s10">10 · 執行計劃</a>
    <a href="#s11">11 · 基線結果</a>
    <a href="#s12">12 · 風險與待辦</a>
    <a href="#s13">附錄 · 工具用法</a>
  </nav>
  <div class="toc-note">用 ${esc(META.environment)}</div>
</aside>
<main>
  <h1>${esc(META.title)}</h1>
  <p class="lead">把「每一項怎麼測、憑什麼判定達標」落成一張可執行的清單：38 個實體、4 個角色、5 條主業務鏈，逐項給出前置條件、操作步驟、預期結果與判定標準，並用同一份用例驅動自動化驗收。</p>
  <div class="meta">
    <span class="chip">系統：${esc(META.system)}</span>
    <span class="chip">範圍：${esc(META.scope)}</span>
    <span class="chip">基線：${summary ? `${summary.passed}/${summary.total} 通過` : '待執行'}</span>
    <span class="chip">用例：${allCases.length} 項（自動化 ${autoCases}）</span>
  </div>

  <h2 id="s0">0 · 結論摘要</h2>
  <div class="cards">
    <div class="card"><div class="k">基線檢查項</div><div class="v">${summary ? summary.total : '—'}</div><div class="n">其中自動化斷言 ${results.length} 條</div></div>
    <div class="card ok"><div class="k">通過率</div><div class="v">${summary ? summary.passRate + '%' : '—'}</div><div class="n">${summary ? `${summary.passed} 通過 / ${summary.failed} 失敗` : ''}</div></div>
    <div class="card ${summary && summary.byPriority.P0.pass === summary.byPriority.P0.total ? 'ok' : 'bad'}"><div class="k">P0 阻斷項</div><div class="v">${summary ? `${summary.byPriority.P0.pass}/${summary.byPriority.P0.total}` : '—'}</div><div class="n">准入要求 100%</div></div>
    <div class="card bad"><div class="k">待修缺陷</div><div class="v">${summary ? summary.failed : '—'}</div><div class="n">1 個 S1、3 個 S2、4 個 S3</div></div>
  </div>
  <div class="verdict">
    <b>准入結論：暫不放行。</b> ${summary ? `本輪 ${summary.total} 項檢查中 ${summary.failed} 項未通過，其中 P0 僅 1 項：刪除「已過賬盤點」會把庫存從 12 直接沖成 0（S1）。` : ''} 這不是介面問題，而是庫存資料會被寫壞；必須先修復並回歸，纔可進入正式環境。其餘 7 項為 S2/S3（PO 編號缺失、菜單死連結、狀態字典不一致、排班工時未計算、歷史報價金額風險等），可排期修復但不阻斷試運行。
  </div>
  <div class="good"><b>可直接使用的部分：</b>角色隔離、CSRF、XSS 轉義、上傳路徑、送貨扣庫、收款核銷、借貸平衡、軟刪除與還原、CSV 權限、四個重頁效能（均 &lt; 3s）本輪全部通過。</div>

  <h2 id="s1">1 · 測試對象與範圍</h2>
  <p>對象是本地復刻的標準清潔滅蟲管理系統：Node.js 單體服務 + SQLite（<code>records</code> 單表 + JSON），四角色（前線 / 辦公室 / 會計 / 管理層），38 個業務實體、6 組導航、5 大業務域。測試以「角色 × 實體 × 操作」為覆蓋骨架，再疊加 5 條跨模組業務鏈。</p>
  <h4>1.1 模組與用例分佈</h4>
  <table><thead><tr><th>模組</th><th>名稱</th><th>用例</th><th>自動化</th><th>基線</th><th>風險</th></tr></thead><tbody>
  ${modulesWithStats.map(({ m, total, pass }) => `<tr><td class="mono">${m.code}</td><td>${esc(m.name)}</td><td>${m.cases.length}</td><td>${m.cases.filter((c) => byId.has(c.id)).length}</td><td>${total ? bar(pass, total) : '<span class="muted">手工</span>'}</td><td>${esc(m.risk)}</td></tr>`).join('')}
  </tbody></table>
  <h4>1.2 資料規模（決定效能與邊界取樣）</h4>
  <table><thead><tr><th>表 / 實體</th><th>筆數</th><th>對測試的意義</th></tr></thead><tbody>
    <tr><td>records（全部業務記錄）</td><td>34,053</td><td>全表 JSON 掃描、遷移完整性</td></tr>
    <tr><td>Schedule 排班</td><td>13,116</td><td>/schedules 日曆與月視圖效能</td></tr>
    <tr><td>StockAdjustment 庫存調整</td><td>9,566</td><td>庫存追溯、盤點沖銷鏈</td></tr>
    <tr><td>Quotation 報價</td><td>1,826</td><td>列表分頁、合計抽樣、轉換鏈</td></tr>
    <tr><td>Customer 客戶</td><td>1,608</td><td>搜尋、配額、詳情 KPI</td></tr>
    <tr><td>PurchaseOrder / DeliveryNote</td><td>902 / 1,026</td><td>PO→DN→庫存</td></tr>
    <tr><td>Invoice / Receipt / StockCount</td><td>205 / 57 / 47</td><td>財務核銷、盤點可逆</td></tr>
  </tbody></table>
  <h4>1.3 不在本輪範圍</h4>
  <ul class="tight">
    <li>原系統 base44 雲端帳號、郵件/WhatsApp 實際發送、第三方支付與銀行對賬。</li>
    <li>真實打印機驅動、條碼槍、GPS 打卡硬體；本輪只驗證頁面與 PDF/CSV 產出。</li>
    <li>跨瀏覽器矩陣（Chrome/Edge 為主）、行動端真機；列為下一輪 UI 專項。</li>
  </ul>

  <h2 id="s2">2 · 驗收依據（需求從哪裡來）</h2>
  <p>驗收不能只憑「看起來能用」。本方案的判定依據固定為四類，並要求每條用例至少掛一類：</p>
  <table><thead><tr><th style="width:70px">編號</th><th>需求 / 約束</th><th>來源</th><th>對應用例</th></tr></thead><tbody>
  ${REQUIREMENTS.map((r) => `<tr><td class="mono">${r.id}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.source)}</td><td class="mono">${r.cases.join('、')}</td></tr>`).join('')}
  </tbody></table>
  <div class="note"><b>基線原則：</b>原系統行為（源碼 + 截圖 + 34 張原系統截圖）優先於「我認為應該怎樣」；四輪改造的 9×4 條決策為第二依據；代碼中的不變量（如 navgrp 13px/700、__id 必須空、HK$ 只出現一次）為第三依據。三者衝突時，記錄為「設計缺口」而不是直接改測試。</div>

  <h2 id="s3">3 · 設計方法</h2>
  <div class="panel" style="margin-bottom:16px"><h4>3.0 從零設計這套測試的五步</h4>
  <ol class="tight">
    <li><b>先定基線，不先寫用例：</b>把「原系統行為、四輪改造決策、代碼不變量」整理成可引用的需求編號（本文件 R-01～R-12）。沒有基線的斷言，最後都會變成爭論。</li>
    <li><b>先測權限，再測功能：</b>4 角色 × 38 實體 × 6 層（菜單/直鏈/列表/表單/動作/回收桶）先跑一遍。權限錯了，後面的功能測試資料都不可信。</li>
    <li><b>畫主鏈與狀態機：</b>報價→PO→合約→發票→收據、PO→DN→庫存、盤點→沖銷，總共 5 條；每條邊至少一條用例，非法邊也要測。</li>
    <li><b>每條用例寫死判定：</b>HTTP 狀態 + DB 欄位 + 副作用 + 冪等，四層都要有；只看「頁面提示成功」不算過。</li>
    <li><b>固化與閉環：</b>把可重複的 115 項做成腳本，用例清單導出 CSV 當進度表，失敗項開缺陷單，修完追加永久用例，不刪舊例。</li>
  </ol></div>
  <div class="grid2">
    <div class="panel"><h4>3.1 優先級（決定準入）</h4><table><thead><tr><th>級別</th><th>含義</th><th>准入</th></tr></thead><tbody>${PRIORITY_DEF.map((p) => `<tr><td>${badge(p.key)} ${p.label}</td><td>${esc(p.rule)}</td><td>${p.key === 'P0' ? '100%' : p.key === 'P1' ? '≥98%' : '≥95%'}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><h4>3.2 測試類型</h4><table><thead><tr><th>類型</th><th>用途</th></tr></thead><tbody>${TYPE_DEF.map(([t, d]) => `<tr><td>${typeBadge(t)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
  </div>
  <h4>3.3 七種設計技術（本系統的具體用法）</h4>
  <table><thead><tr><th style="width:120px">技術</th><th>怎麼用</th><th>本系統例子</th></tr></thead><tbody>
    <tr><td>等價類</td><td>把輸入切成有效/無效類，每類至少一例</td><td>數量：整數 2（有效）、2.5（小數無效）、-1（負數無效）、空（缺省）</td></tr>
    <tr><td>邊界值</td><td>取 0、1、最大、剛好不足</td><td>庫存 5 出庫 3（成功）/ 出庫 10（409）；請假同一天/跨月</td></tr>
    <tr><td>判定表</td><td>多條件組合，逐條列出動作</td><td>角色 × 實體 × 查看/新增/匯出/回收桶；4×38×4 種組合收斂為權限矩陣</td></tr>
    <tr><td>狀態遷移</td><td>枚舉狀態與合法邊</td><td>報價：已報價→跟進中→已收PO→已成交；發票：草稿→已發出→部分付款→已付款/已作廢；盤點：進行中→已完成→（刪除）沖銷→還原</td></tr>
    <tr><td>正交組合</td><td>用少量組合覆蓋多因子</td><td>報價類型（服務/產品）× 語言（中/英）× 有無明細折扣 × 是否轉換</td></tr>
    <tr><td>錯誤推測</td><td>依歷史缺陷清單反推</td><td>彈窗 __id 被預填導致 404、picker 捲動即關閉、amount 欄位被拉成整條、HK$ 重複</td></tr>
    <tr><td>資料不變量</td><td>不靠畫面，直接對 DB 斷言</td><td>報價 subtotal=Σ(數量×單價−折扣)、發票 balance=total−paid、分錄借貸相等、deleted=1 必有 deleted_at</td></tr>
  </tbody></table>

  <h2 id="s4">4 · 分層與自動化邊界</h2>
  <table><thead><tr><th style="width:60px">層</th><th>測什麼</th><th>手段</th><th>頻率</th><th>本輪</th></tr></thead><tbody>
    <tr><td><b>L0</b></td><td>啟動、DB 連通、路由 404、環境變數</td><td>啟動腳本 + HTTP 探測</td><td>每次提交</td><td>3 項自動</td></tr>
    <tr><td><b>L1</b></td><td>純函數：編號、金額、整數、時區、沖銷</td><td>Node 直接 import lib（無需起服務）</td><td>每次提交</td><td>由 L2 覆蓋</td></tr>
    <tr><td><b>L2</b></td><td>HTTP 契約：CRUD、必填、權限、CSRF、軟刪除</td><td>fetch + Cookie/Session + SQLite 斷言</td><td>每日 / 合併前</td><td>92 項自動</td></tr>
    <tr><td><b>L3</b></td><td>跨模組業務鏈：報價→PO→合約→發票→收據；PO→DN→庫存；盤點→沖銷</td><td>端到端 API 編排 + DB 對賬</td><td>每輪改動</td><td>20 項自動</td></tr>
    <tr><td><b>L4</b></td><td>UI 互動：彈窗、picker、分頁、列印、1366 寬</td><td>Playwright/CDP 截圖與 DOM 斷言</td><td>每週 / 發版前</td><td>手工 + 少量 DOM/CSS 斷言</td></tr>
    <tr><td><b>L5</b></td><td>非功能：效能、併發、安全、相容性</td><td>計時、併發 fetch、XSS/IDOR/上傳探測</td><td>發版前</td><td>9 項自動 + 手工清單</td></tr>
  </tbody></table>
  <p class="small muted">自動化只覆蓋「可斷言、可重複、可隔離」的部分。畫面美感、列印斷頁、選擇器手感仍需人工；但它們的判定標準必須寫死在用例裡，不能以「看起來可以」收尾。</p>

  <h2 id="s5">5 · 環境與測試數據</h2>
  <h4>5.1 隔離原則（硬性）</h4>
  <ul class="tight">
    <li><b>絕不在 :3000 正式庫上跑寫入測試。</b>測試只允許在 :3101/:3102 的副本跑，DB 路徑必須在 <code>_run_*</code> 下。</li>
    <li>用 <code>VACUUM INTO</code> 做一致性快照（自動包含 WAL 已提交資料）；不要直接複製 db+wal，生產正在寫入時會得到半舊快照。</li>
    <li>每次執行用唯一 <code>runId</code> 前綴（如 <code>QA-mvnt…</code>），所有測試資料可反查、可清理，不與正式資料撞名。</li>
    <li>測試帳號只用 <code>/demo?as=</code> 的四個示範用戶；<code>CPC_DEMO=1</code>、<code>CPC_AUTO_IMPORT=0</code>。</li>
  </ul>
  <pre><code># 1) 一致性快照（自動；等價於 sqlite3 .backup）
node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data.db',{readOnly:true});d.exec(\"VACUUM INTO '_run_xxxx/data.db'\")"
# 若快照失敗，纔回退複製 data.db + data.db-wal

# 2) 起隔離服務
set PORT=3102
set DB_PATH=...\\_run_xxxx\\data.db
set CPC_UPLOAD_DIR=...\\_run_xxxx\\uploads
set CPC_DEMO=1
set CPC_AUTO_IMPORT=0
node server.mjs

# 3) 跑驗收（自動完成複製、啟動、清理）
node run-tests.mjs --port 3102 --keep</code></pre>
  <h4>5.2 數據準備</h4>
  <table><thead><tr><th>資料</th><th>準備方式</th><th>用途</th></tr></thead><tbody>
    <tr><td>既有 34k 記錄</td><td>直接複製正式庫</td><td>列表分頁、搜尋、效能、歷史資料風險</td></tr>
    <tr><td>本輪新建資料</td><td><code>QA-&lt;runId&gt;</code> 前綴 + 當日日期</td><td>可精確斷言、可最後統一清理</td></tr>
    <tr><td>邊界資料</td><td>0 庫存、負調整、2.5 數量、空明細、超長名稱</td><td>異常與邊界用例</td></tr>
    <tr><td>不可用資料</td><td>正式庫、客戶真實附件、正式上傳目錄</td><td>禁止寫入</td></tr>
  </tbody></table>
  <div class="note"><b>本機限制：</b>F: 盤不支援回收站，Node 的 <code>fs.rmSync</code> 會被安全墊攔截，因此腳本不刪 <code>_run_*</code>，跑完請手動清理（或在支援回收站的磁碟上跑）。</div>

  <h2 id="s6">6 · 判定規則與缺陷管理</h2>
  <h4>6.1 一條用例算「通過」的條件</h4>
  <table><thead><tr><th>層面</th><th>必須同時滿足</th></tr></thead><tbody>
    <tr><td>HTTP</td><td>狀態碼符合預期（成功 302/200，校驗 400，越權 403，不存在 404，衝突 409）</td></tr>
    <tr><td>資料</td><td>DB 欄位值與計算結果符合預期（不是隻看頁面提示）</td></tr>
    <tr><td>副作用</td><td>該變的變了（庫存/餘額/狀態），不該變的沒變（其他欄位、其他實體、筆數）</td></tr>
    <tr><td>可重複</td><td>同一用例連跑 3 次結果一致；重複提交不產生第二筆（冪等）</td></tr>
    <tr><td>證據</td><td>失敗必須附：請求、狀態碼、回應片段、DB 查詢結果、runId；口頭描述不算</td></tr>
  </tbody></table>
  <h4>6.2 缺陷等級</h4>
  <table><thead><tr><th style="width:60px">等級</th><th>定義</th><th>例子（本輪）</th><th>處理</th></tr></thead><tbody>
    <tr><td><b class="sev">S1</b></td><td>資料損壞、金額/庫存錯誤、越權可寫、核心鏈中斷</td><td>刪除已過賬盤點把庫存沖成 0</td><td>立即修，修完重跑全套</td></tr>
    <tr><td><b class="sev">S2</b></td><td>主要功能缺失或有明確繞過；關鍵欄位空白</td><td>報價轉 PO 無編號；歷史報價編輯歸零風險；菜單死連結</td><td>本輪必修</td></tr>
    <tr><td><b class="sev">S3</b></td><td>次要功能/文案/字典不一致，有替代路徑</td><td>部分收款 vs 部分付款；表單可開不可存；自動調整單無編號</td><td>排期修</td></tr>
    <tr><td><b class="sev">S4</b></td><td>體驗、樣式、極端邊界</td><td>排班工時未顯示；列印細節</td><td>可延後</td></tr>
  </tbody></table>
  <h4>6.3 缺陷單模板（直接複製）</h4>
  <pre><code>[標題] 刪除已過賬盤點後庫存被沖成 0（S1）
[環境] :3102 副本 / runId=QA-xxxx / management
[前置] 產品庫存 15；盤點 actual=12 完成過賬（生成 -3）
[步驟] 1. POST /delete/stock_counts/&lt;id&gt;  2. 讀 products.stock_quantity
[預期] 庫存回到 15，生成 +3 沖銷，stock_reversed=true
[實際] 庫存 0；生成 -12 沖銷；count.items 缺 system_quantity/difference
[證據] ADJ before12/change-12/after0；count.items=[{product_id,actual_quantity:12}]
[影響] 任何「盤點後刪除」都會清空該商品庫存，且還原後看似正常，難以察覺
[建議] saved.items 同步寫入 difference 快照；補回歸</code></pre>

  <h2 id="s7">7 · 詳細用例（逐項）</h2>
  <p class="small muted">共 ${allCases.length} 條；P0 ${priorityCount.P0}、P1 ${priorityCount.P1}、P2 ${priorityCount.P2}；已自動化 ${autoCases} 條，其餘為手工/半自動。每條都給出「怎麼做」與「憑什麼算過」。</p>
  ${MODULES.map((m, i) => moduleSection(m, i)).join('')}

  <h2 id="s8">8 · 權限矩陣（38 實體 × 4 角色）</h2>
  <p>權限不是「菜單看得到」就算過。按六層拆：菜單可見性、直鏈訪問、列表、表單、動作（審批/轉換/匯出）、回收桶。下表是實測狀態碼，可直接看出哪一格與設定不一致。</p>
  <h4>8.1 實體列表 / 表單</h4>
  ${permissionMatrix()}
  <h4>8.2 菜單可見性</h4>
  ${navMatrix()}
  <div class="note"><b>本輪發現：</b>會計角色側欄有「盤點記錄」，但 /stockcounts 回 403（NAV 用 BACK_OFFICE，實體用 OFFICE_ADMIN）；會計可打開 /new/contracts 表單，但提交被 403 攔截。前者是死連結，後者是「填完才被拒」。</div>

  <h2 id="s9">9 · 業務鏈與狀態機</h2>
  ${CHAINS.map((c) => `<h4>${c.id} · ${esc(c.name)}</h4><div class="chain">${c.nodes.map((n, i) => `<span class="node">${esc(n)}</span>${i < c.nodes.length - 1 ? '<span class="arr">→</span>' : ''}`).join('')}</div><p class="small muted">驗收要點：${esc(c.verify)}</p>`).join('')}
  <h4>9.1 關鍵狀態遷移</h4>
  <div class="state"><b>報價：</b><span class="s">已報價</span>→<span class="s">跟進中</span>→<span class="s">已收PO</span>→<span class="s">已成交</span><span class="s bad">已取消/失敗</span></div>
  <div class="state"><b>發票：</b><span class="s">草稿</span>→<span class="s">已發出</span>→<span class="s">部分付款</span>→<span class="s">已付款</span><span class="s bad">逾期/已作廢</span></div>
  <div class="state"><b>盤點：</b><span class="s">進行中</span>→<span class="s">已完成（過賬）</span>→<span class="s">刪除（沖銷）</span>→<span class="s">還原（重過賬）</span><span class="s bad">永久刪除</span></div>
  <p class="small muted">每個箭頭至少一條用例；非法箭頭（如草稿直接已付款、未過賬直接沖銷）必須被拒絕或有明確提示。</p>

  <h2 id="s10">10 · 執行計劃（怎麼排、多久跑一次）</h2>
  <table><thead><tr><th style="width:110px">層級</th><th>內容</th><th>耗時</th><th>時機</th><th>通過標準</th></tr></thead><tbody>
    <tr><td><b>冒煙</b></td><td>四角色登入 + 44 頁直鏈 + 5 條主鏈各 1 筆</td><td>約 8 分鐘</td><td>每次部署 / 每日早上</td><td>P0 100%，無 500</td></tr>
    <tr><td><b>回歸</b></td><td>本方案 115 項自動 + 權限矩陣</td><td>約 35 分鐘</td><td>每次合併 / 每週</td><td>P0 100%，P1 ≥98%</td></tr>
    <tr><td><b>發版</b></td><td>回歸 + 手工 UI/列印/1366 寬 + 效能 + 安全清單</td><td>約 90 分鐘</td><td>上線前</td><td>無 S1/S2；P2 有記錄與排期</td></tr>
  </tbody></table>
  <h4>10.1 角色分工</h4>
  <ul class="tight">
    <li><b>QA：</b>維護用例與自動化、判定缺陷等級、出具基線報告；不改產品代碼。</li>
    <li><b>開發：</b>按缺陷單修復，附最小重現與自測；修完通知 QA 重跑，不自行改測試期望。</li>
    <li><b>業務/辦公室：</b>確認「原系統就是這樣」的行為（如合約編號沿用報價號），避免把設計當缺陷。</li>
  </ul>
  <h4>10.2 回歸門檻（寫進發布清單）</h4>
  <ul class="tight">
    <li>P0 全綠；P1 ≥98%；S1/S2 為 0；連續兩次回歸結果一致。</li>
    <li>任何「為了讓測試變綠」而放寬斷言，必須在報告中標註理由並經業務確認。</li>
    <li>測試資料不清理不得進入下一輪（避免污染基準）。</li>
  </ul>

  <h2 id="s11">11 · 基線結果（本輪實測）</h2>
  ${summary ? `<p class="small muted">執行時間：${esc(data.meta.date)} · 隔離服務 ${esc(data.meta.base)} · runId ${esc(data.meta.runId)} · Node ${esc(data.meta.node)}</p>` : ''}
  ${summary ? `
  <div class="cards">
    <div class="card"><div class="k">檢查項</div><div class="v">${summary.total}</div><div class="n">自動斷言</div></div>
    <div class="card ok"><div class="k">通過</div><div class="v">${summary.passed}</div><div class="n">${summary.passRate}%</div></div>
    <div class="card bad"><div class="k">失敗</div><div class="v">${summary.failed}</div><div class="n">見下表</div></div>
    <div class="card ${summary.byPriority.P0.pass === summary.byPriority.P0.total ? 'ok' : 'bad'}"><div class="k">P0</div><div class="v">${summary.byPriority.P0.pass}/${summary.byPriority.P0.total}</div><div class="n">准入線 100%</div></div>
  </div>
  <h4>11.1 按模組</h4>
  <table><thead><tr><th>模組</th><th>檢查</th><th>通過</th><th>失敗</th><th>通過率</th></tr></thead><tbody>
  ${Object.entries(summary.byModule).map(([m, s]) => `<tr><td class="mono">${m}</td><td>${s.total}</td><td>${s.pass}</td><td class="${s.total - s.pass ? 'no' : ''}">${s.total - s.pass}</td><td>${pct(s.pass, s.total)}%</td></tr>`).join('')}
  </tbody></table>
  <h4>11.2 待修缺陷（按等級）</h4>
  ${failuresTable()}
  ` : '<p class="muted">尚未執行基線，先跑 <code>node run-tests.mjs</code>。</p>'}

  <h2 id="s12">12 · 風險、已知缺口與下一步</h2>
  <h4>12.1 需要業務確認的「疑似設計」</h4>
  <table><thead><tr><th>現象</th><th>為什麼可能不是缺陷</th><th>建議</th></tr></thead><tbody>
    <tr><td>合約編號沿用報價編號（SQP-…）</td><td>報價成交後直接成為合約號，符合部分清潔行業習慣</td><td>由業務確認；若確認，寫入需求基線，測試不再斷言 C- 前綴</td></tr>
    <tr><td>PO / 合約 / 收據編號欄位 required，留空被拒</td><td>編號可能由客戶或人工提供，自動編號只是預留能力</td><td>確認是否需要自動；若需要，required 與 defaultNumber 的順序要調整</td></tr>
    <tr><td>公告頁全員可直鏈讀取，但菜單只給管理層</td><td>公告本質是全員可讀，管理頁只是管理入口</td><td>在權限矩陣標註「可讀」；若要嚴格，改菜單或改路由</td></tr>
    <tr><td>送貨單刪除後不反向沖銷庫存</td><td>可能要求人工盤點修正，避免自動回滾造成二次錯誤</td><td>補需求說明；若需沖銷，按盤點模式加 stock_reversed</td></tr>
  </tbody></table>
  <h4>12.2 尚未自動化的高價值手工項</h4>
  <ul class="tight">
    <li>列印版面（報價/發票/收據/排班/工程滿意紙）A4 斷頁與中文換行。</li>
    <li>Picker 手感：50 筆清單捲動、彈窗內裁切、選中回填 ID/單位。</li>
    <li>1366×768 十二欄表格、操作列黏性、水平溢出。</li>
    <li>併發寫入（兩個會話同時保存排班/報價）與 SQLITE_BUSY 重試。</li>
    <li>辦公室每日 10 條回收桶上限與管理層通知（需構造 11 條）。</li>
    <li>公開分享連結的枚舉與過期策略（token 強度、重放）。</li>
  </ul>
  <h4>12.3 建議修復順序（按投入產出）</h4>
  <table><thead><tr><th style="width:60px">順序</th><th>項</th><th>為什麼先做</th><th>預估</th></tr></thead><tbody>
    <tr><td>1</td><td>STK-06 盤點沖銷清零</td><td>唯一 S1，直接寫壞庫存，且還原後掩蓋問題</td><td>0.5 天 + 回歸</td></tr>
    <tr><td>2</td><td>QUO-05 PO 編號/名稱空白</td><td>轉換主鏈第一站，列表無編號無法對賬</td><td>0.5 天</td></tr>
    <tr><td>3</td><td>DAT-02 22 張歷史報價</td><td>一旦有人打開保存就丟金額，屬於靜默資料損失</td><td>1 天（含核對）</td></tr>
    <tr><td>4</td><td>PERM-06 菜單死連結、PERM-03 表單越權</td><td>權限一致性，影響會計日常使用與審計印象</td><td>0.5 天</td></tr>
    <tr><td>5</td><td>INV-07 / STK-09 / SCH-07</td><td>字典、編號、工時，都是可排期的 S3</td><td>1 天</td></tr>
  </tbody></table>
  <div class="note"><b>不要做的事：</b>不要為了讓 115 項全綠而刪掉 STK-06 的斷言、把 PO 編號改成「可為空」、或把「部分收款」加進字典。這三件事都會把真實缺陷偽裝成需求。</div>

  <h2 id="s13">附錄 · 工具用法與交付物</h2>
  <h4>A. 一鍵跑驗收</h4>
  <pre><code>cd "F:\\04 STANDARD CPC SYSTEM\\04. 四期\\測試設計_20261025"
node run-tests.mjs --port 3102 --keep

# 只跑某一模組（可選，需自行加 filter）
# 產出：
#   測試結果_基線.json   機器可讀，含 matrix 與 evidence
#   測試結果_基線.html   人可讀，按模組/優先級匯總
#   _run_&lt;runId&gt;/        隔離副本與 server.log</code></pre>
  <h4>B. 檔案說明</h4>
  <table><thead><tr><th>檔案</th><th>用途</th></tr></thead><tbody>
    <tr><td class="mono">ERP測試設計與驗收方案_20261025.html</td><td>本文件：方法、用例、矩陣、判定、基線</td></tr>
    <tr><td class="mono">plan.mjs</td><td>用例唯一資料源（模組、用例、需求追蹤、業務鏈）</td></tr>
    <tr><td class="mono">run-tests.mjs</td><td>零依賴驗收器：複製 DB、起服務、跑 115 項、出報告</td></tr>
    <tr><td class="mono">build-plan.mjs</td><td>由 plan + 結果生成這份 HTML</td></tr>
    <tr><td class="mono">測試結果_基線.json / .html</td><td>本輪證據與匯總</td></tr>
  </tbody></table>
  <h4>C. 下一輪建議（按順序）</h4>
  <ol class="tight">
    <li>修 STK-06，重跑 115 項，確認 P0 100%。</li>
    <li>補 UI 自動化：Playwright 覆蓋新增彈窗 __id、picker 捲動、列印 PDF 首頁。</li>
    <li>把「權限矩陣」接入每次合併：任何 role 變更都應讓矩陣 diff 可見。</li>
    <li>建立缺陷回歸庫：每個 S1/S2 修復後追加一條永久用例，不刪舊例。</li>
  </ol>
  <footer>${esc(META.title)} · ${esc(META.version)} · 產生於 ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · 基線資料來自 :3102 隔離副本</footer>
</main>
</div>
<script>addEventListener('load',()=>{if(location.hash){const el=document.querySelector(location.hash);if(el)el.scrollIntoView({block:'start',behavior:'instant'});}});</script>
</body>
</html>`;

fs.writeFileSync(path.join(HERE, 'ERP測試設計與驗收方案_20261025.html'), html, 'utf8');

const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const caseRows = [['用例ID', '模組', '模組名稱', '測試項', '優先級', '方法', '前置條件', '步驟', '預期結果/判定標準', '自動化', '基線結果']];
for (const c of allCases) {
  const rows = byId.get(c.id) || [];
  const state = !rows.length ? '手工/未執行' : rows.every((r) => r.pass) ? 'PASS' : 'FAIL';
  caseRows.push([c.id, c.module, c.moduleName, c.title, c.p, c.t, c.pre, c.steps.map((x, i) => `${i + 1}.${x}`).join(' '), c.expect, rows.length ? `自動 ${rows.length} 條` : '手工', state]);
}
fs.writeFileSync(path.join(HERE, '測試用例清單.csv'), '\ufeff' + caseRows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'utf8');

const defectRows = [['缺陷ID', '等級', '優先級', '現象', '實測', '根因', '修復建議', '證據', '狀態']];
for (const r of results.filter((x) => !x.pass)) {
  const root = ROOT[r.id] || { level: 'S3', cause: '待定位', fix: '待排期', evidence: '' };
  defectRows.push([r.id, root.level, r.priority, r.title, r.actual, root.cause, root.fix, root.evidence || '', '待修']);
}
fs.writeFileSync(path.join(HERE, '缺陷清單.csv'), '\ufeff' + defectRows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'utf8');

console.log('已生成 ERP測試設計與驗收方案_20261025.html');
console.log('已生成 測試用例清單.csv / 缺陷清單.csv');
console.log(`用例 ${allCases.length} 條；自動化對應 ${autoCases} 條；基線 ${summary ? summary.passed + '/' + summary.total : '未執行'}`);
