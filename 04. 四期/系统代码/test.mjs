import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ENTITIES, ORIGINAL_ROUTES } from './lib/config.mjs';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3100';
if (!process.env.CPC_TEST && !BASE.includes(':3100')) throw new Error('拒絕對非測試端口執行驗收；請設 TEST_BASE 為隔離測試服務');
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH) throw new Error('請提供隔離測試 DB_PATH');
const OUT = process.env.TEST_OUTPUT || path.join(path.dirname(DB_PATH), 'cpc-test-results.json');
const db = new DatabaseSync(DB_PATH);
const runId = Date.now().toString(36);
const results = [];
const state = { ids: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, pass, details = '') {
  results.push({ name, pass: !!pass, details: String(details || '') });
  if (!pass) console.error('FAIL', name, details);
}
function must(name, condition, details = '') {
  check(name, condition, details);
  if (!condition) throw new Error(`${name}: ${details}`);
}
async function group(name, fn) {
  try { await fn(); }
  catch (error) { check(`${name}（分組完成）`, false, error.stack || error.message); }
}
function row(key, id) {
  const cfg = ENTITIES[key];
  const found = db.prepare('SELECT data,deleted FROM records WHERE entity=? AND id=?').get(cfg.entity, id);
  if (!found) return null;
  const data = JSON.parse(found.data);
  Object.defineProperty(data, '__deleted', { value: !!found.deleted, enumerable: false });
  return data;
}
function first(key, predicate = null) {
  const cfg = ENTITIES[key];
  const rows = db.prepare('SELECT id,data FROM records WHERE entity=? AND deleted=0').all(cfg.entity).map((r) => JSON.parse(r.data));
  return predicate ? rows.find(predicate) : rows[0];
}
function count(key, deleted = 0) {
  return db.prepare(`SELECT COUNT(*) c FROM records WHERE entity=? AND deleted=?`).get(ENTITIES[key].entity, deleted).c;
}
function totalRecords() { return db.prepare('SELECT COUNT(*) c FROM records').get().c; }
function idFromLocation(location) { return decodeURIComponent(String(location || '').split('/').pop().split('?')[0]); }
function opt(key, field, index = 0) { return ENTITIES[key].fields.find((f) => f.name === field)?.options?.[index] || ''; }

async function client(role = null) {
  const c = { role, cookie: '', csrf: '' };
  c.request = async (route, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (c.cookie) headers.Cookie = c.cookie;
    if (options.json) { headers['Content-Type'] = 'application/json'; }
    const response = await fetch(BASE + route, { method: options.method || 'GET', headers, body: options.body, redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers, location: response.headers.get('location') };
  };
  c.get = (route) => c.request(route);
  c.post = (route, fields = {}, withCsrf = true) => {
    const payload = { ...(withCsrf ? { __csrf: c.csrf } : {}), ...fields };
    return c.request(route, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(payload).toString() });
  };
  if (role) {
    const response = await fetch(`${BASE}/demo?as=${role}`, { redirect: 'manual' });
    must(`登入角色 ${role}`, response.status === 302, response.status);
    c.cookie = response.headers.get('set-cookie')?.split(';')[0] || '';
    const home = await c.get('/');
    c.csrf = /<meta name="csrf" content="([^"]*)"/.exec(home.text)?.[1] || '';
    must(`取得 ${role} CSRF`, !!c.csrf);
  }
  return c;
}
async function create(c, key, fields, id) {
  const response = await c.post(`/save/${key}`, { __new_id: id, ...fields });
  must(`新增 ${key}`, response.status === 302, `${response.status} ${response.text.slice(0, 300)}`);
  const saved = row(key, id || idFromLocation(response.location));
  must(`讀回新增 ${key}`, !!saved);
  return saved;
}
async function update(c, key, id, fields) {
  const current = row(key, id);
  const response = await c.post(`/save/${key}`, { __id: id, __expected_updated: current?.updated_date || '', ...fields });
  return response;
}

const mgmt = await client('management');
const office = await client('office');
const accounting = await client('accounting');
const front = await client('front');
const publicClient = await client();

await group('原始資料完整性', async () => {
  const expected = { customers: 1608, quotations: 1826, contracts: 12, invoices: 205, receipts: 57, purchase_orders: 902, delivery_notes: 1026, products: 132, services: 21, suppliers: 151, stock_adjustments: 9566, stock_counts: 47, attendances: 88, schedules: 13113, recurring_schedules: 94, work_records: 2, work_units: 16, notifications: 5103 };
  for (const [key, value] of Object.entries(expected)) check(`資料筆數 ${key}=${value}`, count(key, 0) + count(key, 1) === value, count(key, 0) + count(key, 1));
  check('原始總記錄 34,046', totalRecords() === 34046, totalRecords());
  check('報價回收筒 30', count('quotations', 1) === 30, count('quotations', 1));
  check('送貨單回收筒 15', count('delivery_notes', 1) === 15, count('delivery_notes', 1));
  check('服務使用原表 21', count('services') === 21, count('services'));
  check('供應商使用原表 151', count('suppliers') === 151, count('suppliers'));
});

await group('原系統路由與本地頁面', async () => {
  for (const [route, def] of Object.entries(ORIGINAL_ROUTES)) {
    const cfg = ENTITIES[def.key];
    if (!cfg) continue;
    if (def.action === 'list' || def.action === 'create') {
      const r = await mgmt.get(route);
      check(`GET ${route}`, r.status === 200, r.status);
    } else {
      const sample = first(def.key);
      if (!sample) { check(`SKIP ${route}（原 0 筆）`, true); continue; }
      const param = route.toLowerCase().includes('deliverynote') && def.action === 'create' ? 'editId' : 'id';
      const r = await mgmt.get(`${route}?${param}=${encodeURIComponent(sample.id)}`);
      check(`GET ${route} ${def.action}`, r.status === 200, r.status);
    }
  }
  const dn = first('delivery_notes');
  let r = await mgmt.get(`/CreateDeliveryNote?editId=${dn.id}`);
  check('CreateDeliveryNote?editId 進入編輯', r.status === 200 && r.text.includes('編輯送貨單'), r.status);
  for (const key of Object.keys(ENTITIES)) {
    if (key === 'notifications') continue;
    const nr = await mgmt.get(`/new/${key}`);
    check(`通用新建 /new/${key}`, nr.status === 200, nr.status);
    const sample = first(key);
    if (sample) {
      const vr = await mgmt.get(`/view/${key}/${sample.id}`);
      check(`通用詳情 /view/${key}/:id`, vr.status === 200, vr.status);
    }
  }
  const extras = ['/myschedule', '/myattendance', '/recurringschedules', '/accounts', '/payments', '/bills', '/leads', '/followups', '/addresses', '/TollEmailImport', '/importquotations', '/customers/merge', '/WorkingSchedulePDF', '/print-attendance', '/print-excelschedule', '/excelschedule', '/admin', '/notifications', '/CreateReceipt', '/products/catalog'];
  for (const route of extras) {
    const response = await mgmt.get(route);
    check(`補充路由 ${route}`, response.status === 200, response.status);
  }
  const aliases = ['/Dashboard', '/MyWork', '/PestControlWork', '/ServicePlans', '/ServiceReports', '/WorkSchedule', '/MySchedule', '/CheckIn', '/MyAttendance', '/MonthlyAttendance', '/MySupply', '/Customers', '/Quotations', '/PurchaseOrders', '/Inventory', '/Accounting', '/UserManagement', '/PersonalSettings', '/Employee', '/WorkUnit', '/Address', '/WorkInstruction', '/Pesticide', '/Leads', '/FollowUps', '/Bills', '/Payments', '/GeneralLedger', '/Accounts', '/RecurringSchedules', '/ExcelSchedule', '/EmailTemplates', '/Settings'];
  for (const route of aliases) {
    const response = await mgmt.get(route);
    check(`原名大小寫别名 ${route}`, response.status === 200, response.status);
  }
  const po = first('purchase_orders');
  for (const route of [`/completion-certificate?id=${po.id}`, `/sign-certificate?po=${po.id}`, `/print-schedule?m=2026-10`]) {
    const response = await mgmt.get(route);
    check(`专项打印/签署 ${route}`, response.status === 200, response.status);
  }
  const publicDenied = await publicClient.get('/PublicReportView');
  check('公開報告無 token 拒絕', publicDenied.status === 403, publicDenied.status);
});

await group('四角色與原路徑權限', async () => {
  const customer = first('customers'); const invoice = first('invoices'); const quotation = first('quotations');
  const cases = [
    [front, '/customers', 403], [front, '/quotations', 403], [front, '/invoices', 403], [front, '/users', 403], [front, '/settings', 403],
    [front, `/viewcustomer?id=${customer.id}`, 403], [front, `/viewinvoice?id=${invoice.id}`, 403], [front, '/workinstructions', 200], [front, '/pesticides', 200],
    [office, '/customers', 200], [office, '/quotations', 200], [office, '/invoices', 403], [office, '/receivables', 403], [office, '/users', 403], [office, '/workunits', 200], [office, '/employees', 403],
    [office, `/viewcustomer?id=${customer.id}`, 200], [office, `/viewinvoice?id=${invoice.id}`, 403], [office, `/edit/quotations/${quotation.id}`, 200], [office, `/print/quotations/${quotation.id}`, 403],
    [accounting, '/invoices', 200], [accounting, '/customers', 200], [accounting, '/users', 403], [accounting, '/employees', 200], [accounting, '/schedules', 200], [accounting, '/excelschedule', 200], [accounting, '/new/schedules', 403],
    [accounting, `/viewinvoice?id=${invoice.id}`, 200], [mgmt, `/print/quotations/${quotation.id}`, 200], [mgmt, `/viewquotation?id=${quotation.id}`, 200],
  ];
  for (const [client, route, expected] of cases) {
    const response = await client.get(route);
    check(`權限 ${client.role} ${route} => ${expected}`, response.status === expected, response.status);
  }
  const noCsrf = await mgmt.post('/save/customers', { customer_name: 'bad' }, false);
  check('寫操作缺 CSRF 返回 403', noCsrf.status === 403, noCsrf.status);
});

await group('客戶 CRUD、CSV、XSS 與合併', async () => {
  const id = `t_${runId}_cust`; const name = `驗收客戶${runId}<script>alert(1)</script>`;
  const saved = await create(mgmt, 'customers', { customer_name: name, customer_type: '標準', phone: '21111111', service_address: '香港' }, id);
  state.ids.customer = id;
  check('客戶保存主鍵', saved.id === id, saved.id);
  const edit = await update(mgmt, 'customers', id, { phone: '22222222' });
  check('客戶編輯 302', edit.status === 302, edit.status);
  check('客戶編輯落庫', row('customers', id).phone === '22222222');
  const detail = await mgmt.get(`/view/customers/${id}`);
  check('詳情 XSS 已轉義', !detail.text.includes('<script>alert(1)</script>') && detail.text.includes('&lt;script&gt;'), detail.status);
  const csv = await mgmt.get('/export/customers.csv');
  check('CSV 匯出含新客戶', csv.status === 200 && csv.text.includes(name), csv.status);
  const importedName = `匯入客戶${runId}`;
  const imp = await mgmt.post('/import/customers', { mode: 'create', csv: `customer_name,customer_type\n${importedName},標準` });
  check('CSV 匯入成功', imp.status === 200 && !!first('customers', (r) => r.customer_name === importedName), imp.status);
  const source = first('customers', (r) => r.customer_name === importedName);
  const merged = await mgmt.post('/customers/merge', { source_id: source.id, target_id: id });
  check('客戶合併頁成功', merged.status === 200 && merged.text.includes('合併完成'), merged.status);
  check('合併來源進回收筒', row('customers', source.id)?.__deleted === true);
  const restored = await mgmt.post(`/restore/customers/${source.id}`, {});
  check('客戶可還原', restored.status === 302 && row('customers', source.id)?.__deleted === false, restored.status);
});

await group('報價、轉換、收款與簽署', async () => {
  const qid = `t_${runId}_quote`;
  const q = await create(mgmt, 'quotations', {
    quotation_type: '服務', document_language: '中文', document_date: '2026-10-24', quotation_number: '', quotation_name: '',
    customer_name: row('customers', state.ids.customer).customer_name, customer_type: '標準', work_content: '滅鼠', service_location: '香港',
    service_scope: '全層', work_instructions: JSON.stringify(['細則一']), pesticides: JSON.stringify([{ name: 'RatDown', reg_no: '#1' }]),
    items: JSON.stringify([{ item_name: '滅鼠服務', description: '一次', quantity: 2, unit: '次', unit_price: 100, discount: 0 }]),
    freight_charges: '20', discount: '0', payment_terms: 'Net 30 days', remarks: JSON.stringify(['備註一']), stage: '已報價',
    show_service_item_quantity_unit: '1', show_service_item_total: '1', show_item_description: '0', show_ipm_description: '0',
  }, qid);
  state.ids.quotation = qid;
  check('報價自動編號', /^SQP-\d{4}-\d{4}$/.test(q.quotation_number), q.quotation_number);
  check('報價合計 220', q.subtotal === 200 && q.total_amount === 220, `${q.subtotal}/${q.total_amount}`);
  check('報價客戶關聯已回填', q.customer_id === state.ids.customer, q.customer_id);
  const stage = await mgmt.post(`/quotations/${qid}/stage`, { stage: '跟進中' });
  check('報價階段更新', stage.status === 302 && row('quotations', qid).stage === '跟進中', stage.status);
  const printed = await mgmt.get(`/print/quotations/${qid}`);
  check('服務報價為信件式', printed.status === 200 && printed.text.includes('服 務 費 用') && printed.text.includes('接納及確認') && !printed.text.includes('<th>#</th>'), printed.status);
  const poRes = await mgmt.post(`/quotations/${qid}/to-po`, {});
  must('報價轉 PO', poRes.status === 302, poRes.status);
  const poId = idFromLocation(poRes.location); state.ids.po = poId;
  check('PO 保留來源與明細', row('purchase_orders', poId).quotation_id === qid && row('purchase_orders', poId).items.length === 1);
  const ctRes = await mgmt.post(`/quotations/${qid}/to-contract`, {});
  must('報價轉合約', ctRes.status === 302, ctRes.status);
  state.ids.contract = idFromLocation(ctRes.location);
  const ivRes = await mgmt.post(`/quotations/${qid}/to-invoice`, {});
  must('報價轉發票', ivRes.status === 302, ivRes.status);
  const ivId = idFromLocation(ivRes.location); state.ids.invoice = ivId;
  check('發票初始餘額 220', row('invoices', ivId).balance_due === 220 && row('invoices', ivId).paid_amount === 0);
  const rcRes = await mgmt.post(`/invoices/${ivId}/receipt`, { amount: '50', payment_method: '現金', receipt_date: '2026-10-24' });
  must('發票收款生成收據', rcRes.status === 302, rcRes.status);
  const receiptId = idFromLocation(rcRes.location); state.ids.receipt = receiptId;
  check('收款後已收/餘額正確', row('invoices', ivId).paid_amount === 50 && row('invoices', ivId).balance_due === 170 && row('invoices', ivId).status === '部分收款');
  check('收據金額正確', row('receipts', receiptId).total_amount === 50);
  const over = await mgmt.post(`/invoices/${ivId}/receipt`, { amount: '9999', payment_method: '現金' });
  check('超額收款被拒', over.status === 400, over.status);
  const rcPrint = await mgmt.get(`/print/receipts/${receiptId}`);
  check('收據打印含免簽名文字', rcPrint.text.includes('This is a Computer Printout. No signature is required.'), rcPrint.status);
  const share = await mgmt.post(`/purchase_orders/${poId}/share`, {});
  must('產生 PO 簽署連結', share.status === 302, share.status);
  const signing = row('purchase_orders', poId).signing_link;
  check('簽署連結含安全 token', signing.includes('token='), signing);
  const publicSign = await publicClient.get(signing);
  check('公開簽署頁可用', publicSign.status === 200 && publicSign.text.includes('signature-pad'), publicSign.status);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const signed = await publicClient.post(signing, { signer_name: '驗收簽署人', signer_title: '經理', signature_data: png }, false);
  check('公開簽署落庫', signed.status === 200 && row('purchase_orders', poId).signed_by === '驗收簽署人' && row('purchase_orders', poId).signing_status === '已簽署', signed.status);
  const again = await publicClient.post(signing, { signer_name: '重複', signature_data: png }, false);
  check('重複簽署拒絕', again.status === 409, again.status);
});

await group('送貨單與庫存事務', async () => {
  const product = first('products', (p) => Number(p.stock_quantity) > 20);
  must('找到庫存測試產品', !!product);
  const before = Number(product.stock_quantity);
  const dnId = `t_${runId}_dn`;
  const dn = await create(mgmt, 'delivery_notes', {
    dn_number: '', dn_date: '2026-10-24', customer_name: '庫存驗收客戶', delivery_site: '香港', delivery_method: '跟車運送',
    contact_person: ' tester ', items: JSON.stringify([{ code_no: product.product_code, product_description: product.product_name, qty: 1, packing: '件', remark: '' }]), status: '草稿', notes: '',
  }, dnId);
  state.ids.dn = dnId;
  check('送貨單自動編號', /^DNP\d{7}$/.test(dn.dn_number), dn.dn_number);
  const posted = await update(mgmt, 'delivery_notes', dnId, { status: '已送達' });
  must('送貨單送達過賬 302', posted.status === 302, posted.status);
  const after = Number(row('products', product.id).stock_quantity);
  check('送達只扣一次庫存', after === before - 1, `${before} -> ${after}`);
  check('送貨單標記已同步', row('delivery_notes', dnId).stock_synced === true && !!row('delivery_notes', dnId).stock_synced_at);
  const adjustment = first('stock_adjustments', (a) => a.source_delivery_id === dnId);
  check('送貨出庫調整記錄正確', adjustment && adjustment.quantity_before === before && adjustment.quantity_change === -1 && adjustment.quantity_after === before - 1);
  const again = await update(mgmt, 'delivery_notes', dnId, { notes: '再次保存' });
  check('再次保存不重複扣庫存', again.status === 302 && Number(row('products', product.id).stock_quantity) === after, again.status);
  const editItems = await update(mgmt, 'delivery_notes', dnId, { items: JSON.stringify([{ code_no: product.product_code, qty: 2 }]) });
  check('已過賬明細不可改', editItems.status === 409, editItems.status);
  const badId = `t_${runId}_dn_bad`;
  const bad = await mgmt.post('/save/delivery_notes', { __new_id: badId, dn_number: '', dn_date: '2026-10-24', customer_name: '缺貨驗收', items: JSON.stringify([{ code_no: product.product_code, qty: after + 10000 }]), status: '已送達' });
  check('缺貨返回 409', bad.status === 409, bad.status);
  check('缺貨整筆回滾', !row('delivery_notes', badId) && Number(row('products', product.id).stock_quantity) === after);
});

await group('庫存調整與盤點', async () => {
  const product = first('products', (p) => Number(p.stock_quantity) > 20) || first('products');
  const before = Number(row('products', product.id).stock_quantity);
  const adjId = `t_${runId}_adj`;
  await create(mgmt, 'stock_adjustments', { adjustment_number: '', adjustment_type: '入庫', adjustment_date: '2026-10-24', product_id: product.id, product_code: product.product_code, product_name: product.product_name, quantity_change: 5, unit_cost: 1, reference_number: 'TEST', notes: '' }, adjId);
  check('入庫調整增加 5', Number(row('products', product.id).stock_quantity) === before + 5, `${before} -> ${row('products', product.id).stock_quantity}`);
  const edit = await update(mgmt, 'stock_adjustments', adjId, { notes: '不可改' });
  check('調整記錄不可直接編輯', edit.status === 409, edit.status);
  const countId = `t_${runId}_count`;
  const current = Number(row('products', product.id).stock_quantity);
  await create(mgmt, 'stock_counts', { count_number: '', count_date: '2026-10-24', completed_by: '', completed_date: '', status: '已完成', items: JSON.stringify([{ product_id: product.id, product_code: product.product_code, product_name: product.product_name, actual_quantity: current + 2 }]), notes: '驗收盤點' }, countId);
  check('盤點差異更新庫存', Number(row('products', product.id).stock_quantity) === current + 2, `${current} -> ${row('products', product.id).stock_quantity}`);
  const ca = first('stock_adjustments', (a) => a.source_stock_count_id === countId);
  check('盤點產生差異調整', ca && ca.quantity_change === 2 && ca.quantity_after === current + 2);
});

await group('排班與定期排程', async () => {
  const scheduleId = `t_${runId}_schedule`;
  const poId = state.ids.po || first('purchase_orders').id;
  await create(mgmt, 'schedules', { schedule_date: '2026-11-15', vehicle_plate: '', color: '#fff', assigned_employees: JSON.stringify([{ employee_name: '驗收員' }]), work_items: JSON.stringify([{ po_id: poId, work_name: '驗收工作', work_location: '香港', estimated_hours: 1, status: '待執行' }]), total_hours: 1, status: '待執行', notes: '' }, scheduleId);
  check('排班同步 PO 工作日期', (row('purchase_orders', poId).work_dates || []).includes('2026-11-15'));
  const moved = await mgmt.post(`/schedules/${scheduleId}/move`, { date: '2026-11-16' });
  check('拖曳排班更新日期', moved.status === 200 && row('schedules', scheduleId).schedule_date === '2026-11-16', moved.status);
  check('移動後同步 PO 日期', (row('purchase_orders', poId).work_dates || []).includes('2026-11-16'));
  const recurringId = `t_${runId}_recurring`;
  const contract = row('contracts', state.ids.contract) || first('contracts');
  await create(mgmt, 'recurring_schedules', {
    schedule_name: '驗收每週排程', contract_id: contract.id, contract_number: contract.contract_number, customer_name: contract.customer_name,
    start_date: '2026-10-19', end_date: '2026-12-31', next_schedule_date: '2026-10-19', frequency_type: '每週',
    frequency_config: JSON.stringify({ weekly_days: [1], interval: 1 }), default_employees: JSON.stringify([{ employee_name: '驗收員' }]), default_vehicle: '',
    work_items: JSON.stringify([{ work_name: '每週驗收', work_location: '香港', estimated_hours: 1, start_time: '09:00', end_time: '17:00' }]), status: '啟用', notes: '',
  }, recurringId);
  const generated = await mgmt.post(`/recurring_schedules/${recurringId}/generate`, {});
  check('定期排程生成成功', generated.status === 302, generated.status);
  const generatedRows = db.prepare('SELECT data FROM records WHERE entity=? AND deleted=0').all('Schedule').map((r) => JSON.parse(r.data)).filter((s) => s.recurring_schedule_id === recurringId);
  check('每週排程只生成到期一次', generatedRows.length === 1 && generatedRows[0].schedule_date === '2026-10-19', generatedRows.length);
  await mgmt.post(`/recurring_schedules/${recurringId}/generate`, {});
  const regenerated = db.prepare('SELECT data FROM records WHERE entity=? AND deleted=0').all('Schedule').map((r) => JSON.parse(r.data)).filter((s) => s.recurring_schedule_id === recurringId);
  check('重複生成不重複建班', regenerated.length === 1, regenerated.length);
});

await group('服務報告公開分享與照片檢查', async () => {
  const invalidId = `t_${runId}_report_bad`;
  const invalid = await mgmt.post('/save/work_records', { __new_id: invalidId, report_title: '缺照片', status: '已完成', photo_points: JSON.stringify([]) });
  check('完成報告缺 2 類照片被拒', invalid.status === 400 && !row('work_records', invalidId), invalid.status);
  const existing = first('work_records', (r) => Array.isArray(r.photo_points) && r.photo_points.length) || first('work_records');
  const shared = await mgmt.post(`/work_records/${existing.id}/share`, {});
  check('生成服務報告公開連結', shared.status === 302 && !!row('work_records', existing.id).shared_token, shared.status);
  const shareToken = row('work_records', existing.id).shared_token;
  const pub = await publicClient.get(`/PublicReportView?type=WorkRecord&record_id=${existing.id}&token=${encodeURIComponent(shareToken)}`);
  check('公開報告 token 可用', pub.status === 200, pub.status);
  const denied = await publicClient.get(`/PublicReportView?type=WorkRecord&record_id=${existing.id}&token=wrong`);
  check('錯誤公開 token 拒絕', denied.status === 403, denied.status);
  const point = existing.photo_points?.find((p) => p.close_up_photo || p.work_photo || p.far_photo || p.target_photo);
  const fileUrl = point?.close_up_photo || point?.work_photo || point?.far_photo || point?.target_photo;
  state.imageUrl = fileUrl;
  if (fileUrl) {
    const file = await publicClient.get(`/public-attachment?token=${encodeURIComponent(shareToken)}&url=${encodeURIComponent(fileUrl)}`);
    check('公開附件只憑報告 token 訪問', file.status === 200, file.status);
  }
});

await group('財務與空實體新建鏈路', async () => {
  const accountId = `t_${runId}_account`;
  await create(mgmt, 'accounts', { account_code: 'TEST100', account_name: '驗收現金', account_type: opt('accounts', 'account_type'), account_category: opt('accounts', 'account_category'), description: '', is_active: '1', balance: 0 }, accountId);
  const txId = `t_${runId}_tx`;
  const entries = JSON.stringify([{ account_id: accountId, account_code: 'TEST100', account_name: '驗收現金', debit: 100, credit: 0, description: '借' }, { account_id: accountId, account_code: 'TEST200', account_name: '驗收收入', debit: 0, credit: 100, description: '貸' }]);
  await create(mgmt, 'transactions', { transaction_date: '2026-10-24', transaction_type: '一般', reference_number: 'TXTEST', description: '平衡憑證', entries, status: '已過賬', notes: '' }, txId);
  check('憑證借貸合計 100', row('transactions', txId).total_debit === 100 && row('transactions', txId).total_credit === 100);
  const badTx = `t_${runId}_tx_bad`;
  const bad = await mgmt.post('/save/transactions', { __new_id: badTx, entries: JSON.stringify([{ debit: 100, credit: 0 }]), status: '已過賬' });
  check('不平衡憑證拒絕', bad.status === 400 && !row('transactions', badTx), bad.status);
  const billId = `t_${runId}_bill`;
  await create(mgmt, 'bills', { bill_number: '', bill_date: '2026-10-24', due_date: '2026-11-24', vendor_name: '驗收供應商', vendor_reference: '', items: JSON.stringify([{ description: '物料', quantity: 2, unit_price: 50, amount: 0 }]), tax_amount: 0, paid_amount: 0, status: '草稿', notes: '' }, billId);
  check('帳單合計與餘額 100', row('bills', billId).total_amount === 100 && row('bills', billId).balance_due === 100);
  const paymentId = `t_${runId}_payment`;
  await create(mgmt, 'payments', { payment_number: '', payment_date: '2026-10-24', payment_type: '供應商付款', payment_method: '轉帳', reference_number: 'PAYTEST', customer_name: '', vendor_name: '驗收供應商', amount: 50, description: '', status: '草稿' }, paymentId);
  check('付款新建頁可保存', row('payments', paymentId).amount === 50);
  const leadId = `t_${runId}_lead`;
  await create(mgmt, 'leads', { lead_number: '', customer_name: '驗收線索', customer_type: opt('leads', 'customer_type'), contact_person: '', phone: '', whatsapp: '', email: '', service_address: '', lead_source: opt('leads', 'lead_source'), interest_type: opt('leads', 'interest_type'), estimated_value: 100, status: opt('leads', 'status'), priority: opt('leads', 'priority'), notes: '', assigned_to: '', assigned_name: '' }, leadId);
  check('Lead 新建可保存', !!row('leads', leadId));
  const followId = `t_${runId}_follow`;
  await create(mgmt, 'follow_ups', { quotation_id: state.ids.quotation, quotation_number: row('quotations', state.ids.quotation).quotation_number, customer_id: state.ids.customer, customer_name: row('customers', state.ids.customer).customer_name, lead_id: leadId, follow_up_date: '2026-10-24', method: opt('follow_ups', 'method'), content: '驗收跟進', result: '', next_follow_up_date: '', created_by_name: '' }, followId);
  check('FollowUp 新建可保存', !!row('follow_ups', followId));
  const addressId = `t_${runId}_address`;
  await create(mgmt, 'addresses', { address_name: '驗收地址', full_address: '香港驗收道 1 號', district: '', region: '', contact_person: '', contact_phone: '', notes: '' }, addressId);
  check('地址庫新建可保存', !!row('addresses', addressId));
  const wiId = `t_${runId}_wi`;
  await create(mgmt, 'work_instructions', { title: '驗收細則', category: '測試', content: '<p>內容</p>', is_active: '1' }, wiId);
  check('工作細則新建可保存', !!row('work_instructions', wiId));
  const etId = `t_${runId}_et`;
  await create(mgmt, 'email_templates', { template_name: '驗收範本', subject: '主旨', body: '內容', document_type: '通用', is_active: '1' }, etId);
  check('電郵範本新建可保存', !!row('email_templates', etId));
  const empId = `t_${runId}_emp`;
  await create(mgmt, 'employees', { employee_name: '驗收員工', employee_nickname: '', employee_code: '', employee_type: opt('employees', 'employee_type'), phone: '', email: '', status: '在職', hourly_rate: 0, monthly_salary: 0, resignation_date: '' }, empId);
  check('員工新建可保存', !!row('employees', empId));
  state.ids.employee = empId;
  const supplyId = `t_${runId}_supply`;
  await create(mgmt, 'supply_records', { supply_date: '2026-10-24', employee_id: empId, employee_name: '驗收員工', type: '個人', products: JSON.stringify([]), tools: JSON.stringify([]), notes: '' }, supplyId);
  check('補給記錄新建可保存', !!row('supply_records', supplyId));
});

await group('圖片編輯與另存', async () => {
  must('取得可編輯圖片', !!state.imageUrl);
  const editor = await mgmt.get(`/image-editor?url=${encodeURIComponent(state.imageUrl)}`);
  check('圖片編輯器可打開', editor.status === 200 && editor.text.includes('另存新版本'), editor.status);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const saved = await mgmt.post('/image-editor/save', { source: state.imageUrl, filename: `edited-${runId}.png`, data: png });
  check('圖片另存成功', saved.status === 200 && saved.text.includes('/uploads/Edited/'), saved.status);
  const resultPath = saved.text.match(/\/uploads\/Edited\/[^"<]+?\.png/)?.[0];
  must('取得新圖片路徑', !!resultPath, saved.text.slice(0, 300));
  const file = await mgmt.get(resultPath);
  check('新圖片可訪問', file.status === 200 && file.headers.get('content-type') === 'image/png', `${file.status}/${file.headers.get('content-type')}`);
});

await group('月度出勤保存', async () => {
  const employeeId = state.ids.employee;
  const key = `${employeeId}|2026-10-24`;
  const saved = await mgmt.post('/monthlyattendance/save', { __month: '2026-10', [key]: '7.5' });
  check('出勤新工時保存', saved.status === 302, saved.status);
  let record = first('attendances', (r) => r.employee_id === employeeId && r.attendance_date === '2026-10-24');
  check('出勤工時落庫 7.5', record?.hours === 7.5 && record?.attendance_type === '正常上班', JSON.stringify(record));
  await mgmt.post('/monthlyattendance/save', { __month: '2026-10', [key]: '年假' });
  record = first('attendances', (r) => r.employee_id === employeeId && r.attendance_date === '2026-10-24');
  check('出勤類型修改落庫', record?.hours === 0 && record?.attendance_type === '年假', JSON.stringify(record));
  await mgmt.post('/monthlyattendance/save', { __month: '2026-10', [key]: '' });
  record = first('attendances', (r) => r.employee_id === employeeId && r.attendance_date === '2026-10-24');
  check('出勤清空為缺勤', record?.hours === 0 && record?.attendance_type === '缺勤', JSON.stringify(record));
  const denied = await accounting.post('/monthlyattendance/save', { __month: '2026-10', [key]: '8' });
  check('會計出勤批量保存唯讀', denied.status === 403, denied.status);
});

await group('用戶白名單、改密與登入鎖定', async () => {
  const email = `test-${runId}@example.com`;
  const created = await mgmt.post('/users/save', { id: '', name: '白名單驗收', email, role: 'office', employee_id: '', active: '1', must_change: '1', accessible_pages: 'Dashboard,Customers', password: 'Test123456' });
  check('建立白名單用戶', created.status === 302 && !!db.prepare('SELECT * FROM users WHERE email=?').get(email), created.status);
  const login = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'Test123456' }), redirect: 'manual' });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  const custom = await client();
  custom.role = 'custom'; custom.cookie = cookie;
  const home = await custom.get('/'); custom.csrf = /<meta name="csrf" content="([^"]*)"/.exec(home.text)?.[1] || '';
  check('白名單允許 Customers', (await custom.get('/customers')).status === 200);
  check('白名單阻擋 Quotations', (await custom.get('/quotations')).status === 403);
  const changed = await custom.post('/me/password', { current: 'Test123456', password: 'Newpass123', confirm: 'Newpass123' });
  check('用戶可自行改密', changed.status === 302, changed.status);
  const relogin = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'Newpass123' }), redirect: 'manual' });
  check('新密碼可登入', relogin.status === 302, relogin.status);
  const deactivated = await custom.post('/me/deactivate', { current: 'Newpass123' });
  check('用戶可安全停用帳號', deactivated.status === 302 && db.prepare('SELECT active FROM users WHERE email=?').get(email).active === 0, deactivated.status);
  const disabledLogin = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'Newpass123' }), redirect: 'manual' });
  check('停用帳號不能再登入', disabledLogin.status === 200, disabledLogin.status);
  const originalEmail = `original-pages-${runId}@example.com`;
  await mgmt.post('/users/save', { id: '', name: '原頁面白名單', email: originalEmail, role: 'management', employee_id: '', active: '1', must_change: '0', accessible_pages: 'Dashboard,MyWork,PestControlWork,UserManagement', password: 'Test123456' });
  const originalLogin = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: originalEmail, password: 'Test123456' }), redirect: 'manual' });
  const originalClient = await client(); originalClient.role = 'original-pages'; originalClient.cookie = originalLogin.headers.get('set-cookie')?.split(';')[0] || '';
  check('原白名單 Dashboard/MyWork', (await originalClient.get('/mywork')).status === 200);
  check('原白名單 PestControlWork', (await originalClient.get('/pestcontrolwork')).status === 200);
  check('原白名單 UserManagement', (await originalClient.get('/users')).status === 200);
  check('原白名單仍阻擋未授權頁', (await originalClient.get('/quotations')).status === 403);
  const badEmail = `lock-${runId}@example.com`;
  let last;
  for (let i = 0; i < 5; i++) last = await publicClient.post('/login', { email: badEmail, password: 'wrong' }, false);
  const locked = await publicClient.post('/login', { email: badEmail, password: 'wrong' }, false);
  check('連續失敗後登入鎖定', locked.status === 429, locked.status);
});

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
const report = { base: BASE, database: DB_PATH, runId, passed, failed, total: results.length, state, results };
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`\n驗收完成：${passed}/${results.length} 通過，${failed} 失敗`);
console.log(`報告：${OUT}`);
db.close();
process.exitCode = failed ? 1 : 0;
