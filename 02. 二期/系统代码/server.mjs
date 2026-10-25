import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DB = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/system/data.db';
const PORT = Number(process.env.PORT || 3000);
const db = new DatabaseSync(DB);
db.exec('PRAGMA journal_mode = WAL');

const S = (k, d = '') => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : d;
};
const TZ = S('tz', 'Asia/Hong_Kong');
const LIMIT = Number(S('quota_limit', '50'));
const WSTART = S('work_start', '08:30');
const WEND = S('work_end', '18:00');
const WDAYS = S('work_weekdays', '1,2,3,4,5').split(',').map(Number);

const sessions = new Map();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => (v === null || v === undefined || v === '' ? '—' : 'HK$ ' + Number(v).toLocaleString('en-HK', { maximumFractionDigits: 2 }));

function hkNow() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')];
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}`, weekday: wd, full: `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}` };
}

function workWindowState() {
  const t = hkNow();
  if (S('window_enforced', '1') === '0') return { open: true, why: '示範模式：時間窗已停用' };
  const hol = db.prepare('SELECT name FROM holidays WHERE date=?').get(t.date);
  if (hol) return { open: false, why: `公眾假期（${hol.name}）` };
  if (!WDAYS.includes(t.weekday)) return { open: false, why: '非工作日' };
  if (t.hm < WSTART || t.hm >= WEND) return { open: false, why: '非辦公時間' };
  return { open: true, why: '' };
}

const maskName = (v) => (!v ? '' : String(v).length <= 1 ? String(v) + 'X' : String(v)[0] + 'XX');
const maskPhone = (v) => (!v ? '' : String(v).replace(/[\d]/g, (d, i) => (i < 4 ? d : '*')));

function quotaRow(uid, day) {
  let r = db.prepare('SELECT * FROM quota WHERE user_id=? AND day=?').get(uid, day);
  if (!r) { db.prepare('INSERT INTO quota (user_id,day,used,extra) VALUES (?,?,0,0)').run(uid, day); r = { used: 0, extra: 0 }; }
  return r;
}

function audit(u, action, entity, id, label, shown, masked, via, req) {
  db.prepare(`INSERT INTO audit_log (actor_id,actor_name,actor_role,action,entity,record_id,record_label,fields_shown,masked_fields,ip,ua,via,at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    u.id, u.name, u.role, action, entity, id, label, shown, masked,
    (req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''), req.headers['user-agent'] || '', via, hkNow().full);
}

function notify(msg, detail) {
  db.prepare('INSERT INTO notifications (kind,actor_name,message,detail,at,read) VALUES (?,?,?,?,?,0)')
    .run('quota', '', msg, detail, hkNow().full);
}

function recentSameView(uid, entity, rid) {
  const r = db.prepare(`SELECT at FROM audit_log WHERE actor_id=? AND entity=? AND record_id=? AND action='view' ORDER BY id DESC LIMIT 1`).get(uid, entity, rid);
  if (!r) return false;
  const ts = new Date(String(r.at).replace(' ', 'T') + '+08:00').getTime();
  return Date.now() - ts < 10 * 60 * 1000;
}

const LAYOUT = (title, body, u, extra = '') => `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · 標準滅蟲管理系統</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:"Microsoft JhengHei","PingFang HK",system-ui,sans-serif;background:#f5f6f8;color:#1a1d21;font-size:14px}
.app{display:flex;min-height:100vh}
aside{width:224px;background:#fff;border-right:1px solid #e5e7eb;padding:16px 0;flex:none}
aside .brand{padding:0 18px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #f0f1f3;margin-bottom:10px}
aside .brand b{display:block;color:#111;font-size:15px;margin-bottom:2px}
aside a{display:block;padding:9px 18px;color:#374151;text-decoration:none;font-size:13.5px;border-left:3px solid transparent}
aside a:hover{background:#f7f8fa}aside a.on{background:#eaf5f0;color:#0f6e56;border-left-color:#0f6e56;font-weight:600}
aside .who{margin-top:14px;padding:12px 18px;border-top:1px solid #f0f1f3;font-size:12px;color:#6b7280}
aside .who b{color:#111;display:block;font-size:13px}
main{flex:1;padding:22px 28px;max-width:1180px}
h1{font-size:20px;margin:0 0 4px;font-weight:600}.sub{color:#6b7280;font-size:12.5px;margin-bottom:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 10px;border-bottom:1px solid #eef0f2;text-align:left}
th{background:#fafbfc;color:#6b7280;font-weight:600;font-size:12px;white-space:nowrap}
tr:hover td{background:#fbfcfd}
a.link{color:#0f6e56;text-decoration:none}a.link:hover{text-decoration:underline}
.pill{display:inline-block;padding:1px 8px;border-radius:9px;font-size:11.5px;background:#eef2f7;color:#4b5563}
.pill.g{background:#eaf5f0;color:#0f6e56}.pill.r{background:#fdecec;color:#a32d2d}.pill.y{background:#fdf3e3;color:#a35a00}
.btn{display:inline-block;padding:7px 14px;border-radius:7px;background:#0f6e56;color:#fff;text-decoration:none;font-size:13px;border:0;cursor:pointer}
.btn.ghost{background:#fff;color:#374151;border:1px solid #d8dbe0}
input[type=text],input[type=password],select{padding:7px 10px;border:1px solid #d8dbe0;border-radius:7px;font-size:13px}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpi div{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px}
.kpi b{display:block;font-size:22px;color:#0f6e56}.kpi span{font-size:12px;color:#6b7280}
.muted{color:#9ca3af}
.errbox{max-width:520px;margin:80px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center}
.errbox h2{font-size:17px;margin:0 0 8px}.errbox p{color:#6b7280;font-size:13px;line-height:1.8}
.login{max-width:360px;margin:80px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:26px}
.login h1{font-size:17px;text-align:center;margin-bottom:18px}
.login input{width:100%;margin-bottom:10px}.login .btn{width:100%;text-align:center}
.quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.quick a{flex:1;text-align:center;font-size:11.5px;padding:7px 4px;border:1px solid #d8dbe0;border-radius:7px;color:#374151;text-decoration:none}
.mask{letter-spacing:.5px;color:#6b7280}
</style></head><body><div class="app">
<aside>
  <div class="brand"><b>標準清潔滅蟲</b>公司一站式管理系統</div>
  <a href="/" class="${extra === 'home' ? 'on' : ''}">公告板</a>
  <a href="/customers" class="${extra === 'cust' ? 'on' : ''}">客戶管理</a>
  <a href="/quotations" class="${extra === 'quot' ? 'on' : ''}">報價管理</a>
  <a href="/products" class="${extra === 'prod' ? 'on' : ''}">產品管理</a>
  <a href="/contracts" class="${extra === 'ct' ? 'on' : ''}">合約列表</a>
  <a href="/invoices" class="${extra === 'inv' ? 'on' : ''}">發票管理</a>
  <a href="/receipts" class="${extra === 'rc' ? 'on' : ''}">收據管理</a>
  ${u && (u.role === 'accounting' || u.role === 'management') ? `<a href="/receivables" class="${extra === 'ar' ? 'on' : ''}">應收台賬</a>` : ''}
  ${u && (u.role === 'management') ? `<a href="/admin" class="${extra === 'admin' ? 'on' : ''}">管理後台</a>` : ''}
  ${u ? `<div class="who"><b>${esc(u.name)}</b>${esc(u.email)}<br><span class="pill">${roleName(u.role)}</span> · <a class="link" href="/logout">登出</a></div>` : ''}
</aside><main>${body}</main></div></body></html>`;

const roleName = (r) => ({ management: '管理層', office: '辦公室', front: '前線員工', accounting: '會計' }[r] || r);

function pageLogin(msg = '') {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>登入</title>
<style>body{font-family:"Microsoft JhengHei",system-ui;background:#f5f6f8;margin:0}
.login{max-width:360px;margin:70px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:26px}
h1{font-size:17px;text-align:center;margin:0 0 6px}p.s{text-align:center;color:#9ca3af;font-size:12px;margin:0 0 18px}
input{width:100%;padding:9px 11px;border:1px solid #d8dbe0;border-radius:7px;margin-bottom:10px;font-size:13px;box-sizing:border-box}
button{width:100%;padding:10px;background:#0f6e56;color:#fff;border:0;border-radius:7px;font-size:14px;cursor:pointer}
.quick{display:flex;gap:6px;margin-top:14px}.quick a{flex:1;text-align:center;font-size:11.5px;padding:8px 3px;border:1px solid #d8dbe0;border-radius:7px;color:#374151;text-decoration:none}
.err{background:#fdecec;color:#a32d2d;padding:8px;border-radius:6px;font-size:12.5px;margin-bottom:10px}</style></head><body>
<form class="login" method="post" action="/login">
<h1>標準清潔滅蟲</h1><p class="s">公司一站式管理系統</p>
${msg ? `<div class="err">${esc(msg)}</div>` : ''}
<input name="email" placeholder="電郵" autocomplete="username">
<input name="password" type="password" placeholder="密碼" autocomplete="current-password">
<button>登入</button>
<div class="quick">
  <a href="/demo?as=office">辦公室</a><a href="/demo?as=front">前線</a>
  <a href="/demo?as=accounting">會計</a><a href="/demo?as=management">管理層</a>
</div>
<p class="s" style="margin-top:14px">示範帳號密碼一律 demo1234</p>
</form></body></html>`;
}

function blockPage() {
  return LAYOUT('資料載入中', `<div class="errbox">
    <h2>資料暫時無法載入</h2>
    <p>請稍後再試。<br>已自動通知技術支援。</p>
    <p style="margin-top:18px"><a class="btn ghost" href="/customers">返回</a></p>
  </div>`, null);
}

function send(res, code, html, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(html);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).filter((x) => x[0]));
}

function body(req) {
  return new Promise((res) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => res(Object.fromEntries(new URLSearchParams(d))));
  });
}

function currentUser(req) {
  const c = parseCookies(req);
  const s = sessions.get(c.sid);
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(s.uid);
}

function canSeeAmounts(u) {
  return u.role === 'accounting' || u.role === 'management';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  let u = currentUser(req);

  if (p === '/demo') {
    const as = url.searchParams.get('as');
    const map = { office: 'u-office', front: 'u-front', accounting: 'u-acc', management: 'u-mgmt' };
    const uid = map[as];
    if (uid) {
      const t = crypto.randomBytes(16).toString('hex');
      sessions.set(t, { uid, at: Date.now() });
      res.writeHead(302, { 'Set-Cookie': `sid=${t}; Path=/; HttpOnly`, Location: '/' });
      return res.end();
    }
  }

  if (p === '/login' && req.method === 'GET') return send(res, 200, pageLogin());
  if (p === '/login' && req.method === 'POST') {
    const b = await body(req);
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(b.email || '');
    if (!row) return send(res, 200, pageLogin('帳號或密碼不正確'));
    const [salt, h] = row.pass_hash.split(':');
    const ok = crypto.scryptSync(b.password || '', salt, 32).toString('hex') === h;
    if (!ok) return send(res, 200, pageLogin('帳號或密碼不正確'));
    const t = crypto.randomBytes(16).toString('hex');
    sessions.set(t, { uid: row.id, at: Date.now() });
    res.writeHead(302, { 'Set-Cookie': `sid=${t}; Path=/; HttpOnly`, Location: '/' });
    return res.end();
  }
  if (p === '/logout') {
    const c = parseCookies(req);
    sessions.delete(c.sid);
    res.writeHead(302, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0', Location: '/login' });
    return res.end();
  }
  if (!u) { res.writeHead(302, { Location: '/login' }); return res.end(); }

  const isOffice = u.role === 'office';

// ===== 二期：合約 / 發票 / 收據 / 應收 =====
const P2 = {};

P2.company = {
  name: '標準清潔滅蟲',
  nameEn: 'Standard Pest Control Co.',
  addr: 'Room 302, 3/F, Sunwise Industrial Building, 16-26 Wang Wo Tsai St, Tsuen Wan',
  tel: '(852) 2371 3793',
  fax: '(852) 2370 8369',
  email: 'info@standardcpc.com',
  web: 'https://standardcpc.com',
  wa: '62775666',
};

P2.asset = (p) => {
  try { return 'data:image/' + (p.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(p).toString('base64'); } catch { return ''; }
};
const ASSET_BASE = 'F:/03 Standard CPC DataBase/03. 附件/CompanySettings/698156bdf89286319c6a35be/';
P2.logo = P2.asset(ASSET_BASE + 'company_logo/fc490e725_images.jpg');
P2.sign = P2.asset(ASSET_BASE + 'company_signature/7db4b5a68_2025-12-16091413.png');
P2.stamp = P2.asset(ASSET_BASE + 'company_stamp/92059a759_2025-12-16091434.png');

P2.nextNo = (table, col, prefix, yy, width) => {
  const rows = db.prepare(`SELECT ${col} AS v FROM ${table} WHERE ${col} LIKE ?`).all(prefix + yy + '%');
  let max = 0;
  for (const r of rows) {
    const n = Number(String(r.v).slice((prefix + yy).length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefix + yy + String(max + 1).padStart(width, '0');
};

P2.print = (title, body) => `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page{size:A4;margin:13mm 12mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Microsoft JhengHei","PingFang HK",system-ui,sans-serif;font-size:12px;color:#111;background:#fff;line-height:1.55}
.sheet{width:186mm;margin:0 auto;padding:4mm 0}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f6e56;padding-bottom:9px}
.hd img{height:52px;object-fit:contain}
.co{font-size:10px;color:#3d444a;line-height:1.6;text-align:right}
.co b{font-size:12px;color:#0f6e56}
h1{font-size:19px;letter-spacing:3px;margin:16px 0 2px}
h1 small{font-size:10px;letter-spacing:1px;color:#7b838c;margin-left:8px;font-weight:400}
.meta{display:flex;justify-content:space-between;gap:24px;margin:12px 0 14px;font-size:11px}
.meta .box{border:1px solid #dfe4e2;border-radius:4px;padding:7px 10px;min-width:78mm}
.meta .box div{margin:1px 0}
.meta .kv{min-width:60mm}
.meta table{border:0}.meta td{border:0;padding:1.5px 0;font-size:11px;vertical-align:top}
.meta td:first-child{color:#6b7280;width:26mm}
table.it{width:100%;border-collapse:collapse;margin-top:4px}
table.it th{background:#eef4f1;border:1px solid #cfd8d4;padding:6px 6px;font-size:10.5px;text-align:left;color:#243}
table.it td{border:1px solid #e2e7e5;padding:6px;font-size:11px;vertical-align:top}
.r{text-align:right;white-space:nowrap}
.tot{width:66%;margin-left:auto;margin-top:8px;border-collapse:collapse}
.tot td{border:0;padding:3px 6px;font-size:11.5px}
.tot tr.g td{border-top:1.5px solid #333;font-weight:700;font-size:13px;padding-top:6px}
.terms{margin-top:14px;font-size:10.2px;color:#343a40;line-height:1.75;border-top:1px dashed #cbd2cf;padding-top:8px}
.terms b{color:#111}
.sign{margin-top:22px;display:flex;justify-content:space-between;align-items:flex-end;font-size:10.5px}
.sign .blk{text-align:center}
.sign .line{width:52mm;border-top:1px solid #666;margin-top:26px;padding-top:4px;color:#555}
.sigimg{height:46px}.stamp{height:74px;opacity:.9}
.foot{margin-top:14px;font-size:9.2px;color:#8a9199;text-align:center;border-top:1px solid #eceeed;padding-top:6px}
.noprint{text-align:center;margin:22px}
.noprint button{padding:9px 26px;font-size:13px;background:#0f6e56;color:#fff;border:0;border-radius:6px;cursor:pointer}
@media print{.noprint{display:none}}
</style></head><body><div class="sheet">${body}</div>
<div class="noprint"><button onclick="print()">列印 / 另存為 PDF</button>
<div style="font-size:11px;color:#888;margin-top:8px">列印時選「另存為 PDF」，紙張 A4、邊界預設、勾選「背景圖形」</div></div>
</body></html>`;

P2.head = (title, sub, rightBlock) => `
<div class="hd">
  <div>${P2.logo ? `<img src="${P2.logo}" alt="logo">` : `<div style="font-size:18px;font-weight:700;color:#0f6e56">${P2.company.name}</div>`}</div>
  <div class="co"><b>${P2.company.name}</b><br>${P2.company.addr}<br>
    電話 ${P2.company.tel} · 傳真 ${P2.company.fax}<br>${P2.company.email} · ${P2.company.web}</div>
</div>
<h1>${title}<small>${sub}</small></h1>
${rightBlock}`;

// ---------- 打印：報價單 ----------
if (p.startsWith('/quotations/') && p.endsWith('/print')) {
  const id = decodeURIComponent(p.slice('/quotations/'.length, -'/print'.length));
  const q = db.prepare('SELECT * FROM quotations WHERE id=?').get(id);
  if (!q) return send(res, 404, 'not found');
  if (u.role === 'front') return send(res, 403, 'no');
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(id);
  audit(u, 'print', 'quotations', id, q.number, 'all', '', 'print', req);
  const body = P2.head('報價單', 'QUOTATION', `
  <div class="meta">
    <div class="box">
      <div style="color:#6b7280;font-size:10px;margin-bottom:3px">客戶 CUSTOMER</div>
      <div style="font-size:12.5px;font-weight:600">${esc(q.customer_name)}</div>
      ${q.work_content ? `<div>工程內容：${esc(q.work_content)}</div>` : ''}
    </div>
    <div class="kv"><table>
      <tr><td>報價單號</td><td style="font-weight:600">${esc(q.number)}</td></tr>
      <tr><td>日期</td><td>${esc(q.doc_date)}</td></tr>
      <tr><td>類型</td><td>${esc(q.qtype || '服務')}</td></tr>
      <tr><td>階段</td><td>${esc(q.stage || '已報價')}</td></tr>
    </table></div>
  </div>`);

  const rows = items.map((it, i) => `<tr>
    <td style="width:8mm">${i + 1}</td>
    <td>${esc(it.item_name)}</td>
    <td class="r">${it.quantity || ''}</td>
    <td>${esc(it.unit || '')}</td>
    <td class="r">${money(it.unit_price)}</td>
    <td class="r">${money(it.amount)}</td></tr>`).join('');

  return send(res, 200, P2.print(q.number, body + `
  <table class="it"><thead><tr>
    <th style="width:8mm">#</th><th>項目說明</th><th class="r" style="width:14mm">數量</th>
    <th style="width:14mm">單位</th><th class="r" style="width:26mm">單價</th><th class="r" style="width:28mm">金額</th>
  </tr></thead><tbody>${rows || '<tr><td colspan="6" style="padding:14px;text-align:center;color:#999">無明細</td></tr>'}</tbody></table>
  <table class="tot">
    <tr><td>小計</td><td class="r">${money(q.subtotal)}</td></tr>
    <tr><td>運費</td><td class="r">${money(0)}</td></tr>
    <tr class="g"><td>總金額</td><td class="r">${money(q.total)}</td></tr>
  </table>
  <div class="terms">
    <b>備註</b><br>
    · 本報價單自發出日起 90 天內有效。<br>
    · 報價已包括人手、物料、器械及保險等費用。<br>
    · 所使用之除害劑均為香港漁農自然護理署註冊之有效而安全藥劑。<br>
    · 施工日期及時間以雙方確認為準。
  </div>
  <div class="sign">
    <div class="blk"><div class="sigimg">${P2.sign ? `<img class="sigimg" src="${P2.sign}">` : ''}</div>
      <div class="line">客戶簽署及公司蓋章</div></div>
    <div class="blk"><div class="stamp">${P2.stamp ? `<img class="stamp" src="${P2.stamp}">` : ''}</div>
      <div class="line">${P2.company.name}　授權簽署</div></div>
  </div>
  <div class="foot">${P2.company.name} · ${P2.company.addr} · Tel ${P2.company.tel} · WhatsApp ${P2.company.wa}</div>`));
}

// ---------- 打印：發票 ----------
if (p.startsWith('/invoices/') && p.endsWith('/print')) {
  const id = decodeURIComponent(p.slice('/invoices/'.length, -'/print'.length));
  const v = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!v) return send(res, 404, 'not found');
  if (!canSeeAmounts(u)) return send(res, 403, 'no');
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
  audit(u, 'print', 'invoices', id, v.number, 'all', '', 'print', req);
  const body = P2.head('發票', 'INVOICE', `
  <div class="meta">
    <div class="box">
      <div style="color:#6b7280;font-size:10px;margin-bottom:3px">客戶 CUSTOMER</div>
      <div style="font-size:12.5px;font-weight:600">${esc(v.customer_name)}</div>
      ${v.address ? `<div>${esc(v.address)}</div>` : ''}
      ${v.contact ? `<div>聯絡人：${esc(v.contact)}　${esc(v.tel || '')}</div>` : ''}
    </div>
    <div class="kv"><table>
      <tr><td>發票編號</td><td style="font-weight:600">${esc(v.number)}</td></tr>
      <tr><td>發票日期</td><td>${esc(v.date)}</td></tr>
      <tr><td>到期日</td><td>${esc(v.due_date)}</td></tr>
      <tr><td>客戶 PO</td><td>${esc(v.po_number || '—')}</td></tr>
    </table></div>
  </div>`);
  const rows = items.map((it, i) => `<tr>
    <td style="width:8mm">${i + 1}</td>
    <td style="width:18mm">${esc(it.code || '')}</td>
    <td>${esc(it.name)}${it.description ? `<div style="color:#6b7280;font-size:10px">${esc(it.description)}</div>` : ''}</td>
    <td class="r">${it.quantity || ''}</td><td>${esc(it.unit || '')}</td>
    <td class="r">${money(it.unit_price)}</td><td class="r">${money(it.amount)}</td></tr>`).join('');
  return send(res, 200, P2.print(v.number, body + `
  <table class="it"><thead><tr><th style="width:8mm">#</th><th style="width:18mm">編號</th><th>貨品 / 服務</th>
    <th class="r" style="width:12mm">數量</th><th style="width:12mm">單位</th>
    <th class="r" style="width:24mm">單價</th><th class="r" style="width:26mm">金額</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7" style="padding:14px;text-align:center;color:#999">無明細</td></tr>'}</tbody></table>
  <table class="tot">
    <tr><td>小計</td><td class="r">${money(v.subtotal)}</td></tr>
    <tr><td>運費</td><td class="r">${money(v.freight)}</td></tr>
    <tr class="g"><td>總金額</td><td class="r">${money(v.total)}</td></tr>
    <tr><td>已收款</td><td class="r">${money(v.paid)}</td></tr>
    <tr><td style="color:#a32d2d">應收餘額</td><td class="r" style="color:#a32d2d;font-weight:600">${money(v.balance)}</td></tr>
  </table>
  <div class="terms"><b>付款條款</b>：${esc(v.payment_terms || 'Net 30 days')}<br>
    Payment should be made by CASH or crossed cheque payable to ${P2.company.name}.
    ${v.remarks ? `<br>${esc(String(v.remarks).split('|').join('<br>'))}` : ''}</div>
  <div class="sign">
    <div class="blk"><div class="stamp">${P2.stamp ? `<img class="stamp" src="${P2.stamp}">` : ''}</div>
      <div class="line">${P2.company.name}　授權簽署</div></div>
    <div class="blk"><div class="sigimg"></div><div class="line">客戶簽收</div></div>
  </div>
  <div class="foot">${P2.company.name} · ${P2.company.addr} · Tel ${P2.company.tel} · Fax ${P2.company.fax}</div>`));
}

// ---------- 合約 ----------
if (p === '/contracts') {
  const q = url.searchParams.get('q') || '';
  const where = q ? 'WHERE customer_name LIKE ? OR number LIKE ?' : '';
  const args = q ? [`%${q}%`, `%${q}%`] : [];
  const rows = db.prepare(`SELECT * FROM contracts ${where} ORDER BY start_date DESC LIMIT 100`).all(...args);
  const showAmt = canSeeAmounts(u);
  const body = `
  <h1>合約列表</h1><div class="sub">共 ${db.prepare('SELECT COUNT(*) c FROM contracts').get().c} 份${showAmt ? '' : ' · 合約金額依權限隱藏'}</div>
  <form class="bar" method="get"><input type="text" name="q" value="${esc(q)}" placeholder="搜尋合約編號或客戶" style="width:300px"><button class="btn ghost">搜尋</button></form>
  <div class="card" style="padding:0;overflow:hidden"><table>
  <thead><tr><th>合約編號</th><th>客戶</th><th>工作內容</th><th>合約期</th><th>金額</th><th>狀態</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td><a class="link" href="/contracts/${esc(r.id)}">${esc(r.number)}</a></td>
    <td>${esc(r.customer_name)}</td><td>${esc(r.work_content)}</td>
    <td>${esc(r.start_date)} ~ ${esc(r.end_date)}</td>
    <td>${showAmt ? money(r.total) : '<span class="mask">•••••</span>'}</td>
    <td><span class="pill ${r.status === '生效中' ? 'g' : ''}">${esc(r.status || '—')}</span></td></tr>`).join('')
  || '<tr><td colspan="6" class="muted" style="padding:20px;text-align:center">暫無合約</td></tr>'}
  </tbody></table></div>`;
  return send(res, 200, LAYOUT('合約列表', body, u, 'ct'));
}

if (p.startsWith('/contracts/')) {
  const id = decodeURIComponent(p.slice('/contracts/'.length));
  const c = db.prepare('SELECT * FROM contracts WHERE id=?').get(id);
  if (!c) return send(res, 404, LAYOUT('找不到', '<div class="errbox"><h2>找不到該合約</h2></div>', u));
  audit(u, 'view', 'contracts', id, c.number, 'all', canSeeAmounts(u) ? '' : 'total', 'none', req);
  const invs = db.prepare('SELECT * FROM invoices WHERE customer_name=? ORDER BY date DESC LIMIT 20').all(c.customer_name);
  const body = `
  <h1>${esc(c.number)}</h1><div class="sub">${esc(c.customer_name)} · <span class="pill">${esc(c.status || '')}</span></div>
  <div class="card"><table>
    <tr><th style="width:120px">合約名稱</th><td>${esc(c.name)}</td></tr>
    <tr><th>關聯報價單</th><td>${c.quotation_number ? `<a class="link" href="/quotations?q=${encodeURIComponent(c.quotation_number)}">${esc(c.quotation_number)}</a>` : '—'}</td></tr>
    <tr><th>工作內容</th><td>${esc(c.work_content)}</td></tr>
    <tr><th>工作地點</th><td>${esc(c.work_location)}</td></tr>
    <tr><th>合約期</th><td>${esc(c.start_date)} ~ ${esc(c.end_date)}</td></tr>
    <tr><th>金額</th><td><b>${canSeeAmounts(u) ? money(c.total) : '<span class="mask">•••••</span>'}</b></td></tr>
    <tr><th>客戶 PO</th><td>${esc(c.po_number || '—')}</td></tr>
    <tr><th>付款條款</th><td>${esc(c.payment_terms || '—')}</td></tr>
  </table></div>
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">該客戶最近發票</h3><table>
    <thead><tr><th>發票</th><th>日期</th><th>總額</th><th>餘額</th><th>狀態</th></tr></thead><tbody>
    ${invs.map((v) => `<tr><td><a class="link" href="/invoices/${esc(v.id)}">${esc(v.number)}</a></td><td>${esc(v.date)}</td>
      <td>${canSeeAmounts(u) ? money(v.total) : '<span class="mask">•••••</span>'}</td>
      <td>${canSeeAmounts(u) ? money(v.balance) : '<span class="mask">•••••</span>'}</td>
      <td><span class="pill">${esc(v.status || '')}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:14px;text-align:center">無</td></tr>'}
  </tbody></table></div>`;
  return send(res, 200, LAYOUT(c.number, body, u, 'ct'));
}

// ---------- 發票 ----------
if (p === '/invoices') {
  const q = url.searchParams.get('q') || '';
  const st = url.searchParams.get('st') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const per = 20;
  const conds = []; const args = [];
  if (q) { conds.push('(number LIKE ? OR customer_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (st === 'unpaid') conds.push('balance > 0');
  if (st === 'paid') conds.push('balance <= 0');
  if (st === 'overdue') conds.push("balance > 0 AND due_date < date('now')");
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM invoices ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM invoices ${where} ORDER BY date DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const showAmt = canSeeAmounts(u);
  const sum = db.prepare('SELECT SUM(total) t, SUM(paid) p, SUM(balance) b FROM invoices').get();
  const pill = (s) => `<span class="pill ${s === '已付款' ? 'g' : s === '逾期' ? 'r' : ''}">${esc(s || '—')}</span>`;
  const body = `
  <h1>發票管理</h1><div class="sub">共 ${total.toLocaleString()} 張${showAmt ? '' : ' · 金額依權限隱藏'}</div>
  <div class="kpi">
    <div><b>${showAmt ? money(sum.t) : '•••••'}</b><span>開票總額</span></div>
    <div><b>${showAmt ? money(sum.p) : '•••••'}</b><span>已收款</span></div>
    <div><b style="color:#a32d2d">${showAmt ? money(sum.b) : '•••••'}</b><span>應收餘額</span></div>
    <div><b>${db.prepare("SELECT COUNT(*) c FROM invoices WHERE balance>0 AND due_date < date('now')").get().c}</b><span>逾期張數</span></div>
  </div>
  <form class="bar" method="get">
    <input type="text" name="q" value="${esc(q)}" placeholder="搜尋發票號或客戶" style="width:260px">
    <select name="st">
      <option value="" ${st === '' ? 'selected' : ''}>全部</option>
      <option value="unpaid" ${st === 'unpaid' ? 'selected' : ''}>未收款</option>
      <option value="overdue" ${st === 'overdue' ? 'selected' : ''}>已逾期</option>
      <option value="paid" ${st === 'paid' ? 'selected' : ''}>已收清</option>
    </select>
    <button class="btn ghost">篩選</button></form>
  <div class="card" style="padding:0;overflow:hidden"><table>
  <thead><tr><th>發票編號</th><th>日期</th><th>客戶</th><th>到期日</th><th>總額</th><th>已收</th><th>餘額</th><th>狀態</th></tr></thead><tbody>
  ${rows.map((v) => `<tr><td><a class="link" href="/invoices/${esc(v.id)}">${esc(v.number)}</a></td>
    <td>${esc(v.date)}</td><td>${esc(v.customer_name)}</td><td>${esc(v.due_date)}</td>
    <td>${showAmt ? money(v.total) : '<span class="mask">•••••</span>'}</td>
    <td>${showAmt ? money(v.paid) : '<span class="mask">•••••</span>'}</td>
    <td>${showAmt ? money(v.balance) : '<span class="mask">•••••</span>'}</td>
    <td>${pill(v.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="padding:20px;text-align:center">沒有符合的發票</td></tr>'}
  </tbody></table></div>
  <div class="bar" style="justify-content:center">
    ${page > 1 ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&st=${st}&page=${page - 1}">上一頁</a>` : ''}
    <span class="muted">第 ${page} / ${Math.ceil(total / per) || 1} 頁</span>
    ${page < Math.ceil(total / per) ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&st=${st}&page=${page + 1}">下一頁</a>` : ''}
  </div>`;
  return send(res, 200, LAYOUT('發票管理', body, u, 'inv'));
}

if (p.startsWith('/invoices/') && !p.endsWith('/receipt')) {
  const id = decodeURIComponent(p.slice('/invoices/'.length));
  const v = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!v) return send(res, 404, LAYOUT('找不到', '<div class="errbox"><h2>找不到該發票</h2></div>', u));
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
  const rcs = db.prepare('SELECT * FROM receipts WHERE invoice_id=? ORDER BY date').all(id);
  const showAmt = canSeeAmounts(u);
  audit(u, 'view', 'invoices', id, v.number, 'all', showAmt ? '' : 'total,paid,balance', 'none', req);
  const body = `
  <h1>${esc(v.number)}</h1><div class="sub">${esc(v.customer_name)} · ${esc(v.date)} · <span class="pill">${esc(v.status || '')}</span></div>
  <div class="bar"><a class="btn" href="/invoices/${esc(v.id)}/print" target="_blank">列印 / 出 PDF</a></div>
  <div class="card"><table>
    <tr><th style="width:120px">到期日</th><td>${esc(v.due_date)}</td></tr>
    <tr><th>客戶 PO</th><td>${esc(v.po_number || '—')}</td></tr>
    <tr><th>總金額</th><td><b>${showAmt ? money(v.total) : '<span class="mask">•••••</span>'}</b></td></tr>
    <tr><th>已收款</th><td>${showAmt ? money(v.paid) : '<span class="mask">•••••</span>'}</td></tr>
    <tr><th>應收餘額</th><td>${showAmt ? money(v.balance) : '<span class="mask">•••••</span>'}</td></tr>
    <tr><th>付款條款</th><td>${esc(v.payment_terms || '—')}</td></tr>
  </table></div>
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">明細</h3><table>
    <thead><tr><th>編號</th><th>貨品 / 服務</th><th>數量</th><th>單位</th><th>單價</th><th>金額</th></tr></thead><tbody>
    ${items.map((it) => `<tr><td>${esc(it.code || '')}</td><td>${esc(it.name)}</td><td>${it.quantity}</td>
      <td>${esc(it.unit || '')}</td><td>${showAmt ? money(it.unit_price) : '<span class="mask">•••••</span>'}</td>
      <td>${showAmt ? money(it.amount) : '<span class="mask">•••••</span>'}</td></tr>`).join('')
      || '<tr><td colspan="6" class="muted" style="padding:14px;text-align:center">無明細</td></tr>'}
  </tbody></table></div>
  ${showAmt && v.balance > 0 && (u.role === 'accounting' || u.role === 'management') ? `
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">登記收款</h3>
    <form class="bar" method="post" action="/invoices/${esc(v.id)}/receipt">
      <input type="text" name="amount" value="${v.balance}" style="width:120px" placeholder="金額">
      <select name="method"><option>現金</option><option>支票</option><option>轉帳</option><option>轉數快</option></select>
      <input type="text" name="cheque" placeholder="支票號（選填）" style="width:150px">
      <button class="btn">確認收款</button>
    </form></div>` : ''}
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">收款記錄（${rcs.length}）</h3><table>
    <thead><tr><th>收據號</th><th>日期</th><th>方式</th><th>金額</th></tr></thead><tbody>
    ${rcs.map((r) => `<tr><td>${esc(r.number)}</td><td>${esc(r.date)}</td><td>${esc(r.method || '')}</td>
      <td>${showAmt ? money(r.total) : '<span class="mask">•••••</span>'}</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted" style="padding:14px;text-align:center">尚無收款</td></tr>'}
  </tbody></table></div>`;
  return send(res, 200, LAYOUT(v.number, body, u, 'inv'));
}

// ---------- 收據 ----------
if (p === '/receipts') {
  const q = url.searchParams.get('q') || '';
  const where = q ? 'WHERE customer_name LIKE ? OR number LIKE ? OR invoice_number LIKE ?' : '';
  const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const rows = db.prepare(`SELECT * FROM receipts ${where} ORDER BY date DESC LIMIT 200`).all(...args);
  const showAmt = canSeeAmounts(u);
  const sum = db.prepare('SELECT SUM(total) t, COUNT(*) c FROM receipts').get();
  const body = `
  <h1>收據管理</h1><div class="sub">共 ${sum.c} 張${showAmt ? ` · 合計 ${money(sum.t)}` : ' · 金額依權限隱藏'}</div>
  <form class="bar" method="get"><input type="text" name="q" value="${esc(q)}" placeholder="搜尋收據號、發票號、客戶" style="width:320px"><button class="btn ghost">搜尋</button></form>
  <div class="card" style="padding:0;overflow:hidden"><table>
  <thead><tr><th>收據號</th><th>日期</th><th>對應發票</th><th>客戶</th><th>收款方式</th><th>金額</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${esc(r.number)}</td><td>${esc(r.date)}</td><td>${esc(r.invoice_number || '—')}</td>
    <td>${esc(r.customer_name)}</td><td>${esc(r.method || '—')}${r.cheque_no ? ` · ${esc(r.cheque_no)}` : ''}</td>
    <td>${showAmt ? money(r.total) : '<span class="mask">•••••</span>'}</td></tr>`).join('')
  || '<tr><td colspan="6" class="muted" style="padding:20px;text-align:center">暫無收據</td></tr>'}
  </tbody></table></div>`;
  return send(res, 200, LAYOUT('收據管理', body, u, 'rc'));
}

// ---------- 應收台賬 ----------
if (p === '/receivables') {
  if (u.role !== 'accounting' && u.role !== 'management')
    return send(res, 403, LAYOUT('無權限', '<div class="errbox"><h2>只有會計與管理層可以查看應收台賬</h2></div>', u));
  const rows = db.prepare("SELECT * FROM invoices WHERE balance > 0 ORDER BY due_date").all();
  const today = new Date(hkNow().date);
  const bucket = (due) => {
    const d = Math.floor((today - new Date(due)) / 86400000);
    if (d <= 0) return '未到期';
    if (d <= 30) return '1–30 天';
    if (d <= 60) return '31–60 天';
    if (d <= 90) return '61–90 天';
    return '90 天以上';
  };
  const agg = {};
  for (const r of rows) { const b = bucket(r.due_date); agg[b] = agg[b] || { n: 0, amt: 0 }; agg[b].n++; agg[b].amt += r.balance; }
  const order = ['未到期', '1–30 天', '31–60 天', '61–90 天', '90 天以上'];
  const totalDue = rows.reduce((s, r) => s + r.balance, 0);
  const byCust = {};
  for (const r of rows) { byCust[r.customer_name] = byCust[r.customer_name] || { n: 0, amt: 0 }; byCust[r.customer_name].n++; byCust[r.customer_name].amt += r.balance; }
  const top = Object.entries(byCust).sort((a, b) => b[1].amt - a[1].amt).slice(0, 10);
  const body = `
  <h1>應收台賬</h1><div class="sub">截至 ${hkNow().date} · ${rows.length} 張未收清 · 合計 <b>${money(totalDue)}</b></div>
  <div class="kpi">
    ${order.map((b) => `<div><b style="${b === '90 天以上' ? 'color:#a32d2d' : ''}">${money(agg[b]?.amt || 0)}</b><span>${b}（${agg[b]?.n || 0} 張）</span></div>`).join('')}
  </div>
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">欠款最多的 10 個客戶</h3><table>
    <thead><tr><th>客戶</th><th>張數</th><th>未收金額</th><th>占比</th></tr></thead><tbody>
    ${top.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.n}</td><td>${money(v.amt)}</td>
      <td>${((v.amt / totalDue) * 100).toFixed(1)}%</td></tr>`).join('')}
  </tbody></table></div>
  <div class="card"><h3 style="margin:0 0 10px;font-size:14px">未收清發票（按到期日）</h3><table>
    <thead><tr><th>發票</th><th>客戶</th><th>到期日</th><th>帳齡</th><th>總額</th><th>餘額</th></tr></thead><tbody>
    ${rows.slice(0, 80).map((r) => `<tr><td><a class="link" href="/invoices/${esc(r.id)}">${esc(r.number)}</a></td>
      <td>${esc(r.customer_name)}</td><td>${esc(r.due_date)}</td>
      <td><span class="pill ${bucket(r.due_date) === '90 天以上' ? 'r' : bucket(r.due_date) === '未到期' ? 'g' : 'y'}">${bucket(r.due_date)}</span></td>
      <td>${money(r.total)}</td><td>${money(r.balance)}</td></tr>`).join('')}
  </tbody></table>
  <p class="muted" style="font-size:12px;margin-top:8px">僅顯示前 80 筆，完整清單請用篩選或匯出。</p></div>`;
  return send(res, 200, LAYOUT('應收台賬', body, u, 'ar'));
}
// ===== 二期結束 =====

// ---------- 轉換：報價 → 發票 ----------
if (p.startsWith('/quotations/') && p.endsWith('/to-invoice') && req.method === 'POST') {
  if (u.role === 'front') return send(res, 403, 'no');
  const id = decodeURIComponent(p.slice('/quotations/'.length, -'/to-invoice'.length));
  const q = db.prepare('SELECT * FROM quotations WHERE id=?').get(id);
  if (!q) return send(res, 404, 'no');
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(id);
  const today = hkNow().date;
  const yy = today.slice(2, 4);
  const isProduct = String(q.qtype || '').includes('產品');
  const no = P2.nextNo('invoices', 'number', isProduct ? 'P' : 'S', yy, 5);
  const due = new Date(today + 'T00:00:00Z');
  due.setUTCDate(due.getUTCDate() + 30);
  const dueStr = due.toISOString().slice(0, 10);
  const newId = 'iv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const total = Number(q.total || 0);
  const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(q.customer_id) || {};
  db.prepare(`INSERT INTO invoices (id,number,itype,date,due_date,quotation_id,quotation_number,contract_id,
    customer_id,customer_name,address,tel,contact,po_number,subtotal,freight,total,paid,balance,payment_terms,status,remarks)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    newId, no, isProduct ? '產品' : '服務', today, dueStr, q.id, q.number, '',
    q.customer_id || '', q.customer_name || '', cust.address || '', cust.phone || '', cust.contact || '', '',
    Number(q.subtotal || total), 0, total, 0, total, 'Net 30 days', '草稿', '');
  const insIt = db.prepare('INSERT INTO invoice_items (invoice_id,code,name,description,quantity,unit,unit_price,amount) VALUES (?,?,?,?,?,?,?,?)');
  for (const it of items) insIt.run(newId, '', it.item_name, '', it.quantity, it.unit, it.unit_price, it.amount);
  if (!items.length) insIt.run(newId, '', q.work_content || '服務', '', 1, '項', total, total);
  audit(u, 'create', 'invoices', newId, no, 'from quotation ' + q.number, '', 'convert', req);
  res.writeHead(302, { Location: '/invoices/' + newId });
  return res.end();
}

// ---------- 收款：發票 → 收據 ----------
if (p.startsWith('/invoices/') && p.endsWith('/receipt') && req.method === 'POST') {
  if (u.role === 'front' || u.role === 'office') return send(res, 403, 'no');
  const id = decodeURIComponent(p.slice('/invoices/'.length, -'/receipt'.length));
  const v = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!v) return send(res, 404, 'no');
  const b = await body(req);
  const amt = Number(b.amount || 0);
  if (amt > 0) {
    const today = hkNow().date;
    const no = P2.nextNo('receipts', 'number', 'R', today.slice(2, 4), 4);
    const rid = 'rc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO receipts (id,number,date,invoice_id,invoice_number,customer_name,total,method,cheque_no,bank,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(rid, no, today, v.id, v.number, v.customer_name, amt, b.method || '現金', b.cheque || '', '', '');
    const paid = Number(v.paid || 0) + amt;
    const bal = Math.max(0, Number(v.total || 0) - paid);
    db.prepare('UPDATE invoices SET paid=?, balance=?, status=? WHERE id=?')
      .run(paid, bal, bal <= 0 ? '已付款' : '部分收款', v.id);
    audit(u, 'create', 'receipts', rid, no, 'amount=' + amt, '', 'collect', req);
  }
  res.writeHead(302, { Location: '/invoices/' + v.id });
  return res.end();
}


  if (p === '/') {
    const nc = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
    const nq = db.prepare('SELECT COUNT(*) c FROM quotations').get().c;
    const np = db.prepare('SELECT COUNT(*) c FROM products').get().c;
    const na = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;
    const t = hkNow();
    const w = workWindowState();
    const q = quotaRow(u.id, t.date);
    const body = `
      <h1>公告板</h1><div class="sub">${t.full}（${TZ}） · 登入身分：${esc(u.name)} · ${roleName(u.role)}</div>
      <div class="kpi">
        <div><b>${nc.toLocaleString()}</b><span>客戶</span></div>
        <div><b>${nq.toLocaleString()}</b><span>報價單</span></div>
        <div><b>${np.toLocaleString()}</b><span>產品</span></div>
        <div><b>${na.toLocaleString()}</b><span>審計記錄</span></div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px;font-size:14px">你的存取權限</h3>
        ${isOffice ? `<p style="margin:6px 0">客戶／產品：<span class="pill ${w.open ? 'g' : 'r'}">${w.open ? '可存取' : '不可存取'}</span>
          ${w.open ? '' : `<span class="muted">（${esc(w.why)}）</span>`}
          <br><small class="muted">可存取時段：週一至週五 ${WSTART}–${WEND}，公眾假期除外</small></p>`
        : `<p style="margin:6px 0">客戶／產品：<span class="pill g">不受時間與數量限制</span>（${roleName(u.role)}）</p>`}
        ${roleName(u.role) === '辦公室' ? '' : ''}
      </div>
      ${u.role === 'management' ? `<div class="card"><h3 style="margin:0 0 8px;font-size:14px">管理提示</h3>
        <p style="margin:4px 0">辦公室員工今日已用額度：${q.used} / ${LIMIT + q.extra}
        ${db.prepare('SELECT COUNT(*) c FROM notifications WHERE read=0').get().c ? ` · <a class="link" href="/admin">有新告警</a>` : ''}</p></div>` : ''}`;
    return send(res, 200, LAYOUT('公告板', body, u, 'home'));
  }

  if (p === '/customers') {
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const per = 20;
    const where = q ? `WHERE name LIKE ? OR code LIKE ? OR phone LIKE ?` : '';
    const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const total = db.prepare(`SELECT COUNT(*) c FROM customers ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM customers ${where} ORDER BY name LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
    const masked = isOffice;
    const list = rows.map((r) => `<tr>
      <td><a class="link" href="/customers/${esc(r.id)}">${esc(r.name)}</a>${r.code ? `<br><small class="muted">${esc(r.code)}</small>` : ''}</td>
      <td class="${masked ? 'mask' : ''}">${esc(masked ? maskName(r.contact) : r.contact)}</td>
      <td class="${masked ? 'mask' : ''}">${esc(masked ? maskPhone(r.phone) : r.phone)}</td>
      <td class="${masked ? 'mask' : ''}">${esc(masked ? '—' : r.fax)}</td>
      <td class="${masked ? 'mask' : ''}">${esc(masked ? '—' : r.email)}</td>
      <td><span class="pill">${esc(r.type || '—')}</span></td>
    </tr>`).join('');
    const pages = Math.ceil(total / per);
    const body = `
      <h1>客戶管理</h1><div class="sub">共 ${total.toLocaleString()} 個客戶${masked ? ' · 聯絡資料已按權限遮蔽，點擊客戶名稱可查看完整資料' : ''}</div>
      <form class="bar" method="get"><input type="text" name="q" value="${esc(q)}" placeholder="搜尋客戶名稱、編號、電話" style="width:300px"><button class="btn ghost">搜尋</button></form>
      <div class="card" style="padding:0;overflow:hidden">
      <table><thead><tr><th>客戶名稱</th><th>聯絡人</th><th>電話號碼</th><th>傳真</th><th>電郵</th><th>類型</th></tr></thead>
      <tbody>${list || '<tr><td colspan="6" class="muted" style="padding:24px;text-align:center">沒有符合的客戶</td></tr>'}</tbody></table></div>
      <div class="bar" style="justify-content:center">
        ${page > 1 ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&page=${page - 1}">上一頁</a>` : ''}
        <span class="muted">第 ${page} / ${pages || 1} 頁</span>
        ${page < pages ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&page=${page + 1}">下一頁</a>` : ''}
      </div>`;
    return send(res, 200, LAYOUT('客戶管理', body, u, 'cust'));
  }

  if (p.startsWith('/customers/')) {
    const id = decodeURIComponent(p.slice('/customers/'.length));
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    if (!c) return send(res, 404, LAYOUT('找不到', '<div class="errbox"><h2>找不到該客戶</h2></div>', u));

    if (isOffice) {
      const w = workWindowState();
      const t = hkNow();
      const qr = quotaRow(u.id, t.date);
      if (!w.open) {
        audit(u, 'block_window', 'customers', id, c.name, '', '全部', w.why, req);
        return send(res, 200, blockPage());
      }
      if (!recentSameView(u.id, 'customers', id)) {
        if (qr.used >= LIMIT + qr.extra) {
          audit(u, 'block_quota', 'customers', id, c.name, '', '全部', `quota=${qr.used}`, req);
          notify(`辦公室員工 ${u.name} 触碰額度上限`, `第 ${qr.used + 1} 次請求 · 客戶：${c.name}（${id}）· ${t.full} · IP ${req.socket.remoteAddress}`);
          return send(res, 200, blockPage());
        }
        db.prepare('UPDATE quota SET used=used+1 WHERE user_id=? AND day=?').run(u.id, t.date);
        qr.used++;
      }
      audit(u, 'view', 'customers', id, c.name, 'name,contact,phone,fax,email,address', '列表頁遮蔽', 'auto', req);
    } else {
      audit(u, 'view', 'customers', id, c.name, 'all', '', 'none', req);
    }

    const quotes = db.prepare('SELECT * FROM quotations WHERE customer_id=? ORDER BY doc_date DESC LIMIT 20').all(id);
    const body = `
      <h1>${esc(c.name)}</h1><div class="sub">${esc(c.name_en || '')} ${c.code ? '· ' + esc(c.code) : ''}</div>
      <div class="card">
        <table>
          <tr><th style="width:140px">聯絡人</th><td>${esc(c.contact || '—')}</td></tr>
          <tr><th>電話</th><td>${esc(c.phone || '—')}</td></tr>
          <tr><th>傳真</th><td>${esc(c.fax || '—')}</td></tr>
          <tr><th>電郵</th><td>${esc(c.email || '—')}</td></tr>
          <tr><th>服務地址</th><td>${esc(c.address || '—')}</td></tr>
          <tr><th>客戶類型</th><td><span class="pill">${esc(c.type || '—')}</span></td></tr>
          <tr><th>備註</th><td>${esc(c.notes || '—')}</td></tr>
        </table>
      </div>
      <div class="card">
        <h3 style="margin:0 0 10px;font-size:14px">最近報價（${quotes.length}）</h3>
        <table><thead><tr><th>編號</th><th>日期</th><th>內容</th><th>金額</th><th>階段</th></tr></thead><tbody>
        ${quotes.map((q) => `<tr><td>${esc(q.number)}</td><td>${esc(q.doc_date)}</td><td>${esc(q.work_content)}</td>
          <td>${canSeeAmounts(u) ? money(q.total) : '<span class="mask">•••••</span>'}</td><td><span class="pill">${esc(q.stage || '—')}</span></td></tr>`).join('')
      || '<tr><td colspan="5" class="muted" style="padding:16px;text-align:center">暫無報價記錄</td></tr>'}
        </tbody></table>
      </div>`;
    return send(res, 200, LAYOUT(c.name, body, u, 'cust'));
  }

  if (p === '/quotations') {
    const q = url.searchParams.get('q') || '';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const per = 20;
    const where = q ? `WHERE number LIKE ? OR customer_name LIKE ? OR work_content LIKE ?` : '';
    const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const total = db.prepare(`SELECT COUNT(*) c FROM quotations ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM quotations ${where} ORDER BY doc_date DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
    const showAmt = canSeeAmounts(u);
    const body = `
      <h1>報價管理</h1><div class="sub">共 ${total.toLocaleString()} 張${showAmt ? '' : ' · 金額欄位依權限隱藏'}</div>
      <form class="bar" method="get"><input type="text" name="q" value="${esc(q)}" placeholder="搜尋編號、客戶、工作內容" style="width:320px"><button class="btn ghost">搜尋</button></form>
      <div class="card" style="padding:0;overflow:hidden"><table>
      <thead><tr><th>報價單編號</th><th>日期</th><th>客戶</th><th>工作內容</th><th>總金額</th><th>階段</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a class="link" href="/quotations/${esc(r.id)}">${esc(r.number)}</a></td><td>${esc(r.doc_date)}</td>
        <td>${esc(r.customer_name)}</td><td>${esc(r.work_content)}</td>
        <td>${showAmt ? money(r.total) : '<span class="mask">•••••</span>'}</td>
        <td><span class="pill ${r.stage === '已接受' ? 'g' : ''}">${esc(r.stage || '—')}</span></td></tr>`).join('')}
      </tbody></table></div>
      <div class="bar" style="justify-content:center">
        ${page > 1 ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&page=${page - 1}">上一頁</a>` : ''}
        <span class="muted">第 ${page} / ${Math.ceil(total / per) || 1} 頁</span>
        ${page < Math.ceil(total / per) ? `<a class="btn ghost" href="?q=${encodeURIComponent(q)}&page=${page + 1}">下一頁</a>` : ''}
      </div>`;
    return send(res, 200, LAYOUT('報價管理', body, u, 'quot'));
  }

  if (p.startsWith('/quotations/')) {
    const id = decodeURIComponent(p.slice('/quotations/'.length));
    const q = db.prepare('SELECT * FROM quotations WHERE id=?').get(id);
    if (!q) return send(res, 404, LAYOUT('找不到', '<div class="errbox"><h2>找不到該報價單</h2></div>', u));
    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(id);
    const showAmt = canSeeAmounts(u);
    audit(u, 'view', 'quotations', id, q.number, 'all', showAmt ? '' : 'total,subtotal,item.amount', 'none', req);
    const body = `
      <h1>${esc(q.number)}</h1><div class="sub">${esc(q.customer_name)} · ${esc(q.doc_date)} · <span class="pill">${esc(q.stage || '')}</span></div>
      <div class="bar">
        <a class="btn" href="/quotations/${esc(q.id)}/print" target="_blank">列印 / 出 PDF</a>
        ${u.role !== 'front' ? `<form method="post" action="/quotations/${esc(q.id)}/to-invoice" style="display:inline"
          onsubmit="return confirm('確定依此報價單生成發票？')"><button class="btn ghost">生成發票</button></form>` : ''}
      </div>
      <div class="card"><table>
        <tr><th style="width:120px">工作內容</th><td>${esc(q.work_content)}</td></tr>
        <tr><th>類型</th><td>${esc(q.qtype)}</td></tr>
        <tr><th>小計</th><td>${showAmt ? money(q.subtotal) : '<span class="mask">•••••</span>'}</td></tr>
        <tr><th>總金額</th><td><b>${showAmt ? money(q.total) : '<span class="mask">•••••</span>'}</b></td></tr>
      </table></div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">明細</h3><table>
        <thead><tr><th>項目</th><th>數量</th><th>單位</th><th>單價</th><th>金額</th></tr></thead><tbody>
        ${items.map((it) => `<tr><td>${esc(it.item_name)}</td><td>${it.quantity}</td><td>${esc(it.unit)}</td>
          <td>${money(it.unit_price)}</td><td>${showAmt ? money(it.amount) : '<span class="mask">•••••</span>'}</td></tr>`).join('')
        || '<tr><td colspan="5" class="muted" style="padding:16px;text-align:center">無明細</td></tr>'}
      </tbody></table>
      ${!showAmt ? '<p class="muted" style="font-size:12px;margin-top:10px">單價可見；小計、金額與總額依權限隱藏。</p>' : ''}
      </div>`;
    return send(res, 200, LAYOUT(q.number, body, u, 'quot'));
  }

  if (p === '/products') {
    const q = url.searchParams.get('q') || '';
    const rows = db.prepare(`SELECT * FROM products ${q ? 'WHERE name LIKE ?' : ''} ORDER BY name LIMIT 60`).all(...(q ? [`%${q}%`] : []));
    const body = `
      <h1>產品管理</h1><div class="sub">共 ${db.prepare('SELECT COUNT(*) c FROM products').get().c} 項${isOffice ? ' · 售價可見，成本依權限隱藏' : ''}</div>
      <form class="bar" method="get"><input type="text" name="q" value="${esc(q)}" placeholder="搜尋產品名稱" style="width:280px"><button class="btn ghost">搜尋</button></form>
      <div class="card" style="padding:0;overflow:hidden"><table>
      <thead><tr><th>產品名稱</th><th>編號</th><th>包裝</th><th>零售價</th><th>成本</th><th>庫存</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td>${esc(r.packing)}</td>
        <td>${money(r.retail_price)}</td><td>${canSeeAmounts(u) ? money(r.cost_price) : '<span class="mask">•••••</span>'}</td>
        <td>${r.stock}</td></tr>`).join('')}
      </tbody></table></div>`;
    return send(res, 200, LAYOUT('產品管理', body, u, 'prod'));
  }

  if (p === '/admin') {
    if (u.role !== 'management') return send(res, 403, LAYOUT('無權限', '<div class="errbox"><h2>你沒有權限查看此頁</h2></div>', u));
    const t = hkNow();
    const quotas = db.prepare(`SELECT q.*, u.name FROM quota q JOIN users u ON u.id=q.user_id WHERE q.day=?`).all(t.date);
    const notis = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 20').all();
    const logs = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 40`).all();
    const hols = db.prepare('SELECT * FROM holidays ORDER BY date').all();
    const body = `
      <h1>管理後台</h1><div class="sub">今日（${t.date}） · 額度上限 ${LIMIT} 次／人</div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">時間窗開關</h3>
        <p style="margin:0 0 10px">目前：<span class="pill ${S('window_enforced','1')==='1'?'g':'y'}">${S('window_enforced','1')==='1'?'已啟用（週一至週五 08:30–18:00，公眾假期除外）':'已停用（示範模式）'}</span></p>
        <form method="post" action="/admin/window"><input type="hidden" name="v" value="${S('window_enforced','1')==='1'?'0':'1'}">
        <button class="btn ghost">${S('window_enforced','1')==='1'?'暫停時間窗（方便測試配額）':'重新啟用時間窗'}</button></form></div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">今日查看額度</h3>
        <table><thead><tr><th>員工</th><th>角色</th><th>已用</th><th>追加</th><th>合計上限</th><th>操作</th></tr></thead><tbody>
        ${quotas.map((q) => `<tr><td>${esc(q.name)}</td><td>${esc(q.user_id)}</td><td><b>${q.used}</b></td><td>${q.extra}</td><td>${LIMIT + q.extra}</td>
          <td><form method="post" action="/admin/quota" style="display:inline"><input type="hidden" name="uid" value="${esc(q.user_id)}">
          <input type="hidden" name="day" value="${esc(q.day)}"><input type="number" name="add" value="20" style="width:70px">
          <button class="btn ghost">追加</button></form>
          <form method="post" action="/admin/quota/set" style="display:inline;margin-left:6px">
          <input type="hidden" name="uid" value="${esc(q.user_id)}"><input type="hidden" name="day" value="${esc(q.day)}">
          <input type="number" name="used" value="${q.used}" style="width:70px"><button class="btn ghost">改為</button></form></td></tr>`).join('')
        || '<tr><td colspan="6" class="muted" style="padding:14px">今天還沒有人使用</td></tr>'}
        </tbody></table></div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">告警（${notis.length}）</h3>
        <table><thead><tr><th>時間</th><th>內容</th><th>詳情</th></tr></thead><tbody>
        ${notis.map((n) => `<tr><td>${esc(n.at)}</td><td>${esc(n.message)}</td><td class="muted">${esc(n.detail)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="muted" style="padding:14px">暫無告警</td></tr>'}
        </tbody></table></div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">公眾假期（可編輯）</h3>
        <form class="bar" method="post" action="/admin/holiday">
          <input type="text" name="date" placeholder="2026-11-02" style="width:130px">
          <input type="text" name="name" placeholder="假期名稱" style="width:180px">
          <button class="btn">新增 / 覆蓋</button>
        </form>
        <table><thead><tr><th>日期</th><th>名稱</th><th></th></tr></thead><tbody>
        ${hols.map((h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.name)}</td>
          <td><form method="post" action="/admin/holiday/del" style="display:inline"><input type="hidden" name="date" value="${esc(h.date)}">
          <button class="btn ghost">刪除</button></form></td></tr>`).join('')}
        </tbody></table></div>
      <div class="card"><h3 style="margin:0 0 10px;font-size:14px">最近審計（40 條）</h3>
        <table><thead><tr><th>時間</th><th>誰</th><th>動作</th><th>對象</th><th>顯示欄位</th><th>遮蔽</th></tr></thead><tbody>
        ${logs.map((l) => `<tr><td>${esc(l.at)}</td><td>${esc(l.actor_name)}<br><small class="muted">${esc(l.actor_role)}</small></td>
          <td><span class="pill ${l.action.startsWith('block') ? 'r' : l.action === 'view' ? 'g' : ''}">${esc(l.action)}</span></td>
          <td>${esc(l.record_label)}</td><td class="muted">${esc(l.fields_shown)}</td><td class="muted">${esc(l.masked_fields)}</td></tr>`).join('')}
        </tbody></table></div>`;
    return send(res, 200, LAYOUT('管理後台', body, u, 'admin'));
  }

  if (p === '/admin/quota/set' && req.method === 'POST') {
    if (u.role !== 'management') return send(res, 403, 'no');
    const b = await body(req);
    db.prepare('UPDATE quota SET used=? WHERE user_id=? AND day=?').run(Number(b.used || 0), b.uid, b.day);
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  if (p === '/admin/window' && req.method === 'POST') {
    if (u.role !== 'management') return send(res, 403, 'no');
    const b = await body(req);
    db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('window_enforced', b.v === '1' ? '1' : '0');
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  if (p === '/admin/quota' && req.method === 'POST') {
    if (u.role !== 'management') return send(res, 403, 'no');
    const b = await body(req);
    db.prepare('UPDATE quota SET extra = extra + ? WHERE user_id=? AND day=?').run(Number(b.add || 0), b.uid, b.day);
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  if (p === '/admin/holiday' && req.method === 'POST') {
    if (u.role !== 'management') return send(res, 403, 'no');
    const b = await body(req);
    if (b.date) db.prepare('INSERT OR REPLACE INTO holidays (date,name) VALUES (?,?)').run(b.date, b.name || '自訂假期');
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  if (p === '/admin/holiday/del' && req.method === 'POST') {
    if (u.role !== 'management') return send(res, 403, 'no');
    const b = await body(req);
    db.prepare('DELETE FROM holidays WHERE date=?').run(b.date);
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  send(res, 404, LAYOUT('找不到', '<div class="errbox"><h2>找不到頁面</h2></div>', u));
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  console.log(`本機：  http://127.0.0.1:${PORT}`);
  for (const n of nets) console.log(`同一 WiFi 的手機／同事：  http://${n.address}:${PORT}`);
});
