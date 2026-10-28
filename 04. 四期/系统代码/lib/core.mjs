import { AMOUNT_FIELDS, ENTITIES } from './config.mjs';
import { dynamicOptions } from './actions.mjs';
import { dataTable, detailPage, formGrid, formPage, kpis, layout, pager, simpleTable } from './ui.mjs';
import { arr, esc, hkNow, hoursFromTimes, maskName, maskPhone, money, num, pageLinks, queryWith, str, toCSV, uid, unique } from './utils.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.statusCode = status; }
}

export const canSeeAmounts = (user) => ['accounting', 'management'].includes(user?.role);

const PAGE_ALIASES = {
  schedules: ['schedules', 'ExcelSchedule', 'WorkSchedule', 'MySchedule', 'PestControlWork'],
  service_plan_dates: ['service_plan_dates', 'ServicePlans', 'ServicePlanRecordDay', 'PestControlWork'],
  work_records: ['work_records', 'ServiceReports', 'PestControlWork'],
  check_ins: ['check_ins', 'CheckIn', 'MyAttendance'],
  attendances: ['attendances', 'MonthlyAttendance', 'MyAttendance'],
  supply_records: ['supply_records', 'MySupply'],
  email_templates: ['email_templates', 'EmailTemplates', 'Settings'],
  me: ['me', 'PersonalSettings', 'Settings'],
  company_settings: ['company_settings', 'Settings'],
  users: ['users', 'UserManagement', 'Settings'],
  employees: ['employees', 'Employees', 'UserManagement'],
  work_units: ['work_units', 'WorkUnits', 'Settings'],
  work_instructions: ['work_instructions', 'WorkInstructions', 'Settings'],
  pesticides: ['pesticides', 'Pesticides', 'Settings'],
  accounting: ['accounting', 'Accounting', 'GeneralLedger', 'Accounts', 'Invoices', 'Receipts', 'Bills', 'Payments'],
};

export function assertAccessible(user, pageKey) {
  const raw = str(user?.accessible_pages).trim();
  if (!raw || ['dashboard', 'home', 'mywork', 'me'].includes(pageKey)) return;
  let allowed;
  try { const parsed = JSON.parse(raw); allowed = Array.isArray(parsed) ? parsed : raw.split(','); }
  catch { allowed = raw.split(','); }
  allowed = allowed.map((v) => str(v).trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return;
  const aliases = [pageKey, ...(PAGE_ALIASES[pageKey] || [])].map((v) => v.toLowerCase());
  if (!aliases.some((v) => allowed.includes(v))) throw new HttpError(403, '你沒有權限查看此頁（用戶頁面白名单）');
}

export function assertRole(user, roles, pageKey = '') {
  if (!roles?.includes(user?.role)) throw new HttpError(403, '你沒有權限查看此頁');
  if (pageKey) assertAccessible(user, pageKey);
}

export function assertEntity(user, cfg, edit = false) {
  assertRole(user, edit ? cfg.editRoles : cfg.viewRoles, cfg.key);
}

function ownsRecord(user, cfg, row, edit = false) {
  if (user.role !== 'front') return true;
  const name = str(user.name).replace(/（[^）]*）/g, '').trim();
  if (cfg.key === 'schedules') return arrEmployees(row.assigned_employees).some((n) => n === name) || arrEmployees(row.assigned_employees).some((n) => n.includes(name));
  // 會議決定：服務報告、補給記錄前線可看全部；但只能改自己的（報告本身不給改）
  if (cfg.key === 'work_records') return !edit;
  if (cfg.key === 'supply_records') return edit
    ? (!row.employee_name || row.employee_name === name || row.created_by === user.email)
    : true;
  if (['leave_records', 'check_ins', 'attendances'].includes(cfg.key)) return !row.employee_name || row.employee_name === name || row.created_by === user.email;
  return true;
}

function arrEmployees(value) {
  return Array.isArray(value) ? value.map((v) => typeof v === 'object' ? str(v.employee_name) : str(v)).filter(Boolean) : [];
}

export function assertRecordAccess(user, cfg, row, edit = false) {
  assertEntity(user, cfg, edit);
  if (!ownsRecord(user, cfg, row, edit)) throw new HttpError(403, '你只能查看指派給自己的記錄');
}
export function canEditRecord(user, cfg, row) {
  return !user || user.role !== 'front' || ownsRecord(user, cfg, row, true);
}

function textSearch(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textSearch).join(' ');
  if (typeof value === 'object') return Object.values(value).map(textSearch).join(' ');
  return String(value);
}

function filterValue(row, key, cfg) {
  if (key === 'year') return str(row[cfg.dateField]).slice(0, 4);
  if (key === 'month') return String(Number(str(row[cfg.dateField]).slice(5, 7)) || '');
  const value = row[key];
  return Array.isArray(value) ? value.map((v) => typeof v === 'object' ? textSearch(v) : str(v)) : str(value);
}

export function filteredRows(store, cfg, url, user) {
  const trash = url.searchParams.get('trash') === '1';
  let all = store.list(cfg.key, { onlyDeleted: trash });
  all = all.filter((r) => !r._draft);
  const q = str(url.searchParams.get('q')).trim().toLowerCase();
  if (q) all = all.filter((row) => cfg.search.some((field) => textSearch(row[field]).toLowerCase().includes(q)) || textSearch(row.id).toLowerCase().includes(q));
  for (const filter of cfg.filters || []) {
    const wanted = str(url.searchParams.get(filter.key));
    if (!wanted) continue;
    all = all.filter((row) => {
      const actual = filterValue(row, filter.key, cfg);
      return Array.isArray(actual) ? actual.includes(wanted) : actual === wanted;
    });
  }
  if (cfg.key === 'purchase_orders') {
    const tab = url.searchParams.get('tab');
    if (tab === 'service' || tab === 'product') all = all.filter((r) => r.quotation_type === (tab === 'service' ? '服務' : '產品'));
  }
  if (user.role === 'front') all = all.filter((row) => ['work_records', 'supply_records'].includes(cfg.key) || ownsRecord(user, cfg, row));
  const labelAsc = ['customers', 'products', 'services', 'suppliers', 'accounts', 'work_units', 'pesticides', 'employees', 'vehicles', 'work_instructions', 'email_templates', 'announcements', 'addresses'].includes(cfg.key);
  all.sort((a, b) => {
    if (labelAsc) return str(a[cfg.labelField]).localeCompare(str(b[cfg.labelField]), 'zh-Hant');
    const ad = str(a[cfg.dateField] || a.created_date); const bd = str(b[cfg.dateField] || b.created_date);
    return bd.localeCompare(ad) || str(b.id).localeCompare(str(a.id));
  });
  return all;
}

function filterOptions(rows, filter, cfg) {
  if (filter.options) return filter.options;
  return unique(rows.flatMap((row) => {
    const value = filterValue(row, filter.key, cfg);
    return Array.isArray(value) ? value : [value];
  }));
}

function decorateRow(cfg, row, user) {
  const out = { ...row };
  if (cfg.key === 'contracts') out.contract_start_date = `${str(row.contract_start_date) || '—'} 至 ${str(row.contract_end_date) || '—'}`;
  // 歷史排班在 SCH-07 修復前沒存 total_hours（13,116 筆只有 15 筆有值）。
  // 列表按同一口徑即時算，避免為了顯示去做一次 13,116 筆的全量回寫。
  if (cfg.key === 'schedules' && (row.total_hours === undefined || row.total_hours === null || row.total_hours === '')) {
    const hours = hoursFromTimes(row.work_items);
    out.total_hours = hours || '';
  }
  if (cfg.key === 'customers' && user.role === 'office') {
    out.contact_person = maskName(out.contact_person);
    out.phone = maskPhone(out.phone);
    out.fax = out.fax ? '—' : '';
    out.email = out.email ? '—' : '';
  }
  return out;
}

// 合約新增／編輯改為頁內彈窗（對齊原系統 EditContract），不再跳新頁
export function contractDialog({ store, user, csrf, row = null, isEdit = false, back = '/contracts', open = false }) {
  const cfg = ENTITIES.contracts;
  const data = row || {};
  const rowId = data.id || uid('con');
  const ctx = { store, user, csrf, canSeeAmounts: canSeeAmounts(user), options: {}, rowId, cfg };
  const autoName = `<script>(function(){var d=document.getElementById('contractDlg');if(!d)return;var n=d.querySelector('[name="contract_number"]'),c=d.querySelector('[name="customer_name"]'),l=d.querySelector('[name="work_location"]'),w=d.querySelector('[name="work_content"]'),t=d.querySelector('[name="contract_name"]');if(!t)return;function gen(){if(t.dataset.manual)return;t.value=[n&&n.value,c&&c.value,l&&l.value,w&&w.value].map(function(v){return (v||'').trim()}).filter(Boolean).join('_')}[n,c,l,w].forEach(function(el){if(el)el.addEventListener('input',gen)});t.addEventListener('input',function(){t.dataset.manual='1'})})();</script>`;
  return `<dialog class="modal" id="contractDlg"${open ? ' data-auto-open' : ''}><form method="post" action="/save/contracts">${hiddenInput('__csrf', csrf)}${hiddenInput('__id', isEdit ? data.id : '')}${hiddenInput('__new_id', rowId)}${hiddenInput('__expected_updated', isEdit ? str(data.updated_date) : '')}${hiddenInput('__back', back)}<div class="modal-head"><div><h3>${isEdit ? '編輯合約' : '新增合約'}</h3><div class="sub">選客戶會帶出編號與聯絡人；合約名稱可按「合約編號_客戶_地點_工作內容」自動生成</div></div><button type="button" class="btn ghost small" data-dlg-close aria-label="關閉">✕</button></div><div class="modal-body"><div class="fgrid">${formGrid(cfg.fields, data, ctx)}</div></div><div class="modal-foot"><button type="button" class="btn ghost" data-dlg-close>取消</button><button class="btn" type="submit">${isEdit ? '儲存合約' : '建立合約'}</button></div></form>${autoName}</dialog>`;
}

const hiddenInput = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value ?? '')}">`;

// 服務計劃＝合約的服務子集。合約彈窗是全集；這裡只顯示服務安排，
// 其餘欄位（金額、報價單、客戶編號、文件…）以 hidden 原值回寫，避免斷鏈。
const PLAN_FIELD_NAMES = new Set([
  'customer_name', 'work_location', 'region', 'service_type', 'pest_type', 'pesticides',
  'service_frequency', 'contract_start_date', 'contract_end_date', 'contract_status', 'notes',
]);
export function planDialog({ store, user, csrf, row = null, open = false, back = '/serviceplans' }) {
  const cfg = ENTITIES.contracts;
  const data = row || {};
  const rowId = data.id || uid('con');
  const fields = cfg.fields.map((f) => PLAN_FIELD_NAMES.has(f.name) ? f : { ...f, hidden: true });
  const ctx = { store, user, csrf, canSeeAmounts: canSeeAmounts(user), options: dynamicOptions(store), rowId, cfg };
  return `<dialog class="modal" id="planDlg"${open ? ' data-auto-open' : ''}><form method="post" action="/save/contracts">${hiddenInput('__csrf', csrf)}${hiddenInput('__id', data.id || '')}${hiddenInput('__new_id', rowId)}${hiddenInput('__expected_updated', str(data.updated_date))}${hiddenInput('__back', back)}<div class="modal-head"><div><h3>編輯服務安排</h3><div class="sub">只改服務內容；合約金額、報價單與客戶編號請到「合約列表」編輯</div></div><button type="button" class="btn ghost small" data-dlg-close aria-label="關閉">✕</button></div><div class="modal-body"><div class="fgrid">${formGrid(fields, data, ctx)}</div></div><div class="modal-foot"><button type="button" class="btn ghost" data-dlg-close>取消</button><button class="btn" type="submit">儲存服務安排</button></div></form></dialog>`;
}

// 請假／補給的新增改成頁內彈窗（會議：不要跳新頁）
export function recordDialog({ store, user, csrf, cfg, row = null, open = false, back = null }) {
  const data = row || {};
  const rowId = data.id || uid(cfg.key.slice(0, 3));
  const ctx = { store, user, csrf, canSeeAmounts: canSeeAmounts(user), options: dynamicOptions(store), rowId, cfg };
  const label = cfg.key === 'leave_records' ? '請假記錄' : '補給記錄';
  // 這個彈窗只用於「新增」。__new_id 是預先產生的記錄 ID，__id 必須留空——
  // 否則 saveEntity 會把它當成「編輯一筆不存在的記錄」而丟 404（補給／請假存檔失敗的根因）。
  return `<dialog class="modal" id="recDlg"${open ? ' data-auto-open' : ''}><form method="post" action="/save/${cfg.key}">${hiddenInput('__csrf', csrf)}${hiddenInput('__id', '')}${hiddenInput('__new_id', rowId)}${hiddenInput('__expected_updated', str(data.updated_date))}${hiddenInput('__back', back || cfg.listPath)}<div class="modal-head"><div><h3>新增${label}</h3><div class="sub">${cfg.key === 'leave_records' ? '提交後狀態為「待審批」，由管理層批核' : '可選個人或車牌；產品與工具可逐項加行'}</div></div><button type="button" class="btn ghost small" data-dlg-close aria-label="關閉">✕</button></div><div class="modal-body"><div class="fgrid">${formGrid(cfg.fields, data, ctx)}</div></div><div class="modal-foot"><button type="button" class="btn ghost" data-dlg-close>取消</button><button class="btn" type="submit">建立記錄</button></div></form></dialog>`;
}

function vehicleDialogShell() {
  return `<dialog class="modal" id="vehDlg"><div class="modal-head"><div><h3>車輛資料</h3><div class="sub">基本資訊與費用記錄</div></div><button type="button" class="btn ghost small" onclick="document.getElementById('vehDlg').close()" aria-label="關閉">✕</button></div><div class="modal-body"><p class="muted">載入中…</p></div></dialog>`;
}

const vehicleModalScript = `<script>window.vcFetch=async function(id){var d=document.getElementById('vehDlg');if(!d)return;var b=d.querySelector('.modal-body');var y=document.getElementById('vcYear'),m=document.getElementById('vcMonth');var q=new URLSearchParams();if(y&&y.value)q.set('year',y.value);if(m&&m.value)q.set('month',m.value);b.innerHTML='<p class="muted">載入中…</p>';var r=await fetch('/vehicle-card/'+encodeURIComponent(id)+'?'+q.toString());b.innerHTML=await r.text()};document.addEventListener('click',async function(e){var a=e.target.closest('[data-vehicle-card]');if(!a)return;e.preventDefault();var d=document.getElementById('vehDlg');if(!d)return;var b=d.querySelector('.modal-body');b.innerHTML='<p class="muted">載入中…</p>';if(typeof d.showModal==='function'){try{d.showModal()}catch(err){}}var r=await fetch('/vehicle-card/'+encodeURIComponent(a.dataset.vehicleCard));b.innerHTML=await r.text()});</script>`;

export function entityContext(store, user, csrf, withOptions = false) {
  return { store, user, csrf, canSeeAmounts: canSeeAmounts(user), options: withOptions ? dynamicOptions(store) : {} };
}

export function listEntity({ store, cfg, url, user, csrf }) {
  assertEntity(user, cfg);
  const source = store.list(cfg.key, { onlyDeleted: url.searchParams.get('trash') === '1' }).filter((r) => !r._draft);
  const rows = filteredRows(store, cfg, url, user);
  const per = 50;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(pages, Math.max(1, Number(url.searchParams.get('page') || 1)));
  const visible = rows.slice((page - 1) * per, page * per).map((r) => decorateRow(cfg, r, user));
  const trash = url.searchParams.get('trash') === '1';
  const activeCount = store.count(cfg.key);
  const deletedCount = cfg.softDelete ? store.count(cfg.key, { onlyDeleted: true }) : 0;
  const buttons = [];
  if (cfg.softDelete) buttons.push(`<a class="btn ghost" href="${cfg.listPath}${trash ? '' : '?trash=1'}">${trash ? '返回列表' : `回收筒 (${deletedCount})`}</a>`);
  // 匯出 CSV：管理層全開；前線只開請假／補給（2026-10-25 會議例外）
  if (user.role === 'management' || (user.role === 'front' && ['leave_records', 'supply_records'].includes(cfg.key))) buttons.push(`<a class="btn ghost" href="/export/${cfg.key}.csv${url.search ? esc(url.search) : ''}">匯出 CSV</a>`);
  if (cfg.importExport && cfg.editRoles.includes(user.role) && user.role === 'management') buttons.push(`<a class="btn ghost" href="/import/${cfg.key}">匯入 CSV</a>`);
  if (cfg.key === 'quotations' && cfg.editRoles.includes(user.role)) buttons.push('<a class="btn ghost" href="/importquotations">批量導入</a>');
  if (cfg.key === 'customers' && cfg.editRoles.includes(user.role)) buttons.push('<a class="btn ghost" href="/customers/merge">客戶合併</a>');
  if (cfg.key === 'products') buttons.push('<a class="btn ghost" href="/products/catalog" target="_blank">貨單</a>');
  if (cfg.key === 'vehicles') {
    buttons.push('<a class="btn ghost" href="/TollEmailImport">易通行費用匯入</a>');
    if (ENTITIES.vehicle_expenses.editRoles.includes(user.role)) buttons.push('<a class="btn ghost" href="/new/vehicle_expenses">添加費用記錄</a>');
  }
  const newLabels = { supply_records: '新增記錄', email_templates: '新增範本' };
  const dialogForm = cfg.key === 'contracts';
  const modalForm = dialogForm || ['leave_records', 'supply_records'].includes(cfg.key);
  if (cfg.editRoles.includes(user.role) && cfg.key !== 'company_settings' && !trash) {
    buttons.push(modalForm
      ? `<button class="btn" type="button" data-dlg-open="${dialogForm ? 'contractDlg' : 'recDlg'}">新增${esc(cfg.title)}</button>`
      : `<a class="btn" href="${esc(`/new/${cfg.key}`)}">${newLabels[cfg.key] || `新增${esc(cfg.title)}`}</a>`);
  }
  const filterControls = (cfg.filters || []).map((filter) => {
    const current = str(url.searchParams.get(filter.key));
    const label = cfg.key === 'leave_records' && filter.key === 'year' ? `${hkNow().date.slice(0, 4)}年` : cfg.key === 'leave_records' && filter.key === 'month' ? '選擇月份' : filter.label;
    return `<select name="${esc(filter.key)}"><option value="">${esc(label)}</option>${filterOptions(source, filter, cfg).map((option) => `<option value="${esc(option)}"${current === String(option) ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  }).join('');
  const kpiHtml = cfg.key === 'purchase_orders' ? kpis([
    { label: '全部 PO', value: store.count('purchase_orders') },
    { label: '服務', value: store.list('purchase_orders').filter((r) => r.quotation_type === '服務').length },
    { label: '產品', value: store.list('purchase_orders').filter((r) => r.quotation_type === '產品').length },
    { label: '待安排', value: store.list('purchase_orders').filter((r) => r.work_status === '待安排').length },
  ]) : '';
  const tabs = [];
  if (cfg.key === 'purchase_orders') {
    const all = store.list('purchase_orders');
    tabs.push(`<a class="btn ${!url.searchParams.get('tab') ? '' : 'ghost'}" href="/purchaseorders">全部 (${all.length})</a>`, `<a class="btn ${url.searchParams.get('tab') === 'service' ? '' : 'ghost'}" href="/purchaseorders?tab=service">服務 (${all.filter((r) => r.quotation_type === '服務').length})</a>`, `<a class="btn ${url.searchParams.get('tab') === 'product' ? '' : 'ghost'}" href="/purchaseorders?tab=product">產品 (${all.filter((r) => r.quotation_type === '產品').length})</a>`);
  }
  if (cfg.key === 'supply_records') {
    const types = ['個人', ...store.list('vehicles').map((v) => v.plate_number).filter(Boolean)];
    tabs.push(`<a class="btn ${!url.searchParams.get('type') ? '' : 'ghost'}" href="/mysupply">全部</a>`);
    for (const type of types) tabs.push(`<a class="btn ${url.searchParams.get('type') === type ? '' : 'ghost'}" href="/mysupply?type=${encodeURIComponent(type)}">${esc(type)}</a>`);
  }
  if (cfg.key === 'employees') {
    tabs.push(`<a class="btn ${!url.searchParams.get('status') ? '' : 'ghost'}" href="/employees">所有員工 (${source.length})</a>`);
    for (const status of ['在職', '離職']) tabs.push(`<a class="btn ${url.searchParams.get('status') === status ? '' : 'ghost'}" href="/employees?status=${encodeURIComponent(status)}">${status} (${source.filter((r) => (r.status || '在職') === status).length})</a>`);
  }
  if (cfg.key === 'vehicles') {
    tabs.push(`<a class="btn ${!url.searchParams.get('plate_number') ? '' : 'ghost'}" href="/vehicles">全部</a>`);
    for (const vehicle of source) tabs.push(`<a class="btn ${url.searchParams.get('plate_number') === vehicle.plate_number ? '' : 'ghost'}" href="/vehicles?plate_number=${encodeURIComponent(vehicle.plate_number)}">${esc(vehicle.plate_number)}</a>`);
  }
  if (cfg.key === 'email_templates') {
    const types = ['通用', ...unique(source.map((r) => r.document_type)).filter((t) => t !== '通用')];
    for (const type of types) tabs.push(`<a class="btn ${url.searchParams.get('document_type') === type ? '' : 'ghost'}" href="/emailtemplates?document_type=${encodeURIComponent(type)}">${esc(type)}</a>`);
  }
  let referenceHtml = '';
  if (cfg.key === 'products') {
    referenceHtml = `<h2>LIST FOR PEST CONTROL CHEMICALS ${hkNow().date.slice(0, 4)}</h2>${simpleTable([
      { key: 'product_code', label: 'Item No. 項目編號' }, { key: 'official_name', label: 'Trade Name 貿易名稱', value: (r) => esc(r.official_name || r.product_name || '—') },
      { key: 'afcd_reg_no', label: 'HK Registered # 香港註冊編號' }, { key: 'active_ingredients', label: 'Active Ingredients 有效成份' }, { key: 'packing', label: 'Packing 包裝' },
    ], visible)}`;
  }
  if (cfg.key === 'vehicles' && url.searchParams.get('plate_number')) {
    const expenses = store.list('vehicle_expenses').filter((r) => r.vehicle_plate === url.searchParams.get('plate_number')).slice(0, 50);
    referenceHtml = `<h2>車輛費用（${esc(url.searchParams.get('plate_number'))}）</h2>${simpleTable([{ key: 'expense_date', label: '日期', type: 'date' }, { key: 'expense_type', label: '類型', type: 'pill' }, { key: 'location', label: '地點' }, { key: 'amount', label: '金額', type: 'money' }, { key: 'reference_number', label: '參考編號' }], expenses, entityContext(store, user, csrf))}`;
  }
  if (cfg.key === 'employees') {
    const counts = {};
    for (const schedule of store.list('schedules')) for (const employee of arr(schedule.assigned_employees)) {
      const name = str(employee.employee_name).trim();
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    const legacy = Object.entries(counts).filter(([name]) => !source.some((r) => r.employee_name === name)).map(([name, count]) => ({ employee_name: name, count }));
    referenceHtml += `<details class="card" open><summary><b>由排班還原的員工名單（${legacy.length}）</b></summary><p class="muted">原 Employee 表為 0 筆；以下姓名來自歷史排班，需建立正式員工檔後才能綁定帳號與薪資。</p>${simpleTable([{ key: 'employee_name', label: '員工姓名' }, { key: 'count', label: '排班次數' }, { key: 'status', label: '狀態', value: () => '<span class="pill y">待建檔</span>' }], legacy)}</details>`;
  }
  let quickEdit = '';
  if (cfg.key === 'email_templates' && visible[0] && cfg.editRoles.includes(user.role)) {
    const row = visible[0];
    quickEdit = `<form class="card" method="post" action="/save/email_templates"><h3>快速編輯：${esc(row.template_name)}</h3><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="hidden" name="__id" value="${row.id}"><input type="hidden" name="__expected_updated" value="${esc(row.updated_date || '')}"><input type="hidden" name="__back" value="${esc(cfg.listPath)}"><div class="fgrid"><div class="frow"><label>範本名稱</label><input name="template_name" value="${esc(row.template_name)}" required></div><div class="frow"><label>文件類型</label><input name="document_type" value="${esc(row.document_type || '通用')}"></div><div class="frow wide"><label>主旨</label><input name="subject" value="${esc(row.subject)}" required></div><div class="frow wide"><label>內容</label><textarea name="body" rows="7">${esc(row.body || '')}</textarea></div><input type="hidden" name="is_active" value="0"><label><input type="checkbox" name="is_active" value="1"${row.is_active !== false ? ' checked' : ''}> 啟用</label></div><button class="btn" style="margin-top:14px">保存範本</button></form>`;
  }
  const editHref = (row) => dialogForm ? `${cfg.listPath}?edit=${encodeURIComponent(row.id)}` : `/edit/${cfg.key}/${encodeURIComponent(row.id)}`;
  // 合約用頁內彈窗；?new=1 / ?edit=id 由伺服器直接渲染並自動開啟
  const dialogEditId = dialogForm ? str(url.searchParams.get('edit')) : '';
  const dialogEditRow = dialogEditId ? store.get('contracts', dialogEditId) : null;
  // 彈窗也受 editRoles 約束（PERM-03）：沒有編輯權的角色不該在 DOM 裡拿到一份可填的新增表單，
  // 否則 /contracts?new=1 仍會把「填完才被 403」的體驗留下來。
  const dialogOpen = dialogForm && !trash && cfg.editRoles.includes(user.role);
  const dialogHtml = dialogOpen ? contractDialog({ store, user, csrf, row: dialogEditRow || { ...defaultsFor(cfg), id: uid('con') }, isEdit: !!dialogEditRow, back: cfg.listPath, open: !!dialogEditRow || url.searchParams.get('new') === '1' }) : '';
  const recOpen = !trash && ['leave_records', 'supply_records'].includes(cfg.key);
  const recName = str(user.name).replace(/（[^）]*）/g, '').trim();
  const recDefaults = cfg.key === 'leave_records'
    ? { ...defaultsFor(cfg), employee_name: user.role === 'front' ? recName : '', employee_id: user.role === 'front' ? (user.employee_id || user.id) : '', leave_type: '病假', status: '待審批' }
    : { ...defaultsFor(cfg), employee_name: user.role === 'front' ? recName : '', employee_id: user.role === 'front' ? (user.employee_id || user.id) : '', type: '個人', products: [], tools: [] };
  const recDialogHtml = recOpen ? recordDialog({ store, user, csrf, cfg, row: { ...recDefaults, id: uid(cfg.key.slice(0, 3)) }, open: url.searchParams.get('new') === '1', back: cfg.listPath }) : '';
  const vehicleDlg = cfg.key === 'vehicles' && !trash ? vehicleDialogShell() : '';
  // 採購單操作列：編輯／轉為發票／刪除／前往排班（對齊原系統四按鈕，刪除進回收桶）
  const poActions = (row) => [
    `<a class="btn ghost small" href="/edit/purchase_orders/${encodeURIComponent(row.id)}">編輯</a>`,
    `<a class="btn ghost small" href="/new/invoices?poId=${encodeURIComponent(row.id)}">轉為發票</a>`,
    `<form method="post" action="/delete/purchase_orders/${encodeURIComponent(row.id)}" style="display:inline" data-confirm="確定將此採購單移至回收桶？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn danger small">刪除</button></form>`,
    `<a class="btn ghost small" href="/schedules">前往排班</a>`,
  ].join(' ');
  const table = dataTable({ cfg, rows: visible, ctx: {
    ...entityContext(store, user, csrf), viewHref: (row) => `/view/${cfg.key}/${encodeURIComponent(row.id)}`, editHref, canEdit: !trash, canEditRow: (row) => canEditRecord(user, cfg, row), trash,
    rowActions: trash ? null : cfg.key === 'purchase_orders' && cfg.editRoles.includes(user.role) ? poActions : null,
    extraActions: cfg.key === 'purchase_orders'
      ? (row) => `<a class="btn ghost small" href="/completion-certificate?id=${encodeURIComponent(row.id)}" target="_blank">工程滿意紙</a>`
      : cfg.key === 'leave_records' && user.role === 'management'
        ? (row) => row.status === '待審批' ? `${leaveDecideForm(row, csrf, '已批准', '批准', '', cfg.listPath)} ${leaveDecideForm(row, csrf, '已拒絕', '拒絕', 'danger', cfg.listPath)}` : ''
        : null,
    deleteHref: !trash && (cfg.softDelete || cfg.key === 'work_instructions') ? (row) => `/delete/${cfg.key}/${encodeURIComponent(row.id)}` : null,
  } });
  const hasMoney = cfg.columns.some((c) => c.type === 'money') || cfg.fields.some((f) => f.type === 'money');
  const totalLabel = user.role === 'front' ? rows.length.toLocaleString() : activeCount.toLocaleString();
  const body = `<h1>${esc(cfg.plural)}</h1><div class="sub">${trash ? `回收筒 · ${rows.length} 筆` : `共 ${totalLabel} 筆${url.search ? ` · 篩選後 ${rows.length.toLocaleString()} 筆` : ''}`}${!canSeeAmounts(user) && hasMoney ? ' · 金額依權限隱藏' : ''}</div><div class="bar noprint">${buttons.join('')}</div>${kpiHtml}${tabs.length ? `<div class="bar">${tabs.join('')}</div>` : ''}<form class="bar" method="get">${trash ? '<input type="hidden" name="trash" value="1">' : ''}<input class="search" type="text" name="q" value="${esc(url.searchParams.get('q') || '')}" placeholder="搜尋${esc(cfg.plural)}…">${filterControls}<button class="btn ghost">篩選</button>${url.search ? `<a class="btn ghost" href="${esc(cfg.listPath)}">重設</a>` : ''}</form>${referenceHtml}${table}${quickEdit}${pager({ url, page, pages, total: rows.length })}${dialogHtml}${recDialogHtml}${vehicleDlg}`;
  return layout({ title: cfg.plural, body, user, active: cfg.key, csrf, wide: true, extraHead: cfg.key === 'vehicles' ? vehicleModalScript : '' });
}

function defaultsFor(cfg) {
  const row = {};
  const today = hkNow().date;
  const dateDefaults = {
    quotations: ['document_date'], invoices: ['invoice_date'], receipts: ['receipt_date'], bills: ['bill_date'], payments: ['payment_date'],
    purchase_orders: ['po_date'], delivery_notes: ['dn_date'], stock_adjustments: ['adjustment_date'], stock_counts: ['count_date'],
    schedules: ['schedule_date'], work_records: ['completion_date'], vehicle_expenses: ['expense_date'], transactions: ['transaction_date'],
    supply_records: ['supply_date'], leave_records: ['start_date', 'end_date'],
  };
  for (const name of dateDefaults[cfg.key] || []) row[name] = today;
  if (cfg.key === 'quotations') Object.assign(row, { quotation_type: '服務', document_language: '中文', stage: '已報價', show_service_item_quantity_unit: true, show_service_item_total: true, show_item_description: false, show_ipm_description: false });
  if (cfg.key === 'purchase_orders') Object.assign(row, { quotation_type: '服務', status: '草稿', work_status: '待安排' });
  if (cfg.key === 'invoices') Object.assign(row, { invoice_type: '服務', payment_terms: 'Net 30 days', status: '草稿', paid_amount: 0 });
  if (cfg.key === 'receipts') Object.assign(row, { payment_method: '現金' });
  if (cfg.key === 'contracts') Object.assign(row, { contract_status: '生效中' });
  if (cfg.key === 'employees') Object.assign(row, { status: '在職' });
  if (cfg.key === 'vehicles') Object.assign(row, { status: '可用' });
  if (cfg.key === 'accounts') Object.assign(row, { is_active: true, balance: 0 });
  if (cfg.key === 'transactions') Object.assign(row, { status: '草稿', entries: [] });
  if (cfg.key === 'recurring_schedules') Object.assign(row, { status: '啟用', frequency_type: '每月', start_date: today });
  return row;
}

function prefillEntity(store, cfg, url, row) {
  const qid = str(url.searchParams.get('quotationId'));
  const pid = str(url.searchParams.get('poId'));
  const invoiceId = str(url.searchParams.get('invoiceId'));
  const quotation = qid ? store.get('quotations', qid) : null;
  const purchase = pid ? store.get('purchase_orders', pid) : null;
  const source = purchase || quotation;
  if (source) {
    const mapping = {
      quotation_id: quotation?.id || purchase?.quotation_id || '', quotation_number: quotation?.quotation_number || purchase?.quotation_number || '',
      customer_id: source.customer_id || '', customer_name: source.customer_name || '', customer_code: source.customer_code || '',
      contact_person: source.contact_person || '', customer_tel: source.customer_tel || source.contact_phone || '',
      customer_fax: source.customer_fax || '', customer_email: source.customer_email || '',
      customer_address: source.service_address || source.delivery_address || '', service_address: source.service_address || '',
      delivery_address: source.delivery_address || '', work_unit_id: source.work_unit_id || '', work_unit_name: source.work_unit_name || '',
      work_content: source.work_content || '', service_location: source.service_location || source.work_location || '',
      work_location: source.work_location || source.service_location || '', payment_terms: source.payment_terms || '',
    };
    for (const [key, value] of Object.entries(mapping)) if (cfg.fields.some((f) => f.name === key)) row[key] = value;
    if (cfg.key === 'invoices') {
      row.invoice_type = source.quotation_type || '服務';
      row.delivery_site = source.service_location || source.work_location || '';
      row.due_date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      row.items = arr(source.items).map((item) => ({ item_code: item.code_no || '', item_name: item.item_name || '', description: item.description || '', quantity: num(item.quantity, 1), unit: item.unit || '', unit_price: num(item.unit_price), discount: num(item.discount), subtotal: num(item.total) }));
    } else if (cfg.key === 'delivery_notes') {
      row.delivery_site = source.work_location || source.service_location || '';
      row.delivery_method = '';
      row.items = arr(source.items).map((item) => ({ product_id: item.product_id || '', code_no: item.code_no || item.item_code || '', product_description: item.item_name || item.description || '', packing: item.unit || '', qty: num(item.quantity, 1), remark: '' }));
      row.status = '草稿';
    } else if (cfg.key === 'purchase_orders') {
      row.items = arr(source.items).map((item) => ({ ...item }));
      row.work_dates = source.work_date ? [source.work_date] : [];
    } else if (cfg.key === 'contracts') {
      row.contract_number = source.quotation_number || '';
      row.total_amount = num(source.total_amount);
    }
  }
  if (cfg.key === 'stock_adjustments' && url.searchParams.get('productId')) {
    const product = store.get('products', url.searchParams.get('productId'));
    if (product) Object.assign(row, { product_id: product.id, product_code: product.product_code || '', product_name: product.product_name || '', unit_cost: num(product.cost_price) });
  }
  if (invoiceId && cfg.key === 'receipts') {
    const invoice = store.get('invoices', invoiceId);
    if (invoice) Object.assign(row, {
      invoice_id: invoice.id, invoice_number: invoice.invoice_number, customer_id: invoice.customer_id || '', customer_name: invoice.customer_name || '',
      customer_address: invoice.customer_address || '', customer_tel: invoice.customer_tel || '', customer_fax: invoice.customer_fax || '', contact_person: invoice.contact_person || '',
      total_amount: num(invoice.balance_due), items: [{ invoice_number: invoice.invoice_number, description: `發票 ${invoice.invoice_number} 收款`, subtotal: num(invoice.balance_due) }],
    });
  }
  if (cfg.key === 'schedules' && url.searchParams.get('date')) row.schedule_date = url.searchParams.get('date');
  if (cfg.key === 'vehicle_expenses' && url.searchParams.get('vehicleId')) {
    const vehicle = store.get('vehicles', url.searchParams.get('vehicleId'));
    if (vehicle) Object.assign(row, { vehicle_id: vehicle.id, vehicle_plate: vehicle.plate_number || '' });
  }
  if (cfg.key === 'work_records' && url.searchParams.get('scheduleId')) {
    const schedule = store.get('schedules', url.searchParams.get('scheduleId'));
    const index = Number(url.searchParams.get('index') || 0);
    const item = arr(schedule?.work_items)[index];
    if (schedule && item) Object.assign(row, {
      schedule_id: schedule.id, work_item_index: index, work_name: item.work_name || '', work_location: item.work_location || '',
      work_unit_name: item.work_unit_name || '', employee_name: arr(schedule.assigned_employees)[0]?.employee_name || userNameSafe(row),
      employee_id: arr(schedule.assigned_employees)[0]?.employee_id || '', completion_date: hkNow().date, status: '進行中',
    });
  }
  if (cfg.key === 'recurring_schedules' && url.searchParams.get('contractId')) {
    const contract = store.get('contracts', url.searchParams.get('contractId'));
    if (contract) Object.assign(row, { contract_id: contract.id, contract_number: contract.contract_number, customer_name: contract.customer_name, schedule_name: `${contract.contract_number} 定期服務` });
  }
  for (const key of ['lead_id', 'customer_id', 'customer_name', 'quotation_id', 'quotation_number']) {
    const value = url.searchParams.get(key);
    if (value && cfg.fields.some((f) => f.name === key)) row[key] = value;
  }
  return row;
}
function userNameSafe(row) { return str(row.employee_name || ''); }

export function entityForm({ store, cfg, id = '', url, user, csrf, error = '', override = null, back = null }) {
  assertEntity(user, cfg, true);
  const original = id ? store.get(cfg.key, id) : null;
  if (id && !original) throw new HttpError(404, '找不到要編輯的記錄');
  if (original) assertRecordAccess(user, cfg, original, true);
  const row = override || original || prefillEntity(store, cfg, url, defaultsFor(cfg));
  if (!original && !override && user.role === 'front') {
    if (['supply_records', 'leave_records', 'work_records', 'check_ins'].includes(cfg.key)) {
      row.employee_id ||= user.employee_id || user.id;
      row.employee_name ||= user.name;
    }
    if (cfg.key === 'supply_records') { row.supply_date ||= hkNow().date; row.type ||= '個人'; }
    if (cfg.key === 'leave_records') { row.start_date ||= hkNow().date; row.status ||= '待審批'; }
  }
  if (!row.id) row.id = uid(cfg.key.slice(0, 3));
  return formPage({ cfg, row, ctx: { ...entityContext(store, user, csrf, true), rowId: row.id, originalId: original?.id || '' }, error, back: back || str(url.searchParams.get('back')) || null });
}

export function customerOfficeAccess({ store, user, customer, req, csrf }) {
  if (user.role !== 'office') return { ok: true };
  const now = hkNow();
  const enforced = store.setting('window_enforced', '1') === '1';
  if (enforced) {
    const weekdays = store.setting('work_weekdays', '1,2,3,4,5').split(',').map(Number);
    const holiday = store.db.prepare('SELECT name FROM holidays WHERE date=?').get(now.date);
    const hm = now.hm;
    if (holiday || !weekdays.includes(now.weekday) || hm < store.setting('work_start', '08:30') || hm >= store.setting('work_end', '18:00')) {
      store.audit({ user, action: 'block_window', entity: 'Customer', id: customer.id, label: customer.customer_name, masked: '全部', via: 'detail', req });
      return { ok: false, html: layout({ title: '資料載入中', body: '<div class="errbox"><h2>資料暫時無法載入</h2><p class="muted">請稍後再試。已自動通知技術支援。</p><a class="btn ghost" href="/customers">返回</a></div>', user, csrf }) };
    }
  }
  const recent = store.db.prepare("SELECT at FROM audit_log WHERE actor_id=? AND entity='Customer' AND record_id=? AND action='view' ORDER BY id DESC LIMIT 1").get(user.id, customer.id);
  const recentTime = recent ? new Date(str(recent.at).replace(' ', 'T') + '+08:00').getTime() : 0;
  if (recentTime && Date.now() - recentTime < 10 * 60 * 1000) return { ok: true };
  const quota = store.quota(user.id, now.date);
  const limit = num(store.setting('quota_limit', '50')) + num(quota.extra);
  if (quota.used >= limit) {
    store.audit({ user, action: 'block_quota', entity: 'Customer', id: customer.id, label: customer.customer_name, masked: '全部', via: `quota=${quota.used}`, req });
    store.notify(`辦公室員工 ${user.name} 触碰額度上限`, `第 ${quota.used + 1} 次請求 · 客戶 ${customer.customer_name}`);
    return { ok: false, html: layout({ title: '資料載入中', body: '<div class="errbox"><h2>資料暫時無法載入</h2><p class="muted">請稍後再試。已自動通知技術支援。</p><a class="btn ghost" href="/customers">返回</a></div>', user, csrf }) };
  }
  store.db.prepare('UPDATE quota SET used=used+1 WHERE user_id=? AND day=?').run(user.id, now.date);
  return { ok: true };
}

function leaveDecideForm(row, csrf, status, label, style, back) {
  return `<form method="post" action="/leaves/${encodeURIComponent(row.id)}/decide" style="display:inline"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input type="hidden" name="status" value="${esc(status)}"><input type="hidden" name="__back" value="${esc(back)}"><button class="btn ${style} small">${esc(label)}</button></form>`;
}

function actionForm(action, label, csrf, style = 'ghost', confirm = '', extra = {}) {
  const extraFields = Object.entries(extra).map(([key, value]) => `<input type="hidden" name="${esc(key)}" value="${esc(value)}">`).join('');
  return `<form method="post" action="${esc(action)}" style="display:inline" ${confirm ? `data-confirm="${esc(confirm)}"` : ''}><input type="hidden" name="__csrf" value="${esc(csrf)}">${extraFields}<button class="btn ${style}">${esc(label)}</button></form>`;
}

export function entityDetail({ store, cfg, id, user, csrf, req, url }) {
  const row = store.get(cfg.key, id);
  if (!row) throw new HttpError(404, `找不到該${cfg.title}`);
  assertRecordAccess(user, cfg, row);
  if (cfg.key === 'customers') {
    const access = customerOfficeAccess({ store, user, customer: row, req, csrf });
    if (!access.ok) return access.html;
  }
  let before = '';
  let after = '';
  let tools = '';
  if (cfg.key === 'quotations') {
    before = `<div class="card noprint"><div class="bar">${actionForm(`/quotations/${row.id}/to-po`, '轉為 PO', csrf)}${actionForm(`/quotations/${row.id}/to-contract`, '轉為合約', csrf)}${actionForm(`/quotations/${row.id}/to-invoice`, '轉為發票', csrf)}<a class="btn ghost" href="mailto:${esc(row.customer_email || '')}?subject=${encodeURIComponent(row.quotation_number || '')}">發送電郵</a><form method="post" action="/quotations/${row.id}/stage"><input type="hidden" name="__csrf" value="${esc(csrf)}"><select name="stage">${['已報價', '跟進中', '已收PO', '已成交', '已取消', '失敗'].map((s) => `<option${s === row.stage ? ' selected' : ''}>${s}</option>`).join('')}</select><button class="btn ghost">更新階段</button></form></div></div>`;
    after = `<div class="card"><h3>信件式預覽</h3><iframe src="/print/quotations/${encodeURIComponent(row.id)}" title="報價單預覽" style="width:100%;height:1050px;border:1px solid #e3e7eb"></iframe></div>`;
  }
  if (cfg.key === 'invoices') {
    const receipts = store.list('receipts').filter((r) => r.invoice_id === row.id);
    if (num(row.balance_due) > 0 && canSeeAmounts(user)) before = `<div class="card noprint"><h3>登記收款</h3><form class="bar" method="post" action="/invoices/${row.id}/receipt"><input type="hidden" name="__csrf" value="${esc(csrf)}"><input name="receipt_date" type="date" value="${hkNow().date}"><input name="amount" type="number" step="0.01" min="0.01" max="${num(row.balance_due)}" value="${num(row.balance_due)}" required><select name="payment_method"><option>現金</option><option>支票</option><option>轉帳</option><option>轉數快</option></select><input name="bank_name" placeholder="銀行（選填）"><input name="cheque_number" placeholder="支票號（選填）"><button class="btn">確認收款</button></form></div>`;
    after = `<h2>收款記錄（${receipts.length}）</h2>${simpleTable([{ key: 'receipt_number', label: '收據編號', value: (r) => `<a href="/view/receipts/${r.id}">${esc(r.receipt_number)}</a>` }, { key: 'receipt_date', label: '日期', type: 'date' }, { key: 'payment_method', label: '付款方式' }, { key: 'total_amount', label: '金額', type: 'money' }], receipts, entityContext(store, user, csrf))}`;
  }
  if (cfg.key === 'purchase_orders') {
    before = `<div class="card noprint"><div class="bar"><a class="btn ghost" href="/completion-certificate?id=${row.id}" target="_blank">工程滿意紙</a><a class="btn ghost" href="/new/delivery_notes?poId=${row.id}">由 PO 新增送貨單</a><a class="btn ghost" href="/new/invoices?poId=${row.id}">轉為發票</a><a class="btn ghost" href="/schedules">前往排班</a>${actionForm(`/purchase_orders/${row.id}/share`, row.signing_link ? '重新產生簽署連結' : '產生簽署連結', csrf)}</div>${row.signing_link ? `<div class="notice">簽署連結：<a href="${esc(row.signing_link)}">${esc(row.signing_link)}</a></div>` : ''}</div>`;
  }
  if (cfg.key === 'contracts') {
    const customer = row.customer_id ? store.get('customers', row.customer_id) : null;
    before = `<div class="card noprint"><div class="bar">${row.customer_id ? `<a class="btn ghost" href="/view/customers/${encodeURIComponent(row.customer_id)}">查看客戶${customer?.customer_name ? `：${esc(customer.customer_name)}` : ''}</a>` : ''}<a class="btn ghost" href="/recurringschedules?contractId=${encodeURIComponent(row.id)}">建立定期排程</a><a class="btn ghost" href="/purchaseorders?q=${encodeURIComponent(row.contract_number || '')}">查看關聯 PO</a></div></div>`;
  }
  if (cfg.key === 'recurring_schedules') before = `<div class="card noprint"><div class="bar">${actionForm(`/recurring_schedules/${row.id}/generate`, '立即產生到期排班', csrf)}</div></div>`;
  if (cfg.key === 'vehicles') {
    const plate = str(row.plate_number);
    const expenses = store.list('vehicle_expenses')
      .filter((r) => (plate && str(r.vehicle_plate) === plate) || str(r.vehicle_id) === str(row.id))
      .sort((a, b) => str(b.expense_date).localeCompare(str(a.expense_date)));
    const total = expenses.reduce((sum, r) => sum + num(r.amount), 0);
    after = `<h2>車輛費用（${expenses.length} 筆 · HK$ ${total.toLocaleString('en-HK', { maximumFractionDigits: 2 })}）</h2><div class="bar noprint"><a class="btn" href="/new/vehicle_expenses?vehicleId=${encodeURIComponent(row.id)}">添加費用記錄</a><a class="btn ghost" href="/TollEmailImport">易通行費用匯入</a></div>${simpleTable([{ key: 'expense_date', label: '日期', type: 'date' }, { key: 'expense_time', label: '時間' }, { key: 'expense_type', label: '類型', type: 'pill' }, { key: 'amount', label: '金額', type: 'money' }, { key: 'location', label: '地點' }, { key: 'reference_number', label: '參考編號' }, { key: 'notes', label: '備註' }], expenses, { ...entityContext(store, user, csrf), canSeeAmounts: true })}`;
  }
  if (cfg.key === 'leave_records' && user.role === 'management' && row.status === '待審批') {
    before = `<div class="card noprint"><h3>審批</h3><div class="bar">${leaveDecideForm(row, csrf, '已批准', '批准請假', '', `/view/leave_records/${encodeURIComponent(row.id)}`)}${leaveDecideForm(row, csrf, '已拒絕', '拒絕請假', 'danger', `/view/leave_records/${encodeURIComponent(row.id)}`)}</div><p class="muted">只有管理層可以審批；批准／拒絕後狀態即時更新並寫入審計。</p></div>`;
  }
  if (['work_records', 'service_plan_logs'].includes(cfg.key) && user.role !== 'front') {
    before = `<div class="card noprint"><div class="bar">${actionForm(`/${cfg.key}/${row.id}/share`, row.shared_token ? '沿用現有公開連結' : '產生公開報告連結', csrf)}</div>${row.shared_token ? `<div class="notice">公開連結：<a href="/PublicReportView?type=${cfg.entity}&record_id=${row.id}&token=${encodeURIComponent(row.shared_token)}" target="_blank">/PublicReportView?type=${cfg.entity}&amp;record_id=${row.id}&amp;token=${encodeURIComponent(row.shared_token)}</a></div>` : ''}</div>`;
  }
  if (row.__deleted) {
    tools += actionForm(`/restore/${cfg.key}/${row.id}`, '還原記錄', csrf, '', '確定還原此記錄？');
    if (['office', 'accounting', 'management'].includes(user.role)) tools += actionForm(`/trash/purge`, '永久刪除', csrf, 'danger', '永久刪除後無法還原，確定？', { key: cfg.key, id: row.id });
  }
  else if (cfg.key !== 'company_settings' && cfg.editRoles.includes(user.role) && canEditRecord(user, cfg, row) && !(cfg.key === 'vehicle_expenses' && user.role === 'front')) tools += actionForm(`/delete/${cfg.key}/${row.id}`, '移至回收筒', csrf, 'danger', '確定將此記錄移至回收筒？此動作不會永久刪除。');
  if (cfg.key === 'customers') {
    const related = store.list('quotations').filter((q) => q.customer_id === row.id).slice(0, 20);
    after = `<h2>最近報價（${related.length}）</h2>${simpleTable([{ key: 'quotation_number', label: '編號', value: (r) => `<a href="/view/quotations/${r.id}">${esc(r.quotation_number)}</a>` }, { key: 'document_date', label: '日期', type: 'date' }, { key: 'work_content', label: '工作內容' }, { key: 'total_amount', label: '金額', type: 'money' }, { key: 'stage', label: '階段', type: 'pill' }], related, entityContext(store, user, csrf))}`;
  }
  const masked = !canSeeAmounts(user) ? cfg.fields.filter((f) => f.type === 'money' || AMOUNT_FIELDS.has(f.name)).map((f) => f.name).join(',') : '';
  store.audit({ user, action: 'view', entity: cfg.entity, id: row.id, label: row[cfg.labelField] || row.id, shown: masked ? 'except:' + masked : 'all', masked, via: 'detail', req });
  return detailPage({ cfg, row, ctx: { ...entityContext(store, user, csrf), user }, before, after, tools, title: row[cfg.labelField] || row.id });
}

export function exportEntity({ store, cfg, url, user }) {
  assertEntity(user, cfg);
  if (user.role !== 'management' && !(user.role === 'front' && ['leave_records', 'supply_records'].includes(cfg.key))) throw new HttpError(403, '匯出 CSV 僅限管理層（前線僅開放請假／補給）');
  const rows = filteredRows(store, cfg, url, user);
  const sensitive = new Set(['contact_person', 'phone', 'fax', 'email']);
  const columns = [{ key: 'id', label: 'id' }, ...cfg.fields.map((f) => ({
    key: f.name, label: f.name,
    value: (row) => {
      if (user.role === 'office' && (f.type === 'money' || AMOUNT_FIELDS.has(f.name))) return '•••••';
      if (cfg.key === 'customers' && user.role === 'office' && sensitive.has(f.name)) {
        if (f.name === 'contact_person') return maskName(row[f.name]);
        if (f.name === 'phone') return maskPhone(row[f.name]);
        return row[f.name] ? '—' : '';
      }
      return row[f.name];
    },
  }))];
  const csv = toCSV(rows, columns);
  store.audit({ user, action: 'export', entity: cfg.entity, label: cfg.plural, shown: `rows=${rows.length}`, masked: !canSeeAmounts(user) ? 'amounts' : '', via: 'csv' });
  return { csv, filename: `${cfg.entity}-${hkNow().date}.csv`, count: rows.length };
}

export function importPage({ store, cfg, user, csrf, report = null, error = '' }) {
  assertEntity(user, cfg, true);
  const body = `<h1>匯入${esc(cfg.title)}</h1><div class="sub">使用原始欄位名或欄位標籤作為 CSV 標頭；可先由列表匯出範本</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}${report ? `<div class="notice"><b>匯入完成</b>新增 ${report.created} 筆、更新 ${report.updated} 筆，共 ${report.total} 筆。</div>` : ''}<form class="card" method="post" enctype="multipart/form-data" action="/import/${cfg.key}"><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="frow"><label>CSV 檔案（UTF-8）</label><input type="file" name="file" accept=".csv,text/csv"></div><div class="frow" style="margin-top:14px"><label>或貼上 CSV 內容</label><textarea name="csv" rows="12" placeholder="欄位1,欄位2&#10;資料1,資料2"></textarea></div><div class="frow" style="margin-top:14px"><label>匯入方式</label><select name="mode"><option value="create">只建立新記錄</option><option value="upsert">按 ID／單號更新或建立</option></select></div><div class="bar" style="margin-top:16px"><button class="btn">開始匯入</button><a class="btn ghost" href="${cfg.listPath}">取消</a><a class="btn ghost" href="/export/${cfg.key}.csv">下載現有資料作範本</a></div><p class="muted">所有列會先驗證再寫入；任一列錯誤會整批回滾。每次最多 5,000 筆。財務與庫存匯入不會自動重過賬。</p></form>`;
  return layout({ title: `匯入${cfg.title}`, body, user, active: cfg.key, csrf });
}

export function customerMergePage({ store, user, csrf, result = null, error = '' }) {
  assertRole(user, ENTITIES.customers.editRoles, 'customers');
  const customers = store.list('customers');
  const opts = customers.map((c) => `<option value="${c.id}">${esc(c.customer_name)}${c.customer_code ? ` (${esc(c.customer_code)})` : ''}</option>`).join('');
  const body = `<h1>客戶合併</h1><div class="sub">將來源客戶的所有報價、合約、PO、發票等關聯轉到目標客戶</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}${result ? `<div class="notice"><b>合併完成</b>已更新 ${result.changed} 筆關聯記錄；來源客戶「${esc(result.source.customer_name)}」已移至回收筒。</div>` : ''}<form class="card" method="post" action="/customers/merge" data-confirm="此操作會批量更新關聯記錄，確定合併？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="fgrid"><div class="frow"><label>來源客戶（合併後入回收筒）</label><select name="source_id" required><option value="">請選擇</option>${opts}</select></div><div class="frow"><label>目標客戶（保留）</label><select name="target_id" required><option value="">請選擇</option>${opts}</select></div></div><div class="bar" style="margin-top:16px"><button class="btn danger">確認合併</button><a class="btn ghost" href="/customers">取消</a></div><p class="muted">系統使用單一事務更新所有關聯；任何錯誤都會回滾。不會永久刪除來源記錄。</p></form>`;
  return layout({ title: '客戶合併', body, user, active: 'customers', csrf });
}
