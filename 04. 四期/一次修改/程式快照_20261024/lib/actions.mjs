import { ENTITIES } from './config.mjs';
import { arr, bool, hkNow, num, parseCSV, str, uid } from './utils.mjs';

const NUMBER_FIELDS = {
  customers: 'customer_code', quotations: 'quotation_number', contracts: 'contract_number', invoices: 'invoice_number',
  receipts: 'receipt_number', bills: 'bill_number', payments: 'payment_number', purchase_orders: 'po_number',
  delivery_notes: 'dn_number', products: 'product_code', services: 'service_code', suppliers: 'supplier_code',
  stock_adjustments: 'adjustment_number', stock_counts: 'count_number', employees: 'employee_code',
  leave_records: 'id', recurring_schedules: 'schedule_name', work_records: 'report_title',
  vehicles: 'plate_number', leads: 'lead_number', accounts: 'account_code',
};

function parseJSONField(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { const error = new Error('結構化欄位不是有效 JSON'); error.statusCode = 400; throw error; }
}

function cleanId(value) {
  const id = str(value);
  return /^[A-Za-z0-9_-]{1,110}$/.test(id) ? id : '';
}

export function dynamicOptions(store) {
  const customers = store.list('customers').map((r) => r.customer_name).filter(Boolean);
  const employees = store.list('employees', { includeDeleted: true }).map((r) => r.employee_name).filter(Boolean);
  const legacyEmployees = store.list('schedule_employees' in ENTITIES ? 'schedule_employees' : 'schedules')
    .flatMap((r) => arr(r.assigned_employees).map((e) => e.employee_name));
  const workUnits = store.list('work_units').map((r) => r.unit_name).filter(Boolean);
  const vehicles = store.list('vehicles').map((r) => r.plate_number).filter(Boolean);
  const suppliers = store.list('suppliers').map((r) => r.supplier_name).filter(Boolean);
  const products = store.list('products').map((r) => `${r.product_code || ''} ${r.product_name || ''}`.trim());
  const accounts = store.list('accounts', { includeDeleted: true }).map((r) => `${r.account_code || ''} ${r.account_name || ''}`.trim());
  const unique = (a) => [...new Set(a)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const options = {
    customer_name: unique(customers), customer_id: unique(customers), main_customer: unique(customers),
    assigned_admin_name: unique([...employees, ...legacyEmployees]), employee_name: unique([...employees, ...legacyEmployees]),
    assigned_to: unique([...employees, ...legacyEmployees]), assigned_name: unique([...employees, ...legacyEmployees]),
    work_unit_name: unique(workUnits), work_unit_id: unique(workUnits), vehicle_plate: unique(vehicles),
    default_vehicle: unique(vehicles), supplier_name: unique(suppliers), vendor_name: unique(suppliers),
    product_name: unique(products), product_id: unique(products), account_id: unique(accounts),
    type: unique(['個人', ...vehicles]),
  };
  return options;
}

function defaultNumber(store, cfg, data) {
  const field = NUMBER_FIELDS[cfg.key];
  if (!field || !Object.hasOwn(data, field) || str(data[field])) return;
  const year = hkNow().date.slice(0, 4);
  const yy = year.slice(2);
  if (cfg.key === 'quotations') data[field] = store.nextNumber(cfg.key, field, data.quotation_type === '產品' ? 'SQM-' : 'SQP-', `${year}-`, 4);
  else if (cfg.key === 'purchase_orders') data[field] = store.nextNumber(cfg.key, field, 'PO-', `${year}-`, 4);
  else if (cfg.key === 'invoices') data[field] = store.nextNumber(cfg.key, field, 'INV-', `${year}-`, 4);
  else if (cfg.key === 'receipts') data[field] = store.nextNumber(cfg.key, field, 'R', yy, 4);
  else if (cfg.key === 'bills') data[field] = store.nextNumber(cfg.key, field, 'BILL-', `${year}-`, 4);
  else if (cfg.key === 'payments') data[field] = store.nextNumber(cfg.key, field, 'PAY-', `${year}-`, 4);
  else if (cfg.key === 'leads') data[field] = store.nextNumber(cfg.key, field, 'LEAD-', `${year}-`, 4);
  else if (cfg.key === 'stock_adjustments') data[field] = store.nextNumber(cfg.key, field, 'ADJ-', `${year}-`, 5);
  else if (cfg.key === 'stock_counts') data[field] = store.nextNumber(cfg.key, field, 'COUNT-', `${year}-`, 4);
  else if (cfg.key === 'contracts') data[field] = store.nextNumber(cfg.key, field, 'C-', `${year}-`, 4);
  else if (cfg.key === 'delivery_notes') {
    const prefix = `DNP${yy}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    data[field] = store.nextNumber(cfg.key, field, prefix, '', 3);
  }
}

function normalizeRelations(store, cfg, data) {
  if (Object.hasOwn(data, 'customer_name') && data.customer_name) {
    const customer = store.list('customers').find((r) => r.customer_name === data.customer_name || r.id === data.customer_id);
    if (customer) {
      const mapping = {
        customer_id: customer.id, customer_code: customer.customer_code, customer_tel: customer.phone,
        customer_fax: customer.fax, customer_email: customer.email, contact_person: customer.contact_person,
        customer_address: customer.service_address, service_address: customer.service_address,
        delivery_address: customer.delivery_address, customer_type: customer.customer_type,
      };
      for (const [field, value] of Object.entries(mapping)) {
        if (cfg.fields.some((f) => f.name === field) && (!data[field] || field === 'customer_id' || field === 'customer_code')) data[field] = value || '';
      }
    }
  }
  if (Object.hasOwn(data, 'work_unit_name') && data.work_unit_name) {
    const unit = store.list('work_units').find((r) => r.unit_name === data.work_unit_name);
    if (unit && cfg.fields.some((f) => f.name === 'work_unit_id')) data.work_unit_id = unit.id;
  }
  if (Object.hasOwn(data, 'employee_name') && data.employee_name) {
    const employee = store.list('employees', { includeDeleted: true }).find((r) => r.employee_name === data.employee_name);
    if (employee && cfg.fields.some((f) => f.name === 'employee_id')) data.employee_id = employee.id;
  }
}

function recalculate(cfg, data) {
  if (cfg.key === 'quotations') {
    const items = arr(data.items);
    let subtotal = 0;
    for (const item of items) {
      item.total = num(item.quantity, 0) * num(item.unit_price, 0) - num(item.discount, 0);
      subtotal += item.total;
    }
    data.items = items;
    data.subtotal = subtotal;
    data.total_amount = subtotal + num(data.freight_charges) - num(data.discount);
    if (!data.quotation_name && data.quotation_number) data.quotation_name = [data.quotation_number, data.work_unit_name, data.work_content].filter(Boolean).join('_');
  }
  if (cfg.key === 'invoices') {
    let subtotal = 0;
    for (const item of arr(data.items)) {
      item.subtotal = num(item.quantity) * num(item.unit_price) - num(item.discount);
      subtotal += item.subtotal;
    }
    data.subtotal = subtotal;
    data.total_amount = subtotal + num(data.freight_charges);
    data.paid_amount = num(data.paid_amount);
    data.balance_due = Math.max(0, data.total_amount - data.paid_amount);
  }
  if (cfg.key === 'purchase_orders') {
    let subtotal = 0;
    for (const item of arr(data.items)) {
      item.total = num(item.quantity) * num(item.unit_price) - num(item.discount);
      subtotal += item.total;
    }
    data.subtotal = subtotal;
    data.total_amount = subtotal + num(data.tax_amount);
    if (!data.po_name && data.po_number) data.po_name = [data.po_number, data.work_unit_name, data.work_content].filter(Boolean).join('_');
  }
  if (cfg.key === 'bills') {
    let subtotal = 0;
    for (const item of arr(data.items)) {
      item.amount = num(item.quantity, 1) * num(item.unit_price);
      subtotal += item.amount;
    }
    data.subtotal = subtotal;
    data.total_amount = subtotal + num(data.tax_amount);
    data.paid_amount = num(data.paid_amount);
    data.balance_due = Math.max(0, data.total_amount - data.paid_amount);
  }
  if (cfg.key === 'transactions') {
    let debit = 0; let credit = 0;
    for (const entry of arr(data.entries)) {
      entry.debit = num(entry.debit); entry.credit = num(entry.credit);
      debit += entry.debit; credit += entry.credit;
    }
    data.total_debit = debit; data.total_credit = credit;
    if (data.status !== '草稿' && Math.abs(debit - credit) > 0.009) {
      const error = new Error(`憑證借貸不平衡：借方 ${debit.toFixed(2)} / 貸方 ${credit.toFixed(2)}`);
      error.statusCode = 400; throw error;
    }
  }
  if (cfg.key === 'contracts' && !data.contract_name && data.contract_number) {
    data.contract_name = [data.contract_number, data.customer_name, data.work_content].filter(Boolean).join('_');
  }
}

function prepareRecord({ store, cfg, fields, existing = null, user }) {
  const data = existing ? { ...existing } : {};
  for (const field of cfg.fields) {
    if (field.readOnly && existing) continue;
    if (!Object.hasOwn(fields, field.name) && !existing) continue;
    if (!Object.hasOwn(fields, field.name)) continue;
    const value = fields[field.name];
    if (['items', 'files', 'picks'].includes(field.type)) data[field.name] = parseJSONField(value, []);
    else if (field.type === 'json') {
      try { data[field.name] = parseJSONField(value, {}); }
      catch { data[field.name] = str(value); }
    }
    else if (field.type === 'checkbox') data[field.name] = bool(value);
    else if (['number', 'money'].includes(field.type)) data[field.name] = value === '' ? '' : num(value);
    else if (field.type === 'select' && field.multiple) data[field.name] = Array.isArray(value) ? value : parseJSONField(value, []);
    else data[field.name] = str(value);
  }
  for (const field of cfg.fields) {
    const value = data[field.name];
    if (field.required && (value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length))) {
      const error = new Error(`請填寫必填欄位：${field.label}`); error.statusCode = 400; throw error;
    }
  }
  if (existing) data.id = existing.id;
  else data.id = cleanId(fields.__new_id) || uid(cfg.key.slice(0, 3));
  defaultNumber(store, cfg, data);
  normalizeRelations(store, cfg, data);
  recalculate(cfg, data);
  return data;
}

function productForAdjustment(store, row) {
  const products = store.list('products', { includeDeleted: true });
  return products.find((p) => row.product_id && p.id === row.product_id)
    || products.find((p) => row.product_code && p.product_code === row.product_code)
    || products.find((p) => row.code_no && p.product_code === row.code_no)
    || products.find((p) => row.product_name && p.product_name === row.product_name);
}

function saveStockAdjustment({ store, cfg, data, existing, user }) {
  if (existing) { const error = new Error('庫存調整不可直接編輯，請新增反向調整以保持庫存可追蹤'); error.statusCode = 409; throw error; }
  return store.transaction(() => {
    const product = productForAdjustment(store, data);
    if (!product) { const error = new Error('找不到調整產品，請以產品編號或產品名稱選擇'); error.statusCode = 400; throw error; }
    const before = num(product.stock_quantity);
    let change;
    if (data.adjustment_type === '入庫') change = Math.abs(num(data.quantity_change));
    else if (data.adjustment_type === '出庫') change = -Math.abs(num(data.quantity_change));
    else if (data.quantity_after !== '' && data.quantity_after !== undefined && data.quantity_after !== null) change = num(data.quantity_after) - before;
    else change = num(data.quantity_change);
    const after = before + change;
    if (after < 0) { const error = new Error(`產品 ${product.product_name} 庫存不足：現有 ${before}，調整後 ${after}`); error.statusCode = 409; throw error; }
    data.product_id = product.id; data.product_name = product.product_name; data.product_code = product.product_code;
    data.quantity_before = before; data.quantity_change = change; data.quantity_after = after; data.stock_posted = true;
    product.stock_quantity = after;
    store.save('products', product, { id: product.id, user });
    const saved = store.save(cfg.key, data, { id: data.id, user });
    store.audit({ user, action: 'stock-post', entity: cfg.entity, id: saved.id, label: saved.adjustment_number, shown: `${before} ${change >= 0 ? '+' : ''}${change} → ${after}`, via: 'inventory' });
    return saved;
  });
}

function saveDeliveryNote({ store, cfg, data, existing, user, skipStock = false }) {
  return store.transaction(() => {
    if (existing?.stock_synced && JSON.stringify(existing.items || []) !== JSON.stringify(data.items || [])) {
      const error = new Error('已過賬送貨單不可修改貨品明細，以免庫存失真'); error.statusCode = 409; throw error;
    }
    const shouldPost = !skipStock && data.status === '已送達' && !existing?.stock_synced;
    const operations = [];
    if (shouldPost) {
      for (const [index, item] of arr(data.items).entries()) {
        const product = productForAdjustment(store, item);
        if (!product) { const error = new Error(`第 ${index + 1} 行產品無法匹配（${item.code_no || item.product_name || '未填產品'}）`); error.statusCode = 400; throw error; }
        const qty = num(item.qty ?? item.quantity);
        if (!(qty > 0)) { const error = new Error(`第 ${index + 1} 行出庫數量必須大於 0`); error.statusCode = 400; throw error; }
        const before = num(product.stock_quantity);
        const after = before - qty;
        if (after < 0) { const error = new Error(`產品 ${product.product_name} 庫存不足：需要 ${qty}，現有 ${before}`); error.statusCode = 409; throw error; }
        const duplicated = store.list('stock_adjustments', { includeDeleted: true }).find((a) => a.source_delivery_id === data.id && a.product_id === product.id);
        if (duplicated) { const error = new Error(`送貨單 ${data.dn_number} 已對 ${product.product_name} 過賬，不能重複扣庫存`); error.statusCode = 409; throw error; }
        operations.push({ product, item, qty, before, after });
      }
    }
    data.stock_synced = shouldPost ? false : bool(data.stock_synced);
    const saved = store.save(cfg.key, data, { id: data.id, user, expectedUpdated: existing?.updated_date || null });
    for (const op of operations) {
      op.product.stock_quantity = op.after;
      store.save('products', op.product, { id: op.product.id, user });
      const adjustment = {
        adjustment_date: data.dn_date || hkNow().date, adjustment_type: '送貨出庫',
        product_id: op.product.id, product_name: op.product.product_name, product_code: op.product.product_code,
        quantity_before: op.before, quantity_change: -op.qty, quantity_after: op.after,
        unit_cost: op.product.cost_price || 0, reference_number: data.dn_number,
        source_delivery_id: saved.id, supplier_name: op.product.supplier_name || '', notes: `送貨單 ${data.dn_number} 自動出庫`, stock_posted: true,
      };
      defaultNumber(store, ENTITIES.stock_adjustments, adjustment);
      store.save('stock_adjustments', adjustment, { user });
    }
    if (shouldPost) {
      saved.stock_synced = true; saved.stock_synced_at = new Date().toISOString();
      store.save(cfg.key, saved, { id: saved.id, user });
      store.audit({ user, action: 'delivery-stock-post', entity: cfg.entity, id: saved.id, label: saved.dn_number, shown: `${operations.length} 項產品`, via: 'delivery' });
    }
    return store.get(cfg.key, saved.id);
  });
}

function saveStockCount({ store, cfg, data, existing, user }) {
  return store.transaction(() => {
    if (existing?.stock_posted && (JSON.stringify(existing.items || []) !== JSON.stringify(data.items || []) || existing.status !== data.status)) {
      const error = new Error('已完成並過賬的盤點不可修改，請新增盤點或反向調整'); error.statusCode = 409; throw error;
    }
    const shouldPost = data.status === '已完成' && !existing?.stock_posted;
    const operations = [];
    if (shouldPost) {
      for (const [index, item] of arr(data.items).entries()) {
        const product = productForAdjustment(store, item);
        if (!product) { const error = new Error(`盤點第 ${index + 1} 行找不到產品`); error.statusCode = 400; throw error; }
        const actual = num(item.actual_quantity, NaN);
        if (!Number.isFinite(actual) || actual < 0) { const error = new Error(`盤點第 ${index + 1} 行實際數量無效`); error.statusCode = 400; throw error; }
        const before = num(product.stock_quantity);
        const duplicated = store.list('stock_adjustments', { includeDeleted: true }).find((a) => a.source_stock_count_id === data.id && a.product_id === product.id);
        if (duplicated) { const error = new Error(`盤點 ${data.count_number} 已對 ${product.product_name} 過賬`); error.statusCode = 409; throw error; }
        operations.push({ product, item, actual, before, difference: actual - before });
      }
    }
    data.completed_by ||= user.name;
    if (shouldPost) { data.completed_date ||= hkNow().date; data.stock_posted = true; }
    const saved = store.save(cfg.key, data, { id: data.id, user, expectedUpdated: existing?.updated_date || null });
    for (const op of operations) {
      op.item.product_id = op.product.id; op.item.product_name = op.product.product_name; op.item.product_code = op.product.product_code;
      op.item.system_quantity = op.before; op.item.difference = op.difference;
      op.product.stock_quantity = op.actual;
      store.save('products', op.product, { id: op.product.id, user });
      if (op.difference !== 0) {
        const adjustment = {
          adjustment_date: data.count_date || hkNow().date, adjustment_type: '盤點調整', product_id: op.product.id,
          product_name: op.product.product_name, product_code: op.product.product_code, quantity_before: op.before,
          quantity_change: op.difference, quantity_after: op.actual, unit_cost: op.product.cost_price || 0,
          reference_number: data.count_number, source_stock_count_id: saved.id, supplier_name: op.product.supplier_name || '',
          notes: `盤點 ${data.count_number} 自動調整`, stock_posted: true,
        };
        defaultNumber(store, ENTITIES.stock_adjustments, adjustment);
        store.save('stock_adjustments', adjustment, { user });
      }
    }
    if (shouldPost) store.save(cfg.key, saved, { id: saved.id, user });
    store.audit({ user, action: shouldPost ? 'stock-count-post' : 'save', entity: cfg.entity, id: saved.id, label: saved.count_number, shown: `items=${operations.length}`, via: 'stock-count' });
    return store.get(cfg.key, saved.id);
  });
}

function saveSchedule({ store, cfg, data, existing, user }) {
  return store.transaction(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(data.schedule_date))) { const error = new Error('排班日期無效'); error.statusCode = 400; throw error; }
    const recurringIds = new Set([data.recurring_schedule_id, ...arr(data.work_items).map((i) => i.recurring_schedule_id)].filter(Boolean));
    if (recurringIds.size) {
      const duplicated = store.list('schedules', { includeDeleted: true }).find((s) => s.id !== data.id && s.schedule_date === data.schedule_date
        && (recurringIds.has(s.recurring_schedule_id) || arr(s.work_items).some((i) => recurringIds.has(i.recurring_schedule_id))));
      if (duplicated) { const error = new Error(`同一天已有相同定期排程（${duplicated.id}），不可重複生成`); error.statusCode = 409; throw error; }
    }
    const saved = store.save(cfg.key, data, { id: data.id, user, expectedUpdated: existing?.updated_date || null });
    const poIds = [...new Set(arr(saved.work_items).map((i) => i.po_id).filter(Boolean))];
    for (const poId of poIds) {
      const po = store.get('purchase_orders', poId);
      if (!po) continue;
      po.work_dates = [...new Set([...arr(po.work_dates), saved.schedule_date])].sort();
      store.save('purchase_orders', po, { id: po.id, user });
    }
    return saved;
  });
}

export function moveSchedule({ store, id, date, user }) {
  const existing = recordForMove(store, id);
  const data = { ...existing, schedule_date: date };
  const saved = saveSchedule({ store, cfg: ENTITIES.schedules, data, existing, user });
  store.audit({ user, action: 'move', entity: 'Schedule', id, label: date, via: 'calendar' });
  return saved;
}
function recordForMove(store, id) {
  const row = store.get('schedules', id);
  if (!row) { const error = new Error('找不到排班'); error.statusCode = 404; throw error; }
  return row;
}

function validateWorkRecord(data) {
  if (data.status !== '已完成') return;
  const types = new Set();
  for (const point of arr(data.photo_points)) {
    if (point.close_up_photo) types.add('close_up');
    if (point.work_photo) types.add('work');
    if (point.target_photo) types.add('target');
    if (point.far_photo) types.add('far');
  }
  if (types.size < 2) { const error = new Error('完成工作前必須在近景、工作照、目標物、遠景四類中至少上傳兩類照片'); error.statusCode = 400; throw error; }
}

export function saveEntity({ store, cfg, fields, user, skipStock = false }) {
  const id = cleanId(fields.__id);
  const existing = id ? store.get(cfg.key, id) : null;
  if (id && !existing) { const error = new Error('找不到要編輯的記錄'); error.statusCode = 404; throw error; }
  const data = prepareRecord({ store, cfg, fields, existing, user });
  if (cfg.key === 'leave_records' && user.role !== 'management') data.status = '待審批';
  if (!existing) data._draft = false;
  let saved;
  if (cfg.key === 'work_records') validateWorkRecord(data);
  if (cfg.key === 'stock_adjustments') saved = saveStockAdjustment({ store, cfg, data, existing, user });
  else if (cfg.key === 'stock_counts') saved = saveStockCount({ store, cfg, data, existing, user });
  else if (cfg.key === 'delivery_notes') saved = saveDeliveryNote({ store, cfg, data, existing, user, skipStock });
  else if (cfg.key === 'schedules') saved = saveSchedule({ store, cfg, data, existing, user });
  else saved = store.save(cfg.key, data, { id: data.id, user, expectedUpdated: str(fields.__expected_updated) || null });
  store.audit({ user, action: existing ? 'update' : 'create', entity: cfg.entity, id: saved.id, label: saved[cfg.labelField] || saved[NUMBER_FIELDS[cfg.key]] || saved.id, shown: cfg.fields.map((f) => f.name).join(','), via: 'form' });
  return saved;
}

export function convertQuotation({ store, quotationId, target, user }) {
  const q = store.get('quotations', quotationId);
  if (!q) { const error = new Error('找不到報價單'); error.statusCode = 404; throw error; }
  const year = hkNow().date.slice(0, 4);
  return store.transaction(() => {
    if (target === 'purchase_orders') {
      const existing = store.list('purchase_orders').find((r) => r.quotation_id === q.id);
      if (existing) return { cfg: ENTITIES.purchase_orders, row: existing, existing: true };
      const row = {
        quotation_id: q.id, quotation_number: q.quotation_number, quotation_type: q.quotation_type,
        work_unit_id: q.work_unit_id || '', work_unit_name: q.work_unit_name || '', customer_id: q.customer_id || '',
        customer_name: q.customer_name || '', contact_person: q.contact_person || '', contact_phone: q.customer_tel || '',
        work_content: q.work_content || '', work_location: q.service_location || '', work_dates: q.work_date ? [q.work_date] : [],
        po_date: hkNow().date, items: arr(q.items).map((i) => ({ ...i })), payment_terms: q.payment_terms || '',
        delivery_address: q.delivery_address || q.service_address || '', status: '草稿', work_status: '待安排', notes: q.notes || '',
      };
      defaultNumber(store, ENTITIES.purchase_orders, row); recalculate(ENTITIES.purchase_orders, row);
      const saved = store.save('purchase_orders', row, { user });
      store.audit({ user, action: 'convert', entity: 'Quotation', id: q.id, label: `${q.quotation_number} → ${saved.po_number}`, via: 'quotation' });
      return { cfg: ENTITIES.purchase_orders, row: saved };
    }
    if (target === 'contracts') {
      const existing = store.list('contracts').find((r) => r.quotation_id === q.id);
      if (existing) return { cfg: ENTITIES.contracts, row: existing, existing: true };
      const row = {
        quotation_id: q.id, quotation_number: q.quotation_number, contract_number: q.quotation_number,
        customer_id: q.customer_id || '', customer_name: q.customer_name || '', customer_code: q.customer_code || '',
        work_content: q.work_content || '', work_location: q.service_location || '', contract_start_date: hkNow().date,
        contract_end_date: '', total_amount: q.total_amount || 0, contract_status: '草稿', payment_terms: q.payment_terms || '', notes: q.notes || '',
      };
      recalculate(ENTITIES.contracts, row);
      const saved = store.save('contracts', row, { user });
      store.audit({ user, action: 'convert', entity: 'Quotation', id: q.id, label: `${q.quotation_number} → ${saved.contract_number}`, via: 'quotation' });
      return { cfg: ENTITIES.contracts, row: saved };
    }
    if (target === 'invoices') {
      const row = {
        invoice_type: q.quotation_type || '服務', invoice_date: hkNow().date,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        quotation_id: q.id, quotation_number: q.quotation_number, customer_id: q.customer_id || '', customer_name: q.customer_name || '',
        customer_code: q.customer_code || '', customer_address: q.service_address || '', customer_tel: q.customer_tel || '',
        customer_fax: q.customer_fax || '', contact_person: q.contact_person || '', delivery_site: q.service_location || '',
        items: arr(q.items).map((i) => ({ item_code: i.code_no || '', item_name: i.item_name || '', description: i.description || '', quantity: num(i.quantity, 1), unit: i.unit || '', unit_price: num(i.unit_price), discount: num(i.discount) })),
        freight_charges: num(q.freight_charges), paid_amount: 0, payment_terms: q.payment_terms || 'Net 30 days', status: '草稿', remarks: q.remarks || '', notes: q.notes || '',
      };
      defaultNumber(store, ENTITIES.invoices, row); recalculate(ENTITIES.invoices, row);
      const saved = store.save('invoices', row, { user });
      store.audit({ user, action: 'convert', entity: 'Quotation', id: q.id, label: `${q.quotation_number} → ${saved.invoice_number}`, via: 'quotation' });
      return { cfg: ENTITIES.invoices, row: saved };
    }
    const error = new Error('不支援的轉換'); error.statusCode = 400; throw error;
  });
}

export function collectReceipt({ store, invoiceId, fields, user }) {
  return store.transaction(() => {
    const invoice = store.get('invoices', invoiceId);
    if (!invoice) { const error = new Error('找不到發票'); error.statusCode = 404; throw error; }
    const amount = num(fields.amount);
    const balance = num(invoice.balance_due, num(invoice.total_amount) - num(invoice.paid_amount));
    if (!(amount > 0)) { const error = new Error('收款金額必須大於 0'); error.statusCode = 400; throw error; }
    if (amount - balance > 0.009) { const error = new Error(`收款金額不可超過未收餘額 ${balance.toFixed(2)}`); error.statusCode = 400; throw error; }
    const row = {
      receipt_date: str(fields.receipt_date) || hkNow().date, invoice_id: invoice.id, invoice_number: invoice.invoice_number,
      customer_id: invoice.customer_id || '', customer_name: invoice.customer_name || '', customer_address: invoice.customer_address || '',
      customer_tel: invoice.customer_tel || '', customer_fax: invoice.customer_fax || '', contact_person: invoice.contact_person || '',
      items: [{ invoice_number: invoice.invoice_number, description: str(fields.description) || `發票 ${invoice.invoice_number} 收款`, subtotal: amount }],
      total_amount: amount, payment_method: str(fields.payment_method) || '現金', cheque_number: str(fields.cheque_number),
      bank_name: str(fields.bank_name), notes: str(fields.notes),
    };
    defaultNumber(store, ENTITIES.receipts, row);
    const receipt = store.save('receipts', row, { user });
    invoice.paid_amount = num(invoice.paid_amount) + amount;
    invoice.balance_due = Math.max(0, num(invoice.total_amount) - invoice.paid_amount);
    invoice.status = invoice.balance_due <= 0.009 ? '已付款' : '部分收款';
    store.save('invoices', invoice, { id: invoice.id, user });
    store.audit({ user, action: 'collect', entity: 'Invoice', id: invoice.id, label: `${invoice.invoice_number} / ${receipt.receipt_number}`, shown: `amount=${amount};balance=${invoice.balance_due}`, via: 'receipt' });
    return receipt;
  });
}

export function mergeCustomers({ store, sourceId, targetId, user }) {
  if (!sourceId || !targetId || sourceId === targetId) { const error = new Error('請選擇兩個不同的客戶'); error.statusCode = 400; throw error; }
  const source = store.get('customers', sourceId); const target = store.get('customers', targetId);
  if (!source || !target) { const error = new Error('找不到來源或目標客戶'); error.statusCode = 404; throw error; }
  return store.transaction(() => {
    let changed = 0;
    for (const cfg of Object.values(ENTITIES)) {
      if (!cfg.fields.some((f) => f.name === 'customer_id')) continue;
      for (const row of store.list(cfg.key, { includeDeleted: true })) {
        if (row.customer_id !== sourceId) continue;
        row.customer_id = targetId;
        if (Object.hasOwn(row, 'customer_name')) row.customer_name = target.customer_name;
        if (Object.hasOwn(row, 'customer_code')) row.customer_code = target.customer_code || '';
        store.save(cfg.key, row, { id: row.id, user }); changed++;
      }
    }
    store.setDeleted('customers', sourceId, true, user);
    store.audit({ user, action: 'merge', entity: 'Customer', id: targetId, label: `${source.customer_name} → ${target.customer_name}`, shown: `updated=${changed}`, via: 'customer-merge' });
    return { changed, source, target };
  });
}

function importHeaderMap(cfg, headers) {
  return headers.map((header) => {
    const clean = str(header).replace(/^\uFEFF/, '').trim();
    const field = cfg.fields.find((f) => f.name === clean || f.label === clean || f.label.replace(/ \*$/, '') === clean);
    if (field) return field.name;
    if (['id', 'created_date', 'updated_date'].includes(clean)) return clean;
    return null;
  });
}

export function importEntity({ store, cfg, csv, mode = 'create', user }) {
  const rows = parseCSV(csv);
  if (rows.length < 2) { const error = new Error('CSV 沒有可匯入的資料列'); error.statusCode = 400; throw error; }
  if (rows.length > 5001) { const error = new Error('每次最多匯入 5,000 筆'); error.statusCode = 413; throw error; }
  const mapping = importHeaderMap(cfg, rows[0]);
  if (!mapping.some(Boolean)) { const error = new Error('CSV 標頭沒有可識別欄位，請先下載匯出範本'); error.statusCode = 400; throw error; }
  const report = { created: 0, updated: 0, errors: [], total: rows.length - 1 };
  store.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const fields = { __new_id: '', __id: '' };
      rows[i].forEach((value, index) => { if (mapping[index]) fields[mapping[index]] = value; });
      try {
        if (mode === 'upsert') {
          let existing = fields.id ? store.get(cfg.key, fields.id) : null;
          const uniqueField = NUMBER_FIELDS[cfg.key];
          if (!existing && uniqueField && fields[uniqueField]) existing = store.list(cfg.key, { includeDeleted: true }).find((r) => str(r[uniqueField]) === str(fields[uniqueField]));
          if (existing) fields.__id = existing.id;
        }
        delete fields.id;
        const saved = saveEntity({ store, cfg, fields, user, skipStock: true });
        if (fields.__id) report.updated++; else report.created++;
        if (!saved) throw new Error('儲存失敗');
      } catch (error) {
        report.errors.push({ row: i + 1, message: error.message });
        if (report.errors.length > 30) throw new Error('錯誤超過 30 筆，已整批回滾；首個錯誤：' + report.errors[0].message);
      }
    }
    if (report.errors.length) throw new Error(`匯入發現 ${report.errors.length} 個錯誤，已整批回滾；第 ${report.errors[0].row} 列：${report.errors[0].message}`);
  });
  store.audit({ user, action: 'import', entity: cfg.entity, label: cfg.plural, shown: `created=${report.created};updated=${report.updated}`, via: 'csv' });
  return report;
}

export function saveMonthlyAttendance({ store, fields, user }) {
  const cells = new Map();
  for (const [key, value] of Object.entries(fields)) {
    const [employeeKey, date] = key.split('|');
    if (!employeeKey || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
    cells.set(key, { employeeKey, date, value: str(value).trim() });
  }
  const employees = store.list('employees', { includeDeleted: true });
  const attendances = store.list('attendances');
  return store.transaction(() => {
    let changed = 0;
    for (const { employeeKey, date, value } of cells.values()) {
      const employee = employees.find((e) => e.id === employeeKey || e.employee_name === employeeKey);
      const localUser = store.userById(employeeKey);
      const name = employee?.employee_name || localUser?.name || employeeKey;
      const employeeId = employee?.id || localUser?.employee_id || employeeKey;
      const matches = attendances.filter((r) => {
        if (r.attendance_date !== date) return false;
        return r.employee_id === employeeKey || r.employee_name === employeeKey
          || (employee && r.employee_id === employee.id) || (localUser && r.employee_id === localUser.employee_id);
      });
      const numeric = value !== '' && Number.isFinite(Number(value));
      const hours = numeric ? Number(value) : 0;
      const type = numeric ? (matches[0]?.attendance_type || '正常上班') : value || '缺勤';
      if (matches.length) {
        const first = { ...matches[0], employee_id: employeeId, employee_name: name, attendance_date: date, hours, attendance_type: type };
        store.save('attendances', first, { id: first.id, user });
        for (const duplicate of matches.slice(1)) store.setDeleted('attendances', duplicate.id, true, user);
      } else if (value !== '') {
        store.save('attendances', { employee_id: employeeId, employee_name: name, attendance_date: date, hours, attendance_type: type, notes: '' }, { user });
      } else continue;
      changed++;
    }
    store.audit({ user, action: 'bulk-update', entity: 'Attendance', label: '月度出勤表', shown: `cells=${changed}`, via: 'monthly-attendance' });
    return changed;
  });
}

export function saveExcelSchedules({ store, fields, user }) {
  const updates = new Map();
  for (const [key, value] of Object.entries(fields)) {
    const [id, field] = key.split('|');
    if (!id || !field) continue;
    if (!updates.has(id)) updates.set(id, {});
    updates.get(id)[field] = value;
  }
  return store.transaction(() => {
    let count = 0;
    for (const [id, changes] of updates) {
      const row = store.get('schedules', id);
      if (!row) continue;
      if (changes.schedule_date && /^\d{4}-\d{2}-\d{2}$/.test(changes.schedule_date)) row.schedule_date = changes.schedule_date;
      if (changes.status !== undefined) row.status = str(changes.status);
      if (changes.vehicle_plate !== undefined) row.vehicle_plate = str(changes.vehicle_plate);
      if (changes.employees !== undefined) {
        const names = str(changes.employees).split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean);
        row.assigned_employees = names.map((name, index) => ({ ...(arr(row.assigned_employees)[index] || {}), employee_name: name }));
      }
      if (changes.work_unit_name !== undefined) {
        if (!arr(row.work_items).length) row.work_items = [{}];
        row.work_items[0].work_unit_name = str(changes.work_unit_name);
      }
      saveSchedule({ store, cfg: ENTITIES.schedules, data: row, existing: row, user }); count++;
    }
    store.audit({ user, action: 'bulk-update', entity: 'Schedule', label: '排班 Excel', shown: `updated=${count}`, via: 'excel-schedule' });
    return count;
  });
}

export function backfillDeliveryStock({ store, user }) {
  const candidates = store.list('delivery_notes').filter((r) => r.status === '已送達' && !r.stock_synced);
  const report = { posted: 0, skipped: 0, errors: [] };
  for (const row of candidates) {
    try {
      saveDeliveryNote({ store, cfg: ENTITIES.delivery_notes, data: { ...row }, existing: row, user });
      report.posted++;
    } catch (error) {
      report.skipped++; report.errors.push({ id: row.id, number: row.dn_number, message: error.message });
    }
  }
  store.audit({ user, action: 'stock-backfill', entity: 'DeliveryNote', label: '補錄歷史送貨單庫存', shown: `posted=${report.posted};skipped=${report.skipped}`, via: 'inventory' });
  return report;
}

export function importTollExpenses({ store, text, user }) {
  const vehicles = store.list('vehicles');
  const existing = store.list('vehicle_expenses', { includeDeleted: true });
  const lines = str(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const report = { created: 0, skipped: 0, errors: [] };
  store.transaction(() => {
    for (const line of lines) {
      try {
        const plate = vehicles.map((v) => v.plate_number).find((p) => p && line.toUpperCase().includes(p.toUpperCase()));
        const date = line.match(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}/)?.[0]?.replace(/[年月]/g, '-').replace(/日/g, '') || hkNow().date;
        const amount = Number(line.match(/(?:HK\$|HKD|\$)?\s*(-?\d+(?:\.\d{1,2})?)/i)?.[1]);
        if (!plate || !Number.isFinite(amount)) { report.skipped++; continue; }
        const reference = line.match(/(?:參考|reference|ref|交易編號)\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] || '';
        const duplicated = existing.some((r) => r.vehicle_plate === plate && r.expense_date === date && num(r.amount) === amount && reference && r.reference_number === reference);
        if (duplicated) { report.skipped++; continue; }
        const vehicle = vehicles.find((v) => v.plate_number === plate);
        const row = {
          vehicle_id: vehicle.id, vehicle_plate: plate, expense_type: '易通行', expense_date: date,
          expense_time: line.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0] || '', amount: Math.abs(amount),
          location: line.match(/(?:地點|location)\s*[:：]?\s*([^,，;；]+)/i)?.[1] || '', reference_number: reference,
          import_source: 'TollEmailImport', source: 'TollEmailImport', notes: line.slice(0, 1000),
        };
        store.save('vehicle_expenses', row, { user }); report.created++;
      } catch (error) { report.errors.push({ line: line.slice(0, 120), message: error.message }); }
    }
  });
  store.audit({ user, action: 'import', entity: 'VehicleExpense', label: '易通行費用匯入', shown: `created=${report.created};skipped=${report.skipped}`, via: 'toll-import' });
  return report;
}

function frequencyMatches(dateText, plan) {
  const startText = plan.start_date || plan.next_schedule_date;
  if (!startText || dateText < startText) return false;
  const date = new Date(`${dateText}T00:00:00Z`);
  const start = new Date(`${startText}T00:00:00Z`);
  const cfg = plan.frequency_config || {};
  const interval = Math.max(1, num(cfg.interval || plan.interval, 1));
  const type = str(plan.frequency_type).toLowerCase();
  const dayDiff = Math.floor((date - start) / 86400000);
  if (type.includes('週') || type.includes('week')) {
    if (Math.floor(dayDiff / 7) % interval !== 0) return false;
    const configured = arr(cfg.weekly_days).map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 7);
    const days = configured.length ? configured : [start.getUTCDay()];
    const weekday = date.getUTCDay();
    return days.includes(weekday) || (weekday === 0 && days.includes(7));
  }
  const monthDiff = (date.getUTCFullYear() - start.getUTCFullYear()) * 12 + date.getUTCMonth() - start.getUTCMonth();
  const months = type.includes('季') || type.includes('quarter') ? 3 * interval : type.includes('年') || type.includes('year') ? 12 * interval : interval;
  if (monthDiff < 0 || monthDiff % months !== 0) return false;
  if ((type.includes('年') || type.includes('year')) && date.getUTCMonth() !== start.getUTCMonth()) return false;
  const configuredDays = arr(cfg.monthly_days).map(Number).filter((v) => v >= 1 && v <= 31);
  const days = configuredDays.length ? configuredDays : [start.getUTCDate()];
  const currentDay = date.getUTCDate();
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return days.includes(currentDay) || (currentDay === lastDay && days.some((d) => d > currentDay));
}

function nextFrequencyDate(after, plan) {
  const date = new Date(`${after}T00:00:00Z`);
  for (let i = 0; i < 1100; i++) {
    date.setUTCDate(date.getUTCDate() + 1);
    const text = date.toISOString().slice(0, 10);
    if (frequencyMatches(text, plan)) return text;
  }
  return '';
}

export function generateRecurringSchedules({ store, id = null, targetDate = null, user }) {
  const target = targetDate || hkNow().date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) { const error = new Error('生成目標日期無效'); error.statusCode = 400; throw error; }
  const plans = store.list('recurring_schedules').filter((r) => (!id || r.id === id) && !['已停止', '暫停', '已結束', '已取消'].includes(r.status));
  const report = { created: 0, skipped: 0 };
  const used = new Set();
  for (const schedule of store.list('schedules', { includeDeleted: true })) {
    if (schedule.recurring_schedule_id) used.add(`${schedule.recurring_schedule_id}|${schedule.schedule_date}`);
    for (const item of arr(schedule.work_items)) if (item.recurring_schedule_id) used.add(`${item.recurring_schedule_id}|${schedule.schedule_date}`);
  }
  store.transaction(() => {
    for (const plan of plans) {
      let next = plan.next_schedule_date || plan.start_date;
      if (!next) { report.skipped++; continue; }
      let guard = 0;
      while (next && next <= target && (!plan.end_date || next <= plan.end_date) && guard++ < 400) {
        const key = `${plan.id}|${next}`;
        if (!used.has(key)) {
          const schedule = {
            schedule_date: next, vehicle_plate: plan.default_vehicle || '', assigned_employees: arr(plan.default_employees),
            work_items: arr(plan.work_items).map((item) => ({ recurring_schedule_id: plan.id, recurring_schedule_name: plan.schedule_name || '', ...item })),
            status: '待執行', notes: plan.notes || '', recurring_schedule_id: plan.id,
            total_hours: arr(plan.work_items).reduce((sum, item) => sum + num(item.estimated_hours ?? item.work_hours), 0),
          };
          const saved = store.save('schedules', schedule, { user });
          used.add(key); report.created++;
          for (const poId of [...new Set(arr(saved.work_items).map((i) => i.po_id).filter(Boolean))]) {
            const po = store.get('purchase_orders', poId);
            if (po) { po.work_dates = [...new Set([...arr(po.work_dates), next])].sort(); store.save('purchase_orders', po, { id: po.id, user }); }
          }
        } else report.skipped++;
        plan.last_generated_date = next;
        next = nextFrequencyDate(next, plan);
        plan.next_schedule_date = next;
      }
      store.save('recurring_schedules', plan, { id: plan.id, user });
    }
  });
  store.audit({ user, action: 'generate', entity: 'RecurringSchedule', label: id || '全部', shown: `created=${report.created};skipped=${report.skipped};target=${target}`, via: 'recurring' });
  return report;
}
