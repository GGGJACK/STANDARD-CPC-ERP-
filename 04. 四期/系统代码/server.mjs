import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { ENTITIES, ENTITY_BY_NAME, ORIGINAL_ROUTES } from './lib/config.mjs';
import { assertAccessible, assertEntity, assertRole, canEditRecord, canSeeAmounts, customerMergePage, customerOfficeAccess, entityDetail, entityForm, exportEntity, filteredRows, HttpError, importPage, listEntity } from './lib/core.mjs';
import { backfillDeliveryStock, collectReceipt, convertQuotation, generateRecurringSchedules, importEntity, importTollExpenses, mergeCustomers, moveSchedule, reverseStockCount, saveEntity, saveExcelSchedules, saveMonthlyAttendance } from './lib/actions.mjs';
import { accountingPage, checkInPage, customerDetailPage, excelSchedulePage, generalLedgerPage, monthlyAttendancePage, myAttendancePage, myWorkPage, pestControlWorkDetail, pestControlWorkPage, receivablesPage, servicePlanDetail, servicePlansPage, serviceReportsPage, trashPage, trashUsedToday, TRASH_DAILY_LIMIT, vehicleCard, workSchedulePage } from './lib/pages.mjs';
import { completionCertificate, printDocument, schedulePrint, workRecordPrint } from './lib/documents.mjs';
import { imageEditorPage } from './lib/image-editor.mjs';
import { collectAttachments, detailPage, errorPage, kpis, layout, loginPage, publicLayout, renderValue, simpleTable } from './lib/ui.mjs';
import { PICK_SOURCES, PICK_SOURCE_ENTITY, PICK_SOURCE_EXTRA_ROLES, pickFillForRole, searchPick } from './lib/pickers.mjs';
import { arr, bool, esc, hkNow, money, num, parseBody, safeEqual, safeFileName, str, token, uid, verifyPassword } from './lib/utils.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(ROOT, 'data.db');
const DATA_DIR = process.env.CPC_DATA_DIR || 'F:/03 Standard CPC DataBase/02. 数据导出/json';
const ATTACHMENT_DIR = process.env.CPC_ATTACHMENT_DIR || 'F:/03 Standard CPC DataBase/03. 附件';
const UPLOAD_DIR = process.env.CPC_UPLOAD_DIR || path.join(ROOT, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IMPORT_VERSION = '2026-10-24-full-v2';

const store = new Store({ dbPath: DB_PATH, dataDir: DATA_DIR, attachmentDir: ATTACHMENT_DIR, uploadDir: UPLOAD_DIR });
if (process.env.CPC_AUTO_IMPORT !== '0' && store.setting('raw_import_version') !== IMPORT_VERSION) {
  console.log('正在匯入原始全字段資料（只補齊，不覆蓋現有修改）…');
  const report = store.importAll();
  store.setSetting('raw_import_version', IMPORT_VERSION);
  console.log(`資料匯入完成：${report.reduce((s, r) => s + r.imported, 0).toLocaleString()} 筆`);
}
if (store.db.prepare('SELECT COUNT(*) c FROM holidays').get().c === 0) {
  const file = process.env.CPC_HOLIDAY_FILE || 'F:/03 Standard CPC DataBase/04. 設定/hk_holidays.json';
  if (fs.existsSync(file)) {
    const source = JSON.parse(fs.readFileSync(file, 'utf8'));
    const stmt = store.db.prepare('INSERT OR IGNORE INTO holidays(date,name) VALUES (?,?)');
    for (const year of Object.values(source.years || {})) for (const row of year) stmt.run(row.date, row.name);
  }
}

const sessions = new Map();
const originalLower = Object.fromEntries(Object.entries(ORIGINAL_ROUTES).map(([k, v]) => [k.toLowerCase(), v]));
const PATH_CANONICAL = Object.fromEntries([
  '/mywork', '/pestcontrolwork', '/serviceplans', '/servicereports', '/workschedule', '/myschedule', '/checkin',
  '/myattendance', '/monthlyattendance', '/mysupply', '/inventory', '/accounting', '/generalledger', '/accounts',
  '/recurringschedules', '/excelschedule', '/settings', '/me', '/users', '/employees', '/workunits', '/addresses',
  '/workinstructions', '/pesticides', '/emailtemplates', '/leads', '/followups', '/bills', '/payments',
].map((route) => [route.toLowerCase(), route]));
PATH_CANONICAL['/dashboard'] = '/mywork';
PATH_CANONICAL['/usermanagement'] = '/users';
PATH_CANONICAL['/employee'] = '/employees';
PATH_CANONICAL['/workunit'] = '/workunits';
PATH_CANONICAL['/address'] = '/addresses';
PATH_CANONICAL['/workinstruction'] = '/workinstructions';
PATH_CANONICAL['/pesticide'] = '/pesticides';
PATH_CANONICAL['/personalsettings'] = '/me';
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip' };

function headers(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(),microphone=(),geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    ...extra,
  };
}

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, headers({ 'Content-Type': type, ...extra }));
  res.end(body);
}
function html(res, body, status = 200) { send(res, status, body); }
function redirect(res, location) { res.writeHead(302, headers({ Location: location })); res.end(); }
function json(res, data, status = 200) { send(res, status, JSON.stringify(data), 'application/json; charset=utf-8'); }
function download(res, content, filename, type = 'text/csv; charset=utf-8') {
  send(res, 200, content, type, { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
}
function serveFile(res, file, downloadName = '') {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const disposition = `${downloadName ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(downloadName || path.basename(file))}`;
  res.writeHead(200, headers({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size, 'Content-Disposition': disposition, 'Cache-Control': 'private, max-age=300' }));
  fs.createReadStream(file).pipe(res);
}
function safeBack(value, fallback = '/') {
  const text = str(value);
  return text.startsWith('/') && !text.startsWith('//') && !text.includes('\\') ? text : fallback;
}
// 從列表內刪除後回到原列表（只看 pathname，不信任外部主機）
function backTo(req, fallback) {
  const ref = str(req.headers.referer);
  if (!ref) return fallback;
  try { const url = new URL(ref); return url.pathname + url.search; } catch { return fallback; }
}
function sessionFrom(req) {
  const cookies = Object.fromEntries(str(req.headers.cookie).split(';').map((part) => {
    const i = part.indexOf('='); return [part.slice(0, i).trim(), i > 0 ? decodeURIComponent(part.slice(i + 1).trim()) : ''];
  }).filter((x) => x[0]));
  const session = sessions.get(cookies.sid);
  if (!session || Date.now() - session.at > 12 * 60 * 60 * 1000) {
    if (session) sessions.delete(cookies.sid);
    return null;
  }
  const user = store.userById(session.uid);
  if (!user || !user.active) return null;
  session.at = Date.now();
  return { ...session, user, sid: cookies.sid };
}
function newSession(res, user) {
  const sid = token(24);
  const session = { uid: user.id, csrf: token(18), at: Date.now() };
  sessions.set(sid, session);
  res.writeHead(302, headers({ 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`, Location: '/' }));
  res.end();
  return session;
}
async function bodyWithCsrf(req, session) {
  const body = await parseBody(req);
  const supplied = body.fields.__csrf || req.headers['x-csrf-token'];
  if (!session || !safeEqual(supplied, session.csrf)) throw new HttpError(403, '安全校驗失敗，請重新載入頁面後再提交');
  return body;
}
function requireRole(user, roles, key) { assertRole(user, roles, key); }
function recordOr404(key, id) {
  const row = store.get(key, id);
  if (!row) throw new HttpError(404, '找不到指定記錄');
  return row;
}
function formOverride(cfg, fields) {
  const row = { ...fields, id: str(fields.__id) || str(fields.__new_id) || uid(cfg.key.slice(0, 3)), updated_date: fields.__expected_updated || '' };
  for (const field of cfg.fields) {
    if (['items', 'files', 'json'].includes(field.type) && typeof row[field.name] === 'string') {
      try { row[field.name] = JSON.parse(row[field.name]); } catch {}
    }
  }
  delete row.__id; delete row.__new_id; delete row.__expected_updated; delete row.__csrf; delete row.__back;
  return row;
}
function simplePrint(title, content) {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px/1.5 "Microsoft JhengHei",sans-serif;color:#111}h1{font-size:20px}h2{font-size:15px;margin-top:20px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccd2d6;padding:5px 6px;text-align:left;vertical-align:top}th{background:#f0f3f4}.muted{color:#66717b}.noprint{margin:15px 0}.btn{padding:8px 16px;background:#0f6e56;color:#fff;border:0;border-radius:6px}@media print{.noprint{display:none}}</style></head><body><div class="noprint"><button class="btn" onclick="print()">列印 / 另存 PDF</button></div><h1>${esc(title)}</h1>${content}</body></html>`;
}

function publicReport(url) {
  const type = str(url.searchParams.get('type') || 'WorkRecord');
  const id = str(url.searchParams.get('record_id'));
  const supplied = str(url.searchParams.get('token'));
  let cfg = ENTITY_BY_NAME[type] || ENTITIES.work_records;
  let row = id ? store.get(cfg.key, id) : null;
  if (!row && supplied) {
    for (const candidate of [ENTITIES.work_records, ENTITIES.service_plan_logs]) {
      const found = store.list(candidate.key, { includeDeleted: true }).find((r) => r.shared_token === supplied);
      if (found) { cfg = candidate; row = found; break; }
    }
  }
  if (!row && url.searchParams.get('contract_id')) {
    cfg = ENTITIES.service_plan_logs;
    row = store.list(cfg.key, { includeDeleted: true }).find((r) => r.contract_id === url.searchParams.get('contract_id') && (!supplied || r.shared_token === supplied));
  }
  if (!row || !supplied || row.shared_token !== supplied) throw new HttpError(403, '公開連結無效或已失效');
  return { cfg, row, token: supplied };
}
function publicSignature(url, user = null) {
  const value = str(url.searchParams.get('token'));
  if (value) {
    const signature = store.signature(value);
    if (!signature) throw new HttpError(403, '簽署連結無效');
    const cfg = ENTITY_BY_NAME[signature.entity];
    const row = cfg ? store.get(cfg.key, signature.record_id) : null;
    if (!cfg || !row) throw new HttpError(404, '找不到簽署文件');
    return { signature, cfg, row, token: value };
  }
  const po = str(url.searchParams.get('po'));
  if (po && user) {
    const row = recordOr404('purchase_orders', po);
    assertEntity(user, ENTITIES.purchase_orders);
    return { signature: null, cfg: ENTITIES.purchase_orders, row, token: '' };
  }
  throw new HttpError(403, '請使用系統產生的安全簽署連結');
}
function publicFileAllowed(signature, cfg, row, url) {
  return collectAttachments(row).some((f) => f.url === url) || (signature?.signature_data === url);
}
function signatureForm({ cfg, row, token: signatureToken, url, error = '', csrf = '' }) {
  const action = signatureToken ? `/sign-certificate?token=${encodeURIComponent(signatureToken)}` : `/sign-certificate?po=${encodeURIComponent(row.id)}`;
  return publicLayout({ title: `簽署工程滿意紙 ${row.po_number || ''}`, body: `<h1>工程滿意紙簽署</h1><div class="sub">${esc(row.po_name || row.po_number || '')} · ${esc(row.customer_name || '')}</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}<div class="card"><dl class="detail-grid"><div class="detail-row"><dt>採購單</dt><dd>${esc(row.po_number || '—')}</dd></div><div class="detail-row"><dt>工作地點</dt><dd>${esc(row.work_location || '—')}</dd></div><div class="detail-row"><dt>客戶</dt><dd>${esc(row.customer_name || '—')}</dd></div><div class="detail-row"><dt>工作內容</dt><dd>${esc(row.work_content || '—')}</dd></div></dl></div><form class="card" method="post" action="${action}" id="sign-form">${!signatureToken && csrf ? `<input type="hidden" name="__csrf" value="${esc(csrf)}">` : ''}<div class="frow"><label>簽署人姓名 *</label><input name="signer_name" required maxlength="100"></div><div class="frow" style="margin-top:12px"><label>職銜（選填）</label><input name="signer_title" maxlength="100"></div><div class="frow" style="margin-top:12px"><label>請在下方簽署 *</label><canvas class="signature-pad" id="pad" width="760" height="240"></canvas><input type="hidden" name="signature_data" id="signature_data"><div class="bar" style="margin-top:8px"><button class="btn ghost" type="button" id="clear">清除</button><button class="btn" type="submit">確認簽署</button></div></div><p class="muted">提交即表示確認上述工程已完成。系統會記錄簽署時間及技術審計資料。</p></form><script>const c=document.getElementById('pad'),x=c.getContext('2d');x.lineWidth=2.4;x.lineCap='round';x.strokeStyle='#15242d';let drawing=false;x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);const point=e=>{const r=c.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return[(p.clientX-r.left)*c.width/r.width,(p.clientY-r.top)*c.height/r.height]};const start=e=>{drawing=true;const[a,b]=point(e);x.beginPath();x.moveTo(a,b);e.preventDefault()};const move=e=>{if(!drawing)return;const[a,b]=point(e);x.lineTo(a,b);x.stroke();e.preventDefault()};const end=()=>drawing=false;c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);document.addEventListener('mouseup',end);c.addEventListener('touchstart',start,{passive:false});c.addEventListener('touchmove',move,{passive:false});c.addEventListener('touchend',end);document.getElementById('clear').onclick=()=>{x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)};document.getElementById('sign-form').onsubmit=e=>{const data=c.toDataURL('image/png');if(data.length<1800){e.preventDefault();alert('請先簽署');return}document.getElementById('signature_data').value=data};</script>` });
}

function settingsPage({ user, csrf }) {
  requireRole(user, ['management'], 'company_settings');
  const company = store.list('company_settings', { includeDeleted: true })[0] || {};
  const keys = ['quota_limit', 'work_start', 'work_end', 'work_weekdays', 'window_enforced', 'demo_mode'];
  const body = `<h1>系統設置</h1><div class="sub">公司抬頭、編號前綴、保險到期日及本地安全參數</div><div class="bar"><a class="btn" href="${company.id ? `/edit/company_settings/${company.id}` : '/new/company_settings'}">編輯公司設置</a>${company.id ? `<a class="btn ghost" href="/edit/company_settings/${company.id}#f_company_logo">上傳Logo</a><a class="btn ghost" href="/edit/company_settings/${company.id}#f_company_signature">上傳簽名</a><a class="btn ghost" href="/edit/company_settings/${company.id}#f_company_stamp">上傳印章</a>` : ''}<a class="btn ghost" href="/admin">配額 / 假期 / 審計</a></div><form class="card" method="post" action="/settings/runtime"><h3>運行參數</h3><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="fgrid"><div class="frow"><label>每日客戶查看額度</label><input type="number" name="quota_limit" min="1" value="${esc(store.setting('quota_limit', '50'))}"></div><div class="frow"><label>工作日（1=週一，逗號分隔）</label><input name="work_weekdays" value="${esc(store.setting('work_weekdays', '1,2,3,4,5'))}"></div><div class="frow"><label>開始時間</label><input type="time" name="work_start" value="${esc(store.setting('work_start', '08:30'))}"></div><div class="frow"><label>結束時間</label><input type="time" name="work_end" value="${esc(store.setting('work_end', '18:00'))}"></div><div class="frow"><label>時間窗</label><select name="window_enforced"><option value="1"${store.setting('window_enforced') === '1' ? ' selected' : ''}>啟用</option><option value="0"${store.setting('window_enforced') === '0' ? ' selected' : ''}>停用（演示）</option></select></div><div class="frow"><label>快捷演示登入</label><select name="demo_mode"><option value="1"${store.setting('demo_mode', '1') === '1' ? ' selected' : ''}>啟用（本地演示）</option><option value="0"${store.setting('demo_mode') === '0' ? ' selected' : ''}>停用（正式）</option></select></div></div><button class="btn" style="margin-top:16px">保存設置</button></form><div class="card"><h3>公司資料</h3><dl class="detail-grid">${['company_email', 'company_phone', 'company_fax', 'company_address', 'company_website', 'current_year', 'service_quotation_prefix', 'product_quotation_prefix', 'invoice_prefix', 'receipt_prefix', 'third_party_insurance_expiry', 'labor_insurance_expiry', 'pesticide_permit_expiry', 'pesticide_license_expiry'].map((key) => `<div class="detail-row"><dt>${esc(key)}</dt><dd>${esc(company[key] || '—')}</dd></div>`).join('')}</dl></div>`;
  return layout({ title: '系統設置', body, user, active: 'company_settings', csrf });
}
function mePage({ user, csrf, message = '', error = '' }) {
  const body = `<h1>個人設置</h1><div class="sub">個人資料、頭像與密碼</div>${message ? `<div class="flash">${esc(message)}</div>` : ''}${error ? `<div class="flash error">${esc(error)}</div>` : ''}<div class="two-col"><div><form class="card" method="post" action="/me/profile"><h3>個人資料</h3><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="frow"><label>姓名</label><input name="name" value="${esc(user.name)}" required></div><div class="frow" style="margin-top:12px"><label>電郵（登入帳號）</label><input value="${esc(user.email)}" readonly></div><div class="frow" style="margin-top:12px"><label>角色</label><input value="${esc(user.role)}" readonly></div><button class="btn" style="margin-top:15px">儲存姓名</button></form><form class="card" method="post" action="/me/avatar" enctype="multipart/form-data"><h3>頭像</h3><input type="hidden" name="__csrf" value="${esc(csrf)}">${user.avatar_url ? `<img src="${esc(user.avatar_url)}" alt="頭像" style="width:90px;height:90px;object-fit:cover;border-radius:50%;margin-bottom:12px">` : ''}<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required><button class="btn ghost" style="margin-top:12px">上傳 / 更換頭像</button></form></div><form class="card" method="post" action="/me/password"><h3>修改密碼</h3><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="frow"><label>目前密碼</label><input type="password" name="current" autocomplete="current-password" required></div><div class="frow" style="margin-top:12px"><label>新密碼（至少 10 位，含字母及數字）</label><input type="password" name="password" autocomplete="new-password" minlength="10" required></div><div class="frow" style="margin-top:12px"><label>確認新密碼</label><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></div><button class="btn" style="margin-top:15px">修改密碼</button>${user.must_change ? '<p class="notice warn">首次登入必須修改密碼。</p>' : ''}</form><form class="card" method="post" action="/me/deactivate" data-confirm="停用後會立即登出，需管理員重新啟用。確定停用我的帳號？"><h3>停用我的帳號</h3><input type="hidden" name="__csrf" value="${esc(csrf)}"><p class="muted">這是 Delete Account 的安全替代：不永久刪除業務資料，管理員可恢復。</p><div class="frow"><label>輸入目前密碼確認</label><input type="password" name="current" autocomplete="current-password" required></div><button class="btn danger" style="margin-top:14px">停用我的帳號</button></form></div>`;
  return layout({ title: '個人設置', body, user, active: 'me', csrf });
}
function usersPage({ user, csrf }) {
  requireRole(user, ['management'], 'users');
  const rows = store.users();
  const roleOptions = ['front', 'office', 'accounting', 'management'];
  const body = `<h1>用戶管理</h1><div class="sub">共 ${rows.length} 個本地帳號；空白頁面白名單表示使用角色默認頁面</div><details class="card"><summary><b>新增用戶 / 發送邀請</b></summary><form method="post" action="/users/save" style="margin-top:15px"><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="fgrid"><div class="frow"><label>姓名 *</label><input name="name" required></div><div class="frow"><label>電郵 *</label><input type="email" name="email" required></div><div class="frow"><label>角色</label><select name="role">${roleOptions.map((r) => `<option>${r}</option>`).join('')}</select></div><div class="frow"><label>初始密碼 *</label><input type="password" name="password" minlength="10" required></div><div class="frow wide"><label>可訪問頁面（逗號分隔，留空按角色）</label><input name="accessible_pages" placeholder="Dashboard,Customers,Quotations"></div></div><input type="hidden" name="active" value="1"><input type="hidden" name="must_change" value="1"><button class="btn" style="margin-top:15px">建立帳號</button></form></details><div class="card flush table-wrap"><table><thead><tr><th>姓名 / 電郵</th><th>角色</th><th>綁定員工</th><th>可訪問頁面</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map((r) => `<tr><form method="post" action="/users/save" id="u_${r.id}"></form><td><input form="u_${r.id}" name="name" value="${esc(r.name)}"><br><input form="u_${r.id}" type="email" name="email" value="${esc(r.email)}"></td><td><select form="u_${r.id}" name="role">${roleOptions.map((role) => `<option${role === r.role ? ' selected' : ''}>${role}</option>`).join('')}</select></td><td><input form="u_${r.id}" name="employee_id" value="${esc(r.employee_id || '')}" placeholder="Employee ID"></td><td><input form="u_${r.id}" name="accessible_pages" value="${esc(r.accessible_pages || '')}" style="min-width:210px"><br><input form="u_${r.id}" type="password" name="password" minlength="10" placeholder="重設密碼（留空不變）"></td><td><input form="u_${r.id}" type="hidden" name="active" value="0"><label><input form="u_${r.id}" type="checkbox" name="active" value="1"${r.active ? ' checked' : ''}> 啟用</label><br><label><input form="u_${r.id}" type="checkbox" name="must_change" value="1"${r.must_change ? ' checked' : ''}> 首次改密</label></td><td><input form="u_${r.id}" type="hidden" name="__csrf" value="${esc(csrf)}"><input form="u_${r.id}" type="hidden" name="id" value="${r.id}"><button class="btn small">保存</button></td></tr>`).join('')}</tbody></table></div><p class="muted">原系統 User 表因 403 未能導出；這裡管理新系統帳號。真實 50 名用戶需按名單建立，不會假稱已恢復。</p>`;
  return layout({ title: '用戶管理', body, user, active: 'users', csrf, wide: true });
}
function adminPage({ user, csrf }) {
  requireRole(user, ['management'], 'admin');
  const today = hkNow().date;
  const quotas = store.db.prepare('SELECT q.*,u.name,u.role FROM quota q JOIN users u ON u.id=q.user_id WHERE q.day=? ORDER BY u.name').all(today);
  const holidays = store.db.prepare('SELECT * FROM holidays ORDER BY date').all();
  const logs = store.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 60').all();
  const notices = store.db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 20').all();
  const body = `<h1>管理後台</h1><div class="sub">配額、假期、告警與審計</div><div class="two-col"><div class="card"><h3>今日查看額度（${today}）</h3>${simpleTable([{ key: 'name', label: '員工' }, { key: 'used', label: '已用' }, { key: 'extra', label: '追加' }, { key: 'actions', label: '操作', value: (q) => `<form class="bar" method="post" action="/admin/quota"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="hidden" name="uid" value="${q.user_id}"><input type="number" name="add" value="20" style="width:70px"><button class="btn small">追加</button></form>` }], quotas)}</div><div class="card"><h3>時間窗</h3><p>目前：${store.setting('window_enforced') === '1' ? '啟用' : '停用（演示）'}</p><form method="post" action="/admin/window"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="hidden" name="value" value="${store.setting('window_enforced') === '1' ? '0' : '1'}"><button class="btn ghost">${store.setting('window_enforced') === '1' ? '暫停時間窗' : '重新啟用時間窗'}</button></form><h3 style="margin-top:20px">告警</h3>${notices.map((n) => `<div class="notice warn"><b>${esc(n.message)}</b><span>${esc(n.at)}</span><div class="muted">${esc(n.detail)}</div></div>`).join('') || '<p class="muted">暫無告警</p>'}</div></div><div class="card"><h3>公眾假期</h3><form class="bar" method="post" action="/admin/holiday"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="date" name="date" required><input name="name" placeholder="假期名稱" required><button class="btn">新增 / 覆蓋</button></form><div style="max-height:350px;overflow:auto">${simpleTable([{ key: 'date', label: '日期' }, { key: 'name', label: '名稱' }, { key: 'actions', label: '操作', value: (h) => `<form method="post" action="/admin/holiday/del"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="hidden" name="date" value="${h.date}"><button class="btn danger small">刪除</button></form>` }], holidays)}</div></div><h2>最近審計（60 條）</h2>${simpleTable([{ key: 'at', label: '時間' }, { key: 'actor_name', label: '使用者' }, { key: 'action', label: '動作' }, { key: 'entity', label: '實體' }, { key: 'record_label', label: '記錄' }, { key: 'via', label: '來源' }, { key: 'masked_fields', label: '遮蔽' }], logs)}`;
  return layout({ title: '管理後台', body, user, active: 'admin', csrf, wide: true });
}
function inventoryPage({ store: db, url, user, csrf }) {
  requireRole(user, ENTITIES.stock_adjustments.viewRoles, 'stock_adjustments');
  const tab = str(url.searchParams.get('tab') || 'stock');
  const products = db.list('products');
  const adjustments = db.list('stock_adjustments').sort((a, b) => str(b.adjustment_date).localeCompare(str(a.adjustment_date))).slice(0, 150);
  const counts = db.list('stock_counts').sort((a, b) => str(b.count_date).localeCompare(str(a.count_date))).slice(0, 100);
  const canEdit = ENTITIES.stock_adjustments.editRoles.includes(user.role);
  const totalValue = products.reduce((s, p) => s + num(p.stock_quantity) * num(p.cost_price), 0);
  const delForm = (key, id, label = '刪除') => `<form method="post" action="/delete/${key}/${encodeURIComponent(id)}" style="display:inline" data-confirm="確定將此記錄移至回收桶？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn danger small">${label}</button></form>`;
  let table;
  if (tab === 'adjustments') {
    table = simpleTable([
      { key: 'adjustment_number', label: '單號', value: (r) => `<a class="tlink" href="/view/stock_adjustments/${r.id}">${esc(r.adjustment_number)}</a>` },
      { key: 'adjustment_date', label: '日期', type: 'date' }, { key: 'adjustment_type', label: '類型', type: 'pill' },
      { key: 'product_code', label: '產品編號' }, { key: 'product_name', label: '產品' },
      { key: 'quantity_before', label: '之前' }, { key: 'quantity_change', label: '變動' }, { key: 'quantity_after', label: '結存' },
      { key: 'actions', label: '操作', value: (r) => `${delForm('stock_adjustments', r.id)}` },
    ], adjustments, { canSeeAmounts: canSeeAmounts(user) });
  } else if (tab === 'counts') {
    table = simpleTable([
      { key: 'count_number', label: '盤點單號', value: (r) => `<a class="tlink" href="/view/stock_counts/${r.id}">${esc(r.count_number)}</a>` },
      { key: 'count_date', label: '盤點日期', type: 'date' }, { key: 'completed_by', label: '盤點人' },
      { key: 'items', label: '項目數', value: (r) => { const list = arr(r.items); return list.length ? `<details><summary><b>${list.length} 項</b></summary><div class="muted" style="margin-top:4px">${list.slice(0, 30).map((it) => `${esc(it.product_code || '')} ${esc(it.product_name || '')}：${esc(it.system_quantity ?? '—')} → ${esc(it.actual_quantity ?? '—')}（${num(it.difference) > 0 ? '+' : ''}${esc(it.difference ?? '—')}）`).join('<br>')}</div></details>` : '<span class="muted">—</span>'; } },
      { key: 'status', label: '狀態', type: 'pill' },
      { key: 'stock_posted', label: '已過賬', value: (r) => r.stock_posted ? (r.stock_reversed ? '<span class="pill y">已沖銷</span>' : '<span class="pill g">是</span>') : '<span class="pill">否</span>' },
      { key: 'actions', label: '操作', value: (r) => `${delForm('stock_counts', r.id)}` },
    ], counts);
  } else {
    table = `<form method="post" action="/inventory/delete" id="invForm">${`<input type="hidden" name="__csrf" value="${esc(csrf)}">`}
      <div class="bar noprint"><button class="btn danger" type="submit" onclick="return confirm('將選取的產品移至回收桶？庫存記錄會一併隱藏，可在回收桶還原。')">刪除選取</button><span class="muted">勾選左側方框可批量刪除產品（進回收桶，可還原）</span></div>
      <div class="card flush table-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="invAll" aria-label="全選"></th><th>產品編號</th><th>產品名稱</th><th>庫存數量</th><th>來貨價</th><th>庫存值</th><th>狀態</th><th>操作</th></tr></thead><tbody>${products.length ? products.map((r) => `<tr><td><input type="checkbox" name="ids" value="${esc(r.id)}" aria-label="選取"></td><td><a class="tlink" href="/view/products/${r.id}">${esc(r.product_code)}</a></td><td>${esc(r.product_name)}</td><td>${esc(r.stock_quantity ?? 0)}</td><td class="num">${canSeeAmounts(user) ? `<span class="num">${money(num(r.cost_price))}</span>` : '<span class="mask">•••••</span>'}</td><td class="num">${canSeeAmounts(user) ? `<span class="num">${money(num(r.stock_quantity) * num(r.cost_price))}</span>` : '<span class="mask">•••••</span>'}</td><td>${num(r.stock_quantity) < 10 ? '<span class="pill r">低庫存</span>' : '<span class="pill g">正常</span>'}</td><td class="actions"><a class="btn ghost small" href="/new/stock_adjustments?productId=${encodeURIComponent(r.id)}">調整</a> ${delForm('products', r.id)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">暫無產品</td></tr>'}</tbody></table></div></form>
      <script>(function(){var a=document.getElementById('invAll');if(a)a.addEventListener('change',function(){document.querySelectorAll('input[name="ids"]').forEach(function(b){b.checked=a.checked})})})();</script>`;
  }
  const body = `<h1>庫存管理</h1><div class="sub">產品、調整、盤點及送貨單過賬</div>${kpis([{ label: '產品種類', value: products.length }, { label: '總庫存量', value: products.reduce((s, p) => s + num(p.stock_quantity), 0).toLocaleString() }, { label: '庫存總值', value: canSeeAmounts(user) ? `HK$ ${totalValue.toLocaleString('en-HK', { maximumFractionDigits: 2 })}` : '•••••' }, { label: '低庫存（<10）', value: products.filter((p) => num(p.stock_quantity) < 10).length }])}<div class="bar noprint"><a class="btn ${tab === 'stock' ? '' : 'ghost'}" href="/inventory">庫存列表</a><a class="btn ${tab === 'adjustments' ? '' : 'ghost'}" href="/inventory?tab=adjustments">調整記錄</a><a class="btn ${tab === 'counts' ? '' : 'ghost'}" href="/inventory?tab=counts">盤點記錄</a><a class="btn ghost" href="/trash?module=${tab === 'counts' ? 'stock_counts' : tab === 'adjustments' ? 'stock_adjustments' : 'products'}">回收桶</a>${canEdit ? `<a class="btn" href="/new/stock_adjustments">庫存調整</a><a class="btn" href="/new/stock_counts">新增盤點</a><form method="post" action="/inventory/backfill" data-confirm="將對所有已送達但未過賬的送貨單補扣庫存，確定？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn ghost">補錄歷史送貨單庫存</button></form>` : ''}</div>
    ${url.searchParams.get('posted') ? `<div class="notice"><b>補錄完成</b>成功 ${esc(url.searchParams.get('posted'))} 張，跳過 ${esc(url.searchParams.get('skipped') || 0)} 張。</div>` : ''}
    ${url.searchParams.get('purged') ? `<div class="notice"><b>已处理</b>${esc(url.searchParams.get('purged'))}</div>` : ''}
    ${tab === 'counts' ? '<div class="notice noprint"><b>盤點與庫存如何聯動</b>盤點單狀態改為「已完成」時，系統會把每個產品的實際數量寫回庫存，並自動生成一張「盤點調整」單記錄差異。已過賬的盤點單被刪除時，會先自動生成反向調整把庫存沖回盤點前數量，再移入回收桶。</div>' : ''}
    ${table}`;
  return layout({ title: '庫存管理', body, user, active: 'stock_adjustments', csrf, wide: true });
}
function tollPage({ user, csrf, report = null, error = '' }) {
  requireRole(user, ENTITIES.vehicle_expenses.editRoles, 'vehicle_expenses');
  const body = `<h1>易通行費用匯入</h1><div class="sub">貼上易通行電郵文字或 CSV 內容，系統按車牌、日期、金額與參考編號去重</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}${report ? `<div class="notice"><b>匯入完成</b>新增 ${report.created} 筆，跳過 ${report.skipped} 筆，錯誤 ${report.errors.length} 筆。</div>` : ''}<form class="card" method="post" action="/TollEmailImport"><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="frow"><label>電郵 / CSV 內容</label><textarea name="text" rows="14" required placeholder="TG4278,2026-10-24,HK$38.00,REF123,青衣幹線"></textarea></div><div class="bar" style="margin-top:14px"><button class="btn">分析並匯入</button><a class="btn ghost" href="/vehicles">返回車輛</a></div><p class="muted">每一行應至少包含已登記車牌、日期及一個金額。重複記錄會跳過；無法識別的行不會寫入。</p></form>`;
  return layout({ title: '易通行費用匯入', body, user, active: 'vehicles', csrf });
}

async function handle(req, res) {
  const requestedUrl = new URL(req.url, 'http://localhost');
  const canonical = PATH_CANONICAL[requestedUrl.pathname.toLowerCase()];
  const url = canonical ? new URL(canonical + requestedUrl.search, 'http://localhost') : requestedUrl;
  const p = url.pathname;
  let session = sessionFrom(req);
  let user = session?.user || null;

  if (p === '/login' && req.method === 'GET') return html(res, loginPage({ demo: store.setting('demo_mode', '1') === '1' && process.env.CPC_DEMO !== '0' }));
  if (p === '/login' && req.method === 'POST') {
    const { fields } = await parseBody(req);
    const email = str(fields.email).trim().toLowerCase();
    const failureKey = `${req.socket.remoteAddress}|${email}`;
    const failure = store.loginFailure(failureKey);
    if (failure?.locked_until && failure.locked_until > new Date().toISOString()) throw new HttpError(429, '登入失敗次數過多，請 15 分鐘後再試');
    const row = store.userByEmail(email);
    if (!row || !row.active || !verifyPassword(fields.password, row.pass_hash)) {
      store.recordLoginFailure(failureKey);
      return html(res, loginPage({ error: '帳號或密碼不正確', demo: store.setting('demo_mode', '1') === '1' }));
    }
    store.clearLoginFailures(failureKey);
    store.audit({ user: row, action: 'login', entity: 'User', id: row.id, label: row.email, via: 'password', req });
    return newSession(res, row);
  }
  if (p === '/demo' && store.setting('demo_mode', '1') === '1' && process.env.CPC_DEMO !== '0') {
    const ids = { office: 'u-office', front: 'u-front', accounting: 'u-acc', management: 'u-mgmt' };
    const row = store.userById(ids[url.searchParams.get('as')]);
    if (row) return newSession(res, row);
  }
  if (p === '/PublicReportView' && req.method === 'GET') {
    const { cfg, row, token: publicToken } = publicReport(url);
    if (cfg.key === 'work_records') return html(res, workRecordPrint({ row, store, publicToken }));
    const body = `<h1>${esc(row.record_name || row.report_title || '服務計劃報告')}</h1><div class="sub">${esc(row.customer_name || '')} · ${esc(row.work_date || '')}</div><div class="card"><dl class="detail-grid">${cfg.fields.map((f) => `<div class="detail-row ${['items', 'json', 'files', 'textarea'].includes(f.type) ? 'wide' : ''}"><dt>${esc(f.label)}</dt><dd>${renderValue(row[f.name], f, { publicToken, canSeeAmounts: false })}</dd></div>`).join('')}</dl></div>`;
    return html(res, publicLayout({ title: row.record_name || '服務計劃報告', body }));
  }
  if (p === '/sign-certificate' && req.method === 'GET') {
    const current = publicSignature(url, user);
    if (current.signature?.signed_at || current.row.signed_date || current.row.completion_certificate?.signed_date) return html(res, completionCertificate({ row: current.row, store, publicToken: current.token, readOnly: true }));
    return html(res, signatureForm({ ...current, url, csrf: session?.csrf || '' }));
  }
  if (p === '/sign-certificate' && req.method === 'POST') {
    const current = publicSignature(url, user);
    if (current.signature?.signed_at) throw new HttpError(409, '此文件已完成簽署');
    const { fields } = await parseBody(req, 3 * 1024 * 1024);
    if (!current.token && (!session || !safeEqual(fields.__csrf, session.csrf))) throw new HttpError(403, '安全校驗失敗，請重新載入');
    const name = str(fields.signer_name).trim();
    const data = str(fields.signature_data);
    if (!name || !data.startsWith('data:image/png;base64,') || data.length > 2_000_000) return html(res, signatureForm({ ...current, url, csrf: session?.csrf || '', error: '請填寫簽署人並完成有效簽名' }), 400);
    const signedAt = new Date().toISOString();
    if (current.signature) store.sign(current.token, { signer_name: name, signer_title: str(fields.signer_title), signature_data: data }, req);
    current.row.signed_by = name; current.row.signed_date = signedAt; current.row.signing_status = '已簽署'; current.row.signature_image = data;
    current.row.completion_certificate = { ...(current.row.completion_certificate || {}), signed_by: name, signed_date: signedAt, signature_image: data };
    store.save(current.cfg.key, current.row, { id: current.row.id, user });
    store.audit({ user, action: 'sign', entity: current.cfg.entity, id: current.row.id, label: current.row.po_number, shown: `signer=${name}`, via: 'public-sign', req });
    return html(res, completionCertificate({ row: current.row, store, publicToken: current.token, readOnly: true }));
  }
  if (p === '/signature-image') {
    const signature = store.signature(url.searchParams.get('token'));
    if (!signature?.signature_data?.startsWith('data:image/png;base64,')) throw new HttpError(404, '找不到簽名');
    const buffer = Buffer.from(signature.signature_data.split(',')[1], 'base64');
    return send(res, 200, buffer, 'image/png', { 'Cache-Control': 'private, max-age=300' });
  }
  if (p === '/public-attachment' || p === '/public-upload') {
    const report = publicReport(url);
    const source = p === '/public-upload' ? str(url.searchParams.get('path')) : str(url.searchParams.get('url'));
    if (!publicFileAllowed(null, report.cfg, report.row, source)) throw new HttpError(403, '附件不屬於此公開報告');
    const file = p === '/public-upload' ? store.resolveUpload(source) : store.resolveAttachment(source);
    if (!file) throw new HttpError(404, '附件不存在');
    return serveFile(res, file);
  }

  if (!session) {
    if (req.method !== 'GET') throw new HttpError(401, '登入已失效');
    return redirect(res, `/login?from=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const csrf = session.csrf;
  if (p === '/logout') {
    sessions.delete(session.sid);
    res.writeHead(302, headers({ 'Set-Cookie': 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', Location: '/login' }));
    return res.end();
  }

  if (p === '/attachment') {
    const file = store.resolveAttachment(url.searchParams.get('url'));
    if (!file) throw new HttpError(404, '附件不存在或尚未下載');
    return serveFile(res, file);
  }
  if (p.startsWith('/uploads/')) {
    const file = store.resolveUpload(p);
    if (!file) throw new HttpError(404, '附件不存在');
    return serveFile(res, file);
  }
  if (p === '/upload' && req.method === 'POST') {
    const body = await bodyWithCsrf(req, session);
    const cfg = ENTITIES[body.fields.key];
    if (!cfg) throw new HttpError(404, '未知上傳實體');
    assertEntity(user, cfg, true);
    const id = str(body.fields.id);
    if (!/^[A-Za-z0-9_-]{1,110}$/.test(id)) throw new HttpError(400, '無效記錄 ID');
    if (!store.get(cfg.key, id)) store.save(cfg.key, { id, _draft: true }, { id, user });
    const file = store.saveUpload({ keyOrEntity: cfg.key, id, field: body.fields.field, file: body.files.file, user });
    return json(res, { ok: true, file });
  }

  if (p === '/api/pick' && req.method === 'GET') {
    const source = str(url.searchParams.get('source'));
    const def = PICK_SOURCES[source];
    if (!def) throw new HttpError(404, '未知選擇器資料源');
    // SEC-01：選擇器是表單入口，權限必須與實體頁一致。否則前線可用它繞過
    // /customers 的 403，把 1,608 個客戶連電話一起拉走；產品成本價同理。
    // 判據仍取自實體 viewRoles，只有明確例外才放行（見 PICK_SOURCE_EXTRA_ROLES）。
    const pickCfg = PICK_SOURCE_ENTITY[source] ? ENTITIES[PICK_SOURCE_ENTITY[source]] : null;
    if (pickCfg) {
      const allowed = [...(pickCfg.viewRoles || []), ...(PICK_SOURCE_EXTRA_ROLES[source] || [])];
      if (!allowed.includes(user.role)) throw new HttpError(403, '無權使用此選擇器');
    }
    const query = str(url.searchParams.get('q'));
    const limit = Math.min(50, Math.max(5, Number(url.searchParams.get('limit') || 20)));
    const rows = searchPick(store, source, query, limit).map((row) => ({ ...row, fill: pickFillForRole(row.fill, user) }));
    const amountsHidden = !['accounting', 'management'].includes(user.role);
    store.audit({
      user, action: 'pick', entity: pickCfg ? pickCfg.entity : source, label: def.label,
      shown: `source=${source} rows=${rows.length}`,
      masked: [amountsHidden ? 'amounts' : '', user.role === 'front' ? 'contact' : ''].filter(Boolean).join(','),
      via: 'api', req,
    });
    return json(res, rows);
  }
  if (p.startsWith('/save/') && req.method === 'POST') {
    const cfg = ENTITIES[p.slice(6)];
    if (!cfg) throw new HttpError(404, '未知實體');
    assertEntity(user, cfg, true);
    const body = await bodyWithCsrf(req, session);
    if (body.fields.__id) assertEntity(user, cfg, true);
    if (cfg.key === 'vehicle_expenses' && user.role === 'front' && body.fields.__id) throw new HttpError(403, '前線可新增車輛費用，修改請聯絡辦公室');
    try {
      const saved = saveEntity({ store, cfg, fields: body.fields, user });
      const target = safeBack(body.fields.__back, `/view/${cfg.key}/${encodeURIComponent(saved.id)}`);
      // 排班存檔後回到同一日曆，並標示剛存的那一天（解決「新增完不知道加到哪」）
      if (cfg.key === 'schedules') return redirect(res, `${target}${target.includes('?') ? '&' : '?'}saved=${encodeURIComponent(str(saved.schedule_date))}`);
      return redirect(res, target);
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) throw error;
      // 重繪表單時若 __id 指向已不存在的記錄，entityForm 會再丟 404（變成空白錯誤頁）。
      // 這裡先確認記錄還在，否則以「新增」表單重繪，把使用者填過的內容原樣留住。
      const retryId = str(body.fields.__id) && store.get(cfg.key, str(body.fields.__id)) ? str(body.fields.__id) : '';
      return html(res, entityForm({ store, cfg, id: retryId, url, user, csrf, error: error.message, override: formOverride(cfg, body.fields), back: safeBack(body.fields.__back, cfg.listPath) }), error.statusCode);
    }
  }
  if (p.startsWith('/delete/') && req.method === 'POST') {
    const [, , key, ...rest] = p.split('/');
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知實體');
    assertEntity(user, cfg, true);
    await bodyWithCsrf(req, session);
    const id = decodeURIComponent(rest.join('/'));
    const row = recordOr404(key, id);
    if (!canEditRecord(user, cfg, row)) throw new HttpError(403, '只能刪除自己的記錄');
    if (key === 'delivery_notes' && row.stock_synced) throw new HttpError(409, '已扣庫存的送貨單不可直接刪除，請先以反向調整處理');
    if (key === 'vehicle_expenses' && user.role === 'front') throw new HttpError(403, '前線可新增車輛費用，刪除請聯絡辦公室');
    if (key === 'stock_counts') reverseStockCount({ store, id, user });
    store.setDeleted(key, id, true, user);
    return redirect(res, backTo(req, `/view/${key}/${encodeURIComponent(id)}`));
  }
  if (p.startsWith('/restore/') && req.method === 'POST') {
    const [, , key, ...rest] = p.split('/');
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知實體');
    assertEntity(user, cfg, true);
    await bodyWithCsrf(req, session);
    const id = decodeURIComponent(rest.join('/'));
    if (key === 'stock_counts') reverseStockCount({ store, id, user, redo: true });
    store.setDeleted(key, id, false, user);
    return redirect(res, backTo(req, `/view/${key}/${encodeURIComponent(id)}`));
  }
  if (p.startsWith('/print/') && req.method === 'GET') {
    const [, , key, ...rest] = p.split('/');
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知實體');
    assertEntity(user, cfg);
    if (!canSeeAmounts(user) && ['quotations', 'invoices', 'receipts', 'contracts', 'purchase_orders', 'bills', 'payments'].includes(key)) throw new HttpError(403, '你沒有權限列印含金額文件');
    const row = recordOr404(key, decodeURIComponent(rest.join('/')));
    store.audit({ user, action: 'print', entity: cfg.entity, id: row.id, label: row[cfg.labelField], via: 'document', req });
    return send(res, 200, printDocument({ cfg, row, store, user }), 'text/html; charset=utf-8', {
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    });
  }
  if ((p.startsWith('/export/') || p.startsWith('/export-')) && p.endsWith('.csv')) {
    const key = p.slice(8, -4);
    if (key === 'attendance') {
      requireRole(user, ['management'], 'attendances');
      const month = str(url.searchParams.get('m')) || hkNow().month;
      const rows = store.list('attendances').filter((r) => str(r.attendance_date).startsWith(month));
      const columns = ['employee_name', 'attendance_date', 'hours', 'attendance_type', 'notes'];
      const csv = '\uFEFF' + columns.join(',') + '\r\n' + rows.map((r) => columns.map((c) => `"${str(r[c]).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      return download(res, csv, `attendance-${month}.csv`);
    }
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知匯出實體');
    const result = exportEntity({ store, cfg, url, user });
    return download(res, result.csv, result.filename);
  }
  if (p.startsWith('/import/')) {
    const cfg = ENTITIES[p.slice(8)]; if (!cfg) throw new HttpError(404, '未知匯入實體');
    assertEntity(user, cfg, true);
    if (req.method === 'GET') return html(res, importPage({ store, cfg, user, csrf }));
    const body = await bodyWithCsrf(req, session);
    const csv = body.files.file?.data?.toString('utf8') || str(body.fields.csv);
    const report = importEntity({ store, cfg, csv, mode: body.fields.mode, user });
    return html(res, importPage({ store, cfg, user, csrf, report }));
  }

  if (p === '/customers/merge') {
    if (req.method === 'GET') return html(res, customerMergePage({ store, user, csrf }));
    const { fields } = await bodyWithCsrf(req, session);
    const result = mergeCustomers({ store, sourceId: fields.source_id, targetId: fields.target_id, user });
    return html(res, customerMergePage({ store, user, csrf, result }));
  }
  if (p.startsWith('/quotations/') && p.endsWith('/stage') && req.method === 'POST') {
    requireRole(user, ENTITIES.quotations.editRoles, 'quotations');
    const id = decodeURIComponent(p.slice('/quotations/'.length, -'/stage'.length));
    const { fields } = await bodyWithCsrf(req, session);
    const row = recordOr404('quotations', id);
    const allowed = ['已報價', '跟進中', '已收PO', '已成交', '已取消', '失敗'];
    if (!allowed.includes(fields.stage)) throw new HttpError(400, '無效報價階段');
    row.stage = fields.stage;
    if (fields.stage === '已成交') { row.accepted = true; row.accepted_date ||= hkNow().date; }
    store.save('quotations', row, { id, user });
    return redirect(res, `/view/quotations/${encodeURIComponent(id)}`);
  }
  if (p.startsWith('/quotations/') && req.method === 'POST' && ['/to-po', '/to-contract', '/to-invoice'].some((s) => p.endsWith(s))) {
    requireRole(user, ENTITIES.quotations.editRoles, 'quotations');
    await bodyWithCsrf(req, session);
    const suffix = ['/to-po', '/to-contract', '/to-invoice'].find((s) => p.endsWith(s));
    const id = decodeURIComponent(p.slice('/quotations/'.length, -suffix.length));
    const target = suffix === '/to-po' ? 'purchase_orders' : suffix === '/to-contract' ? 'contracts' : 'invoices';
    const result = convertQuotation({ store, quotationId: id, target, user });
    return redirect(res, `/view/${result.cfg.key}/${encodeURIComponent(result.row.id)}`);
  }
  if (p.startsWith('/invoices/') && p.endsWith('/receipt') && req.method === 'POST') {
    requireRole(user, ['accounting', 'management'], 'receipts');
    const id = decodeURIComponent(p.slice('/invoices/'.length, -'/receipt'.length));
    const { fields } = await bodyWithCsrf(req, session);
    const receipt = collectReceipt({ store, invoiceId: id, fields, user });
    return redirect(res, `/view/receipts/${encodeURIComponent(receipt.id)}`);
  }
  if (p.startsWith('/purchase_orders/') && p.endsWith('/share') && req.method === 'POST') {
    requireRole(user, ENTITIES.purchase_orders.editRoles, 'purchase_orders');
    const id = decodeURIComponent(p.slice('/purchase_orders/'.length, -'/share'.length));
    await bodyWithCsrf(req, session);
    const row = recordOr404('purchase_orders', id);
    const value = store.createSignature({ entity: 'PurchaseOrder', recordId: id });
    row.signing_link = `/sign-certificate?token=${value}`; row.signing_status = '待簽署';
    store.save('purchase_orders', row, { id, user });
    return redirect(res, `/view/purchase_orders/${encodeURIComponent(id)}`);
  }
  if ((p.startsWith('/work_records/') || p.startsWith('/service_plan_logs/')) && p.endsWith('/share') && req.method === 'POST') {
    const key = p.startsWith('/work_records/') ? 'work_records' : 'service_plan_logs';
    requireRole(user, ENTITIES[key].editRoles, key);
    const id = decodeURIComponent(p.slice(`/${key}/`.length, -'/share'.length));
    await bodyWithCsrf(req, session);
    const row = recordOr404(key, id);
    row.shared_token ||= token(32);
    store.save(key, row, { id, user });
    return redirect(res, `/view/${key}/${encodeURIComponent(id)}`);
  }
  if (p.startsWith('/recurring_schedules/') && p.endsWith('/generate') && req.method === 'POST') {
    requireRole(user, ENTITIES.recurring_schedules.editRoles, 'recurring_schedules');
    const id = decodeURIComponent(p.slice('/recurring_schedules/'.length, -'/generate'.length));
    await bodyWithCsrf(req, session);
    const report = generateRecurringSchedules({ store, id, user });
    return redirect(res, `/view/recurring_schedules/${encodeURIComponent(id)}?created=${report.created}`);
  }
  if (p.startsWith('/schedules/') && p.endsWith('/move') && req.method === 'POST') {
    requireRole(user, ENTITIES.schedules.editRoles, 'schedules');
    const id = decodeURIComponent(p.slice('/schedules/'.length, -'/move'.length));
    const { fields } = await bodyWithCsrf(req, session);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) throw new HttpError(400, '無效排班日期');
    moveSchedule({ store, id, date: fields.date, user });
    return json(res, { ok: true });
  }
  if (p.startsWith('/leaves/') && p.endsWith('/decide') && req.method === 'POST') {
    requireRole(user, ['management'], 'leave_records');
    const id = decodeURIComponent(p.slice('/leaves/'.length, -'/decide'.length));
    const { fields } = await bodyWithCsrf(req, session);
    if (!['已批准', '已拒絕', '待審批'].includes(str(fields.status))) throw new HttpError(400, '無效的審批狀態');
    const row = recordOr404('leave_records', id);
    row.status = str(fields.status);
    row.decided_by = user.name;
    row.decided_at = hkNow().full;
    store.save('leave_records', row, { id, user });
    store.audit({ user, action: 'approve', entity: 'LeaveRecord', id, label: row.employee_name, shown: `status=${row.status}`, via: 'leave', req });
    return redirect(res, safeBack(fields.__back, '/leaves'));
  }
  if (p === '/trash' && req.method === 'GET') {
    requireRole(user, ['office', 'management'], 'trash');
    return html(res, trashPage({ store, url, user, csrf }));
  }
  if ((p === '/trash/restore' || p === '/trash/purge') && req.method === 'POST') {
    requireRole(user, ['office', 'management'], 'trash');
    const purge = p === '/trash/purge';
    const { fields } = await bodyWithCsrf(req, session);
    const items = [];
    if (fields.item) items.push(...(Array.isArray(fields.item) ? fields.item : [fields.item]));
    if (fields.key && fields.id) items.push(`${fields.key}|${fields.id}`);
    const targets = items.map((raw) => {
      const [key, ...rest] = str(raw).split('|');
      const cfg = ENTITIES[key];
      return cfg && cfg.softDelete ? { cfg, id: rest.join('|') } : null;
    }).filter(Boolean);
    if (!targets.length) return redirect(res, '/trash');
    // 辦公室每日 10 條上限；超出即拒絕並推送管理層
    if (user.role === 'office') {
      const used = trashUsedToday(store, user);
      if (used + targets.length > TRASH_DAILY_LIMIT) {
        store.notify(`辦公室員工 ${user.name} 回收桶操作超出每日上限`, `今日已用 ${used} 條，本次嘗試 ${targets.length} 條（上限 ${TRASH_DAILY_LIMIT}）`, 'trash');
        return html(res, trashPage({ store, url, user, csrf, error: `已達辦公室每日 ${TRASH_DAILY_LIMIT} 條上限（今日已用 ${used} 條），本次操作未執行；已通知管理層。` }));
      }
    }
    let done = 0;
    for (const { cfg, id } of targets) {
      if (purge) {
        if (cfg.key === 'stock_counts') reverseStockCount({ store, id, user }); // 沖銷後才永久刪除
        if (store.purge(cfg.key, id, user)) done += 1;
      } else {
        if (cfg.key === 'stock_counts') reverseStockCount({ store, id, user, redo: true });
        if (store.setDeleted(cfg.key, id, false, user)) done += 1;
      }
    }
    return redirect(res, `/trash?module=${encodeURIComponent(str(fields.__module))}&done=${purge ? 'purge' : 'restore'}&n=${done}`);
  }
  if (p.startsWith('/vehicle-card') && req.method === 'GET') {
    requireRole(user, ENTITIES.vehicles.viewRoles, 'vehicles');
    const id = p.length > '/vehicle-card/'.length ? decodeURIComponent(p.slice('/vehicle-card/'.length)) : str(url.searchParams.get('id'));
    const body = vehicleCard({ store, url, user, csrf, id });
    return send(res, 200, body, 'text/html; charset=utf-8');
  }
  if (p === '/vehicleexpenses') return redirect(res, '/vehicles');
  if (p === '/inventory/delete' && req.method === 'POST') {
    requireRole(user, ENTITIES.products.editRoles, 'products');
    const { fields } = await bodyWithCsrf(req, session);
    const ids = fields.ids ? (Array.isArray(fields.ids) ? fields.ids : [fields.ids]) : [];
    let done = 0;
    for (const id of ids) if (store.setDeleted('products', str(id), true, user)) done += 1;
    return redirect(res, `/inventory?purged=${encodeURIComponent(`已將 ${done} 個產品移至回收桶`)}`);
  }
  if (p === '/monthlyattendance/save' && req.method === 'POST') {
    requireRole(user, ENTITIES.attendances.editRoles, 'attendances');
    const { fields } = await bodyWithCsrf(req, session);
    const count = saveMonthlyAttendance({ store, fields, user });
    return redirect(res, `/monthlyattendance?m=${encodeURIComponent(fields.__month || hkNow().month)}&saved=${count}`);
  }
  if (p === '/excelschedule/save' && req.method === 'POST') {
    requireRole(user, ENTITIES.schedules.editRoles, 'schedules');
    const { fields } = await bodyWithCsrf(req, session);
    const count = saveExcelSchedules({ store, fields, user });
    return redirect(res, `/excelschedule?saved=${count}`);
  }
  if (p === '/checkin' && req.method === 'POST') {
    requireRole(user, ENTITIES.check_ins.viewRoles, 'check_ins');
    const { fields } = await bodyWithCsrf(req, session);
    const now = hkNow();
    const existing = store.list('check_ins').find((r) => r.created_by === user.email && str(r.work_date || r.check_in_date) === now.date);
    if (existing) throw new HttpError(409, '今日已完成打卡');
    const row = { employee_id: user.employee_id || user.id, employee_name: str(user.name).replace(/（[^）]*）/g, '').trim(), work_date: now.date, check_in_time: now.full, check_in_date: now.date, status: '已打卡', notes: str(fields.notes) };
    const saved = store.save('check_ins', row, { user });
    store.audit({ user, action: 'checkin', entity: 'CheckInRecord', id: saved.id, label: now.full, via: 'checkin', req });
    return redirect(res, '/myattendance?done=1');
  }
  if (p === '/inventory/backfill' && req.method === 'POST') {
    requireRole(user, ENTITIES.stock_adjustments.editRoles, 'stock_adjustments');
    await bodyWithCsrf(req, session);
    const report = backfillDeliveryStock({ store, user });
    return redirect(res, `/inventory?tab=adjustments&posted=${report.posted}&skipped=${report.skipped}`);
  }
  if (p === '/TollEmailImport') {
    if (req.method === 'GET') return html(res, tollPage({ user, csrf }));
    const { fields } = await bodyWithCsrf(req, session);
    const report = importTollExpenses({ store, text: fields.text, user });
    return html(res, tollPage({ user, csrf, report }));
  }
  if (p === '/image-editor' && req.method === 'GET') {
    if (!str(url.searchParams.get('url'))) throw new HttpError(400, '缺少圖片來源');
    return html(res, imageEditorPage({ url, user, csrf }));
  }
  if (p === '/image-editor/save' && req.method === 'POST') {
    const { fields } = await bodyWithCsrf(req, session);
    const source = str(fields.source);
    if (!(source.startsWith('/uploads/') || /^https?:\/\/base44\.app\//.test(source))) throw new HttpError(400, '圖片來源不受支援');
    const data = str(fields.data);
    if (!data.startsWith('data:image/png;base64,') || data.length > 12_000_000) throw new HttpError(400, '圖片格式或大小無效');
    const buffer = Buffer.from(data.split(',')[1], 'base64');
    if (!buffer.length || buffer.length > 9_000_000) throw new HttpError(400, '輸出圖片不可超過 9 MB');
    const filename = safeFileName(fields.filename).replace(/\.[^.]+$/, '') + '.png';
    const relative = path.join('Edited', user.id, `${Date.now()}_${filename}`);
    const destination = path.resolve(UPLOAD_DIR, relative);
    if (!destination.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new HttpError(400, '無效輸出路徑');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, buffer, { flag: 'wx' });
    const result = '/uploads/' + relative.split(path.sep).map(encodeURIComponent).join('/');
    store.audit({ user, action: 'image-edit', entity: 'Attachment', label: filename, shown: `bytes=${buffer.length}`, via: 'image-editor', req });
    return html(res, imageEditorPage({ url, user, csrf, result }));
  }
  if (p === '/settings/runtime' && req.method === 'POST') {
    requireRole(user, ['management'], 'company_settings');
    const { fields } = await bodyWithCsrf(req, session);
    for (const key of ['quota_limit', 'work_start', 'work_end', 'work_weekdays', 'window_enforced', 'demo_mode']) store.setSetting(key, fields[key]);
    return redirect(res, '/settings?saved=1');
  }
  if (p === '/me/profile' && req.method === 'POST') {
    const { fields } = await bodyWithCsrf(req, session);
    if (!str(fields.name).trim()) throw new HttpError(400, '姓名不可為空');
    store.saveUser({ ...user, name: str(fields.name).trim() });
    return redirect(res, '/me?saved=1');
  }
  if (p === '/me/password' && req.method === 'POST') {
    const { fields } = await bodyWithCsrf(req, session);
    if (!verifyPassword(fields.current, user.pass_hash)) throw new HttpError(400, '目前密碼不正確');
    if (fields.password !== fields.confirm) throw new HttpError(400, '兩次新密碼不一致');
    if (str(fields.password).length < 10 || !/[A-Za-z]/.test(fields.password) || !/\d/.test(fields.password)) throw new HttpError(400, '新密碼至少 10 位並包含字母及數字');
    store.setPassword(user.id, fields.password, false);
    store.audit({ user, action: 'change-password', entity: 'User', id: user.id, label: user.email, via: 'profile', req });
    return redirect(res, '/me?password=1');
  }
  if (p === '/me/deactivate' && req.method === 'POST') {
    const { fields } = await bodyWithCsrf(req, session);
    if (!verifyPassword(fields.current, user.pass_hash)) throw new HttpError(400, '目前密碼不正確');
    if (user.role === 'management' && store.users().filter((row) => row.active && row.role === 'management').length <= 1) throw new HttpError(409, '不可停用系統最後一個管理帳號');
    store.saveUser({ ...user, active: false });
    store.audit({ user, action: 'deactivate', entity: 'User', id: user.id, label: user.email, via: 'profile', req });
    sessions.delete(session.sid);
    res.writeHead(302, headers({ 'Set-Cookie': 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', Location: '/login' }));
    return res.end();
  }
  if (p === '/me/avatar' && req.method === 'POST') {
    const body = await bodyWithCsrf(req, session);
    const file = body.files.file;
    if (!file?.data?.length || file.data.length > 5 * 1024 * 1024 || !['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.filename).toLowerCase())) throw new HttpError(400, '請上傳 5 MB 內的 PNG/JPEG/WebP 頭像');
    const relative = path.join('User', user.id, `${Date.now()}_${safeFileName(file.filename)}`);
    const destination = path.resolve(UPLOAD_DIR, relative);
    if (!destination.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new HttpError(400, '無效路徑');
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, file.data);
    const avatar = '/uploads/' + relative.split(path.sep).map(encodeURIComponent).join('/');
    store.saveUser({ ...user, avatar_url: avatar });
    return redirect(res, '/me?avatar=1');
  }
  if (p === '/users/save' && req.method === 'POST') {
    requireRole(user, ['management'], 'users');
    const { fields } = await bodyWithCsrf(req, session);
    if (!['front', 'office', 'accounting', 'management'].includes(fields.role)) throw new HttpError(400, '無效角色');
    if (fields.id === user.id && (fields.role !== 'management' || fields.active !== '1')) throw new HttpError(409, '不可停用自己或移除自己的管理角色');
    if (fields.password && (str(fields.password).length < 10 || !/[A-Za-z]/.test(fields.password) || !/\d/.test(fields.password))) throw new HttpError(400, '密碼至少 10 位並含字母及數字');
    store.saveUser({ id: fields.id || '', email: str(fields.email).trim().toLowerCase(), name: str(fields.name).trim(), role: fields.role, employee_id: str(fields.employee_id), active: fields.active === '1', must_change: bool(fields.must_change), accessible_pages: str(fields.accessible_pages), password: str(fields.password) });
    return redirect(res, '/users?saved=1');
  }
  if (p.startsWith('/admin/') && req.method === 'POST') {
    requireRole(user, ['management'], 'admin');
    const { fields } = await bodyWithCsrf(req, session);
    if (p === '/admin/quota') store.db.prepare('UPDATE quota SET extra=extra+? WHERE user_id=? AND day=?').run(num(fields.add), fields.uid, hkNow().date);
    else if (p === '/admin/window') store.setSetting('window_enforced', fields.value === '1' ? '1' : '0');
    else if (p === '/admin/holiday') store.db.prepare('INSERT INTO holidays(date,name) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET name=excluded.name').run(fields.date, fields.name);
    else if (p === '/admin/holiday/del') store.db.prepare('DELETE FROM holidays WHERE date=?').run(fields.date);
    else throw new HttpError(404, '未知管理操作');
    return redirect(res, '/admin');
  }

  if (p === '/' || p === '/mywork') return html(res, myWorkPage({ store, url, user, csrf }));
  if (p === '/dashboard') return redirect(res, '/mywork');
  if (p === '/pestcontrolwork') { assertAccessible(user, 'schedules'); return html(res, pestControlWorkPage({ store, url, user, csrf })); }
  if (p.startsWith('/pestcontrolwork/')) { assertAccessible(user, 'schedules'); return html(res, pestControlWorkDetail({ store, url, user, csrf, id: decodeURIComponent(p.slice(17)), index: Number(url.searchParams.get('index') || 0) })); }
  if (p === '/serviceplans') { assertAccessible(user, 'service_plan_dates'); return html(res, servicePlansPage({ store, url, user, csrf })); }
  if (p.startsWith('/serviceplans/')) { assertAccessible(user, 'service_plan_dates'); return html(res, servicePlanDetail({ store, url, user, csrf, id: decodeURIComponent(p.slice(14)) })); }
  if (p.startsWith('/serviceplan/')) { assertAccessible(user, 'service_plan_dates'); return html(res, servicePlanDetail({ store, url, user, csrf, id: decodeURIComponent(p.slice(13)) })); }
  if (p === '/serviceplanrecordday') {
    assertAccessible(user, 'service_plan_dates');
    const id = str(url.searchParams.get('id') || url.searchParams.get('record_id'));
    if (id) {
      const log = store.get('service_plan_logs', id);
      if (log) return html(res, entityDetail({ store, cfg: ENTITIES.service_plan_logs, id, user, csrf, req, url }));
      return html(res, entityDetail({ store, cfg: ENTITIES.service_plan_dates, id, user, csrf, req, url }));
    }
    return html(res, listEntity({ store, cfg: ENTITIES.service_plan_dates, url, user, csrf }));
  }
  if (p === '/servicereports') { assertAccessible(user, 'work_records'); return html(res, serviceReportsPage({ store, url, user, csrf })); }
  if (p.startsWith('/servicereport/')) return html(res, entityDetail({ store, cfg: ENTITIES.work_records, id: decodeURIComponent(p.slice(15)), user, csrf, req, url }));
  if (p === '/workschedule' || p === '/myschedule') return redirect(res, '/mywork?tab=schedule');
  if (p === '/schedules') { requireRole(user, ['office', 'accounting', 'management'], 'schedules'); return html(res, workSchedulePage({ store, url, user, csrf, manage: true })); }
  if (p === '/checkin') return redirect(res, '/myattendance');
  if (p === '/myattendance') return html(res, myAttendancePage({ store, url, user, csrf }));
  if (p === '/monthlyattendance' || p === '/attendance') { requireRole(user, ['office', 'accounting', 'management'], 'attendances'); return html(res, monthlyAttendancePage({ store, url, user, csrf })); }
  if (p === '/ExcelSchedule' || p === '/excelschedule') { requireRole(user, ['office', 'accounting', 'management'], 'schedules'); return html(res, excelSchedulePage({ store, url, user, csrf })); }
  if (p === '/accounting') { requireRole(user, ['accounting', 'management'], 'accounting'); return html(res, accountingPage({ store, url, user, csrf })); }
  if (p === '/receivables') { requireRole(user, ['accounting', 'management'], 'accounting'); return html(res, receivablesPage({ store, url, user, csrf })); }
  if (p === '/generalledger') { requireRole(user, ['accounting', 'management'], 'accounting'); return html(res, generalLedgerPage({ store, url, user, csrf })); }
  if (p === '/transactions') { requireRole(user, ['accounting', 'management'], 'transactions'); return html(res, listEntity({ store, cfg: ENTITIES.transactions, url, user, csrf })); }
  if (p === '/inventory') return html(res, inventoryPage({ store, url, user, csrf }));
  if (p === '/settings') return html(res, settingsPage({ user, csrf }));
  if (p === '/me' || p === '/PersonalSettings') return html(res, mePage({ user, csrf, message: url.searchParams.has('password') ? '密碼已修改' : url.searchParams.has('avatar') ? '頭像已更新' : url.searchParams.has('saved') ? '資料已保存' : '' }));
  if (p === '/users') return html(res, usersPage({ user, csrf }));
  if (p === '/admin') return html(res, adminPage({ user, csrf }));
  if (p === '/completion-certificate') {
    const row = recordOr404('purchase_orders', str(url.searchParams.get('id') || url.searchParams.get('po')));
    assertEntity(user, ENTITIES.purchase_orders);
    return html(res, completionCertificate({ row, store }));
  }
  if (p === '/print-schedule' || p === '/WorkingSchedulePDF' || p === '/print-excelschedule') {
    requireRole(user, ENTITIES.schedules.viewRoles, 'schedules');
    const month = str(url.searchParams.get('m')) || hkNow().month;
    const date = str(url.searchParams.get('date'));
    const rows = store.list('schedules', date ? { date } : {}).filter((r) => date ? r.schedule_date === date : str(r.schedule_date).startsWith(month));
    return html(res, schedulePrint({ rows, date: date || month, title: '工作排班' }));
  }
  if (p === '/print-attendance') {
    requireRole(user, ['office', 'accounting', 'management'], 'attendances');
    const month = str(url.searchParams.get('m')) || hkNow().month;
    const rows = store.list('attendances').filter((r) => str(r.attendance_date).startsWith(month));
    return html(res, simplePrint(`月度出勤表 ${month}`, simpleTable([{ key: 'employee_name', label: '員工' }, { key: 'attendance_date', label: '日期' }, { key: 'hours', label: '工時' }, { key: 'attendance_type', label: '類型' }, { key: 'notes', label: '備註' }], rows)));
  }
  if (p === '/products/catalog') {
    requireRole(user, ENTITIES.products.viewRoles, 'products');
    const rows = store.list('products');
    return html(res, simplePrint(`LIST FOR PEST CONTROL CHEMICALS ${hkNow().date.slice(0, 4)}`, simpleTable([
      { key: 'product_code', label: 'Item No. 項目編號' }, { key: 'official_name', label: 'Trade Name 貿易名稱', value: (r) => esc(r.official_name || r.product_name || '—') },
      { key: 'afcd_reg_no', label: 'HK Registered # 香港註冊編號' }, { key: 'active_ingredients', label: 'Active Ingredients 有效成份' }, { key: 'packing', label: 'Packing 包裝' },
    ], rows)));
  }
  if (p === '/importquotations') return html(res, importPage({ store, cfg: ENTITIES.quotations, user, csrf }));

  if (p.startsWith('/new/')) {
    const cfg = ENTITIES[p.slice(5)]; if (!cfg) throw new HttpError(404, '未知實體');
    // 合約一律走頁內彈窗：直接回列表頁並自動開啟彈窗（不再開新頁）
    if (cfg.key === 'contracts') return html(res, listEntity({ store, cfg, url: new URL('http://local/contracts?new=1'), user, csrf }));
    if (['leave_records', 'supply_records'].includes(cfg.key)) return html(res, listEntity({ store, cfg, url: new URL(`http://local${cfg.listPath}?new=1`), user, csrf }));
    return html(res, entityForm({ store, cfg, url, user, csrf }));
  }
  if (p.startsWith('/edit/')) {
    const rest = p.slice(6); const slash = rest.indexOf('/');
    const key = slash > 0 ? rest.slice(0, slash) : rest;
    const id = slash > 0 ? decodeURIComponent(rest.slice(slash + 1)) : str(url.searchParams.get('id'));
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知實體');
    if (key === 'vehicle_expenses' && user.role === 'front') throw new HttpError(403, '前線可新增車輛費用，修改請聯絡辦公室');
    if (cfg.key === 'contracts') return html(res, listEntity({ store, cfg, url: new URL(`http://local/contracts?edit=${encodeURIComponent(id)}`), user, csrf }));
    return html(res, entityForm({ store, cfg, id, url, user, csrf }));
  }
  if (p.startsWith('/view/')) {
    const rest = p.slice(6); const slash = rest.indexOf('/');
    const key = slash > 0 ? rest.slice(0, slash) : rest;
    const id = slash > 0 ? decodeURIComponent(rest.slice(slash + 1)) : str(url.searchParams.get('id'));
    const cfg = ENTITIES[key]; if (!cfg) throw new HttpError(404, '未知實體');
    // 客戶詳情改成原系統版面（KPI + 頁簽 + 聯絡人卡）
    if (key === 'customers') {
      const customer = recordOr404('customers', id);
      const access = customerOfficeAccess({ store, user, customer, req, csrf });
      if (!access.ok) return html(res, access.html);
      return html(res, customerDetailPage({ store, url, user, csrf, id }));
    }
    return html(res, entityDetail({ store, cfg, id, user, csrf, req, url }));
  }

  const original = ORIGINAL_ROUTES[p] || originalLower[p.toLowerCase()];
  if (original) {
    const cfg = ENTITIES[original.key];
    if (!cfg) throw new HttpError(404, '原系統路由未配置實體');
    const id = str(url.searchParams.get('id') || url.searchParams.get('editId') || url.searchParams.get('record_id'));
    if (original.action === 'list') return html(res, listEntity({ store, cfg, url, user, csrf }));
    if (original.action === 'view') return html(res, entityDetail({ store, cfg, id, user, csrf, req, url }));
    if (original.action === 'create' || original.action === 'edit') return html(res, entityForm({ store, cfg, id: original.action === 'edit' || url.searchParams.has('editId') ? id : '', url, user, csrf }));
  }

  const listCfg = Object.values(ENTITIES).find((cfg) => cfg.listPath === p);
  if (listCfg) return html(res, listEntity({ store, cfg: listCfg, url, user, csrf }));
  const detailCfg = Object.values(ENTITIES).find((cfg) => p.startsWith(cfg.listPath + '/'));
  if (detailCfg) {
    const id = decodeURIComponent(p.slice(detailCfg.listPath.length + 1));
    return html(res, entityDetail({ store, cfg: detailCfg, id, user, csrf, req, url }));
  }
  throw new HttpError(404, '找不到頁面');
}

const server = http.createServer(async (req, res) => {
  try { await handle(req, res); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[ERR]', req.method, req.url, error);
    if (res.headersSent) { res.end(); return; }
    const session = sessionFrom(req);
    if (req.headers.accept?.includes('application/json') || req.url.includes('/move')) json(res, { error: error.message || '系統錯誤' }, status);
    else html(res, errorPage({ title: status === 403 ? '無權限' : status === 404 ? '找不到頁面' : '系統提示', message: error.message || '系統錯誤', user: session?.user, csrf: session?.csrf || '', status }), status);
  }
});
server.listen(PORT, HOST, () => {
  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  console.log(`本機：  http://127.0.0.1:${PORT}`);
  for (const n of nets) console.log(`同一 WiFi 的手機／同事：  http://${n.address}:${PORT}`);
  console.log(`資料庫：${DB_PATH}`);
});
process.on('SIGTERM', () => { try { store.close(); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { store.close(); } catch {} process.exit(0); });
