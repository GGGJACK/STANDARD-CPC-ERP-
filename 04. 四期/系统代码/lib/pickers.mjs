// 可搜索選擇器（picker）資料源
// 目的：取代「員工 ID / 采購單 ID / 合約 ID / 產品 ID」等裸文字輸入，
// 讓表單與排班工作列表都能「輸入關鍵字 → 下拉選 → 自動帶出關聯欄位」。
import { arr, str } from './utils.mjs';

const cache = new Map();
const memo = (key, ttl, build) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = build();
  cache.set(key, { at: Date.now(), value });
  return value;
};
export const clearPickCache = () => cache.clear();

// 原系統 Employee 表為 0 筆，真實員工姓名散落在排班／出勤／請假；
// 這裡合併成一份「可選員工池」，同名者優先保留有 ID 的版本。
function employeePool(store) {
  return memo('employees', 30_000, () => {
    const byName = new Map();
    const add = (name, id = '', nickname = '', code = '') => {
      const key = str(name).replace(/（[^）]*）/g, '').trim();
      if (!key) return;
      const current = byName.get(key);
      if (current) {
        if (!current.id && id) current.id = id;
        if (!current.nickname && nickname) current.nickname = nickname;
        if (!current.code && code) current.code = code;
        return;
      }
      byName.set(key, { id: str(id), name: key, nickname: str(nickname), code: str(code) });
    };
    for (const row of store.list('employees', { includeDeleted: true })) add(row.employee_name, row.id, row.employee_nickname, row.employee_code);
    for (const row of store.list('schedules')) for (const e of arr(row.assigned_employees)) add(e.employee_name, e.employee_id, e.employee_nickname);
    for (const row of store.list('attendances')) add(row.employee_name, row.employee_id);
    for (const row of store.list('leave_records')) add(row.employee_name, row.employee_id);
    for (const row of store.list('supply_records')) add(row.employee_name, row.employee_id);
    for (const row of store.users()) if (row.role === 'front' || row.employee_id) add(row.name, row.employee_id || '');
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  });
}

const trim = (value) => str(value).replace(/\s+/g, ' ').trim();

// 害蟲種類主檔：沿用原系統 PestTypeMultiSelect 的 23 項雙語清單，
// 不另建資料表，避免後台還要多一頁維護。新增種類時改這裡即可。
export const PEST_TYPES = [
  '甲蟲 (Cockroaches)', '老鼠 (Rodents)', '白蟻 (Termite)', '白蟻預防 (Termite Preventive)',
  '跳蚤 (Fleas)', '蚊 (Mosquitoes)', '螞蟻 (Ants)', '蜥蜴 (Lizards)', '蟎 (Mites)', '蛇 (Snakes)',
  '蜈蚣 (Centipede)', '銀魚 (Silverfish)', '書蟲 (Booklice)', '黃蜂 (Wasp)', '衣蛾 (Case Moths)',
  '蛀木蟲 (Woodborers)', '蒼蠅 (Flies)', '地毯甲蟲 (Carpet Beetles)', '植物蝨 (Plant Flies)',
  '倉儲霧氣 (Container Fumigation)', '蜱 (Ticks)', '蜘蛛 (Spiders)', '其他 (Others)',
];

// 授權策略（server.mjs 的 /api/pick 依此執行，避免把整個來源一刀切 403 打斷前線表單）：
//   strict — 依 ENTITIES[entity].viewRoles 校驗，無權限直接 403；客戶／合約／採購單含聯絡方式與金額
//   scrub  — 全員可讀，但按角色刪除 fill 內的敏感欄位；產品（成本）與員工（名冊）
//   open   — 全員可讀的基礎資料，不裁剪
export const PICK_SOURCES = {
  customers: {
    entity: 'customers', policy: 'strict',
    label: '客戶',
    build: (store) => store.list('customers').map((r) => ({
      id: r.id,
      label: trim(r.customer_name) || trim(r.customer_code) || r.id,
      sub: [trim(r.customer_code), trim(r.contact_person), trim(r.phone)].filter(Boolean).join(' · '),
      text: [r.customer_name, r.customer_name_en, r.customer_code, r.main_customer, r.contact_person, r.phone, r.email].map(str).join(' '),
      fill: {
        customer_id: r.id, customer_name: r.customer_name || '', customer_code: r.customer_code || '',
        customer_type: r.customer_type || '', main_customer: r.main_customer || '',
        contact_person: r.contact_person || '', contact_phone: r.phone || '', customer_tel: r.phone || '',
        phone: r.phone || '', fax: r.fax || '', customer_fax: r.fax || '', email: r.email || '', customer_email: r.email || '',
        service_address: r.service_address || '', customer_address: r.service_address || '',
        delivery_address: r.delivery_address || '',
      },
    })),
  },
  contracts: {
    entity: 'contracts', policy: 'strict',
    label: '合約',
    build: (store) => store.list('contracts').map((r) => ({
      id: r.id,
      label: [trim(r.contract_number), trim(r.customer_name)].filter(Boolean).join(' · ') || r.id,
      sub: [trim(r.work_content), trim(r.contract_start_date) && `${r.contract_start_date} 起`].filter(Boolean).join(' · '),
      text: [r.contract_number, r.contract_name, r.customer_name, r.work_content, r.work_location, r.po_number].map(str).join(' '),
      fill: {
        contract_id: r.id, contract_number: r.contract_number || '', contract_name: r.contract_name || '',
        customer_id: r.customer_id || '', customer_name: r.customer_name || '', customer_code: r.customer_code || '',
        contact_person: r.contact_person || '', contact_phone: r.contact_phone || '',
        work_location: r.work_location || '', service_address: r.service_address || '',
        work_content: r.work_content || '', work_name: r.work_content || r.contract_name || '', work_unit_id: r.work_unit_id || '', work_unit_name: r.work_unit_name || '',
        po_number: r.po_number || '', quotation_number: r.quotation_number || '',
        service_frequency: r.service_frequency || '', total_amount: r.total_amount ?? '',
        service_type: /^單次$/.test(str(r.service_frequency).trim()) ? '單次' : (r.service_frequency ? '定期' : ''),
        payment_terms: r.payment_terms || '', contract_status: r.contract_status || '',
      },
    })),
  },
  purchase_orders: {
    entity: 'purchase_orders', policy: 'strict',
    label: '採購單',
    build: (store) => {
      // 會議點名：選 PO 沒帶出工作單位。原因是部分 PO 記錄本身沒有 work_unit_name，
      // 這裡沿 PO → 報價單 → 合約 逐級反查，補齊工作單位（含 ID 與名稱）。
      const quotations = new Map(store.list('quotations').map((q) => [str(q.id), q]));
      const contracts = store.list('contracts');
      const contractByQuotation = new Map();
      const contractByCustomer = new Map();
      for (const c of contracts) {
        if (c.quotation_id && !contractByQuotation.has(str(c.quotation_id))) contractByQuotation.set(str(c.quotation_id), c);
        const key = `${str(c.customer_id)}|${str(c.work_location)}`;
        if (c.customer_id && !contractByCustomer.has(key)) contractByCustomer.set(key, c);
      }
      const unitOf = (record) => record && (str(record.work_unit_name) || str(record.work_unit_id)) ? { name: str(record.work_unit_name), id: str(record.work_unit_id) } : null;
      return store.list('purchase_orders').map((r) => {
        const quotation = r.quotation_id ? quotations.get(str(r.quotation_id)) : null;
        const contract = (r.quotation_id && contractByQuotation.get(str(r.quotation_id)))
          || contractByCustomer.get(`${str(r.customer_id)}|${str(r.work_location)}`)
          || null;
        const unit = unitOf(r) || unitOf(quotation) || unitOf(contract) || { name: '', id: '' };
        return {
          id: r.id,
          label: trim(r.po_name) || trim(r.po_number) || r.id,
          sub: [trim(r.po_number), trim(r.customer_name), trim(r.work_status)].filter(Boolean).join(' · '),
          text: [r.po_number, r.po_name, r.customer_name, r.work_content, r.work_location, r.quotation_number].map(str).join(' '),
          fill: {
            po_id: r.id, po_name: r.po_name || '', po_number: r.po_number || '',
            quotation_id: r.quotation_id || '', quotation_number: r.quotation_number || '',
            customer_id: r.customer_id || '', customer_name: r.customer_name || '',
            contact_person: r.contact_person || '', contact_phone: r.contact_phone || '',
            work_location: r.work_location || r.delivery_address || '', work_content: r.work_content || '',
            work_name: r.work_content || '',
            work_unit_id: unit.id, work_unit_name: unit.name,
            service_type: r.quotation_type === '產品' ? '單次' : '', po_status: r.work_status || '',
          },
        };
      });
    },
  },
  work_units: {
    entity: 'work_units', policy: 'open',
    label: '工作單位',
    build: (store) => store.list('work_units').map((r) => ({
      id: r.id,
      label: trim(r.unit_name) || trim(r.short_name) || r.id,
      sub: [trim(r.short_name), trim(r.unit_name_en)].filter(Boolean).join(' · '),
      text: [r.unit_name, r.unit_name_en, r.short_name].map(str).join(' '),
      fill: { work_unit_id: r.id, work_unit_name: r.unit_name || r.short_name || '', unit_short_name: r.short_name || '' },
    })),
  },
  employees: {
    entity: 'employees', policy: 'scrub',
    label: '員工',
    build: (store) => employeePool(store).map((e) => ({
      id: e.id || e.name,
      label: e.nickname ? `${e.name}（${e.nickname}）` : e.name,
      sub: [e.code, e.id ? '' : '歷史排班'].filter(Boolean).join(' · '),
      text: [e.name, e.nickname, e.code].join(' '),
      fill: { employee_id: e.id || '', employee_name: e.name, employee_nickname: e.nickname || '' },
    })),
  },
  products: {
    entity: 'products', policy: 'scrub',
    label: '產品',
    build: (store) => store.list('products').map((r) => ({
      id: r.id,
      label: [trim(r.product_code), trim(r.product_name) || trim(r.official_name)].filter(Boolean).join(' ') || r.id,
      sub: [trim(r.official_name), trim(r.packing)].filter(Boolean).join(' · '),
      text: [r.product_code, r.product_name, r.official_name, r.active_ingredients, r.afcd_reg_no].map(str).join(' '),
      fill: {
        product_id: r.id, product_code: r.product_code || '', code_no: r.product_code || '',
        product_name: r.product_name || r.official_name || '', official_name: r.official_name || '',
        unit: r.unit || r.packing || '', cost_price: r.cost_price ?? '', afcd_reg_no: r.afcd_reg_no || '',
      },
    })),
  },
  pest_types: {
    entity: null, policy: 'open',
    label: '害蟲種類',
    build: () => PEST_TYPES.map((name) => ({ id: name, label: name, sub: '', text: name, fill: {} })),
  },
  pesticides: {
    entity: 'pesticides', policy: 'open',
    label: '藥物',
    build: (store) => store.list('pesticides').map((r) => ({
      id: r.id,
      label: trim(r.product_name) || r.id,
      sub: [trim(r.afcd_reg_no), trim(r.pesticide_category)].filter(Boolean).join(' · '),
      text: [r.product_name, r.afcd_reg_no, r.pesticide_category].map(str).join(' '),
      fill: { name: r.product_name || '', product_name: r.product_name || '', reg_no: r.afcd_reg_no || '', afcd_reg_no: r.afcd_reg_no || '', product_id: r.id },
    })),
  },
  vehicles: {
    entity: 'vehicles', policy: 'open',
    label: '車輛',
    build: (store) => store.list('vehicles').map((r) => ({
      id: r.id,
      label: trim(r.plate_number) || r.id,
      sub: [trim(r.vehicle_type), trim(r.status)].filter(Boolean).join(' · '),
      text: [r.plate_number, r.vehicle_type, r.notes].map(str).join(' '),
      fill: { vehicle_id: r.id, vehicle_plate: r.plate_number || '', plate_number: r.plate_number || '' },
    })),
  },
  work_instructions: {
    entity: 'work_instructions', policy: 'open',
    label: '工作細則',
    build: (store) => store.list('work_instructions').map((r) => ({
      id: r.id,
      label: trim(r.title) || r.id,
      sub: [trim(r.category), trim(r.content).slice(0, 40)].filter(Boolean).join(' · '),
      text: [r.title, r.category, r.content].map(str).join(' '),
      fill: {
        work_content: r.title || '', work_instruction_id: r.id,
        instruction_title: r.title || '', instruction_category: r.category || '',
      },
    })),
  },
  tools: {
    entity: null, policy: 'open',
    label: '工具',
    build: (store) => {
      const seen = new Map();
      for (const row of store.list('supply_records')) {
        for (const tool of arr(row.tools)) {
          const name = trim(tool.tool_name || tool.name);
          if (name) seen.set(name, (seen.get(name) || 0) + 1);
        }
      }
      const starter = ['手套', '口罩', '噴霧器', '藥餌', '鼠籠', '黏鼠板', '膠紙', '剪刀', '電鑽', '梯'];
      for (const name of starter) if (!seen.has(name)) seen.set(name, 0);
      return [...seen.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
        .map(([name, count]) => ({ id: name, label: name, sub: count ? `用過 ${count} 次` : '常用', text: name, fill: { tool_name: name } }));
    },
  },
};

export const PICK_SOURCE_NAMES = Object.keys(PICK_SOURCES);

// 欄位裁剪：成本類欄位只給會計／管理層；前線另外看不到聯絡方式。
// pickRows 有 30 秒快取，rows 物件是共用的，必須先複製再 delete，否則會污染其他角色的結果。
const COST_FIELDS = ['cost_price', 'supplier_price', 'unit_cost'];
const CONTACT_FIELDS = ['phone', 'fax', 'email', 'contact_person', 'contact_phone', 'customer_tel', 'customer_fax', 'customer_email'];
const COST_ROLES = ['accounting', 'management'];
const bareName = (value) => str(value).replace(/（[^）]*）/g, '').trim();

// 前線只返回自己那一條員工記錄：補給／請假表單要能選到自己，但不能看到整個名冊。
function selfOnly(rows, user) {
  const selfId = str(user?.employee_id).trim();
  const selfName = bareName(user?.name);
  if (!selfId && !selfName) return [];
  return rows.filter((row) => (selfId && str(row.fill.employee_id) === selfId)
    || (selfName && bareName(row.fill.employee_name) === selfName));
}

function scrubRow(row, role) {
  const fill = { ...row.fill };
  if (!COST_ROLES.includes(role)) for (const key of COST_FIELDS) delete fill[key];
  if (role === 'front') for (const key of CONTACT_FIELDS) delete fill[key];
  return { ...row, fill };
}

function scopedRows(store, source, user) {
  const def = PICK_SOURCES[source];
  if (!def) return [];
  const rows = pickRows(store, source);
  if (def.policy === 'open') return rows;
  const scoped = def.entity === 'employees' && user?.role === 'front' ? selfOnly(rows, user) : rows;
  return scoped.map((row) => scrubRow(row, user?.role));
}

export function pickRows(store, source) {
  const def = PICK_SOURCES[source];
  if (!def) return [];
  return memo(`rows:${source}`, 30_000, () => def.build(store));
}

export function searchPick(store, source, query, limit = 20, user = null) {
  const def = PICK_SOURCES[source];
  if (!def) return [];
  const rows = scopedRows(store, source, user);
  const q = str(query).trim().toLowerCase();
  if (!q) return rows.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const row of rows) {
    const text = row.text.toLowerCase();
    if (!tokens.every((t) => text.includes(t))) continue;
    const label = row.label.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else score = 20;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row.label.localeCompare(b.row.label, 'zh-Hant'));
  return scored.slice(0, limit).map((s) => s.row);
}

// 編輯既有記錄時，用 ID 找回顯示文字（避免下拉框只顯示一串亂碼 ID）
export function pickLabel(store, source, id) {
  const key = str(id);
  if (!key) return '';
  const row = pickRows(store, source).find((r) => str(r.id) === key);
  return row ? row.label : '';
}

export function pickRecord(store, source, id) {
  const key = str(id);
  if (!key) return null;
  return pickRows(store, source).find((r) => str(r.id) === key) || null;
}
