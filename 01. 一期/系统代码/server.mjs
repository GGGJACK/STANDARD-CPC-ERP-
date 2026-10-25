import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(HERE, 'data.db');
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
