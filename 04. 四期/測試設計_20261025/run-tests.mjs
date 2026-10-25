// 標準清潔滅蟲 ERP · 可執行驗收（零依賴，Node 22+）
// 用法：
//   node run-tests.mjs                # 自動複製 DB、啟動 :3102 隔離服務、跑完清理
//   node run-tests.mjs --keep         # 保留 _run 目錄與日誌
//   node run-tests.mjs --port 3105 --src "..." --out "..."
// 安全：拒絕在 :3000 或正式 DB 上執行；所有寫入都落在 _run 副本。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const SRC = path.resolve(arg('src', 'F:/04 STANDARD CPC SYSTEM/04. 四期/系统代码'));
const OUT = path.resolve(arg('out', HERE));
const PORT = Number(arg('port', '3102'));
const KEEP = argv.includes('--keep');
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now().toString(36);
const RUN = path.join(OUT, '_run_' + STAMP);
if (PORT === 3000) { console.error('拒絕執行：不可對正式埠 3000 跑測試'); process.exit(2); }

const { ENTITIES, NAV } = await import(pathToFileURL(path.join(SRC, 'lib/config.mjs')).href);
const ROLES = ['front', 'office', 'accounting', 'management'];
const ROLE_CN = { front: '前線', office: '辦公室', accounting: '會計', management: '管理層' };
const CUSTOM_PATHS = new Set(['/inventory', '/generalledger', '/attendance', '/checkin', '/serviceplans', '/settings', '/vehicleexpenses']);

const runId = STAMP;
const tag = `QA-${runId}`;
const results = [];
const matrix = { nav: [], access: [], list: [], form: [] };
const evidence = {};

function log(line) { process.stdout.write(line + '\n'); }
function record({ id, module, title, priority = 'P1', type = '功能', pass, expected = '', actual = '', ms = 0, detail = '' }) {
  results.push({ id, module, title, priority, type, pass: !!pass, expected, actual: String(actual || ''), ms, detail: String(detail || '') });
  log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${title}${pass ? '' : '  — ' + String(actual || '').slice(0, 220)}`);
}

const setup = () => {
  if (!fs.existsSync(path.join(SRC, 'server.mjs'))) throw new Error('找不到 server.mjs：' + SRC);
  fs.mkdirSync(path.join(RUN, 'uploads'), { recursive: true });
  // 一致性快照：VACUUM INTO 會把 WAL 內已提交資料一併寫入，避免 db+wal 非原子複製得到半舊快照
  const dest = path.join(RUN, 'data.db');
  try {
    const src = new DatabaseSync(path.join(SRC, 'data.db'), { readOnly: true });
    src.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    src.close();
  } catch (error) {
    console.warn('VACUUM INTO 失敗，回退為複製 db + wal：' + error.message);
    for (const suffix of ['', '-wal']) {
      const from = path.join(SRC, 'data.db' + suffix);
      const to = path.join(RUN, 'data.db' + suffix);
      if (fs.existsSync(from)) fs.copyFileSync(from, to);
    }
  }

  log(`隔離副本：${path.join(RUN, 'data.db')}`);
};

let child;
let db;
const jars = {};
const csrfCache = {};

async function waitForServer(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/login');
      if (res.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function login(role, slot = role) {
  const res = await fetch(BASE + '/demo?as=' + role, { redirect: 'manual' });
  const cookies = res.headers.getSetCookie?.() || [];
  const sid = cookies.map((c) => /^sid=([^;]+)/.exec(c)?.[1]).find(Boolean);
  jars[slot] = sid ? `sid=${sid}` : '';
  return { status: res.status, sid: sid || '', setCookie: cookies[0] || '' };
}

async function req(role, p, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (role && jars[role]) headers.cookie = jars[role];
  const started = Date.now();
  const res = await fetch(BASE + p, { redirect: 'manual', ...options, headers });
  const text = options.method === 'HEAD' ? '' : await res.text();
  return { status: res.status, text, location: res.headers.get('location') || '', headers: res.headers, ms: Date.now() - started };
}

async function csrf(role) {
  if (csrfCache[role]) return csrfCache[role];
  const r = await req(role, '/mywork');
  csrfCache[role] = /<meta name="csrf" content="([^"]+)"/.exec(r.text)?.[1] || '';
  return csrfCache[role];
}

async function post(role, p, fields) {
  const token = await csrf(role);
  return req(role, p, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ __csrf: token, ...fields }).toString(),
  });
}

function basePayload(key, overrides = {}) {
  const cfg = ENTITIES[key];
  const out = { __id: '', __back: '', __new_id: '' };
  for (const f of cfg.fields) {
    out[f.name] = ['items', 'files', 'picks'].includes(f.type) ? '[]' : f.type === 'checkbox' ? '0' : '';
  }
  return { ...out, ...overrides };
}

function rowPayload(role, key, row, overrides = {}) {
  const cfg = ENTITIES[key];
  const out = { __csrf: csrfCache[role], __id: row.id, __expected_updated: row.updated_date || '', __back: '', __new_id: '' };
  for (const f of cfg.fields) {
    const v = row[f.name];
    if (['items', 'files', 'picks'].includes(f.type)) out[f.name] = JSON.stringify(Array.isArray(v) ? v : v ? [v] : []);
    else if (f.type === 'checkbox') out[f.name] = v ? '1' : '0';
    else out[f.name] = v === null || v === undefined ? '' : String(v);
  }
  return { ...out, ...overrides };
}

function rowOf(key, id) {
  const cfg = ENTITIES[key];
  const r = db.prepare('SELECT data,deleted FROM records WHERE entity=? AND id=?').get(cfg.entity, String(id));
  return r ? { ...JSON.parse(r.data), __deleted: !!r.deleted } : null;
}
function countOf(key) {
  return db.prepare('SELECT COUNT(*) c FROM records WHERE entity=?').get(ENTITIES[key].entity).c;
}
function idFrom(location) {
  try { return decodeURIComponent(String(location).split('?')[0].split('/').pop()); } catch { return ''; }
}
function htmlHas(html, text) { return String(html).includes(text); }
function sidebar(html) { return (/<aside[\s\S]*?<\/aside>/.exec(html) || [''])[0]; }
function stripTags(s) { return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

const X = {};

async function run() {
  // ── 啟動 ─────────────────────────────
  await check('SYS-01', 'SYS', '冷啟動與登入頁', 'P0', '功能', async () => {
    const r = await req(null, '/login');
    return { pass: r.status === 200 && htmlHas(r.text, '登入'), expected: '200 且含登入表單', actual: `status=${r.status}` };
  });
  await check('SYS-03', 'SYS', '未知路由錯誤頁', 'P1', '異常', async () => {
    await login('office', 'sysOffice');
    const a = await req('sysOffice', '/no-such-page');
    const b = await req('sysOffice', '/view/customers/not-exist');
    delete jars.sysOffice;
    return { pass: a.status === 404 && b.status === 404 && !/at .*\.mjs:\d+/.test(a.text), expected: '404 錯誤頁、無堆疊', actual: `${a.status}/${b.status}` };
  });
  const beforeTotal = db.prepare('SELECT COUNT(*) c FROM records').get().c;
  await check('SYS-04', 'SYS', '測試環境不自動匯入', 'P1', '資料', async () => {
    const after = db.prepare('SELECT COUNT(*) c FROM records').get().c;
    return { pass: after >= beforeTotal && Math.abs(after - beforeTotal) < 50, expected: '啟動不批量改寫資料', actual: `${beforeTotal} → ${after}` };
  });

  // ── 認證 ─────────────────────────────
  await check('AUTH-01', 'AUTH', '四角色登入與會話', 'P0', '功能', async () => {
    const bad = [];
    for (const role of ROLES) {
      const l = await login(role);
      const r = await req(role, '/mywork');
      if (!l.sid || r.status !== 200) bad.push(`${role}:${l.status}/${r.status}`);
    }
    return { pass: !bad.length, expected: '四角色均有 sid 且 /mywork 200', actual: bad.join(',') || 'OK' };
  });
  for (const role of ROLES) await csrf(role);
  await check('AUTH-02', 'AUTH', '未登入訪問受保護頁', 'P0', '權限', async () => {
    const a = await req(null, '/customers');
    const b = await req(null, '/receivables');
    return { pass: a.status === 302 && b.status === 302 && a.location.includes('/login'), expected: '302 → /login', actual: `${a.status} ${a.location}` };
  });
  await check('AUTH-03', 'AUTH', '未登入提交寫操作', 'P0', '安全', async () => {
    const before = countOf('customers');
    const r = await req(null, '/save/customers', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'customer_name=x' });
    return { pass: r.status === 401 && countOf('customers') === before, expected: '401 且不落庫', actual: `${r.status}, ${before}→${countOf('customers')}` };
  });
  await check('AUTH-04', 'AUTH', 'CSRF 缺失與錯誤', 'P0', '安全', async () => {
    const before = countOf('customers');
    const a = await req('office', '/save/customers', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'customer_name=NO_CSRF' });
    const b = await req('office', '/save/customers', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `__csrf=WRONG&customer_name=BAD_CSRF` });
    return { pass: a.status === 403 && b.status === 403 && countOf('customers') === before, expected: '403 / 403、筆數不變', actual: `${a.status}/${b.status}, ${before}→${countOf('customers')}` };
  });
  await check('AUTH-05', 'AUTH', '錯誤密碼鎖定', 'P1', '異常', async () => {
    const email = `qa-lock-${runId}@example.com`;
    const codes = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await req(null, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'wrong' }).toString() });
      codes.push(r.status);
    }
    return { pass: codes[5] === 429, expected: '第 6 次 429', actual: codes.join(',') };
  });
  await check('AUTH-06', 'AUTH', '登出使舊會話失效', 'P0', '功能', async () => {
    const l = await login('office', 'tempOffice');
    const out = await req('tempOffice', '/logout');
    const after = await req('tempOffice', '/mywork');
    delete jars.tempOffice;
    return { pass: out.status === 302 && after.status === 302, expected: '登出 302、舊 sid 再訪問 302', actual: `${out.status}/${after.status}` };
  });
  await check('AUTH-07', 'AUTH', '會話 Cookie 安全旗標', 'P1', '安全', async () => {
    const l = await login('office', 'flagOffice');
    delete jars.flagOffice;
    const c = l.setCookie || '';
    const ok = /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c) && /Path=\//.test(c);
    return { pass: ok, expected: 'HttpOnly + SameSite=Lax + Path=/', actual: c };
  });

  // ── 權限：菜單 / 直鏈 / 實體矩陣 ─────────────
  for (const role of ROLES) {
    const page = await req(role, '/mywork');
    const side = sidebar(page.text);
    const hrefs = new Set([...side.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1].split('?')[0]));
    const mismatches = [];
    for (const group of NAV) {
      for (const item of group.items) {
        const expected = item.roles.includes(role);
        const actual = hrefs.has(item.path);
        matrix.nav.push({ role, path: item.path, label: item.label, group: group.group, expected, actual });
        if (expected !== actual) mismatches.push(`${item.path}(期望${expected ? '顯示' : '隱藏'})`);
      }
    }
    record({ id: 'PERM-01', module: 'PERM', title: `菜單可見性 · ${ROLE_CN[role]}`, priority: 'P0', type: '權限', pass: !mismatches.length, expected: 'NAV.roles 完全一致', actual: mismatches.slice(0, 6).join('、') || 'OK', detail: `${NAV.reduce((n, g) => n + g.items.length, 0)} 項` });
  }

  for (const role of ROLES) {
    const security = []; const availability = [];
    for (const group of NAV) {
      for (const item of group.items) {
        const allowed = item.roles.includes(role);
        const r = await req(role, item.path);
        // 公告頁為全員可讀（菜單只給管理層用於管理），直鏈 200 不算越權
        const pass = item.path === '/announcements' ? r.status === 200 : allowed ? r.status === 200 : r.status === 403;
        matrix.access.push({ role, path: item.path, label: item.label, allowed, status: r.status, pass });
        if (!pass && !allowed) security.push(`${item.path}=${r.status}(應403)`);
        else if (!pass) availability.push(`${item.path}=${r.status}(應200)`);
      }
    }
    record({ id: 'PERM-02', module: 'PERM', title: `直鏈越權攔截 · ${ROLE_CN[role]}`, priority: security.length ? 'P0' : 'P1', type: '權限', pass: !security.length, expected: '無權頁面必須 403', actual: security.slice(0, 6).join('、') || 'OK', detail: `${NAV.reduce((n, g) => n + g.items.length, 0)} 頁` });
    if (availability.length) record({ id: 'PERM-06', module: 'PERM', title: `菜單可用性 · ${ROLE_CN[role]}`, priority: 'P1', type: '權限', pass: false, expected: '菜單可見頁面必須 200', actual: availability.slice(0, 6).join('、') });
  }

  for (const role of ROLES) {
    const lf = []; const ff = [];
    for (const [key, cfg] of Object.entries(ENTITIES)) {
      if (!CUSTOM_PATHS.has(cfg.listPath)) {
        const expect = cfg.viewRoles.includes(role) ? 200 : 403;
        const r = await req(role, cfg.listPath);
        matrix.list.push({ role, key, path: cfg.listPath, expected: expect, status: r.status, pass: r.status === expect });
        if (r.status !== expect) lf.push(`${key}@${cfg.listPath}=${r.status}/${expect}`);
      }
      const eExpect = cfg.editRoles.includes(role) ? 200 : 403;
      const e = await req(role, '/new/' + key);
      matrix.form.push({ role, key, expected: eExpect, status: e.status, pass: e.status === eExpect });
      if (e.status !== eExpect) ff.push(`${key}=${e.status}/${eExpect}`);
    }
    const listSecurity = lf.some((x) => /=\d+\/403/.test(x));
    const formSecurity = ff.some((x) => /=200\/403$/.test(x));
    record({ id: 'PERM-03', module: 'PERM', title: `實體列表權限 · ${ROLE_CN[role]}`, priority: listSecurity ? 'P0' : 'P1', type: '權限', pass: !lf.length, expected: 'viewRoles 決定 200/403', actual: lf.slice(0, 6).join('、') || 'OK' });
    record({ id: 'PERM-03', module: 'PERM', title: `實體表單權限 · ${ROLE_CN[role]}`, priority: 'P2', type: '權限', pass: !ff.length, expected: 'editRoles 決定 200/403', actual: ff.slice(0, 6).join('、') || 'OK' });
  }

  await check('PERM-04', 'PERM', '動作級權限（審批/匯出）', 'P0', '權限', async () => {
    const f = await req('front', '/export/customers.csv');
    const o = await req('office', '/export/customers.csv');
    const m = await req('management', '/export/customers.csv');
    return { pass: f.status === 403 && o.status === 403 && m.status === 200, expected: 'front/office 403，management 200', actual: `${f.status}/${o.status}/${m.status}` };
  });
  await check('PERM-05', 'PERM', '回收桶角色邊界', 'P1', '權限', async () => {
    const [f, a, o, m] = await Promise.all([req('front', '/trash'), req('accounting', '/trash'), req('office', '/trash'), req('management', '/trash')]);
    return { pass: f.status === 403 && a.status === 403 && o.status === 200 && m.status === 200, expected: 'front/acc 403，office/mgmt 200', actual: `${f.status}/${a.status}/${o.status}/${m.status}` };
  });
  // SEC-01：選擇器是表單入口，不能成為繞過實體權限的第二條路
  await check('PERM-07', 'PERM', '選擇器不得繞過實體權限', 'P0', '權限', async () => {
    const parse = (r) => { try { return JSON.parse(r.text); } catch { return []; } };
    const [fc, fp, op, mp, fe] = await Promise.all([
      req('front', '/api/pick?source=customers&limit=5'),
      req('front', '/api/pick?source=products&limit=5'),
      req('office', '/api/pick?source=products&limit=5'),
      req('management', '/api/pick?source=products&limit=5'),
      req('front', '/api/pick?source=employees&limit=5'),
    ]);
    const officeRows = parse(op); const mgmtRows = parse(mp); const frontRows = parse(fp);
    const leak = officeRows.some((x) => x.fill && Object.hasOwn(x.fill, 'cost_price'));
    const mgmtHas = mgmtRows.some((x) => x.fill && Object.hasOwn(x.fill, 'cost_price'));
    const frontLeak = frontRows.some((x) => x.fill && Object.hasOwn(x.fill, 'cost_price'));
    const audited = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='pick'").get().c;
    return {
      pass: fc.status === 403 && fp.status === 200 && !frontLeak && op.status === 200 && !leak && mgmtHas && fe.status === 200 && audited >= 3,
      expected: 'front→customers 403；front→products 200 但無 cost_price（補給要選產品）；office 無 cost_price；mgmt 有；front→employees 200；每次調用留審計',
      actual: `${fc.status}/${fp.status} frontLeak=${frontLeak} officeLeak=${leak} mgmt=${mgmtHas} emp=${fe.status} audit=${audited}`,
    };
  });
  // SEC-02：屏蔽必須做在序列化層，不能只做在 renderValue
  await check('PERM-08', 'PERM', '編輯表單金額掩碼', 'P0', '權限', async () => {
    const q = db.prepare('SELECT data FROM records WHERE entity=? AND deleted=0').all('Quotation')
      .map((r) => JSON.parse(r.data)).find((d) => Number(d.total_amount) > 0);
    if (!q) return { pass: false, expected: '庫內應有帶金額的報價', actual: '無樣本' };
    const amount = String(q.total_amount);
    const [o, m] = await Promise.all([
      req('office', '/edit/quotations/' + q.id),
      req('management', '/edit/quotations/' + q.id),
    ]);
    const visible = [...o.text.matchAll(/<input[^>]*>/g)].map((x) => x[0])
      .filter((tag) => tag.includes(`value="${amount}"`) && !/type="hidden"/.test(tag));
    const masked = o.text.includes('•••••');
    const hiddenKeeps = o.text.includes(`name="total_amount" value="${amount}"`);
    return {
      pass: o.status === 200 && !visible.length && masked && hiddenKeeps && m.text.includes(`value="${amount}"`),
      expected: 'office 可見控件無明文、有佔位符、hidden 保值；management 見真實金額',
      actual: `office ${o.status} 明文=${visible.length} 佔位=${masked} hidden=${hiddenKeeps} mgmt=${m.text.includes(`value="${amount}"`)}`,
    };
  });

  // ── 客戶 ─────────────────────────────
  await check('CUS-01', 'CUS', '新增客戶必填校驗', 'P0', '異常', async () => {
    const before = countOf('customers');
    const r = await post('office', '/save/customers', basePayload('customers', { customer_name: '' }));
    return { pass: r.status === 400 && htmlHas(r.text, '請填寫必填欄位：客戶名稱') && countOf('customers') === before, expected: '400 + 必填提示、不落庫', actual: `${r.status}, ${before}→${countOf('customers')}` };
  });
  await check('CUS-02', 'CUS', '新增客戶成功', 'P0', '功能', async () => {
    const r = await post('office', '/save/customers', basePayload('customers', { customer_name: `${tag}-客戶`, customer_type: '標準', phone: '2123 4567', service_address: '香港測試地址 1 號' }));
    const id = idFrom(r.location); X.customerId = id;
    const row = id && rowOf('customers', id);
    return { pass: r.status === 302 && row && row.customer_name === `${tag}-客戶` && row.phone === '2123 4567', expected: '302 → 詳情、DB 一致', actual: `${r.status} ${r.location}` };
  });
  await check('CUS-03', 'CUS', '客戶搜尋', 'P1', '功能', async () => {
    const r = await req('office', '/customers?q=' + encodeURIComponent(tag));
    return { pass: r.status === 200 && htmlHas(r.text, `${tag}-客戶`), expected: '列表命中新客戶', actual: `status=${r.status}` };
  });
  await check('CUS-04', 'CUS', '編輯保留未提交欄位', 'P1', '資料', async () => {
    const row = rowOf('customers', X.customerId);
    const r = await post('office', '/save/customers', rowPayload('office', 'customers', row, { phone: '9999 0000' }));
    const after = rowOf('customers', X.customerId);
    return { pass: r.status === 302 && after.phone === '9999 0000' && after.customer_name === row.customer_name, expected: '電話更新、名稱不變', actual: `${after.phone} / ${after.customer_name}` };
  });
  await check('CUS-05', 'CUS', '客戶詳情聚合', 'P1', '功能', async () => {
    const r = await req('office', '/view/customers/' + X.customerId);
    return { pass: r.status === 200 && htmlHas(r.text, `${tag}-客戶`) && htmlHas(r.text, '總報價'), expected: '200 + KPI/資料', actual: `status=${r.status}` };
  });
  await check('CUS-06', 'CUS', '前線不可看客戶詳情', 'P0', '權限', async () => {
    const r = await req('front', '/view/customers/' + X.customerId);
    return { pass: r.status === 403 && !htmlHas(r.text, '2123 4567'), expected: '403、不泄露電話', actual: `status=${r.status}` };
  });

  // ── 報價 ─────────────────────────────
  await check('QUO-01', 'QUO', '報價自動編號', 'P0', '功能', async () => {
    const r = await post('office', '/save/quotations', basePayload('quotations', {
      quotation_type: '服務', customer_name: `${tag}-客戶`, customer_type: '標準', work_content: '滅蟲服務', service_location: '測試地點',
      work_unit_name: '測試單位', items: JSON.stringify([{ item_name: '服務費', quantity: 2, unit_price: 100, discount: 10, unit: '次' }]),
      freight_charges: '20',
    }));
    const id = idFrom(r.location); X.quotationId = id;
    const row = id && rowOf('quotations', id);
    evidence.quotation = row;
    return { pass: r.status === 302 && /^SQP-\d{4}-\d{4}$/.test(row?.quotation_number || ''), expected: 'SQP-YYYY-####', actual: row?.quotation_number || r.status };
  });
  await check('QUO-02', 'QUO', '報價明細與總額', 'P0', '資料', async () => {
    const row = rowOf('quotations', X.quotationId);
    // 整單折扣已從表單移除（施工順序表 T0-5，歷史 0 使用；欄位仍留在 JSON 裡兼容舊資料），
    // 所以總額 = 小計 + 運費，不再減表頭折扣。行級 Disc 保留。
    return { pass: row.subtotal === 190 && row.total_amount === 210 && row.items?.[0]?.total === 190, expected: '小計 190、總額 190+20=210', actual: `${row.subtotal}/${row.total_amount}` };
  });
  await check('QUO-03', 'QUO', '報價必填與空明細', 'P0', '異常', async () => {
    const a = await post('office', '/save/quotations', basePayload('quotations', { quotation_type: '服務', customer_type: '標準', work_content: 'x', items: JSON.stringify([{ quantity: 1, unit_price: 1 }]) }));
    const b = await post('office', '/save/quotations', basePayload('quotations', { quotation_type: '服務', customer_name: 'x', customer_type: '標準', work_content: 'x', items: '[]' }));
    return { pass: a.status === 400 && b.status === 400, expected: '缺客戶 400、空明細 400', actual: `${a.status}/${b.status}` };
  });
  await check('QUO-04', 'QUO', '報價階段與成交', 'P1', '功能', async () => {
    const ok = await post('office', '/quotations/' + X.quotationId + '/stage', { stage: '已成交' });
    const row = rowOf('quotations', X.quotationId);
    const bad = await post('office', '/quotations/' + X.quotationId + '/stage', { stage: '亂填' });
    return { pass: ok.status === 302 && row.accepted === true && !!row.accepted_date && bad.status === 400, expected: '成交標記 + 非法值 400', actual: `${ok.status}/${bad.status}, accepted=${row.accepted}` };
  });
  await check('QUO-05', 'QUO', '報價轉採購單', 'P1', '功能', async () => {
    const r = await post('office', '/quotations/' + X.quotationId + '/to-po', {});
    const id = idFrom(r.location); X.poFromQuotationId = id;
    const po = id && rowOf('purchase_orders', id);
    const q = rowOf('quotations', X.quotationId);
    const ok = r.status === 302 && po && po.quotation_id === q.id && po.customer_name === q.customer_name && Number(po.total_amount) === Number(q.total_amount) && !!po.po_number;
    return { pass: !!ok, expected: 'PO 關聯報價、金額一致、PO 編號非空', actual: `status=${r.status}, po_number=${po?.po_number || '空'}, po_name=${po?.po_name || '空'}` };
  });
  await check('QUO-06', 'QUO', '報價轉合約', 'P0', '功能', async () => {
    const r = await post('office', '/quotations/' + X.quotationId + '/to-contract', {});
    const id = idFrom(r.location); X.contractFromQuotationId = id;
    const ct = id && rowOf('contracts', id);
    const q = rowOf('quotations', X.quotationId);
    return { pass: r.status === 302 && ct.quotation_id === q.id && ct.contract_number === q.quotation_number && String(ct.contract_name).includes(q.customer_name), expected: '合約關聯、編號沿用、名稱含客戶', actual: `${ct?.contract_number} / ${ct?.contract_name}` };
  });
  await check('QUO-07', 'QUO', '重複轉換冪等', 'P1', '異常', async () => {
    const before = countOf('purchase_orders');
    const r = await post('office', '/quotations/' + X.quotationId + '/to-po', {});
    const after = countOf('purchase_orders');
    return { pass: idFrom(r.location) === X.poFromQuotationId && after === before, expected: '同一 PO、筆數不變', actual: `${idFrom(r.location)} / ${before}→${after}` };
  });
  await check('QUO-08', 'QUO', '報價軟刪除與回收桶', 'P1', '資料', async () => {
    const del = await post('office', '/delete/quotations/' + X.quotationId, {});
    const row = rowOf('quotations', X.quotationId);
    const trash = await req('office', '/trash?module=quotations');
    const restore = await post('office', '/trash/restore', { key: 'quotations', id: X.quotationId });
    const back = rowOf('quotations', X.quotationId);
    return { pass: del.status === 302 && row.__deleted && !!row.deleted_at && htmlHas(trash.text, `${tag}-客戶`) && !back.__deleted, expected: 'deleted=1 + 回收桶可見 + 還原', actual: `${del.status}, deleted=${row.__deleted}, restore=${restore.status}` };
  });

  // ── 採購單 ───────────────────────────
  await check('PO-01', 'PO', 'PO 自動編號與名稱', 'P0', '功能', async () => {
    const r = await post('office', '/save/purchase_orders', basePayload('purchase_orders', { po_number: `PO-${tag}`, customer_name: `${tag}-客戶`, work_unit_name: '測試單位', work_content: '滅蟲', po_date: '2026-10-25' }));
    const id = idFrom(r.location); X.poId = id;
    const row = id && rowOf('purchase_orders', id);
    return { pass: r.status === 302 && row?.po_number === `PO-${tag}` && String(row?.po_name || '').includes('測試單位'), expected: '編號保存 + 名稱自動含單位', actual: `${row?.po_number} / ${row?.po_name}` };
  });
  await check('PO-02', 'PO', 'PO 必填校驗', 'P0', '異常', async () => {
    const a = await post('office', '/save/purchase_orders', basePayload('purchase_orders', { po_number: `PO-X-${tag}`, customer_name: '' }));
    return { pass: a.status === 400, expected: '400', actual: a.status };
  });
  await check('PO-03', 'PO', 'PO 金額含稅', 'P0', '資料', async () => {
    const r = await post('office', '/save/purchase_orders', basePayload('purchase_orders', { po_number: `PO-Y-${tag}`, customer_name: `${tag}-客戶`, items: JSON.stringify([{ quantity: 2, unit_price: 300, discount: 0 }]), tax_amount: '50' }));
    const row = rowOf('purchase_orders', idFrom(r.location));
    return { pass: row.subtotal === 600 && row.total_amount === 650, expected: '600 / 650', actual: `${row.subtotal}/${row.total_amount}` };
  });
  await check('PO-04', 'PO', 'PO 詳情行操作', 'P1', '功能', async () => {
    const r = await req('office', '/view/purchase_orders/' + X.poId);
    return { pass: r.status === 200 && htmlHas(r.text, '由 PO 新增送貨單') && htmlHas(r.text, 'poId=' + X.poId), expected: '詳情含送貨/發票/排班入口', actual: `status=${r.status}` };
  });
  await check('PO-05', 'PO', 'PO 軟刪除與還原', 'P1', '資料', async () => {
    await post('office', '/delete/purchase_orders/' + X.poId, {});
    const del = rowOf('purchase_orders', X.poId);
    const restore = await post('office', '/trash/restore', { key: 'purchase_orders', id: X.poId });
    const back = rowOf('purchase_orders', X.poId);
    return { pass: del.__deleted && !back.__deleted && restore.status === 302, expected: '刪除→還原', actual: `${del.__deleted}/${back.__deleted}` };
  });
  await check('PO-06', 'PO', 'PO 簽署連結', 'P1', '功能', async () => {
    const r = await post('office', '/purchase_orders/' + X.poId + '/share', {});
    const row = rowOf('purchase_orders', X.poId);
    const sign = row.signing_link ? await req(null, row.signing_link) : { status: 0 };
    return { pass: r.status === 302 && row.signing_status === '待簽署' && sign.status === 200, expected: '待簽署 + 連結可開', actual: `${row.signing_status} / ${sign.status}` };
  });
  await check('PO-07', 'PO', '由 PO 新增送貨單預填', 'P1', '功能', async () => {
    const r = await req('office', '/new/delivery_notes?poId=' + X.poId);
    return { pass: r.status === 200 && htmlHas(r.text, `${tag}-客戶`), expected: '表單預填客戶/PO', actual: `status=${r.status}` };
  });

  // ── 合約 ─────────────────────────────
  await check('CON-01', 'CON', '合約必填與編號', 'P0', '功能', async () => {
    const blank = await post('office', '/save/contracts', basePayload('contracts', { contract_number: '', customer_name: `${tag}-客戶` }));
    const r = await post('office', '/save/contracts', basePayload('contracts', { contract_number: `C-${tag}`, customer_name: `${tag}-客戶`, contract_start_date: '2026-11-01' }));
    const id = idFrom(r.location); X.contractId = id;
    const row = id && rowOf('contracts', id);
    return { pass: blank.status === 400 && r.status === 302 && row.contract_number === `C-${tag}`, expected: '留空 400、填值成功', actual: `${blank.status}/${r.status}` };
  });
  await check('CON-02', 'CON', '合約名稱自動生成', 'P1', '功能', async () => {
    const row = rowOf('contracts', X.contractId);
    const expected = `C2-${tag}_${tag}-客戶_九龍測試地點_滅蟲服務`;
    const r = await post('office', '/save/contracts', basePayload('contracts', { contract_number: `C2-${tag}`, customer_name: `${tag}-客戶`, work_location: '九龍測試地點', work_content: '滅蟲服務' }));
    const row2 = rowOf('contracts', idFrom(r.location));
    return { pass: row2.contract_name === expected, expected, actual: row2.contract_name };
  });
  await check('CON-03', 'CON', '合約 13 欄彈窗', 'P1', 'UI', async () => {
    const r = await req('office', '/contracts');
    const ok = r.status === 200 && htmlHas(r.text, 'id="contractDlg"') && ['合約編號', '客戶名稱', '服務頻率', '合約文件'].every((t) => htmlHas(r.text, t));
    return { pass: ok, expected: '彈窗存在且欄位齊全', actual: `status=${r.status}` };
  });
  await check('CON-04', 'CON', '合約詳情與客戶連結', 'P1', '功能', async () => {
    const detail = await req('office', '/view/contracts/' + X.contractId);
    const list = await req('office', '/contracts');
    return { pass: detail.status === 200 && htmlHas(detail.text, `C-${tag}`) && htmlHas(list.text, '/view/customers/'), expected: '詳情 200、客戶名可點', actual: `${detail.status}` };
  });
  await check('CON-05', 'CON', '合約軟刪除與還原', 'P1', '資料', async () => {
    await post('office', '/delete/contracts/' + X.contractId, {});
    const del = rowOf('contracts', X.contractId);
    const restore = await post('office', '/trash/restore', { key: 'contracts', id: X.contractId });
    const back = rowOf('contracts', X.contractId);
    return { pass: del.__deleted && !back.__deleted, expected: '刪除→還原', actual: `${del.__deleted}/${back.__deleted}/${restore.status}` };
  });

  // ── 產品與庫存 ────────────────────────
  await check('STK-01', 'STK', '產品新增與必填', 'P0', '功能', async () => {
    const bad = await post('office', '/save/products', basePayload('products', { product_name: `${tag}-產品`, standard_retail_price: '' }));
    const r = await post('office', '/save/products', basePayload('products', { product_name: `${tag}-產品`, product_code: `P${runId}`.toUpperCase(), standard_retail_price: '100', cost_price: '60', stock_quantity: '10', supplier_name: '測試供應商' }));
    const id = idFrom(r.location); X.productId = id;
    const row = id && rowOf('products', id);
    return { pass: bad.status === 400 && r.status === 302 && Number(row.stock_quantity) === 10, expected: '缺價 400、成功且庫存 10', actual: `${bad.status}/${r.status}, stock=${row?.stock_quantity}` };
  });
  await check('STK-02', 'STK', '入庫調整', 'P0', '資料', async () => {
    const r = await post('office', '/save/stock_adjustments', basePayload('stock_adjustments', { adjustment_type: '入庫', adjustment_date: '2026-10-25', product_id: X.productId, quantity_change: '5' }));
    const id = idFrom(r.location); X.adjustmentId = id;
    const adj = rowOf('stock_adjustments', id);
    const p = rowOf('products', X.productId);
    return { pass: r.status === 302 && Number(p.stock_quantity) === 15 && adj.quantity_before === 10 && adj.quantity_change === 5 && adj.quantity_after === 15, expected: '10 +5 → 15', actual: `${adj?.quantity_before}/${adj?.quantity_change}/${adj?.quantity_after}, stock=${p.stock_quantity}` };
  });
  await check('STK-03', 'STK', '出庫與負庫存', 'P0', '邊界', async () => {
    const r = await post('office', '/save/stock_adjustments', basePayload('stock_adjustments', { adjustment_type: '出庫', adjustment_date: '2026-10-25', product_id: X.productId, quantity_change: '100' }));
    const p = rowOf('products', X.productId);
    return { pass: r.status === 409 && Number(p.stock_quantity) === 15, expected: '409、庫存仍 15', actual: `${r.status}, stock=${p.stock_quantity}` };
  });
  await check('STK-04', 'STK', '調整單不可編輯', 'P0', '異常', async () => {
    const adj = rowOf('stock_adjustments', X.adjustmentId);
    const r = await post('office', '/save/stock_adjustments', rowPayload('office', 'stock_adjustments', adj, { notes: '改一下' }));
    return { pass: r.status === 409, expected: '409', actual: r.status };
  });
  await check('STK-05', 'STK', '盤點完成過賬', 'P0', '資料', async () => {
    const r = await post('office', '/save/stock_counts', basePayload('stock_counts', {
      count_date: '2026-10-25', status: '已完成',
      items: JSON.stringify([{ product_id: X.productId, product_code: `P${runId}`.toUpperCase(), actual_quantity: 12 }]),
    }));
    const id = idFrom(r.location); X.countId = id;
    const p = rowOf('products', X.productId);
    const cnt = rowOf('stock_counts', id);
    const adj = db.prepare("SELECT data FROM records WHERE entity='StockAdjustment' AND data LIKE ?").all(`%${id}%`).map((x) => JSON.parse(x.data)).find((a) => a.source_stock_count_id === id);
    return { pass: r.status === 302 && Number(p.stock_quantity) === 12 && cnt.stock_posted === true && adj?.quantity_change === -3, expected: '庫存 12、-3 調整、已過賬', actual: `${r.status}, stock=${p.stock_quantity}, posted=${cnt?.stock_posted}, adj=${adj?.quantity_change}` };
  });
  await check('STK-09', 'STK', '自動盤點調整單編號', 'P2', '資料', async () => {
    const rows = db.prepare("SELECT data FROM records WHERE entity='StockAdjustment'").all().map((x) => JSON.parse(x.data)).filter((a) => a.source_stock_count_id === X.countId);
    return { pass: rows.length === 1 && /^ADJ-\d{4}-\d{5}$/.test(rows[0].adjustment_number || ''), expected: 'ADJ-YYYY-#####', actual: rows[0]?.adjustment_number || '空' };
  });
  await check('STK-06', 'STK', '刪除已過賬盤點沖銷', 'P0', '資料', async () => {
    const del = await post('office', '/delete/stock_counts/' + X.countId, {});
    const p = rowOf('products', X.productId);
    const cnt = rowOf('stock_counts', X.countId);
    return { pass: del.status === 302 && Number(p.stock_quantity) === 15 && cnt.stock_reversed === true && cnt.__deleted === true, expected: '庫存回 15、reversed', actual: `${del.status}, stock=${p.stock_quantity}, reversed=${cnt?.stock_reversed}` };
  });
  await check('STK-07', 'STK', '還原盤點重新過賬', 'P0', '資料', async () => {
    const r = await post('office', '/trash/restore', { key: 'stock_counts', id: X.countId });
    const p = rowOf('products', X.productId);
    const cnt = rowOf('stock_counts', X.countId);
    return { pass: r.status === 302 && Number(p.stock_quantity) === 12 && cnt.stock_reversed === false && cnt.__deleted === false, expected: '庫存回 12、reversed=false', actual: `${r.status}, stock=${p.stock_quantity}` };
  });
  await check('STK-08', 'STK', '已過賬盤點不可改', 'P0', '異常', async () => {
    const cnt = rowOf('stock_counts', X.countId);
    const r = await post('office', '/save/stock_counts', rowPayload('office', 'stock_counts', cnt, { status: '已取消' }));
    return { pass: r.status === 409, expected: '409', actual: r.status };
  });

  // ── 送貨單 ───────────────────────────
  await check('DN-01', 'DN', '送貨單自動編號與出庫', 'P0', '資料', async () => {
    const r = await post('office', '/save/delivery_notes', basePayload('delivery_notes', {
      dn_date: '2026-10-25', customer_name: `${tag}-客戶`, status: '已送達',
      items: JSON.stringify([{ qty: 3, code_no: `P${runId}`.toUpperCase(), product_description: `${tag}-產品` }]),
    }));
    const id = idFrom(r.location); X.dnId = id;
    const dn = rowOf('delivery_notes', id);
    const p = rowOf('products', X.productId);
    return { pass: r.status === 302 && /^DNP\d{7}$/.test(dn?.dn_number || '') && Number(p.stock_quantity) === 9 && dn.stock_synced === true, expected: 'DNPyymm###、庫存 12→9', actual: `${dn?.dn_number}, stock=${p.stock_quantity}, synced=${dn?.stock_synced}` };
  });
  await check('DN-02', 'DN', '送貨出庫調整單', 'P0', '資料', async () => {
    const rows = db.prepare("SELECT data FROM records WHERE entity='StockAdjustment'").all().map((x) => JSON.parse(x.data)).filter((a) => a.source_delivery_id === X.dnId);
    const op = rows[0];
    return { pass: rows.length === 1 && op.quantity_change === -3 && op.adjustment_type === '送貨出庫', expected: '1 張 -3 出庫調整', actual: `${rows.length} 張 / ${op?.quantity_change}` };
  });
  await check('DN-03', 'DN', '庫存不足攔截', 'P0', '異常', async () => {
    const before = rowOf('products', X.productId).stock_quantity;
    const r = await post('office', '/save/delivery_notes', basePayload('delivery_notes', { dn_date: '2026-10-25', customer_name: `${tag}-客戶`, status: '已送達', items: JSON.stringify([{ qty: 999, code_no: `P${runId}`.toUpperCase() }]) }));
    const after = rowOf('products', X.productId).stock_quantity;
    return { pass: r.status === 409 && before === after, expected: '409、庫存不變', actual: `${r.status}, ${before}→${after}` };
  });
  await check('DN-04', 'DN', '已過賬明細鎖定', 'P0', '異常', async () => {
    const dn = rowOf('delivery_notes', X.dnId);
    const r = await post('office', '/save/delivery_notes', rowPayload('office', 'delivery_notes', dn, { items: JSON.stringify([{ qty: 2, code_no: `P${runId}`.toUpperCase() }]) }));
    return { pass: r.status === 409, expected: '409', actual: r.status };
  });
  await check('DN-05', 'DN', '重複過賬不扣庫存', 'P0', '異常', async () => {
    const dn = rowOf('delivery_notes', X.dnId);
    const before = rowOf('products', X.productId).stock_quantity;
    const r = await post('office', '/save/delivery_notes', rowPayload('office', 'delivery_notes', dn, {}));
    const after = rowOf('products', X.productId).stock_quantity;
    return { pass: r.status === 302 && before === after, expected: '儲存成功但不重扣', actual: `${r.status}, ${before}→${after}` };
  });

  // ── 發票與收款 ────────────────────────
  await check('INV-01', 'INV', '發票金額與編號', 'P0', '資料', async () => {
    const r = await post('accounting', '/save/invoices', basePayload('invoices', {
      customer_name: `${tag}-客戶`, invoice_date: '2026-10-25', status: '已發出',
      items: JSON.stringify([{ item_name: '服務', quantity: 3, unit_price: 200, discount: 50 }]), freight_charges: '30',
    }));
    const id = idFrom(r.location); X.invoiceId = id;
    const row = id && rowOf('invoices', id);
    return { pass: r.status === 302 && row.subtotal === 550 && row.total_amount === 580 && row.balance_due === 580 && /^INV-\d{4}-\d{4}$/.test(row.invoice_number || ''), expected: '550/580/580 + INV 編號', actual: `${row?.subtotal}/${row?.total_amount}/${row?.balance_due}, ${row?.invoice_number}` };
  });
  await check('INV-02', 'INV', '發票必填', 'P0', '異常', async () => {
    const r = await post('accounting', '/save/invoices', basePayload('invoices', { customer_name: '', items: JSON.stringify([{ quantity: 1, unit_price: 1 }]) }));
    return { pass: r.status === 400, expected: '400', actual: r.status };
  });
  await check('INV-03', 'INV', '收款核銷', 'P0', '資料', async () => {
    const a = await req('accounting', '/invoices/' + X.invoiceId + '/receipt', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.accounting, amount: '300', payment_method: '現金', receipt_date: '2026-10-25' }).toString() });
    const mid = rowOf('invoices', X.invoiceId);
    const b = await req('accounting', '/invoices/' + X.invoiceId + '/receipt', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.accounting, amount: '280', payment_method: '現金', receipt_date: '2026-10-25' }).toString() });
    const end = rowOf('invoices', X.invoiceId);
    const receipts = db.prepare("SELECT data FROM records WHERE entity='Receipt'").all().map((x) => JSON.parse(x.data)).filter((r) => r.invoice_id === X.invoiceId);
    return { pass: a.status === 302 && mid.paid_amount === 300 && mid.balance_due === 280 && b.status === 302 && end.paid_amount === 580 && end.balance_due === 0 && end.status === '已付款' && receipts.length === 2, expected: '300→280→0、2 張收據', actual: `${mid.paid_amount}/${mid.balance_due} (${mid.status}) → ${end.paid_amount}/${end.balance_due} (${end.status}), receipts=${receipts.length}` };
  });
  await check('INV-07', 'INV', '部分收款狀態字典', 'P1', '資料', async () => {
    const inv = { customer_name: `${tag}-客戶`, invoice_date: '2026-10-25', status: '已發出', items: JSON.stringify([{ item_name: '服務', quantity: 1, unit_price: 100 }]) };
    const c = await post('accounting', '/save/invoices', basePayload('invoices', inv));
    const id = idFrom(c.location);
    await req('accounting', '/invoices/' + id + '/receipt', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.accounting, amount: '40' }).toString() });
    const row = rowOf('invoices', id);
    return { pass: row.status === '部分付款', expected: '狀態=部分付款（filter 字典值）', actual: row.status };
  });
  await check('INV-04', 'INV', '超額收款', 'P1', '邊界', async () => {    const r = await req('accounting', '/invoices/' + X.invoiceId + '/receipt', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.accounting, amount: '150' }).toString() });
    return { pass: r.status === 400 && htmlHas(r.text, '不可超過'), expected: '400 不可超過餘額', actual: r.status };
  });
  await check('INV-06', 'INV', '收據明細關聯發票', 'P1', '資料', async () => {
    const receipts = db.prepare("SELECT data FROM records WHERE entity='Receipt'").all().map((x) => JSON.parse(x.data)).filter((r) => r.invoice_id === X.invoiceId);
    const ok = receipts.length === 2 && receipts.every((r) => r.items?.[0]?.invoice_number === rowOf('invoices', X.invoiceId).invoice_number);
    return { pass: ok, expected: '明細含發票編號', actual: `${receipts.length} 張` };
  });

  // ── 總帳與應收 ────────────────────────
  await check('TXN-01', 'TXN', '借貸不平衡攔截', 'P0', '異常', async () => {
    const before = countOf('transactions');
    const r = await post('accounting', '/save/transactions', basePayload('transactions', { transaction_type: '日記賬', status: '已過賬', entries: JSON.stringify([{ account_name: 'A', debit: 100, credit: 0 }, { account_name: 'B', debit: 0, credit: 50 }]) }));
    return { pass: r.status === 400 && htmlHas(r.text, '不平衡') && countOf('transactions') === before, expected: '400、不落庫', actual: `${r.status}, ${before}→${countOf('transactions')}` };
  });
  await check('TXN-02', 'TXN', '平衡分錄入帳', 'P0', '資料', async () => {
    const r = await post('accounting', '/save/transactions', basePayload('transactions', { transaction_type: '日記賬', status: '已過賬', description: `${tag} 測試分錄`, entries: JSON.stringify([{ account_name: 'A', debit: 100, credit: 0 }, { account_name: 'B', debit: 0, credit: 100 }]) }));
    const row = rowOf('transactions', idFrom(r.location));
    return { pass: r.status === 302 && row.total_debit === 100 && row.total_credit === 100, expected: '100/100', actual: `${row?.total_debit}/${row?.total_credit}` };
  });
  await check('TXN-03', 'TXN', '草稿允許不平衡', 'P1', '邊界', async () => {
    const r = await post('accounting', '/save/transactions', basePayload('transactions', { transaction_type: '日記賬', status: '草稿', entries: JSON.stringify([{ account_name: 'A', debit: 100, credit: 0 }, { account_name: 'B', debit: 0, credit: 50 }]) }));
    return { pass: r.status === 302, expected: '草稿可存', actual: r.status };
  });
  await check('TXN-04', 'TXN', '總帳頁可用性', 'P1', '效能', async () => {
    const r = await req('accounting', '/generalledger');
    return { pass: r.status === 200 && htmlHas(r.text, '總帳') && r.ms < 3000, expected: '200、< 3s', actual: `${r.status}, ${r.ms}ms` };
  });

  // ── 請假 / 補給 ───────────────────────
  await check('LV-01', 'LV', '請假天數與狀態', 'P0', '資料', async () => {
    const r = await post('front', '/save/leave_records', basePayload('leave_records', { employee_name: '他人姓名', leave_type: '年假', start_date: '2026-11-02', end_date: '2026-11-04', status: '已批准', reason: '測試' }));
    const id = idFrom(r.location); X.leaveId = id;
    const row = id && rowOf('leave_records', id);
    return { pass: r.status === 302 && row.total_days === 3 && row.status === '待審批', expected: '3 天、待審批', actual: `${row?.total_days}/${row?.status}` };
  });
  await check('LV-02', 'LV', '前線不可代他人請假', 'P0', '安全', async () => {
    const row = rowOf('leave_records', X.leaveId);
    const me = db.prepare("SELECT name FROM users WHERE id='u-front'").get();
    const myName = me ? String(me.name).replace(/（[^）]*）/g, '').trim() : '';
    return { pass: row.employee_name !== '他人姓名' && (!myName || row.employee_name === myName), expected: '姓名被強制為本人', actual: row.employee_name };
  });
  await check('LV-03', 'LV', '審批權限與流轉', 'P0', '權限', async () => {
    const f = await req('front', '/leaves/' + X.leaveId + '/decide', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.front, status: '已批准' }).toString() });
    const m = await req('management', '/leaves/' + X.leaveId + '/decide', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.management, status: '已批准' }).toString() });
    const row = rowOf('leave_records', X.leaveId);
    return { pass: f.status === 403 && m.status === 302 && row.status === '已批准' && !!row.decided_by, expected: 'front 403、mgmt 批准', actual: `${f.status}/${m.status}, ${row?.status}` };
  });
  await check('LV-04', 'LV', '非法審批狀態', 'P1', '異常', async () => {
    const r = await req('management', '/leaves/' + X.leaveId + '/decide', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ __csrf: csrfCache.management, status: '亂填' }).toString() });
    return { pass: r.status === 400 && rowOf('leave_records', X.leaveId).status === '已批准', expected: '400、狀態不變', actual: `${r.status}` };
  });

  await check('SUP-01', 'SUP', '補給建立與員工鎖定', 'P0', '功能', async () => {
    const r = await post('front', '/save/supply_records', basePayload('supply_records', { supply_date: '2026-10-25', type: '個人', employee_name: '他人', products: JSON.stringify([{ product_name: `${tag}-產品`, product_id: X.productId, unit: '件', quantity: 2 }]) }));
    const id = idFrom(r.location); X.supplyId = id;
    const row = id && rowOf('supply_records', id);
    const me = db.prepare("SELECT name FROM users WHERE id='u-front'").get();
    const myName = me ? String(me.name).replace(/（[^）]*）/g, '').trim() : '';
    return { pass: r.status === 302 && row.employee_name === myName && row.products?.[0]?.quantity === 2, expected: '302、本人、數量 2', actual: `${r.status}, ${row?.employee_name}, ${row?.products?.[0]?.quantity}` };
  });
  await check('SUP-02', 'SUP', '數量必須整數', 'P0', '邊界', async () => {
    const r = await post('front', '/save/supply_records', basePayload('supply_records', { supply_date: '2026-10-25', type: '個人', products: JSON.stringify([{ product_name: `${tag}-產品`, product_id: X.productId, quantity: 2.5 }]) }));
    return { pass: r.status === 400 && htmlHas(r.text, '整數'), expected: '400 整數提示', actual: r.status };
  });
  await check('SUP-03', 'SUP', '新增彈窗 __id 為空', 'P0', 'UI', async () => {
    const r = await req('front', '/mysupply?new=1');
    const dlg = (/<dialog[^>]+id="recDlg"[\s\S]*?<\/dialog>/.exec(r.text) || [''])[0];
    return { pass: r.status === 200 && /name="__id"\s+value=""/.test(dlg) && /name="__new_id"\s+value="[^"]+"/.test(dlg), expected: '__id 空、__new_id 有值', actual: `status=${r.status}, __id=${
      (/name="__id"\s+value="([^"]*)"/.exec(dlg) || [])[1] ?? 'missing'}` };
  });

  // ── 排班 ─────────────────────────────
  await check('SCH-01', 'SCH', '排班新增與工時', 'P0', '功能', async () => {
    const r = await post('office', '/save/schedules', basePayload('schedules', {
      schedule_date: '2026-11-10', status: '待執行',
      work_items: JSON.stringify([{ work_name: '測試工作A', work_location: '測試地點', start_time: '09:00', end_time: '11:00', service_type: '臨時' }, { work_name: '測試工作B', start_time: '13:00', end_time: '14:30', service_type: '臨時' }]),
    }));
    const id = idFrom(r.location); X.scheduleId = id;
    const row = id && rowOf('schedules', id);
    return { pass: r.status === 302 && row.work_items?.length === 2, expected: '2 個工作項保存', actual: `${row?.work_items?.length} 項、total_hours=${row?.total_hours}` };
  });
  await check('SCH-07', 'SCH', '排班總工時計算', 'P2', '資料', async () => {
    const row = rowOf('schedules', X.scheduleId);
    return { pass: Number(row.total_hours) === 3.5, expected: '09:00–11:00 + 13:00–14:30 = 3.5', actual: `total_hours=${row.total_hours || '空'}` };
  });
  await check('SCH-02', 'SCH', '排班改期', 'P0', '功能', async () => {
    const r = await req('office', '/schedules/' + X.scheduleId + '/move', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ __csrf: csrfCache.office, date: '2026-11-11' }).toString() });
    const row = rowOf('schedules', X.scheduleId);
    return { pass: r.status === 200 && row.schedule_date === '2026-11-11', expected: '200、日期更新', actual: `${r.status}, ${row?.schedule_date}` };
  });
  await check('SCH-03', 'SCH', '排班工作項回寫 PO 日期', 'P1', '資料', async () => {
    const r = await post('office', '/save/schedules', basePayload('schedules', { schedule_date: '2026-11-12', status: '待執行', work_items: JSON.stringify([{ po_id: X.poId, work_name: 'PO 工作', start_time: '09:00', end_time: '10:00' }]) }));
    const po = rowOf('purchase_orders', X.poId);
    return { pass: r.status === 302 && Array.isArray(po.work_dates) && po.work_dates.includes('2026-11-12'), expected: 'PO.work_dates 含 2026-11-12', actual: JSON.stringify(po?.work_dates) };
  });
  await check('SCH-06', 'SCH', '排班權限', 'P0', '權限', async () => {
    const a = await req('front', '/schedules');
    const b = await post('front', '/save/schedules', basePayload('schedules', { schedule_date: '2026-11-12', work_items: '[]' }));
    return { pass: a.status === 403 && b.status === 403, expected: '皆 403', actual: `${a.status}/${b.status}` };
  });

  // ── 回收桶 / 匯出 / 安全 ────────────────
  await check('TRS-01', 'TRS', '回收桶入口與篩選', 'P1', '功能', async () => {
    const r = await req('office', '/trash');
    return { pass: r.status === 200 && htmlHas(r.text, '回收桶') && htmlHas(r.text, '刪除'), expected: '200 + 列表/篩選', actual: `status=${r.status}` };
  });
  await check('TRS-02', 'TRS', '還原記錄', 'P0', '資料', async () => {
    await post('office', '/delete/quotations/' + X.quotationId, {});
    const r = await post('office', '/trash/restore', { key: 'quotations', id: X.quotationId });
    const row = rowOf('quotations', X.quotationId);
    return { pass: r.status === 302 && !row.__deleted, expected: '還原成功', actual: `${r.status}, deleted=${row.__deleted}` };
  });
  await check('TRS-03', 'TRS', '永久刪除邊界', 'P0', '權限', async () => {
    await post('office', '/delete/purchase_orders/' + X.poFromQuotationId, {});
    const r = await post('office', '/trash/purge', { key: 'purchase_orders', id: X.poFromQuotationId });
    const gone = !rowOf('purchase_orders', X.poFromQuotationId);
    return { pass: (r.status === 200 || r.status === 302) && gone, expected: 'office 可永久刪除（上限內）', actual: `${r.status}, gone=${gone}` };
  });

  await check('EXP-01', 'EXP', 'CSV 匯出權限', 'P0', '權限', async () => {
    const f = await req('front', '/export/customers.csv');
    const o = await req('office', '/export/customers.csv');
    const m = await req('management', '/export/customers.csv');
    const ct = m.headers.get('content-type') || '';
    return { pass: f.status === 403 && o.status === 403 && m.status === 200 && /text\/csv/.test(ct), expected: '403/403/200 text/csv', actual: `${f.status}/${o.status}/${m.status} ${ct}` };
  });
  await check('EXP-02', 'EXP', 'CSV 編碼與 BOM', 'P1', '資料', async () => {
    const res = await fetch(BASE + '/export/customers.csv', { headers: { cookie: jars.management } });
    const buf = Buffer.from(await res.arrayBuffer());
    const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const body = buf.toString('utf8');
    return { pass: res.status === 200 && bom && body.includes('客戶'), expected: 'UTF-8 BOM、含標題', actual: `status=${res.status}, bom=${bom}, first=${buf.slice(0, 3).toString('hex')}, len=${buf.length}` };
  });
  await check('SEC-01', 'SEC', '存儲型 XSS 轉義', 'P0', '安全', async () => {
    const payload = `<script>alert('${runId}')</script>`;
    const c = await post('office', '/save/customers', basePayload('customers', { customer_name: payload, customer_type: '標準' }));
    const id = idFrom(c.location); X.xssId = id;
    const list = await req('office', '/customers?q=' + encodeURIComponent(runId));
    const detail = await req('office', '/view/customers/' + id);
    const pass = c.status === 302 && htmlHas(list.text, '&lt;script&gt;') && !htmlHas(list.text, payload) && !htmlHas(detail.text, payload);
    return { pass, expected: '輸出轉義、無原始 script', actual: `create=${c.status}, escaped=${htmlHas(list.text, '&lt;script&gt;')}` };
  });
  await check('SEC-02', 'SEC', '越權 IDOR', 'P0', '安全', async () => {
    const a = await req('front', '/view/invoices/' + X.invoiceId);
    const b = await req('front', '/view/contracts/' + X.contractId);
    return { pass: a.status === 403 && b.status === 403, expected: '403/403', actual: `${a.status}/${b.status}` };
  });
  await check('SEC-03', 'SEC', '上傳路徑穿越', 'P0', '安全', async () => {
    const form = new FormData();
    form.append('__csrf', csrfCache.office);
    form.append('key', 'products');
    form.append('id', X.productId);
    form.append('field', 'product_image');
    form.append('file', new Blob(['x'], { type: 'image/png' }), '../../evil.png');
    const res = await fetch(BASE + '/upload', { method: 'POST', headers: { cookie: jars.office }, body: form });
    const text = await res.text();
    let parsed = {}; try { parsed = JSON.parse(text); } catch {}
    const file = typeof parsed.file === 'string' ? parsed.file : parsed.file?.file_url || '';
    const escaped = file.includes('..') || !file.startsWith('/uploads/');
    return { pass: res.status === 200 && !escaped, expected: '200、路徑限制在 uploads 下', actual: `${res.status} ${file || text.slice(0, 120)}` };
  });
  await check('SEC-07', 'SEC', '登入簽發新會話', 'P1', '安全', async () => {
    const a = await login('office', 'sessA');
    const b = await login('office', 'sessB');
    delete jars.sessA; delete jars.sessB;
    return { pass: !!a.sid && !!b.sid && a.sid !== b.sid, expected: '每次登入新 sid', actual: `${String(a.sid).slice(0, 8)} vs ${String(b.sid).slice(0, 8)}` };
  });

  // ── 效能 ─────────────────────────────
  for (const [id, title, p, limit] of [
    ['PERF-01', '應收台賬首字節', '/receivables', 3000],
    ['PERF-01', '總帳首字節', '/generalledger', 3000],
    ['PERF-01', '庫存頁首字節', '/inventory', 2000],
    ['PERF-01', '排班頁首字節', '/schedules', 3000],
  ]) {
    await check(id, 'PERF', title, 'P1', '效能', async () => {
      await req('management', p);
      const r = await req('management', p);
      return { pass: r.status === 200 && r.ms < limit, expected: `200 且 < ${limit}ms（暖機後）`, actual: `${r.status}, ${r.ms}ms` };
    });
  }
  await check('PERF-02', 'PERF', '列表分頁', 'P1', '效能', async () => {
    const a = await req('office', '/quotations');
    const b = await req('office', '/quotations?page=2');
    return { pass: a.status === 200 && b.status === 200 && a.ms < 1500 && b.ms < 1500, expected: '兩頁 < 1.5s', actual: `${a.ms}ms / ${b.ms}ms` };
  });

  // ── UI 不變量 ─────────────────────────
  await check('UI-01', 'UI', '側欄分組字級', 'P2', 'UI', async () => {
    const r = await req('office', '/mywork');
    const ok = /\.navgrp>summary\{[^}]*font-size:13px[^}]*font-weight:700/.test(r.text);
    return { pass: ok, expected: '13px / 700', actual: ok ? '命中' : '未命中' };
  });
  await check('UI-02', 'UI', '操作列黏性', 'P2', 'UI', async () => {
    const r = await req('office', '/customers');
    return { pass: /\.act-col\{[^}]*position:sticky/.test(r.text), expected: 'position:sticky', actual: /position:sticky/.test(r.text) ? '命中' : '未命中' };
  });
  await check('UI-03', 'UI', '金額格式不重複', 'P1', 'UI', async () => {
    const r = await req('office', '/inventory');
    return { pass: r.status === 200 && !htmlHas(r.text, 'HK$ HK$'), expected: '無 HK$ HK$', actual: htmlHas(r.text, 'HK$ HK$') ? '出現重複幣種' : 'OK' };
  });
  await check('UI-04', 'UI', '日曆空格不被圖示撐高', 'P2', 'UI', async () => {
    const r = await req('office', '/schedules');
    const bad = /\.calendar-cell\.empty\b/.test(r.text);
    return { pass: r.status === 200 && !bad, expected: '無 .calendar-cell.empty 規則', actual: bad ? '存在舊規則' : 'OK' };
  });
  await check('UI-05', 'UI', '頁首不重複', 'P2', 'UI', async () => {
    const pages = ['/customers', '/quotations', '/products', '/schedules'];
    const bad = [];
    for (const p of pages) {
      const r = await req('office', p);
      const n = (r.text.match(/class="pagehead"/g) || []).length;
      if (n > 1) bad.push(`${p}:${n}`);
    }
    return { pass: !bad.length, expected: '每頁 ≤ 1 個 pagehead', actual: bad.join(',') || 'OK' };
  });

  // ── 資料完整性（SQL 掃描） ───────────────
  await check('DAT-01', 'DAT', '所有記錄 JSON 可解析', 'P0', '資料', async () => {
    const rows = db.prepare('SELECT id,data FROM records').all();
    let bad = 0; let first = '';
    for (const r of rows) { try { JSON.parse(r.data); } catch { bad += 1; if (!first) first = r.id; } }
    return { pass: bad === 0, expected: '0 筆壞 JSON', actual: `${bad} 筆${first ? '，首筆 ' + first : ''}`, detail: `${rows.length} 筆` };
  });
  await check('DAT-02', 'DAT', '報價合計抽樣一致', 'P1', '資料', async () => {
    const rows = db.prepare("SELECT data FROM records WHERE entity='Quotation' LIMIT 400").all().map((r) => JSON.parse(r.data));
    const bad = [];
    for (const q of rows) {
      if (!Array.isArray(q.items) || !q.items.length) continue;
      const subtotal = q.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) - (Number(i.discount) || 0), 0);
      const total = subtotal + (Number(q.freight_charges) || 0) - (Number(q.discount) || 0);
      if (Math.abs(subtotal - Number(q.subtotal || 0)) > 0.02 || Math.abs(total - Number(q.total_amount || 0)) > 0.02) bad.push(q.quotation_number || q.id);
    }
    return { pass: !bad.length, expected: '抽樣 400 筆全部一致', actual: bad.length ? `${bad.length} 筆表頭有金額但明細為 0：${bad.slice(0, 3).join(',')}` : `OK (${rows.length} 筆)` };
  });
  await check('DAT-03', 'DAT', '發票餘額一致', 'P0', '資料', async () => {
    const rows = db.prepare("SELECT data FROM records WHERE entity='Invoice'").all().map((r) => JSON.parse(r.data));
    const bad = rows.filter((i) => Math.abs(Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)) - Number(i.balance_due || 0)) > 0.02);
    return { pass: !bad.length, expected: 'balance=total−paid', actual: bad.slice(0, 5).map((i) => i.invoice_number).join(',') || `OK (${rows.length} 筆)` };
  });
  await check('DAT-04', 'DAT', '已過賬分錄借貸平衡', 'P0', '資料', async () => {
    const rows = db.prepare("SELECT data FROM records WHERE entity='Transaction'").all().map((r) => JSON.parse(r.data));
    const bad = rows.filter((t) => t.status && t.status !== '草稿' && Math.abs(Number(t.total_debit || 0) - Number(t.total_credit || 0)) > 0.01);
    return { pass: !bad.length, expected: '非草稿全部平衡', actual: bad.slice(0, 5).map((t) => t.reference_number || t.id).join(',') || `OK (${rows.length} 筆)` };
  });
  await check('DAT-05', 'DAT', '軟刪除欄位完整', 'P1', '資料', async () => {
    // 歷史匯入的刪除記錄沒有 deleted_at/by，屬遺留資料；只檢查本次改造後的刪除
    const rows = db.prepare("SELECT entity,id,data,updated_date FROM records WHERE deleted=1").all()
      .filter((r) => String(r.updated_date).slice(0, 10) >= '2026-10-24')
      .map((r) => ({ entity: r.entity, id: r.id, ...JSON.parse(r.data) }));
    const bad = rows.filter((r) => !r.deleted_at || !r.deleted_by);
    return { pass: !bad.length, expected: '近兩日刪除均有時間/操作人（歷史匯入豁免）', actual: bad.slice(0, 5).map((r) => r.entity + ':' + r.id).join(',') || `OK (${rows.length} 筆)` };
  });
  // DAT-03：外鍵靠名字匹配，同名多筆時必須停下來問，不能取第一筆
  await check('DAT-06', 'DAT', '重名關聯不猜（409）', 'P0', '資料', async () => {
    const names = new Map();
    for (const r of db.prepare('SELECT data FROM records WHERE entity=? AND deleted=0').all('Customer')) {
      const n = JSON.parse(r.data).customer_name;
      if (n) names.set(n, (names.get(n) || 0) + 1);
    }
    const dup = [...names.entries()].find(([, c]) => c > 1);
    if (!dup) return { pass: false, expected: '庫內應有重名客戶作為樣本', actual: '無重名樣本' };
    const bad = await post('office', '/save/delivery_notes', basePayload('delivery_notes', { customer_name: dup[0], customer_id: '' }));
    const ok = await post('office', '/save/delivery_notes', basePayload('delivery_notes', { customer_name: `${tag}-無重名`, customer_id: '' }));
    return {
      pass: bad.status === 409 && htmlHas(bad.text, '同名') && ok.status !== 409,
      expected: `同名客戶（×${dup[1]}）→ 409 並提示；不同名不攔`,
      actual: `同名 ${bad.status}（${htmlHas(bad.text, '同名') ? '有提示' : '無提示'}）／不同名 ${ok.status}`,
    };
  });
}

async function check(id, module, title, priority, type, fn, expectedHint = '') {
  const started = Date.now();
  let out;
  try {
    out = await fn();
  } catch (error) {
    out = { pass: false, actual: '異常：' + error.message, expected: expectedHint };
  }
  record({
    id, module, title, priority, type,
    pass: out?.pass === true,
    expected: out?.expected || expectedHint,
    actual: out?.actual || '',
    detail: out?.detail || '',
    ms: Date.now() - started,
  });
  return out;
}

function summarize() {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const byPriority = {};
  const byModule = {};
  for (const r of results) {
    byPriority[r.priority] = byPriority[r.priority] || { total: 0, pass: 0 };
    byPriority[r.priority].total += 1;
    if (r.pass) byPriority[r.priority].pass += 1;
    byModule[r.module] = byModule[r.module] || { total: 0, pass: 0 };
    byModule[r.module].total += 1;
    if (r.pass) byModule[r.module].pass += 1;
  }
  return { total, passed, failed: total - passed, passRate: total ? +(passed / total * 100).toFixed(1) : 0, byPriority, byModule };
}

function writeReports() {
  const summary = summarize();
  const payload = {
    meta: { title: '標準清潔滅蟲 ERP · 可執行驗收結果', date: new Date().toISOString(), base: BASE, src: SRC, runId, node: process.version },
    summary, results, matrix, evidence,
  };
  fs.writeFileSync(path.join(OUT, '測試結果_基線.json'), JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '測試結果_基線.html'), renderHtml(payload), 'utf8');
  return summary;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }

function renderHtml(data) {
  const { summary, results: rows, matrix: mx } = data;
  const failures = rows.filter((r) => !r.pass);
  const modules = [...new Set(rows.map((r) => r.module))];
  const priorityRow = ['P0', 'P1', 'P2'].map((p) => {
    const s = summary.byPriority[p] || { total: 0, pass: 0 };
    return `<tr><td>${p}</td><td>${s.total}</td><td>${s.pass}</td><td>${s.total - s.pass}</td><td><b class="${s.total === s.pass ? 'ok' : 'bad'}">${pct(s.pass, s.total)}%</b></td></tr>`;
  }).join('');
  const moduleRows = modules.map((m) => {
    const s = summary.byModule[m];
    return `<tr><td>${esc(m)}</td><td>${s.total}</td><td>${s.pass}</td><td>${s.total - s.pass}</td><td>${pct(s.pass, s.total)}%</td></tr>`;
  }).join('');
  const failureRows = failures.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.priority)}</td><td>${esc(r.title)}</td><td>${esc(r.expected)}</td><td class="bad">${esc(r.actual)}</td></tr>`).join('') || '<tr><td colspan="5" class="ok">本次未發現失敗項</td></tr>';
  const detailRows = modules.map((m) => {
    const list = rows.filter((r) => r.module === m);
    return `<h3>${esc(m)}（${list.filter((r) => r.pass).length}/${list.length}）</h3><table><thead><tr><th>ID</th><th>測試項</th><th>優先級</th><th>結果</th><th>預期</th><th>實測</th><th>耗時</th></tr></thead><tbody>${list.map((r) => `<tr class="${r.pass ? '' : 'failrow'}"><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.priority)}</td><td class="${r.pass ? 'ok' : 'bad'}">${r.pass ? 'PASS' : 'FAIL'}</td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td><td>${r.ms}ms</td></tr>`).join('')}</tbody></table>`;
  }).join('');
  const matrixSection = (title, list, keyLabel) => {
    const roles = ROLES;
    const keys = [...new Set(list.map((x) => x[keyLabel]))];
    const cell = (k, role) => {
      const item = list.find((x) => x[keyLabel] === k && x.role === role);
      if (!item) return '<td class="muted">—</td>';
      if (keyLabel === 'path' && item.expected === undefined) {
        return `<td class="${item.pass ? 'ok' : 'bad'}">${item.status}</td>`;
      }
      return `<td class="${item.pass ? 'ok' : 'bad'}">${item.status}${item.pass ? '' : ' ✗'}</td>`;
    };
    return `<h3>${esc(title)}</h3><div class="scroll"><table class="matrix"><thead><tr><th>${esc(keyLabel)}</th>${roles.map((r) => `<th>${ROLE_CN[r]}</th>`).join('')}</tr></thead><tbody>${keys.map((k) => `<tr><td>${esc(k)}</td>${roles.map((r) => cell(k, r)).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>驗收結果 · 標準清潔滅蟲 ERP</title><style>
:root{--ink:#0f172a;--muted:#64748b;--line:#e4e9f0;--bg:#f6f8fb;--card:#fff;--brand:#0f766e;--bad:#b42318;--ok:#067647;--warn:#b54708}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.65 "Microsoft YaHei","PingFang TC",system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 28px 80px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 12px;padding-top:18px;border-top:1px solid var(--line)}
h3{font-size:15px;margin:22px 0 8px}.sub{color:var(--muted);margin-bottom:22px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.card b{display:block;font-size:26px;line-height:1.2}.card span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f8fafc;font-weight:600;color:#334155;white-space:nowrap}
tr:last-child td{border-bottom:0}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.muted{color:var(--muted)}
.failrow{background:#fff7f6}.scroll{overflow:auto;max-height:560px;border-radius:10px}
.matrix td,.matrix th{text-align:center;white-space:nowrap}.matrix td:first-child,.matrix th:first-child{text-align:left}
.note{background:#fffaeb;border:1px solid #fedf89;border-radius:10px;padding:12px 14px;color:#7a2e0e;margin:14px 0}
@media print{body{background:#fff}.wrap{max-width:none;padding:0}h2{page-break-after:avoid}tr{page-break-inside:avoid}.scroll{max-height:none;overflow:visible}}
</style></head><body><div class="wrap">
<h1>標準清潔滅蟲 ERP · 可執行驗收結果</h1>
<div class="sub">${esc(data.meta.date)} · 隔離副本 ${esc(data.meta.base)} · 來源 ${esc(data.meta.src)} · Node ${esc(data.meta.node)}</div>
<div class="cards">
<div class="card"><span>總檢查項</span><b>${summary.total}</b></div>
<div class="card"><span>通過</span><b class="ok">${summary.passed}</b></div>
<div class="card"><span>失敗</span><b class="${summary.failed ? 'bad' : 'ok'}">${summary.failed}</b></div>
<div class="card"><span>通過率</span><b>${summary.passRate}%</b></div>
</div>
<div class="note"><b>准入判定：</b>P0 必須 100%。本次 P0 通過率 ${pct((summary.byPriority.P0 || {}).pass || 0, (summary.byPriority.P0 || {}).total || 0)}%。失敗項需逐條判定為「產品缺陷 / 測試假設錯誤 / 設計缺口」，不得直接改測試讓它變綠。</div>
<h2>一、按優先級</h2><table><thead><tr><th>優先級</th><th>檢查</th><th>通過</th><th>失敗</th><th>通過率</th></tr></thead><tbody>${priorityRow}</tbody></table>
<h2>二、按模組</h2><table><thead><tr><th>模組</th><th>檢查</th><th>通過</th><th>失敗</th><th>通過率</th></tr></thead><tbody>${moduleRows}</tbody></table>
<h2>三、失敗項（需逐條定位）</h2><table><thead><tr><th>ID</th><th>級別</th><th>測試項</th><th>預期</th><th>實測</th></tr></thead><tbody>${failureRows}</tbody></table>
<h2>四、權限矩陣（菜單 / 直鏈 / 實體）</h2>
${matrixSection('菜單可見性（期望 vs 實際）', mx.nav, 'path')}
${matrixSection('直鏈訪問狀態碼', mx.access, 'path')}
${matrixSection('實體列表狀態碼', mx.list, 'key')}
${matrixSection('實體表單狀態碼', mx.form, 'key')}
<h2>五、明細</h2>${detailRows}
</div></body></html>`;
}

async function main() {
  log('='.repeat(72));
  log('標準清潔滅蟲 ERP · 可執行驗收 v1.0');
  log('='.repeat(72));
  setup();
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: SRC,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(RUN, 'data.db'), CPC_UPLOAD_DIR: path.join(RUN, 'uploads'), CPC_DEMO: '1', CPC_AUTO_IMPORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  child.stdout.on('data', (b) => serverLog.push(b.toString()));
  child.stderr.on('data', (b) => serverLog.push(b.toString()));
  const ready = await waitForServer();
  if (!ready) {
    fs.writeFileSync(path.join(OUT, '服務啟動失敗.log'), serverLog.join(''), 'utf8');
    console.error('服務啟動失敗，日誌已寫入 服務啟動失敗.log');
    child.kill();
    process.exit(1);
  }
  db = new DatabaseSync(path.join(RUN, 'data.db'));
  log('服務就緒：' + BASE + '\n');

  try {
    await run();
  } catch (error) {
    console.error('執行中斷：', error);
    record({ id: 'RUN-01', module: 'SYS', title: '測試執行完整性', priority: 'P0', type: '功能', pass: false, expected: '全部套件跑完', actual: error.message });
  } finally {
    const summary = writeReports();
    log('\n' + '-'.repeat(72));
    log(`合計 ${summary.total} · 通過 ${summary.passed} · 失敗 ${summary.failed} · 通過率 ${summary.passRate}%`);
    for (const p of ['P0', 'P1', 'P2']) {
      const s = summary.byPriority[p];
      if (s) log(`  ${p}: ${s.pass}/${s.total}`);
    }
    log('報告：測試結果_基線.html / 測試結果_基線.json');
    try { db.close(); } catch {}
    child.kill();
    await new Promise((r) => setTimeout(r, 400));
    fs.writeFileSync(path.join(RUN, 'server.log'), serverLog.join(''), 'utf8');
    log('隔離副本保留在 ' + RUN + '（可手動刪除）');
    process.exit(summary.failed ? 1 : 0);
  }
}

main();
