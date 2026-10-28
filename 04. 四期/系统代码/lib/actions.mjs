import { ENTITIES } from './config.mjs';
import { arr, bool, hkNow, hoursFromTimes, isIntegerField, num, parseCSV, str, uid } from './utils.mjs';

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

// 按名匹配只作兜底：唯一命中才回填。同名多筆時寧可報錯，也不要猜一個掛上去——
// 庫裡有 25 組同名客戶，猜錯就是把單據靜默改掛到別人名下。
function matchUniqueByName(rows, nameField, name, label) {
  const target = str(name).trim();
  if (!target) return null;
  const hits = rows.filter((row) => str(row[nameField]).trim() === target);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const refs = hits.map((row) => row.customer_code || row.employee_code || row.unit_name || row.id).join('、');
    const error = new Error(`有多個同名${label}「${target}」，請從下拉選擇對應的一筆（可選：${refs}）`);
    error.statusCode = 409;
    throw error;
  }
  return null;
}

// 關聯回填的兩條規則（不是遺漏，改動前先讀）：
// 1) 只有真的能存下 xxx_id 的實體才做解析。customers／leads／follow_ups 沒有 customer_id，
//    名字就是自由文字，一律不做匹配、也不拋 409（否則新建同名客戶會被擋下，還會抄到別人的
//    customer_code）。work_records 有 work_unit_name 但沒有 work_unit_id，同理跳過。
// 2) 不變量：伺服端永不覆蓋使用者這次提交的值；派生欄位只在「本次為空」且「母檔有值」時補齊。
function normalizeRelations(store, cfg, data) {
  const hasField = (name) => cfg.fields.some((f) => f.name === name);
  // 使用者手填的值（聯絡人、電話、客戶類型）一律保留；母檔沒有值時也不清空，
  // 避免每次儲存都把人改過的資料蓋回去。
  const fill = (field, value) => {
    if (!hasField(field)) return;
    if (value === undefined || value === null || value === '') return;
    if (str(data[field])) return;
    data[field] = value;
  };
  // 客戶：id 優先。有 id 就只認 id，不再依名字覆寫，避免單據漂移到同名客戶身上。
  if (hasField('customer_id')) {
    const id = str(data.customer_id).trim();
    let customer = id ? store.get('customers', id) : null;
    if (!customer) customer = matchUniqueByName(store.list('customers'), 'customer_name', data.customer_name, '客戶');
    if (customer) {
      data.customer_id = customer.id;
      fill('customer_code', customer.customer_code);
      fill('customer_tel', customer.phone);
      fill('customer_fax', customer.fax);
      fill('customer_email', customer.email);
      fill('contact_person', customer.contact_person);
      fill('customer_address', customer.service_address);
      fill('service_address', customer.service_address);
      fill('delivery_address', customer.delivery_address);
      fill('customer_type', customer.customer_type);
    }
  }
  if (hasField('work_unit_id')) {
    const id = str(data.work_unit_id).trim();
    let unit = id ? store.get('work_units', id) : null;
    if (!unit) unit = matchUniqueByName(store.list('work_units'), 'unit_name', data.work_unit_name, '工作單位');
    if (unit) data.work_unit_id = unit.id;
  }
  // 員工：姓名重複會把排班／請假掛錯人，所以同樣只接受唯一命中
  if (hasField('employee_id')) {
    const id = str(data.employee_id).trim();
    let employee = id ? store.get('employees', id, { includeDeleted: true }) : null;
    if (!employee) employee = matchUniqueByName(store.list('employees', { includeDeleted: true }), 'employee_name', data.employee_name, '員工');
    if (employee) data.employee_id = employee.id;
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
    if (str(data.amount_source) === 'header') {
      // 歷史匯入的 22 張報價只有表頭金額，明細單價是 0 或缺明細（DAT-02）。
      // 用明細重算等於把 9,000 靜默歸零；標了 header 就保留表頭金額，
      // 要改成明細口徑必須走 /quotations/:id/recalc-amount 這個明確動作。
      data.total_amount = num(data.total_amount);
      data.subtotal = num(data.subtotal);
    } else {
      data.subtotal = subtotal;
      data.total_amount = subtotal + num(data.freight_charges) - num(data.discount);
      // 口徑寫進記錄：之後誰再打開都不必猜這筆金額是明細算的還是表頭帶進來的。
      data.amount_source = 'items';
    }
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
    // 對齊原系統命名：合約編號_客戶_地點_工作內容
    data.contract_name = [data.contract_number, data.customer_name, data.work_location, data.work_content].filter(Boolean).join('_');
  }
}

// 數量只能整數：瓶、包、支、件沒有「半個」。
// 前端已用 text + inputmode 擋掉小數點，這裡再擋一次，避免直接組 POST 寫進 2.5。
// 例外：編輯既有記錄且該值沒被改動時放行——資料庫裡仍有原系統匯入的小數庫存，
// 硬性拒絕會讓那些商品連改名都存不了。
function assertIntegerQuantities(data, cfg, existing) {
  const unchanged = (name, value) => existing && existing[name] !== undefined && String(existing[name]) === String(value);
  for (const field of cfg.fields) {
    const value = data[field.name];
    if (value === '' || value === null || value === undefined) continue;
    if (field.type === 'items' && Array.isArray(value)) {
      const cols = (field.itemColumns || []).filter(isIntegerField);
      if (!cols.length) continue;
      value.forEach((row, index) => {
        for (const col of cols) {
          const cell = row?.[col.name];
          if (cell === '' || cell === null || cell === undefined) continue;
          if (!Number.isInteger(Number(cell))) {
            const error = new Error(`第 ${index + 1} 行的「${col.label || col.name}」必須為整數，不可有小數`);
            error.statusCode = 400;
            throw error;
          }
        }
      });
      continue;
    }
    if (!isIntegerField(field) || unchanged(field.name, value)) continue;
    if (!Number.isInteger(Number(value))) {
      const error = new Error(`「${field.label || field.name}」必須為整數，不可有小數`);
      error.statusCode = 400;
      throw error;
    }
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
  assertIntegerQuantities(data, cfg, existing);
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
        adjustment_number: '', // 鍵必須先存在，defaultNumber() 才會編號（缺鍵會直接 return，調整單就沒有編號可追溯）
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

// 已過賬盤點單：刪除時沖銷庫存、還原時重新過賬，兩邊都留調整單可追溯
export function reverseStockCount({ store, id, user, redo = false }) {
  return store.transaction(() => {
    const count = store.get('stock_counts', id);
    if (!count) { const error = new Error('找不到盤點單'); error.statusCode = 404; throw error; }
    if (!count.stock_posted) return { changed: 0 };
    if (!redo && count.stock_reversed) return { changed: 0 };
    if (redo && !count.stock_reversed) return { changed: 0 };
    const sign = redo ? 1 : -1;
    const operations = [];
    for (const item of arr(count.items)) {
      const product = productForAdjustment(store, item);
      if (!product) continue;
      // 差額優先讀盤點單快照。快照與 system_quantity 都缺時不再退回 actual − 0
      // （那會把庫存清零），直接中止，讓人用庫存調整單處理。
      const hasSnapshot = item.difference !== undefined && item.difference !== null && item.difference !== '';
      const hasSystem = item.system_quantity !== undefined && item.system_quantity !== null && item.system_quantity !== '';
      if (!hasSnapshot && !hasSystem) {
        const error = new Error(`盤點 ${count.count_number} 的明細缺少差額快照（${item.product_name || item.product_id || '未知產品'}），為避免寫錯庫存已中止，請改用庫存調整單處理`);
        error.statusCode = 409;
        throw error;
      }
      const diff = hasSnapshot ? num(item.difference) : num(item.actual_quantity) - num(item.system_quantity);
      if (!diff) continue;
      operations.push({ product, diff });
    }
    for (const op of operations) {
      const before = num(op.product.stock_quantity);
      const change = sign * op.diff;
      const after = before + change;
      if (after < 0) {
        const error = new Error(`產品 ${op.product.product_name} 庫存不足：現有 ${before}，沖銷後 ${after}`);
        error.statusCode = 409;
        throw error;
      }
      op.product.stock_quantity = after;
      store.save('products', op.product, { id: op.product.id, user });
      const adjustment = {
        adjustment_number: '', // 同上：缺鍵則不編號
        adjustment_date: hkNow().date, adjustment_type: '盤點調整',
        product_id: op.product.id, product_name: op.product.product_name, product_code: op.product.product_code,
        quantity_before: before, quantity_change: change, quantity_after: after,
        unit_cost: op.product.cost_price || 0, reference_number: count.count_number,
        source_stock_count_id: count.id, stock_posted: true,
        notes: `${redo ? '還原' : '刪除'}盤點 ${count.count_number} 自動${redo ? '重新過賬' : '沖銷'}`,
      };
      defaultNumber(store, ENTITIES.stock_adjustments, adjustment);
      store.save('stock_adjustments', adjustment, { user });
    }
    count.stock_reversed = !redo;
    store.save('stock_counts', count, { id: count.id, user });
    store.audit({ user, action: redo ? 'stock-count-redo' : 'stock-count-reverse', entity: 'StockCount', id: count.id, label: count.count_number, shown: `items=${operations.length}`, via: 'trash' });
    return { changed: operations.length };
  });
}

function saveStockCount({ store, cfg, data, existing, user }) {  return store.transaction(() => {
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
        const difference = actual - before;
        // 差異必須在第一次 store.save() 之前就寫進 data.items：
        // save() 會從資料庫重新讀回一筆新物件，之後再改這裡的 item 引用不會進到 saved.items，
        // 沖銷時讀不到 difference／system_quantity，就會把「實際 12」當成差異 12，庫存被清成 0。
        item.product_id = product.id;
        item.product_name = product.product_name;
        item.product_code = product.product_code;
        item.system_quantity = before;
        item.difference = difference;
        operations.push({ product, actual, before, difference });
      }
    }
    data.completed_by ||= user.name;
    if (shouldPost) { data.completed_date ||= hkNow().date; data.stock_posted = true; }
    const saved = store.save(cfg.key, data, { id: data.id, user, expectedUpdated: existing?.updated_date || null });
    for (const op of operations) {
      op.product.stock_quantity = op.actual;
      store.save('products', op.product, { id: op.product.id, user });
      if (op.difference !== 0) {
        const adjustment = {
          adjustment_number: '', // 同上：缺鍵則不編號
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
    // 手動排班一直沒算總工時（SCH-07）：表單上的 total_hours 是唯讀空欄，
    // 前後端都沒人填，13,116 筆排班只有 15 筆有值。落庫前按工作項起止時間匯總。
    data.total_hours = hoursFromTimes(data.work_items);
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
  let id = cleanId(fields.__id);
  let existing = id ? store.get(cfg.key, id) : null;
  // 防禦：新增表單若誤把暫存 ID 寫進 __id，會走到「編輯不存在的記錄」。
  // 新表單不會帶 __expected_updated，遇到這種情況就按新增處理（沿用該 ID），
  // 不要丟 404 —— 否則使用者只會看到一片空白錯誤頁，資料也白填。
  if (id && !existing && !str(fields.__expected_updated)) {
    existing = null;
    id = '';
  }
  if (id && !existing) { const error = new Error('找不到要編輯的記錄'); error.statusCode = 404; throw error; }
  const data = prepareRecord({ store, cfg, fields, existing, user });
  // 合約名稱與定期排程名稱：使用者留空時按業務規則自動生成（仍可手動覆蓋）
  if (cfg.key === 'contracts' && !str(data.contract_name).trim()) {
    data.contract_name = [data.contract_number, data.customer_name, data.work_location, data.work_content]
      .map((v) => str(v).trim()).filter(Boolean).join('_');
  }
  if (cfg.key === 'recurring_schedules' && !str(data.schedule_name).trim()) {
    data.schedule_name = `${str(data.contract_number).trim() || '定期'}_服務排程`;
  }
  if (cfg.key === 'leave_records' && user.role !== 'management') data.status = '待審批';
  // 前線只能為自己建請假／補給／打卡，防止表單被改姓名
  if (['leave_records', 'supply_records', 'check_ins'].includes(cfg.key) && user.role === 'front') {
    data.employee_name = str(user.name).replace(/（[^）]*）/g, '').trim();
    data.employee_id = user.employee_id || user.id;
  }
  if (cfg.key === 'leave_records' && data.start_date && data.end_date) {
    const days = Math.round((Date.parse(data.end_date) - Date.parse(data.start_date)) / 86400000) + 1;
    if (Number.isFinite(days) && days > 0) data.total_days = days;
  }
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
        // 鍵必須先存在：defaultNumber() 用 Object.hasOwn 判斷，缺鍵就直接 return，
        // 轉出來的採購單會沒有編號，po_name 也跟著空白（QUO-05，與 STK-09 同型）。
        po_number: '',
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
        // 同 QUO-05：invoice_number 鍵要在，否則轉出來的發票沒有編號。
        invoice_number: '',
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

// DAT-02 的出口：把「表頭金額優先」的歷史報價改回明細口徑。
// 明細補齊後由人明確按下才會走這裡；金額變化寫進審計，事後追得到。
export function recalcQuotationAmount({ store, quotationId, user }) {
  return store.transaction(() => {
    const row = store.get('quotations', quotationId);
    if (!row) { const error = new Error('找不到報價單'); error.statusCode = 404; throw error; }
    const before = num(row.total_amount);
    delete row.amount_source;
    recalculate(ENTITIES.quotations, row);
    const saved = store.save('quotations', row, { id: row.id, user });
    store.audit({ user, action: 'recalc', entity: 'Quotation', id: row.id, label: row.quotation_number, shown: `total ${before} → ${num(saved.total_amount)}`, via: 'quotation' });
    return saved;
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
      // 同 QUO-05：收款單也要先有鍵，否則收據編號空白、無法按號追溯。
      receipt_number: '',
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
    // 狀態值必須落在字典內（INV-07）：發票狀態選項／篩選器用的是「部分付款」，
    // 這裡原本寫「部分收款」，收款後列表 pill 與篩選器都認不出、篩選會漏單。
    invoice.status = invoice.balance_due <= 0.009 ? '已付款' : '部分付款';
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
