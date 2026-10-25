export const ROLES = ['front', 'office', 'accounting', 'management'];

// 四角色為本地權限推導；原系統以 accessible_pages 控制菜單。
const ALL = [...ROLES];
const WORK_READ = ['front', 'office', 'accounting', 'management'];
const BACK_OFFICE = ['office', 'accounting', 'management'];
const OFFICE_ADMIN = ['office', 'management'];
const FINANCE = ['accounting', 'management'];
const MANAGEMENT = ['management'];

const field = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });
const escAttr = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const column = (key, label, type) => ({ key, label, ...(type ? { type } : {}) });
// 可點擊欄位：detail＝本實體詳情頁、customer＝客戶詳情、vehicle-card＝車輛彈窗
const linkColumn = (key, label, link) => ({ key, label, link });
const actionColumn = () => column('id', '操作');
const employeeItems = [
  { name: 'employee_id', label: '員工 ID' },
  { name: 'employee_name', label: '員工姓名' },
  { name: 'employee_nickname', label: '員工暱稱' },
];
// 排班工作列表：9 個業務欄位 + 關聯 PO／合約搜尋器；其餘 ID 轉隱藏欄位原樣保存，舊資料不丟。
const workItemColumns = [
  { name: 'po_id', label: '關聯採購單 PO', type: 'pick', source: 'purchase_orders', displayField: 'po_name', link: true, placeholder: '搜尋採購單…', pickLabel: '採購單' },
  { name: 'contract_id', label: '關聯合約', type: 'pick', source: 'contracts', displayField: 'contract_number', link: true, placeholder: '搜尋合約…', pickLabel: '合約' },
  { name: 'work_name', label: '工作名稱', type: 'pick', source: 'work_instructions', valueMode: 'text', wide: true, placeholder: '搜尋工作細則庫，或直接輸入工作名稱', pickLabel: '工作細則' },
  { name: 'work_location', label: '工作地點', wide: true },
  { name: 'work_unit_name', label: '工作單位', type: 'pick', source: 'work_units', valueMode: 'label', displayField: 'work_unit_name', placeholder: '搜尋或輸入工作單位…', pickLabel: '工作單位' },
  { name: 'contact_person', label: '聯絡人' },
  { name: 'contact_phone', label: '聯絡電話' },
  { name: 'service_type', label: '服務類型', type: 'select', options: ['定期', '單次', '臨時', '緊急'], default: '臨時' },
  { name: 'pest_types', label: '害蟲種類', type: 'picks', source: 'pest_types', wide: true },
  { name: 'start_time', label: '開始時間', type: 'time' },
  { name: 'end_time', label: '結束時間', type: 'time' },
  { name: 'notes', label: '備註', wide: true },
  { name: 'po_name', label: '採購單名稱', hidden: true },
  { name: 'quotation_id', hidden: true }, { name: 'quotation_number', hidden: true }, { name: 'contract_number', hidden: true },
  { name: 'recurring_schedule_id', hidden: true }, { name: 'recurring_schedule_name', hidden: true },
  { name: 'work_unit_id', hidden: true }, { name: 'estimated_hours', hidden: true }, { name: 'work_hours', hidden: true }, { name: 'status', hidden: true },
];
const recurringWorkItemColumns = [
  { name: 'work_name', label: '工作名稱' },
  { name: 'work_location', label: '工作地點', type: 'textarea' },
  { name: 'work_unit_id', label: '工作單位 ID' },
  { name: 'work_unit_name', label: '工作單位' },
  { name: 'contact_person', label: '聯絡人' },
  { name: 'contact_phone', label: '聯絡電話' },
  { name: 'service_type', label: '服務類型' },
  { name: 'start_time', label: '開始時間', type: 'time' },
  { name: 'end_time', label: '結束時間', type: 'time' },
  { name: 'estimated_hours', label: '預計工時', type: 'number' },
  { name: 'notes', label: '備註', type: 'textarea' },
];
const moneyItemColumns = [
  { name: 'item_id', label: '項目 ID' },
  { name: 'item_name', label: '項目名稱' },
  { name: 'code_no', label: '項目編號' },
  { name: 'description', label: '描述', type: 'textarea' },
  { name: 'quantity', label: '數量', type: 'number' },
  { name: 'unit', label: '單位' },
  { name: 'unit_price', label: '單價', type: 'money' },
  { name: 'discount', label: '折扣', type: 'money' },
  { name: 'total', label: '小計', type: 'money' },
];

function define(config) {
  return {
    active: true,
    dateField: 'created_date',
    labelField: 'id',
    softDelete: false,
    importExport: false,
    viewRoles: BACK_OFFICE,
    editRoles: OFFICE_ADMIN,
    search: [],
    columns: [],
    filters: [],
    fields: [],
    original: {},
    ...config,
    active: config.key,
  };
}

export const NAV = [
  {
    group: '主要功能',
    items: [
      { path: '/', label: '公告板', key: 'dashboard', roles: ALL },
      { path: '/mywork', label: '我的工作', key: 'mywork', roles: ALL },
    ],
  },
  {
    group: '前線員工',
    items: [
      { path: '/pestcontrolwork', label: '滅蟲工作', key: 'pestcontrolwork', roles: WORK_READ },
      { path: '/myattendance', label: '我的出勤', key: 'myattendance', roles: WORK_READ },
      { path: '/mysupply', label: '補給記錄', key: 'supply_records', roles: WORK_READ },
    ],
  },
  {
    group: '市場管理',
    items: [
      { path: '/customers', label: '客戶管理', key: 'customers', roles: BACK_OFFICE },
      { path: '/leads', label: '線索 Leads', key: 'leads', roles: BACK_OFFICE },
      { path: '/followups', label: '跟進 FollowUps', key: 'follow_ups', roles: BACK_OFFICE },
      { path: '/quotations', label: '報價管理', key: 'quotations', roles: BACK_OFFICE },
      { path: '/purchaseorders', label: '採購單管理', key: 'purchase_orders', roles: BACK_OFFICE },
      { path: '/deliverynotes', label: '送貨單管理', key: 'delivery_notes', roles: BACK_OFFICE },
      { path: '/products', label: '產品管理', key: 'products', roles: BACK_OFFICE },
      { path: '/services', label: '服務管理', key: 'services', roles: BACK_OFFICE },
      { path: '/suppliers', label: '供應商管理', key: 'suppliers', roles: BACK_OFFICE },
    ],
  },
  {
    group: '營運管理',
    items: [
      { path: '/serviceplans', label: '服務計劃', key: 'serviceplans', roles: WORK_READ },
      { path: '/servicereports', label: '服務報告', key: 'work_records', roles: WORK_READ },
      { path: '/vehicles', label: '車輛管理', key: 'vehicles', roles: WORK_READ },
      { path: '/leaves', label: '請假紀錄', key: 'leave_records', roles: ALL },
      { path: '/schedules', label: '排班管理', key: 'schedules', roles: BACK_OFFICE },
      { path: '/recurringschedules', label: '定期服務排程', key: 'recurring_schedules', roles: BACK_OFFICE },
      { path: '/contracts', label: '合約列表', key: 'contracts', roles: BACK_OFFICE },
      { path: '/monthlyattendance', label: '月度出勤表', key: 'monthlyattendance', roles: BACK_OFFICE },
      { path: '/excelschedule', label: '排班Excel', key: 'excelschedule', roles: BACK_OFFICE },
      { path: '/inventory', label: '庫存管理', key: 'stock_adjustments', roles: BACK_OFFICE },
      { path: '/stockcounts', label: '盤點記錄', key: 'stock_counts', roles: BACK_OFFICE },
    ],
  },
  {
    group: '公司財務',
    items: [
      { path: '/invoices', label: '發票管理', key: 'invoices', roles: FINANCE },
      { path: '/receipts', label: '收據管理', key: 'receipts', roles: FINANCE },
      { path: '/payments', label: '付款管理', key: 'payments', roles: FINANCE },
      { path: '/bills', label: '帳單管理', key: 'bills', roles: FINANCE },
      { path: '/accounting', label: '會計系統', key: 'accounting', roles: FINANCE },
      { path: '/receivables', label: '應收台賬', key: 'receivables', roles: FINANCE },
      { path: '/generalledger', label: '總帳', key: 'transactions', roles: FINANCE },
      { path: '/accounts', label: '科目表', key: 'accounts', roles: FINANCE },
    ],
  },
  {
    group: '設置',
    items: [
      { path: '/me', label: '個人設置', key: 'me', roles: ALL },
      { path: '/users', label: '用戶管理', key: 'users', roles: MANAGEMENT },
      { path: '/employees', label: '員工管理', key: 'employees', roles: ['accounting', 'management'] },
      { path: '/workunits', label: '工作單位管理', key: 'work_units', roles: WORK_READ },
      { path: '/workinstructions', label: '工作細則庫', key: 'work_instructions', roles: ALL },
      { path: '/pesticides', label: '藥物庫', key: 'pesticides', roles: ALL },
      { path: '/emailtemplates', label: '電郵範本', key: 'email_templates', roles: MANAGEMENT },
      { path: '/addresses', label: '地址庫', key: 'addresses', roles: BACK_OFFICE },
      { path: '/announcements', label: '公告管理', key: 'announcements', roles: MANAGEMENT },
      { path: '/trash', label: '回收桶', key: 'trash', roles: ['office', 'management'] },
      { path: '/settings', label: '系統設置', key: 'company_settings', roles: MANAGEMENT },
    ],
  },
];

export const ENTITIES = {
  customers: define({
    key: 'customers', entity: 'Customer', title: '客戶', plural: '客戶管理', listPath: '/customers',
    labelField: 'customer_name', importExport: true,
    search: ['customer_name', 'customer_name_en', 'customer_code', 'main_customer', 'contact_person', 'phone', 'fax', 'email', 'service_address'],
    columns: [
      column('customer_code', '客戶編號'), column('main_customer', '主客戶'), column('customer_name', '客戶名稱'),
      column('customer_name_en', '英文名稱'), column('customer_type', '類型', 'pill'), column('contact_person', '聯繫人'),
      column('phone', '電話'), column('fax', '傳真'), column('email', '電郵'), column('service_address', '服務地址'), actionColumn(),
    ],
    filters: [
      { key: 'customer_type', label: '全部類型', options: ['標準', '行家', '鼠隊', '社福及管理公司', '政府', '管理公司', '同行', '社福單位', '其他公司', '普通客戶', '舊客'] },
      { key: 'main_customer', label: '主客戶', dynamic: true },
    ],
    fields: [
      field('customer_code', '客戶編號'), field('customer_name', '客戶名稱', 'text', { required: true }),
      field('customer_name_en', '英文名稱'), field('customer_type', '類型', 'select', { options: ['標準', '行家', '鼠隊', '社福及管理公司', '政府', '管理公司', '同行', '社福單位', '其他公司', '普通客戶', '舊客'] }),
      field('main_customer', '主客戶'), field('contact_person', '聯繫人'), field('phone', '電話'), field('fax', '傳真'), field('email', '電郵'),
      field('service_address', '服務地址', 'textarea', { wide: true }), field('delivery_address', '送貨地址', 'textarea', { wide: true }),
      field('notes', '備註', 'textarea', { wide: true }),
    ],
    original: { list: '/customers', view: '/viewcustomer' },
  }),

  quotations: define({
    key: 'quotations', entity: 'Quotation', title: '報價單', plural: '報價管理', listPath: '/quotations',
    dateField: 'document_date', labelField: 'quotation_name', softDelete: true, importExport: true,
    search: ['quotation_number', 'quotation_name', 'customer_name', 'service_location', 'work_content'],
    columns: [
      column('created_date', '創建日期', 'date'), column('quotation_number', '報價單編號'), column('quotation_name', '報價單名稱'),
      column('quotation_type', '類型', 'pill'), column('work_unit_name', '工作單位'), column('customer_name', '客戶名稱'),
      column('service_location', '工作地點'), column('work_content', '工作內容'), column('total_amount', '總金額', 'money'),
      column('assigned_admin_name', '負責員工'), column('submission_methods', '投標方式'), column('stage', '階段', 'pill'), actionColumn(),
    ],
    filters: [
      { key: 'year', label: '全部年份', dynamic: true }, { key: 'quotation_type', label: '全部類型', options: ['服務', '產品'] },
      { key: 'stage', label: '全部階段', options: ['已報價', '跟進中', '已收PO', '已成交', '已取消', '失敗'] },
      { key: 'assigned_admin', label: '全部員工', dynamic: true }, { key: 'work_unit_id', label: '全部工作單位', dynamic: true },
      { key: 'submission_methods', label: '全部投標方式', options: ['郵寄或傳真', '親身投遞', '傳真', '電郵', 'WhatsApp', 'Link'] },
    ],
    fields: [
      field('document_date', '創建日期', 'date', { section: '基本資訊' }),
      field('quotation_type', '報價類型', 'select', { required: true, options: ['服務', '產品'], section: '基本資訊' }),
      field('document_language', '報價單語言', 'select', { options: ['中文', '英文'], section: '基本資訊' }),
      field('quotation_number', '報價單編號', 'text', { placeholder: '留空自動生成', section: '基本資訊' }),
      field('quotation_name', '報價單名稱', 'text', { wide: true, section: '基本資訊' }), field('quotation_link', '報價連結', 'text', { section: '基本資訊' }),
      field('tender_number', '招標編號', 'text', { section: '基本資訊' }), field('tender_documents', '標書文件', 'files', { wide: true, section: '基本資訊' }),
      field('assigned_admin', '負責員工 ID', 'text', { section: '基本資訊' }), field('assigned_admin_name', '負責員工', 'text', { section: '基本資訊' }),
      field('customer_source', '客戶來源', 'select', { options: ['E-procurement', 'Email', 'Phone', 'WhatsApp', 'Fax', 'Letter', 'Link'], section: '基本資訊' }),
      field('lead_id', '線索 ID', 'text', { section: '基本資訊' }),
      field('customer_id', '客戶 ID', 'text', { section: '客戶資訊' }), field('customer_name', '客戶名稱', 'text', { required: true, section: '客戶資訊' }),
      field('customer_type', '客戶類型', 'select', { required: true, options: ['標準', '行家', '鼠隊', '社福及管理公司', '政府', '管理公司', '同行', '社福單位', '其他公司', '普通客戶', '舊客'], section: '客戶資訊' }),
      field('main_customer', '主客戶', 'text', { section: '客戶資訊' }),
      field('customer_code', '客戶編號', 'text', { section: '客戶資訊' }), field('contact_person', '聯絡人', 'text', { section: '客戶資訊' }),
      field('customer_tel', '電話', 'text', { section: '客戶資訊' }), field('customer_fax', '傳真', 'text', { section: '客戶資訊' }), field('customer_email', '電郵', 'text', { section: '客戶資訊' }),
      field('service_address', '服務地址', 'textarea', { wide: true, section: '客戶資訊' }), field('delivery_address', '送貨地址', 'textarea', { wide: true, section: '客戶資訊' }),
      field('work_unit_id', '工作單位 ID', 'text', { section: '工作資訊' }), field('work_unit_name', '工作單位', 'text', { section: '工作資訊' }),
      field('work_content', '工作內容', 'text', { required: true, section: '工作資訊' }), field('service_location', '工作地點', 'textarea', { wide: true, section: '工作資訊' }),
      field('service_scope', '服務範圍', 'textarea', { wide: true, section: '工作資訊' }), field('work_instructions', '工作細則', 'json', { wide: true, section: '工作資訊' }),
      field('pesticides', '採用藥物', 'items', { wide: true, section: '工作資訊', itemColumns: [{ name: 'name', label: '藥物名稱' }, { name: 'reg_no', label: 'AFCD Reg. No.' }] }),
      field('work_date', '工作日期／時間說明', 'text', { wide: true, section: '工作資訊' }),
      field('items', '報價項目', 'items', { required: true, wide: true, section: '報價項目', itemColumns: moneyItemColumns }),
      field('subtotal', '小計', 'money', { readOnly: true, section: '報價摘要' }), field('freight_charges', '運費', 'money', { section: '報價摘要' }),
      field('total_amount', '總金額', 'money', { readOnly: true, section: '報價摘要' }),
      field('payment_terms', '付款條款', 'textarea', { wide: true, section: '條款與顯示' }), field('validity', '有效期', 'textarea', { wide: true, section: '條款與顯示' }),
      field('delivery_terms', '交貨條款', 'textarea', { wide: true, section: '條款與顯示' }), field('remarks', '備註列表', 'json', { wide: true, section: '條款與顯示' }),
      field('show_service_item_quantity_unit', '顯示數量及單位', 'checkbox', { section: '條款與顯示' }), field('show_service_item_total', '顯示項目總金額', 'checkbox', { section: '條款與顯示' }),
      field('show_ipm_description', '顯示 IPM 段落', 'checkbox', { section: '條款與顯示' }), field('show_item_description', '顯示項目描述', 'checkbox', { section: '條款與顯示' }),
      field('submission_method', '投標方式（舊欄位）', 'text', { section: '後台資訊' }), field('submission_methods', '投標方式（多選）', 'json', { wide: true, section: '後台資訊' }),
      field('deadline_date', '截止日期', 'date', { section: '後台資訊' }), field('deadline_time', '截止時間', 'time', { section: '後台資訊' }),
      field('stage', '階段', 'select', { options: ['已報價', '跟進中', '已收PO', '已成交', '已取消', '失敗'], section: '後台資訊' }),
      field('delivery_date', '交付日期', 'date', { section: '後台資訊' }), field('delivery_channel', '交付渠道', 'text', { section: '後台資訊' }),
      field('delivery_person', '交付人員', 'text', { section: '後台資訊' }), field('notes', '內部備註', 'textarea', { wide: true, section: '後台資訊' }),
      field('accepted', '已接受', 'checkbox', { section: '後台資訊' }), field('accepted_date', '接受日期', 'date', { section: '後台資訊' }),
      field('pdf_url', 'PDF 文件', 'text', { readOnly: true, section: '後台資訊' }),
    ],
    original: { list: '/quotations', view: '/viewquotation', create: '/createquotation', edit: '/editquotation' },
  }),

  contracts: define({
    key: 'contracts', entity: 'Contract', title: '合約', plural: '合約列表', listPath: '/contracts',
    dateField: 'contract_start_date', labelField: 'contract_name', softDelete: true, importExport: true,
    search: ['contract_number', 'contract_name', 'customer_name', 'work_location', 'work_content'],
    columns: [
      linkColumn('contract_number', '合約編號', 'detail'), column('contract_name', '合約名稱'), column('work_unit_name', '工作單位'),
      linkColumn('customer_name', '客戶名稱', 'customer'), column('quotation_number', '關聯報價單'), column('contract_start_date', '合約期', 'date'),
      column('service_frequency', '服務頻率'), column('total_amount', '合約總額', 'money'), column('contract_status', '合約狀態', 'pill'), actionColumn(),
    ],
    filters: [{ key: 'year', label: '全部年份', dynamic: true }, { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }],
    fields: [
      field('contract_number', '合約編號', 'text', { required: true, section: '基本資料' }),
      field('contract_name', '合約名稱（自動生成）', 'text', { wide: true, section: '基本資料', placeholder: '選擇客戶／地點／工作內容後自動生成，可手動修改' }),
      field('po_number', 'PO 編號', 'text', { section: '基本資料' }),
      field('customer_name', '客戶名稱（To）', 'pick', { source: 'customers', valueMode: 'text', pickLabel: '客戶', required: true, section: '基本資料', placeholder: '輸入客戶名稱搜尋，或直接輸入新名稱' }),
      field('work_unit_name', '工作單位（From）', 'pick', { source: 'work_units', valueMode: 'text', pickLabel: '工作單位', section: '基本資料', placeholder: '搜尋工作單位…' }),
      field('work_location', '工作地點（Location）', 'textarea', { wide: true, section: '基本資料' }),
      field('work_content', '工作內容', 'pick', { source: 'work_instructions', valueMode: 'text', pickLabel: '工作細則', wide: true, section: '基本資料', placeholder: '搜尋工作細則庫，或直接輸入工作內容' }),
      field('contact_person', '聯絡人（Attn）', 'text', { section: '基本資料' }), field('contact_phone', '聯絡電話', 'text', { section: '基本資料' }),
      field('contract_start_date', '開始日期', 'date', { section: '合約條款' }), field('contract_end_date', '結束日期', 'date', { section: '合約條款' }),
      field('service_frequency', '服務頻率', 'select', { options: ['每星期', '每星期一期', '每月一次', '每月2次', '每月3次', '每兩個月一次', '每季', '每半年', '每年', '單次'], section: '合約條款' }),
      field('total_amount', '合約總額 (HK$)', 'money', { section: '合約條款' }),
      field('payment_terms', '付款條款', 'textarea', { wide: true, section: '合約條款' }),
      field('contract_status', '合約狀態', 'select', { options: ['生效中', '已完成', '已取消'], section: '合約條款' }),
      field('notes', '備註', 'textarea', { wide: true, section: '合約條款' }),
      // 服務安排：合約彈窗是全集，服務計劃的鉛筆彈窗只取這一段的子集
      field('service_type', '服務種類', 'select', { options: ['定期', '單次', '臨時', '緊急'], section: '服務安排' }),
      field('pest_type', '害蟲種類', 'picks', { source: 'pest_types', wide: true, section: '服務安排' }),
      field('region', '地區', 'select', { options: ['香港', '九龍', '新界', '離島', '全港', '未分類'], section: '服務安排' }),
      field('pesticides', '用藥', 'picks', { source: 'pesticides', wide: true, section: '服務安排' }),
      field('documents', '合約文件', 'files', { wide: true, section: '合約文件' }),
      // 以下為關聯 ID：不再在表單顯示，但保留原值隨表單提交，避免舊資料斷鏈
      field('customer_id', '客戶 ID', 'text', { hidden: true }), field('customer_code', '客戶編號', 'text', { hidden: true }),
      field('work_unit_id', '工作單位 ID', 'text', { hidden: true }),
      field('quotation_id', '報價單 ID', 'text', { hidden: true }), field('quotation_number', '關聯報價單', 'text', { hidden: true }),
      field('service_address', '服務地址', 'textarea', { hidden: true }),
      field('work_instructions', '工作細則', 'json', { hidden: true }), field('venue_map_url', '場地圖', 'json', { hidden: true }),
    ],
    original: { list: '/contracts', view: '/viewcontract', edit: '/editcontract' },
  }),

  invoices: define({
    key: 'invoices', entity: 'Invoice', title: '發票', plural: '發票管理', listPath: '/invoices',
    dateField: 'invoice_date', labelField: 'invoice_number', viewRoles: FINANCE, editRoles: FINANCE,
    search: ['invoice_number', 'customer_name', 'customer_code', 'po_number', 'dn_number'],
    columns: [
      column('created_date', '創建日期', 'date'), column('invoice_number', '發票編號'), column('invoice_type', '類型', 'pill'),
      column('customer_name', '客戶名稱'), column('total_amount', '總金額', 'money'), column('paid_amount', '已付金額', 'money'),
      column('due_date', '到期日', 'date'), column('status', '狀態', 'pill'), column('quotation_number', '來源'), actionColumn(),
    ],
    filters: [{ key: 'invoice_type', label: '全部類型', options: ['服務', '產品'] }, { key: 'status', label: '全部狀態', options: ['草稿', '已發出', '部分付款', '已付款', '逾期', '已作廢'] }],
    fields: [
      field('invoice_number', '發票編號', 'text', { section: '發票詳情' }), field('invoice_type', '發票類型', 'select', { options: ['服務', '產品'], section: '發票詳情' }),
      field('invoice_date', '開票日期', 'date', { section: '發票詳情' }), field('due_date', '到期日', 'date', { section: '發票詳情' }),
      field('quotation_id', '報價單 ID', 'text', { section: '發票詳情' }), field('quotation_number', '報價單編號', 'text', { section: '發票詳情' }),
      field('po_number', 'PO 編號', 'text', { section: '發票詳情' }), field('dn_number', 'DN 編號', 'text', { section: '發票詳情' }),
      field('delivery_site', '送貨地點', 'text', { section: '發票詳情' }), field('delivery_method', '送貨方式', 'select', { options: ['順豐到付', '上門取貨', '跟車運送'], section: '發票詳情' }),
      field('customer_id', '客戶 ID', 'text', { section: '客戶資訊' }), field('customer_name', '客戶名稱', 'text', { required: true, section: '客戶資訊' }),
      field('customer_code', '客戶編號', 'text', { section: '客戶資訊' }), field('contact_person', '聯絡人', 'text', { section: '客戶資訊' }),
      field('customer_tel', '電話', 'text', { section: '客戶資訊' }), field('customer_fax', '傳真', 'text', { section: '客戶資訊' }), field('customer_email', '電郵', 'text', { section: '客戶資訊' }),
      field('customer_address', '客戶地址', 'textarea', { wide: true, section: '客戶資訊' }),
      field('items', '發票項目', 'items', { required: true, wide: true, section: '發票項目', itemColumns: [
        { name: 'item_code', label: 'Code No.' }, { name: 'item_name', label: '項目名稱' }, { name: 'description', label: '描述', type: 'textarea' },
        { name: 'quantity', label: '數量', type: 'number' }, { name: 'unit', label: '單位' }, { name: 'unit_price', label: '單價', type: 'money' },
        { name: 'discount', label: '折扣', type: 'money' }, { name: 'subtotal', label: '小計', type: 'money' },
      ] }),
      field('freight_charges', '運費', 'money', { section: '發票摘要' }), field('subtotal', '小計', 'money', { readOnly: true, section: '發票摘要' }),
      field('total_amount', '總金額', 'money', { readOnly: true, section: '發票摘要' }), field('paid_amount', '已付金額', 'money', { readOnly: true, section: '發票摘要' }),
      field('balance_due', '未付餘額', 'money', { readOnly: true, section: '發票摘要' }),
      field('payment_terms', '付款條款', 'textarea', { wide: true, section: '付款資料' }),
      field('payment_method', '付款方式', 'select', { options: ['現金', '支票', '銀行轉賬', '其他'], section: '付款資料' }),
      field('status', '狀態', 'select', { options: ['草稿', '已發出', '部分付款', '已付款', '逾期', '已作廢'], section: '付款資料' }),
      field('remarks', '收據印刷備註', 'json', { wide: true, section: '付款資料' }), field('notes', '內部備註', 'textarea', { wide: true, section: '付款資料' }),
    ],
    original: { list: '/invoices', view: '/viewinvoice', create: '/createinvoice', edit: '/editinvoice' },
  }),

  receipts: define({
    key: 'receipts', entity: 'Receipt', title: '收據', plural: '收據管理', listPath: '/receipts',
    dateField: 'receipt_date', labelField: 'receipt_number', viewRoles: FINANCE, editRoles: FINANCE,
    search: ['receipt_number', 'customer_name', 'invoice_number'],
    columns: [column('receipt_number', '收據編號'), column('receipt_date', '日期', 'date'), column('customer_name', '客戶名稱'), column('invoice_number', '關聯發票'), column('payment_method', '付款方式'), column('total_amount', '總金額', 'money'), actionColumn()],
    fields: [
      field('receipt_number', '收據編號', 'text', { required: true }), field('receipt_date', '日期', 'date'),
      field('invoice_id', '發票 ID'), field('invoice_number', '關聯發票編號'), field('customer_id', '客戶 ID'), field('customer_name', '客戶名稱', 'text', { required: true }),
      field('customer_address', '客戶地址', 'textarea', { wide: true }), field('customer_tel', '電話'), field('customer_fax', '傳真'), field('contact_person', '聯絡人'),
      field('items', '收據項目', 'items', { wide: true, itemColumns: [{ name: 'invoice_number', label: '發票編號' }, { name: 'description', label: '說明', type: 'textarea' }, { name: 'subtotal', label: '小計', type: 'money' }] }),
      field('total_amount', '總金額', 'money'), field('payment_method', '付款方式', 'select', { options: ['現金', '支票', '銀行轉賬', '信用卡', '其他'] }),
      field('cheque_number', '支票號碼'), field('bank_name', '銀行名稱'), field('notes', '備註', 'textarea', { wide: true }),
    ],
    original: { list: '/receipts', view: '/viewreceipt', create: '/CreateReceipt', edit: '/editreceipt' },
  }),

  bills: define({
    key: 'bills', entity: 'Bill', title: '帳單', plural: '帳單管理', listPath: '/bills',
    dateField: 'bill_date', labelField: 'bill_number', viewRoles: FINANCE, editRoles: FINANCE,
    search: ['bill_number', 'vendor_name', 'vendor_reference'],
    columns: [column('bill_number', '帳單編號'), column('bill_date', '帳單日期', 'date'), column('vendor_name', '供應商'), column('due_date', '到期日', 'date'), column('total_amount', '總金額', 'money'), column('balance_due', '未付餘額', 'money'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['草稿', '待批准', '已批准', '部分付款', '已付款', '逾期'] }],
    fields: [
      field('bill_number', '帳單編號'), field('bill_date', '帳單日期', 'date'), field('due_date', '到期日', 'date'),
      field('vendor_name', '供應商名稱', 'text', { required: true }), field('vendor_reference', '供應商發票號'),
      field('items', '帳單項目', 'items', { required: true, wide: true, itemColumns: [{ name: 'description', label: '描述', type: 'textarea' }, { name: 'quantity', label: '數量', type: 'number' }, { name: 'unit_price', label: '單價', type: 'money' }, { name: 'amount', label: '金額', type: 'money' }, { name: 'account_id', label: '支出科目 ID' }] }),
      field('subtotal', '小計', 'money', { readOnly: true }), field('tax_amount', '稅額', 'money'), field('total_amount', '總金額', 'money', { readOnly: true }),
      field('paid_amount', '已付金額', 'money'), field('balance_due', '未付餘額', 'money', { readOnly: true }),
      field('status', '狀態', 'select', { options: ['草稿', '待批准', '已批准', '部分付款', '已付款', '逾期'] }), field('notes', '備註', 'textarea', { wide: true }),
    ],
    original: { list: '/bills', view: '/viewbill', create: '/createbill' },
  }),

  payments: define({
    key: 'payments', entity: 'Payment', title: '付款記錄', plural: '付款管理', listPath: '/payments',
    dateField: 'payment_date', labelField: 'payment_number', viewRoles: FINANCE, editRoles: FINANCE,
    search: ['payment_number', 'customer_name', 'vendor_name', 'reference_number'],
    columns: [column('payment_number', '付款編號'), column('payment_date', '付款日期', 'date'), column('payment_type', '類型', 'pill'), column('customer_name', '客戶'), column('vendor_name', '供應商'), column('payment_method', '付款方式'), column('reference_number', '參考編號'), column('amount', '金額', 'money'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'payment_type', label: '全部類型', options: ['收款', '付款'] }, { key: 'payment_method', label: '全部方式', options: ['現金', '支票', '銀行轉賬', '信用卡', '其他'] }],
    fields: [
      field('payment_number', '付款編號'), field('payment_date', '付款日期', 'date'), field('payment_type', '類型', 'select', { options: ['收款', '付款'] }),
      field('payment_method', '付款方式', 'select', { options: ['現金', '支票', '銀行轉賬', '信用卡', '其他'] }),
      field('customer_name', '客戶名稱'), field('vendor_name', '供應商名稱'), field('amount', '金額', 'money', { required: true }),
      field('reference_number', '參考編號', 'text', { placeholder: '支票號、轉賬編號等' }), field('description', '說明', 'textarea', { wide: true }),
      field('status', '狀態', 'select', { options: ['草稿', '已完成', '已取消'] }),
    ],
    original: { list: '/payments', view: '/viewpayment', create: '/createpayment' },
  }),

  transactions: define({
    key: 'transactions', entity: 'Transaction', title: '交易', plural: '總帳', listPath: '/generalledger',
    dateField: 'transaction_date', labelField: 'reference_number', viewRoles: FINANCE, editRoles: FINANCE,
    search: ['reference_number', 'description', 'transaction_type'],
    columns: [column('transaction_date', '交易日期', 'date'), column('reference_number', '參考編號'), column('transaction_type', '類型', 'pill'), column('description', '摘要'), column('total_debit', '借方總額', 'money'), column('total_credit', '貸方總額', 'money'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'transaction_type', label: '全部類型', options: ['日記賬', '調整'] }, { key: 'status', label: '全部狀態', options: ['草稿', '已過賬', '已核准'] }],
    fields: [
      field('transaction_date', '交易日期', 'date'), field('transaction_type', '交易類型', 'select', { options: ['日記賬', '調整'] }), field('reference_number', '參考編號'),
      field('description', '摘要', 'textarea', { wide: true }),
      field('entries', '分錄明細', 'items', { required: true, wide: true, itemColumns: [{ name: 'account_id', label: '會計科目 ID' }, { name: 'account_code', label: '科目編號' }, { name: 'account_name', label: '科目名稱' }, { name: 'debit', label: '借方', type: 'money' }, { name: 'credit', label: '貸方', type: 'money' }, { name: 'description', label: '說明', type: 'textarea' }] }),
      field('total_debit', '借方總額', 'money', { readOnly: true }), field('total_credit', '貸方總額', 'money', { readOnly: true }),
      field('status', '狀態', 'select', { options: ['草稿', '已過賬', '已核准'] }), field('notes', '備註', 'textarea', { wide: true }),
    ],
    original: { list: '/generalledger', create: '/createtransaction' },
  }),

  purchase_orders: define({
    key: 'purchase_orders', entity: 'PurchaseOrder', title: '採購單', plural: '採購單管理', listPath: '/purchaseorders',
    dateField: 'po_date', labelField: 'po_name', softDelete: true,
    search: ['po_number', 'po_name', 'customer_name', 'work_location', 'work_content'],
    columns: [
      column('po_date', 'PO日期', 'date'), linkColumn('po_name', '採購單名稱', 'detail'), column('work_unit_name', '工作單位'),
      linkColumn('customer_name', '客戶', 'customer'), column('work_location', '工作地點'), column('total_amount', '金額', 'money'),
      column('po_documents', 'PO文件', 'attachments'), column('work_status', '工作狀態', 'pill'), column('work_dates', '工作日期'),
      column('notes', '備註'), actionColumn(),
    ],
    filters: [
      { key: 'quotation_type', label: '服務／產品', options: ['服務', '產品'] }, { key: 'year', label: '全部年份', dynamic: true },
      { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
      { key: 'status', label: '全部狀態', options: ['草稿', '已確認', '處理中', '已完成', '已取消'] },
      { key: 'work_status', label: '全部工作狀態', options: ['待安排', '已安排', '進行中', '已完成', '已取消'] },
    ],
    fields: [
      field('po_number', 'PO 編號', 'text', { required: true, section: '訂單資訊' }), field('po_name', '採購單名稱', 'text', { wide: true, section: '訂單資訊' }),
      field('po_reference', 'PO 參考編號', 'text', { section: '訂單資訊' }), field('quotation_type', '報價類型', 'select', { options: ['服務', '產品'], section: '訂單資訊' }),
      field('quotation_id', '報價單 ID', 'text', { section: '訂單資訊' }), field('quotation_number', '報價單編號', 'text', { section: '訂單資訊' }),
      field('work_unit_id', '工作單位 ID', 'text', { section: '訂單資訊' }), field('work_unit_name', '工作單位', 'text', { section: '訂單資訊' }),
      field('customer_id', '客戶 ID', 'text', { section: '客戶與工作' }), field('customer_name', '客戶名稱', 'text', { required: true, section: '客戶與工作' }),
      field('contact_person', '聯絡人', 'text', { section: '客戶與工作' }), field('contact_phone', '聯絡電話', 'text', { section: '客戶與工作' }),
      field('work_content', '工作內容', 'textarea', { wide: true, section: '客戶與工作' }), field('work_location', '工作地點', 'textarea', { wide: true, section: '客戶與工作' }),
      field('work_dates', '工作日期', 'json', { wide: true, section: '客戶與工作' }), field('po_date', 'PO 日期', 'date', { section: '訂單資訊' }),
      field('delivery_date', '交貨日期', 'date', { section: '訂單資訊' }), field('delivery_address', '交貨地址', 'textarea', { wide: true, section: '訂單資訊' }),
      field('items', '訂單項目', 'items', { wide: true, section: '訂單項目', itemColumns: moneyItemColumns }),
      field('subtotal', '小計', 'money', { readOnly: true, section: '訂單項目' }), field('tax_amount', '稅額', 'money', { section: '訂單項目' }), field('total_amount', '總金額', 'money', { section: '訂單項目' }),
      field('payment_terms', '付款條款', 'textarea', { wide: true, section: '訂單資訊' }),
      field('status', '狀態', 'select', { options: ['草稿', '已確認', '處理中', '已完成', '已取消'], section: '狀態與文件' }),
      field('work_status', '工作狀態', 'select', { options: ['待安排', '已安排', '進行中', '已完成', '已取消'], section: '狀態與文件' }),
      field('po_documents', 'PO 文件', 'files', { wide: true, section: '狀態與文件' }), field('completion_certificate', '工程滿意紙', 'json', { wide: true, section: '狀態與文件' }),
      field('signing_link', '簽署連結', 'text', { wide: true, section: '簽署資料' }), field('signed_by', '簽署人', 'text', { section: '簽署資料' }),
      field('signed_date', '簽署日期時間', 'text', { section: '簽署資料' }), field('signature_image', '簽名圖像', 'files', { wide: true, section: '簽署資料' }),
      field('signing_status', '簽署狀態', 'text', { section: '簽署資料' }),
      field('notes', '備註', 'textarea', { wide: true, section: '狀態與文件' }),
    ],
    original: { list: '/purchaseorders', view: '/viewpurchaseorder', create: '/createpurchaseorder', edit: '/editpurchaseorder' },
  }),

  delivery_notes: define({
    key: 'delivery_notes', entity: 'DeliveryNote', title: '送貨單', plural: '送貨單管理', listPath: '/deliverynotes',
    dateField: 'dn_date', labelField: 'dn_number', softDelete: true,
    search: ['dn_number', 'customer_name', 'delivery_site', 'delivery_method', 'po_number', 'contact_person', 'quotation_number', 'invoice_number'],
    columns: [column('dn_number', '送貨單編號'), column('dn_date', '日期', 'date'), column('customer_name', '客戶名稱'), column('delivery_site', '地盤'), column('delivery_method', '送貨方式'), column('po_number', 'PO No.'), column('contact_person', '收貨人'), column('invoice_number', '關聯單據'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['草稿', '已發出', '已送達', '已取消'] }, { key: 'year', label: '全部年份', dynamic: true }, { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }],
    fields: [
      field('dn_number', '送貨單編號'), field('dn_date', '送貨日期', 'date'), field('customer_id', '客戶 ID'), field('customer_name', '公司名稱', 'text', { required: true }),
      field('delivery_site', '送貨地點', 'textarea', { wide: true }), field('delivery_address', '地址', 'textarea', { wide: true }),
      field('delivery_method', '送貨方式', 'select', { options: ['順豐到付', '上門取貨', '跟車運送'] }), field('contact_person', '收貨人'), field('contact_phone', '電話'), field('po_number', 'PO No.'),
      field('quotation_id', '報價單 ID'), field('quotation_number', '報價單編號'), field('invoice_id', '發票 ID'), field('invoice_number', '發票編號'),
      field('items', '送貨項目', 'items', { wide: true, itemColumns: [{ name: 'qty', label: '數量', type: 'number' }, { name: 'code_no', label: '貨品編號' }, { name: 'product_description', label: '產品描述', type: 'textarea' }, { name: 'packing', label: '包裝' }, { name: 'remark', label: '備註', type: 'textarea' }] }),
      field('status', '狀態', 'select', { options: ['草稿', '已發出', '已送達', '已取消'] }), field('notes', '備註', 'textarea', { wide: true }),
      field('stock_synced', '庫存已同步', 'checkbox', { readOnly: true }), field('stock_synced_at', '庫存同步時間', 'text', { readOnly: true }),
    ],
    original: { list: '/deliverynotes', view: '/viewdeliverynote', create: '/CreateDeliveryNote', edit: '/CreateDeliveryNote' },
  }),

  products: define({
    key: 'products', entity: 'Product', title: '產品', plural: '產品管理', listPath: '/products', labelField: 'product_name', softDelete: true, importExport: true,
    search: ['product_name', 'product_code', 'afcd_reg_no', 'origin', 'supplier_name'],
    columns: [column('product_code', '產品編號'), column('product_image', '產品圖片', 'attachments'), column('product_name', '產品名稱'), column('afcd_reg_no', 'AFCD Reg. No.'), column('msds_file_url', 'MSDS', 'attachments'), column('supplier_name', '供應商'), column('cost_price', '來貨價', 'money'), column('standard_retail_price', '標準零售價', 'money'), column('supplier_price', '行家價', 'money'), column('rat_price', '鼠隊價', 'money'), column('welfare_price', '社福及管理公司價', 'money'), column('stock_quantity', '庫存'), actionColumn()],
    filters: [{ key: 'category', label: '全部分類', options: ['裝置', '床蝨', '蟑螂', '除草', '殺菌消毒', '飛行昆蟲', '爬行昆蟲', '鼠類', '白蟻', '蒼蠅', '蚊子', '螞蟻', '蛇'] }],
    fields: [
      field('product_image', '產品圖片', 'files', { wide: true, section: '文件與基本資料' }), field('msds_file_url', '物料安全資料表 (MSDS)', 'files', { wide: true, section: '文件與基本資料' }),
      field('product_name', '產品名稱', 'text', { required: true, section: '文件與基本資料' }), field('brand', '品牌', 'text', { section: '文件與基本資料' }), field('official_name', '正式名稱', 'text', { section: '文件與基本資料' }),
      field('product_code', '產品編號', 'text', { section: '文件與基本資料' }), field('afcd_reg_no', 'AFCD Reg. No.', 'text', { section: '文件與基本資料' }),
      field('pesticide_category', '藥物類別', 'select', { options: ['飛蟲、蒼蠅、蛾', '蚊', '果蠅', '爬蟲', '床蚤', '蟑螂', '蜜蜂', '老鼠', '螞蟻', '白蟻', '紅火蟻', '消毒'], section: '文件與基本資料' }),
      field('active_ingredients', '主要成份', 'textarea', { wide: true, section: '文件與基本資料' }), field('packing', '包裝', 'text', { section: '文件與基本資料' }), field('per_size', 'Per Size', 'text', { section: '文件與基本資料' }),
      field('origin', '來源地', 'text', { section: '文件與基本資料' }), field('category', '產品分類（多選）', 'json', { wide: true, section: '文件與基本資料' }), field('treatment_methods', '處理方法（多選）', 'json', { wide: true, section: '文件與基本資料' }),
      field('description', '產品描述', 'richtext', { wide: true, section: '文件與基本資料' }), field('supplier_id', '供應商 ID', 'text', { section: '文件與基本資料' }), field('supplier_name', '供應商', 'text', { section: '文件與基本資料' }),
      field('stock_quantity', '庫存數量', 'number', { section: '庫存與價目' }), field('cost_price', '來貨價', 'money', { section: '庫存與價目' }),
      field('standard_retail_price', '標準零售價', 'money', { required: true, section: '庫存與價目' }), field('government_price', '政府價格', 'money', { section: '庫存與價目' }),
      field('management_company_price', '管理公司價格', 'money', { section: '庫存與價目' }), field('supplier_price', '行家價', 'money', { section: '庫存與價目' }),
      field('welfare_price', '社福及管理公司價', 'money', { section: '庫存與價目' }), field('company_price', '其他公司價格', 'money', { section: '庫存與價目' }),
      field('regular_customer_price', '普通客戶價格', 'money', { section: '庫存與價目' }), field('old_customer_price', '舊客價格', 'money', { section: '庫存與價目' }), field('rat_price', '鼠隊價', 'money', { section: '庫存與價目' }),
    ],
    original: { list: '/products', view: '/viewproduct' },
  }),

  services: define({
    key: 'services', entity: 'Service', title: '服務', plural: '服務管理', listPath: '/services', labelField: 'service_name', importExport: true,
    search: ['service_name', 'service_code'],
    columns: [column('service_name', '服務名稱'), column('service_code', '服務編號'), column('category', '類別', 'pill'), column('unit', '計價單位'), column('base_price', '基本價格', 'money'), column('description', '描述'), actionColumn()],
    fields: [
      field('service_name', '服務名稱', 'text', { required: true }), field('service_code', '服務編號'),
      field('category', '服務類別', 'select', { options: ['清潔服務', '滅蟲服務', '消毒服務', '其他服務'] }), field('unit', '計價單位', 'text', { placeholder: '例：次、小時、平方呎' }),
      field('description', '服務描述', 'textarea', { wide: true }), field('base_price', '基本價格', 'money', { required: true, section: '價目表' }),
      field('government_price', '政府價格', 'money', { section: '價目表' }), field('management_company_price', '管理公司價格', 'money', { section: '價目表' }),
      field('supplier_price', '供應商／同行價格', 'money', { section: '價目表' }), field('welfare_price', '社福單位價格', 'money', { section: '價目表' }),
      field('company_price', '其他公司價格', 'money', { section: '價目表' }), field('regular_customer_price', '普通客戶價格', 'money', { section: '價目表' }),
      field('old_customer_price', '舊客價格', 'money', { section: '價目表' }), field('rat_price', '鼠隊價', 'money', { section: '價目表' }),
    ],
    original: { list: '/services', view: '/viewservice' },
  }),

  suppliers: define({
    key: 'suppliers', entity: 'Supplier', title: '供應商', plural: '供應商管理', listPath: '/suppliers', labelField: 'supplier_name', importExport: true,
    search: ['supplier_name', 'supplier_code', 'contact_person', 'phone', 'email'],
    columns: [column('supplier_code', '供應商編號'), column('supplier_name', '供應商名稱'), column('contact_person', '聯繫人'), column('phone', '電話'), column('fax', '傳真'), column('address', '地址'), actionColumn()],
    filters: [{ key: 'product_ids', label: '全部產品', dynamic: true }],
    fields: [field('supplier_code', '供應商編號'), field('supplier_name', '供應商名稱', 'text', { required: true }), field('contact_person', '聯繫人'), field('phone', '電話'), field('fax', '傳真'), field('email', '電郵'), field('country', '國家'), field('address', '地址', 'textarea', { wide: true }), field('product_ids', '關聯產品 ID', 'json', { wide: true }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/suppliers', view: '/viewsupplier' },
  }),

  stock_adjustments: define({
    key: 'stock_adjustments', entity: 'StockAdjustment', title: '庫存調整', plural: '調整記錄', listPath: '/inventory', dateField: 'adjustment_date', labelField: 'adjustment_number', softDelete: true,
    search: ['adjustment_number', 'product_name', 'product_code', 'reference_number', 'supplier_name'],
    columns: [column('adjustment_date', '日期', 'date'), column('adjustment_type', '類型', 'pill'), column('product_name', '產品'), column('quantity_before', '調整前'), column('quantity_change', '調整量'), column('quantity_after', '調整後'), column('notes', '備註')],
    filters: [{ key: 'adjustment_type', label: '全部類型', options: ['入庫', '出庫', '損耗', '退貨', '盤點調整'] }],
    fields: [field('adjustment_number', '調整編號'), field('adjustment_type', '調整類型', 'select', { options: ['入庫', '出庫', '損耗', '退貨', '盤點調整'] }), field('adjustment_date', '調整日期', 'date'), field('product_id', '產品 ID', 'text', { required: true }), field('product_name', '產品名稱'), field('product_code', '產品編號'), field('quantity_before', '調整前數量', 'number', { readOnly: true }), field('quantity_change', '調整數量', 'number', { required: true }), field('quantity_after', '調整後數量', 'number', { readOnly: true }), field('unit_cost', '單位成本', 'money'), field('reference_number', '參考單號'), field('supplier_name', '供應商'), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/inventory' },
  }),

  stock_counts: define({
    key: 'stock_counts', entity: 'StockCount', title: '盤點', plural: '盤點記錄', listPath: '/stockcounts', dateField: 'count_date', labelField: 'count_number', softDelete: true, viewRoles: OFFICE_ADMIN,
    search: ['count_number', 'completed_by', 'notes'],
    columns: [column('count_number', '盤點編號'), column('count_date', '盤點日期', 'date'), { key: 'items', label: '項目數', value: (row) => { const list = Array.isArray(row.items) ? row.items : []; if (!list.length) return '—'; const names = list.slice(0, 3).map((it) => `${it.product_name || it.product_code || ''} ${it.system_quantity ?? '—'}→${it.actual_quantity ?? '—'}`).join('；'); return `<span title="${escAttr(names)}">${list.length} 項</span>`; } }, column('status', '狀態', 'pill'), column('completed_by', '完成人員'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['已完成', '進行中', '已取消'] }],
    fields: [field('count_number', '盤點編號'), field('count_date', '盤點日期', 'date'), field('completed_by', '盤點人員'), field('completed_date', '完成日期', 'date'), field('status', '狀態', 'select', { options: ['已完成', '進行中', '已取消'] }), field('items', '盤點項目', 'items', { wide: true, itemColumns: [{ name: 'product_id', label: '產品 ID' }, { name: 'product_name', label: '產品名稱' }, { name: 'product_code', label: '產品編號' }, { name: 'system_quantity', label: '系統數量', type: 'number' }, { name: 'actual_quantity', label: '實際數量', type: 'number' }, { name: 'difference', label: '差異', type: 'number' }, { name: 'notes', label: '備註', type: 'textarea' }] }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/inventory' },
  }),

  employees: define({
    key: 'employees', entity: 'Employee', title: '員工', plural: '員工管理', listPath: '/employees', labelField: 'employee_name', importExport: true, viewRoles: ['accounting', 'management'], editRoles: MANAGEMENT,
    search: ['employee_name', 'employee_nickname', 'employee_code'],
    columns: [column('employee_name', '員工姓名'), column('employee_nickname', '員工昵稱'), column('employee_code', '員工編號'), column('employee_type', '員工類型', 'pill'), column('phone', '電話'), column('email', '電郵'), column('hourly_rate', '時薪/月薪', 'money'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '所有員工', options: ['在職', '離職'] }],
    fields: [field('employee_name', '員工姓名', 'text', { required: true }), field('employee_nickname', '員工暱稱'), field('employee_code', '員工編號'), field('employee_type', '員工類型', 'select', { required: true, options: ['管理員', '行政員工', '前線員工'] }), field('user_id', '綁定用戶 ID'), field('phone', '電話'), field('email', '電郵'), field('hourly_rate', '時薪', 'money'), field('monthly_salary', '月薪', 'money'), field('status', '狀態', 'select', { options: ['在職', '離職'] }), field('resignation_date', '離職日期', 'date')],
    original: { list: '/employees', view: '/viewemployee' },
  }),

  attendances: define({
    key: 'attendances', entity: 'Attendance', title: '出勤', plural: '出勤記錄', listPath: '/attendance', dateField: 'attendance_date', labelField: 'employee_name', viewRoles: WORK_READ,
    search: ['employee_name', 'attendance_type', 'notes'],
    columns: [column('attendance_date', '出勤日期', 'date'), column('employee_name', '員工姓名'), column('attendance_type', '出勤類型', 'pill'), column('hours', '時數'), column('notes', '備註'), actionColumn()],
    filters: [{ key: 'attendance_type', label: '全部類型', options: ['正常上班', '加班', '病假', '事假', '年假', '缺勤'] }, { key: 'year', label: '全部年份', dynamic: true }, { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }],
    fields: [field('employee_id', '員工 ID', 'text', { required: true }), field('employee_name', '員工姓名', 'text', { required: true }), field('attendance_date', '出勤日期', 'date', { required: true }), field('attendance_type', '出勤類型', 'select', { options: ['正常上班', '加班', '病假', '事假', '年假', '缺勤'] }), field('hours', '時數', 'number'), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/monthlyattendance' },
  }),

  check_ins: define({
    key: 'check_ins', entity: 'CheckInRecord', title: '打卡記錄', plural: '打卡記錄', listPath: '/checkin', dateField: 'work_date', labelField: 'employee_name', viewRoles: WORK_READ,
    search: ['employee_name', 'check_in_location', 'check_out_location'],
    columns: [column('work_date', '工作日期', 'date'), column('employee_name', '員工姓名'), column('check_in_time', '上班時間'), column('check_in_location', '上班地點'), column('check_out_time', '下班時間'), column('check_out_location', '下班地點'), column('total_hours', '總工時'), actionColumn()],
    fields: [field('employee_id', '員工 ID', 'text', { required: true }), field('employee_name', '員工姓名', 'text', { required: true }), field('work_date', '工作日期', 'date', { required: true }), field('check_in_time', '上班時間（ISO）', 'text', { required: true }), field('check_in_location', '上班地點'), field('check_out_time', '下班時間（ISO）'), field('check_out_location', '下班地點'), field('total_hours', '總工時', 'number', { readOnly: true })],
    original: { list: '/checkin' },
  }),

  leave_records: define({
    key: 'leave_records', entity: 'LeaveRecord', title: '請假記錄', plural: '請假紀錄', listPath: '/leaves', dateField: 'start_date', labelField: 'employee_name', viewRoles: ALL, editRoles: ALL,
    search: ['employee_name', 'leave_type', 'reason'],
    columns: [column('employee_name', '員工'), column('leave_type', '類型', 'pill'), column('start_date', '日期', 'date'), column('total_days', '天數'), column('status', '狀態', 'pill'), column('reason', '原因'), actionColumn()],
    filters: [{ key: 'year', label: '全部年份', dynamic: true }, { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }, { key: 'status', label: '全部狀態', options: ['待審批', '已批准', '已拒絕'] }],
    fields: [field('employee_name', '員工姓名', 'pick', { source: 'employees', valueMode: 'text', pickLabel: '員工', required: true, placeholder: '搜尋員工，或直接輸入全英文姓名' }), field('employee_id', '員工 ID', 'text', { hidden: true }), field('leave_type', '請假類型', 'select', { required: true, options: ['病假', '事假', '年假', '產假', '侍產假', '恩恤假', '其他'] }), field('start_date', '開始日期', 'date', { required: true }), field('end_date', '結束日期', 'date', { required: true }), field('total_days', '請假天數', 'number', { readOnly: true }), field('status', '狀態', 'select', { options: ['待審批', '已批准', '已拒絕'] }), field('reason', '請假原因', 'textarea', { required: true, wide: true }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/leaverecords' },
  }),

  schedules: define({
    key: 'schedules', entity: 'Schedule', title: '排班', plural: '排班管理', listPath: '/schedules', dateField: 'schedule_date', softDelete: true, viewRoles: BACK_OFFICE, editRoles: OFFICE_ADMIN,
    search: ['vehicle_plate', 'status', 'notes'],
    columns: [column('schedule_date', '排班日期', 'date'), column('vehicle_plate', '車牌號碼'), column('assigned_employees', '分配員工'), column('work_items', '工作項目'), column('total_hours', '總工時'), column('status', '狀態', 'pill'), column('notes', '備註'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['待執行', '進行中', '已完成', '已取消'] }, { key: 'vehicle_plate', label: '全部車輛', dynamic: true }],
    fields: [field('schedule_date', '排班日期', 'date', { required: true }), field('vehicle_plate', '車牌號碼', 'pick', { source: 'vehicles', valueMode: 'text', pickLabel: '車輛', placeholder: '搜尋車牌，或直接輸入' }), field('color', '排班顏色', 'color'), field('assigned_employees', '分配員工', 'picks', { source: 'employees', wide: true }), field('work_items', '工作列表', 'items', { required: true, wide: true, layout: 'cards', rowLabel: '工作', addLabel: '新增工作', itemColumns: workItemColumns }), field('total_hours', '總工時', 'number', { readOnly: true }), field('status', '狀態', 'select', { options: ['待執行', '進行中', '已完成', '已取消'] }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/schedules' },
  }),

  recurring_schedules: define({
    key: 'recurring_schedules', entity: 'RecurringSchedule', title: '定期排程', plural: '定期服務排程', listPath: '/recurringschedules', dateField: 'start_date', labelField: 'schedule_name', softDelete: true, viewRoles: BACK_OFFICE,
    search: ['schedule_name', 'contract_number', 'customer_name', 'frequency_type'],
    columns: [column('schedule_name', '排程名稱'), column('contract_number', '合約編號'), column('customer_name', '客戶'), column('frequency_type', '頻率', 'pill'), column('start_date', '開始日期', 'date'), column('end_date', '結束日期', 'date'), column('next_schedule_date', '下次排程', 'date'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['啟用', '暫停', '已結束'] }, { key: 'frequency_type', label: '全部頻率', options: ['每週', '每月', '每季', '每年'] }],
    fields: [
      field('contract_id', '合約（必選，會帶出客戶與排程名稱）', 'pick', { source: 'contracts', valueMode: 'id', displayField: 'contract_number', required: true, section: '排程資料', placeholder: '搜尋合約編號或客戶…', pickLabel: '合約' }),
      field('schedule_name', '排程名稱', 'text', { section: '排程資料', placeholder: '留空會自動生成：合約編號_服務排程' }),
      field('frequency_type', '頻率類型', 'select', { options: ['每月', '每週', '每季', '每年'], section: '排程資料' }),
      field('start_date', '開始日期', 'date', { required: true, section: '排程資料' }), field('end_date', '結束日期', 'date', { section: '排程資料' }),
      field('status', '狀態', 'select', { options: ['啟用', '暫停', '已結束'], section: '排程資料' }),
      field('default_vehicle', '預設車牌', 'text', { section: '排程資料' }),
      field('frequency_config', '頻率設定', 'json', { wide: true, section: '頻率設定' }),
      field('last_generated_date', '最後產生日期', 'date', { readOnly: true, section: '頻率設定' }), field('next_schedule_date', '下次排程日期', 'date', { readOnly: true, section: '頻率設定' }),
      field('work_items', '工作項目', 'items', { required: true, wide: true, section: '工作項目', itemColumns: recurringWorkItemColumns }),
      field('default_employees', '預設分配員工', 'items', { wide: true, section: '工作項目', itemColumns: employeeItems }),
      field('notes', '整體備註／排程文件 JSON', 'textarea', { wide: true, section: '工作項目' }),
      field('contract_number', '合約編號', 'text', { hidden: true }), field('customer_name', '客戶名稱', 'text', { hidden: true }),
    ],
    original: { list: '/recurringschedules' },
  }),

  work_records: define({
    key: 'work_records', entity: 'WorkRecord', title: '服務報告', plural: '服務報告', listPath: '/servicereports', dateField: 'completion_date', labelField: 'report_title', viewRoles: WORK_READ,
    search: ['report_title', 'reference_no', 'work_name', 'work_location', 'employee_name'],
    columns: [column('completion_date', '完成日期', 'date'), column('report_title', '報告標題'), column('reference_no', '參考編號'), column('work_name', '工作名稱'), column('work_location', '工作地點'), column('employee_name', '員工'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['進行中', '已完成', '已取消'] }],
    fields: [field('schedule_id', '排班 ID'), field('work_item_index', '工作項目索引', 'number'), field('report_title', '報告標題', 'text', { required: true }), field('reference_no', '參考編號'), field('work_name', '工作名稱'), field('work_location', '工作地點', 'textarea', { wide: true }), field('work_unit_name', '工作單位'), field('employee_id', '員工 ID'), field('employee_name', '員工姓名'), field('completion_date', '完成日期', 'date'), field('service_description', '服務細則', 'textarea', { wide: true }), field('pest_types', '害蟲種類', 'json', { wide: true }), field('pesticide_applied', '使用藥物', 'textarea', { wide: true }), field('products_used', '使用產品', 'items', { wide: true, itemColumns: [{ name: 'product_id', label: '產品 ID' }, { name: 'product_name', label: '產品名稱' }, { name: 'quantity', label: '數量', type: 'number' }, { name: 'unit', label: '單位' }, { name: 'notes', label: '備註', type: 'textarea' }] }), field('photo_points', '照片紀錄點', 'items', { wide: true, itemColumns: [{ name: 'point_name', label: '紀錄點名稱' }, { name: 'photo_url', label: '照片 URL', type: 'files' }, { name: 'caption', label: '照片說明' }, { name: 'notes', label: '備註', type: 'textarea' }] }), field('description_text', '工作描述', 'textarea', { wide: true }), field('photo_section_text', '照片段落文字', 'textarea', { wide: true }), field('remarks', '備註', 'textarea', { wide: true }), field('status', '狀態', 'select', { options: ['進行中', '已完成', '已取消'] })],
    original: { list: '/servicereports', view: '/servicereport' },
  }),

  work_units: define({
    key: 'work_units', entity: 'WorkUnit', title: '工作單位', plural: '工作單位管理', listPath: '/workunits', labelField: 'unit_name', viewRoles: WORK_READ, editRoles: MANAGEMENT,
    search: ['unit_name', 'unit_name_en', 'short_name', 'company_email'],
    columns: [column('unit_name', '中文名稱'), column('unit_name_en', '英文名稱'), column('short_name', '簡稱'), column('company_phone', '公司電話'), column('company_email', '公司電郵'), column('color', '顏色'), actionColumn()],
    fields: [field('unit_name', '中文名稱', 'text', { required: true }), field('unit_name_en', '英文名稱'), field('short_name', '簡稱'), field('color', '顏色標記'), field('company_address', '公司地址', 'textarea', { wide: true }), field('company_phone', '公司電話'), field('company_fax', '公司傳真'), field('company_email', '公司電郵'), field('company_website', '公司網站'), field('company_logo', '公司 Logo', 'files'), field('company_signature', '公司簽名', 'files'), field('company_stamp', '公司印章', 'files'), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/workunits' },
  }),

  service_plan_logs: define({
    key: 'service_plan_logs', entity: 'ServicePlanLog', title: '服務計劃紀錄', plural: '服務計劃紀錄', listPath: '/serviceplanlogs', dateField: 'work_date', labelField: 'record_name', viewRoles: WORK_READ,
    search: ['contract_number', 'customer_name', 'work_location', 'record_name', 'record_number', 'notes', 'free_text'],
    columns: [column('work_date', '工作日期', 'date'), column('contract_number', '合約編號'), column('customer_name', '客戶'), column('record_number', '紀錄點編號'), column('record_name', '紀錄點名稱'), column('pest_type', '涉及害蟲'), column('severity', '嚴重程度', 'pill'), column('assessment', '評估', 'pill'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'record_mode', label: '全部模式', options: ['quadrants', 'free_text'] }, { key: 'status', label: '全部狀態', options: ['pending', 'completed', 'cancelled'] }],
    fields: [field('contract_id', '合約 ID', 'text', { required: true }), field('record_date_id', '紀錄日 ID'), field('contract_number', '合約編號'), field('customer_name', '客戶名稱'), field('work_location', '工作地點', 'textarea', { wide: true }), field('work_date', '工作日期', 'date', { required: true }), field('record_number', '紀錄點編號'), field('record_name', '紀錄點名稱', 'text', { required: true }), field('record_mode', '紀錄模式', 'select', { options: ['quadrants', 'free_text'] }), field('pest_type', '涉及害蟲'), field('severity', '嚴重程度', 'select', { options: ['輕微', '中等', '嚴重'] }), field('assessment', '評估', 'select', { options: ['正常', '需要跟進', '已處理'] }), field('quadrants', '四格照片與說明', 'json', { wide: true }), field('free_photos', '自由紀錄照片', 'files', { wide: true }), field('free_text', '自由紀錄內容', 'textarea', { wide: true }), field('notes', '備註', 'textarea', { wide: true }), field('customer_feedback', '客戶回饋', 'textarea', { wide: true }), field('map_image_url', '標記場地圖', 'files'), field('shared_token', '分享權杖', 'text', { readOnly: true }), field('status', '狀態', 'select', { options: ['pending', 'completed', 'cancelled'] })],
    original: { view: '/serviceplanrecordday' },
  }),

  service_plan_dates: define({
    key: 'service_plan_dates', entity: 'ServicePlanDate', title: '服務計劃紀錄日', plural: '服務計劃紀錄日', listPath: '/serviceplans', dateField: 'work_date', labelField: 'work_date', viewRoles: WORK_READ,
    search: ['contract_number', 'customer_name', 'work_date'],
    columns: [column('work_date', '紀錄日期', 'date'), column('contract_number', '合約編號'), column('customer_name', '客戶名稱'), column('assigned_employees', '負責員工'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['pending', 'completed', 'cancelled'] }],
    fields: [field('contract_id', '合約 ID', 'text', { required: true }), field('contract_number', '合約編號'), field('customer_name', '客戶名稱'), field('work_date', '紀錄日期', 'date', { required: true }), field('assigned_employees', '負責員工', 'items', { wide: true, itemColumns: employeeItems }), field('report_data', '報告內容', 'json', { wide: true }), field('shared_token', '分享權杖', 'text', { readOnly: true }), field('status', '狀態', 'select', { options: ['pending', 'completed', 'cancelled'] })],
    original: { view: '/serviceplanrecordday' },
  }),

  supply_records: define({
    key: 'supply_records', entity: 'SupplyRecord', title: '補給記錄', plural: '補給記錄', listPath: '/mysupply', dateField: 'supply_date', labelField: 'employee_name', viewRoles: WORK_READ, editRoles: WORK_READ,
    search: ['employee_name', 'type', 'notes'],
    columns: [column('supply_date', '日期', 'date'), column('employee_name', '員工'), column('type', '補給位置', 'pill'), column('products', '產品', 'items'), column('tools', '工具', 'items'), column('notes', '備註'), actionColumn()],
    filters: [{ key: 'type', label: '補給位置', dynamic: true }, { key: 'employee_name', label: '全部員工', dynamic: true }],
    fields: [field('supply_date', '日期', 'date', { required: true }), field('type', '補給位置', 'select', { required: true, placeholder: '選擇個人或車牌' }), field('employee_name', '員工姓名', 'pick', { wide: true, source: 'employees', valueMode: 'text', pickLabel: '員工', placeholder: '搜尋員工，或直接輸入' }), field('employee_id', '員工 ID', 'text', { hidden: true }), field('products', '產品列表', 'items', { wide: true, addLabel: '新增產品', itemColumns: [{ name: 'product_name', label: '產品', type: 'pick', source: 'products', valueMode: 'label', displayField: 'product_name', wide: true, placeholder: '搜尋產品庫…', pickLabel: '產品' }, { name: 'product_id', hidden: true }, { name: 'unit', hidden: true }, { name: 'quantity', label: '數量', type: 'number' }] }), field('tools', '工具列表', 'items', { wide: true, addLabel: '新增工具', itemColumns: [{ name: 'tool_name', label: '工具名稱', type: 'pick', source: 'tools', valueMode: 'text', displayField: 'tool_name', wide: true, placeholder: '輸入工具名稱（會提示用過的工具）', pickLabel: '工具' }, { name: 'quantity', label: '數量', type: 'number' }] }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/mysupply' },
  }),

  work_instructions: define({
    key: 'work_instructions', entity: 'WorkInstruction', title: '工作細則', plural: '工作細則庫', listPath: '/workinstructions', labelField: 'title', viewRoles: ALL, editRoles: MANAGEMENT,
    search: ['title', 'category', 'content'],
    columns: [column('title', '標題'), column('category', '類別', 'pill'), column('content', '內容', 'richtext'), column('is_active', '啟用', 'pill'), actionColumn()],
    filters: [{ key: 'category', label: '全部類別', dynamic: true }, { key: 'is_active', label: '全部狀態', options: ['true', 'false'] }],
    fields: [field('title', '標題', 'text', { required: true }), field('category', '類別', 'select', { options: ['室內服務', '室外服務', '一般服務', '其他'] }), field('content', '內容', 'richtext', { required: true, wide: true }), field('is_active', '啟用', 'checkbox')],
    original: { list: '/workinstructions' },
  }),

  vehicles: define({
    key: 'vehicles', entity: 'Vehicle', title: '車輛', plural: '車輛管理', listPath: '/vehicles', dateField: 'license_expiry_date', labelField: 'plate_number', softDelete: true, viewRoles: WORK_READ,
    search: ['plate_number', 'notes'],
    columns: [linkColumn('plate_number', '車牌號碼', 'vehicle-card'), column('license_expiry_date', '牌照到期日', 'date'), column('insurance_expiry_date', '保險到期日', 'date'), column('status', '狀態', 'pill'), column('notes', '備註'), actionColumn()],
    filters: [{ key: 'plate_number', label: '全部車牌', dynamic: true }, { key: 'status', label: '全部狀態', options: ['可用', '維修中', '停用'] }],
    fields: [field('plate_number', '車牌號碼', 'text', { required: true, placeholder: '例：AB1234' }), field('license_expiry_date', '車輛牌照到期日', 'date'), field('insurance_expiry_date', '車輛保險到期日', 'date'), field('status', '狀態', 'select', { options: ['可用', '維修中', '停用'] }), field('notes', '備註', 'textarea', { wide: true }), field('vehicle_type', '車輛類型', 'text', { hidden: true })],
    original: { list: '/vehicles', view: '/viewvehicle' },
  }),

  vehicle_expenses: define({
    key: 'vehicle_expenses', entity: 'VehicleExpense', title: '車輛費用', plural: '車輛費用', listPath: '/vehicleexpenses', dateField: 'expense_date', labelField: 'vehicle_plate', editRoles: WORK_READ,
    search: ['vehicle_plate', 'expense_type', 'location', 'reference_number', 'source', 'email_message_id'],
    columns: [column('expense_date', '日期', 'date'), column('expense_time', '時間', 'text'), column('vehicle_plate', '車牌'), column('expense_type', '類型', 'pill'), column('amount', '金額', 'money'), column('location', '地點'), column('reference_number', '參考編號'), column('source', '來源'), column('notes', '備註'), actionColumn()],
    filters: [{ key: 'expense_type', label: '所有類型', options: ['政府罰單', '行車收費', '隧道費', '停車費', '易通行'] }, { key: 'source', label: '全部來源', dynamic: true }, { key: 'year', label: '全部年份', dynamic: true }, { key: 'month', label: '全部月份', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }],
    fields: [field('vehicle_plate', '車牌號碼', 'pick', { source: 'vehicles', valueMode: 'text', pickLabel: '車輛', required: true, placeholder: '搜尋車牌，或直接輸入' }), field('expense_type', '費用類型', 'select', { required: true, options: ['政府罰單', '行車收費', '隧道費', '停車費', '易通行'] }), field('expense_date', '日期', 'date', { required: true }), field('expense_time', '時間', 'time'), field('amount', '金額 (HKD)', 'money', { required: true }), field('location', '地點'), field('reference_number', '參考編號'), field('source', '來源'), field('notes', '備註', 'textarea', { wide: true })],
    original: { view: '/viewvehicle' },
  }),

  pesticides: define({
    key: 'pesticides', entity: 'Pesticide', title: '藥物', plural: '藥物庫', listPath: '/pesticides', labelField: 'product_name', viewRoles: ALL, editRoles: MANAGEMENT,
    search: ['product_name', 'afcd_reg_no', 'pesticide_category'],
    columns: [column('product_name', '藥物名稱'), column('afcd_reg_no', 'AFCD Reg. No.'), column('pesticide_category', '藥物類別', 'pill'), actionColumn()],
    filters: [{ key: 'pesticide_category', label: '全部類別', options: ['飛蟲、蒼蠅、蛾', '蚊', '果蠅', '爬蟲', '床蚤', '蟑螂', '蜜蜂', '老鼠', '螞蟻', '白蟻', '紅火蟻', '消毒'] }],
    fields: [field('product_name', '藥物名稱', 'text', { required: true }), field('afcd_reg_no', 'AFCD Reg. No.', 'text', { required: true }), field('pesticide_category', '藥物類別', 'select', { options: ['飛蟲、蒼蠅、蛾', '蚊', '果蠅', '爬蟲', '床蚤', '蟑螂', '蜜蜂', '老鼠', '螞蟻', '白蟻', '紅火蟻', '消毒'] })],
    original: { list: '/pesticides' },
  }),

  leads: define({
    key: 'leads', entity: 'Lead', title: '潛在客戶', plural: '線索 Leads', listPath: '/leads', labelField: 'lead_number', viewRoles: BACK_OFFICE,
    search: ['lead_number', 'customer_name', 'contact_person', 'phone', 'email'],
    columns: [column('lead_number', 'Lead 編號'), column('customer_name', '客戶名稱'), column('customer_type', '類型', 'pill'), column('interest_type', '興趣'), column('estimated_value', '預計金額', 'money'), column('status', '狀態', 'pill'), column('priority', '優先級', 'pill'), column('assigned_name', '負責人'), actionColumn()],
    filters: [{ key: 'status', label: '全部狀態', options: ['新Lead', '跟進中', '已報價', '成交', '失敗', '已取消'] }, { key: 'priority', label: '全部優先級', options: ['高', '中', '低'] }],
    fields: [field('lead_number', 'Lead 編號'), field('customer_name', '客戶名稱', 'text', { required: true }), field('customer_type', '客戶類型', 'select', { required: true, options: ['政府', '管理公司', '同行', '社福單位', '其他公司', '普通客戶', '舊客'] }), field('contact_person', '聯繫人'), field('phone', '電話'), field('whatsapp', 'WhatsApp'), field('email', '電郵'), field('service_address', '服務地址', 'textarea', { wide: true }), field('lead_source', '來源', 'select', { options: ['E-procurement', 'Email', 'Phone', 'WhatsApp', '推薦', '網站', '其他'] }), field('interest_type', '興趣類型', 'select', { options: ['服務', '產品', '兩者'] }), field('estimated_value', '預計金額', 'money'), field('status', '狀態', 'select', { options: ['新Lead', '跟進中', '已報價', '成交', '失敗', '已取消'] }), field('priority', '優先級', 'select', { options: ['高', '中', '低'] }), field('assigned_to', '負責員工 ID'), field('assigned_name', '負責員工'), field('converted_to_quotation', '已轉為報價', 'checkbox', { readOnly: true }), field('notes', '備註', 'textarea', { wide: true })],
    original: { list: '/leads', view: '/viewlead', create: '/createlead' },
  }),

  follow_ups: define({
    key: 'follow_ups', entity: 'FollowUp', title: '跟進記錄', plural: '跟進 FollowUps', listPath: '/followups', dateField: 'follow_up_date', labelField: 'quotation_number', viewRoles: BACK_OFFICE,
    search: ['quotation_number', 'customer_name', 'content', 'admin_employee_name'],
    columns: [column('follow_up_date', '跟進日期', 'date'), column('quotation_number', '報價單'), column('customer_name', '客戶'), column('follow_up_method', '跟進方式', 'pill'), column('content', '跟進內容'), column('next_follow_up_date', '下次跟進', 'date'), column('admin_employee_name', '跟進人'), column('status', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'follow_up_method', label: '全部方式', options: ['電話', 'WhatsApp', '電郵', '會面', '其他'] }, { key: 'status', label: '全部狀態', options: ['待跟進', '已跟進', '已完成'] }],
    fields: [field('quotation_id', '報價單 ID', 'text', { required: true }), field('quotation_number', '報價單編號'), field('customer_name', '客戶名稱'), field('follow_up_date', '跟進日期', 'date', { required: true }), field('follow_up_method', '跟進方式', 'select', { options: ['電話', 'WhatsApp', '電郵', '會面', '其他'] }), field('content', '跟進內容', 'textarea', { required: true, wide: true, placeholder: '記錄跟進的詳細內容...' }), field('next_follow_up_date', '下次跟進日期', 'date'), field('admin_employee_id', '跟進員工 ID'), field('admin_employee_name', '跟進員工'), field('status', '狀態', 'select', { options: ['待跟進', '已跟進', '已完成'] })],
    original: { list: '/followups' },
  }),

  announcements: define({
    key: 'announcements', entity: 'Announcement', title: '公告', plural: '公告管理', listPath: '/announcements', labelField: 'title', viewRoles: ALL, editRoles: MANAGEMENT,
    search: ['title', 'content', 'priority'],
    columns: [column('title', '標題'), column('content', '內容', 'richtext'), column('priority', '優先級', 'pill'), column('is_active', '啟用', 'pill'), actionColumn()],
    filters: [{ key: 'priority', label: '全部優先級', options: ['一般', '重要', '緊急'] }, { key: 'is_active', label: '全部狀態', options: ['true', 'false'] }],
    fields: [field('title', '標題', 'text', { required: true }), field('content', '內容', 'richtext', { required: true, wide: true }), field('priority', '優先級', 'select', { options: ['一般', '重要', '緊急'] }), field('is_active', '啟用', 'checkbox')],
    original: { list: '/dashboard' },
  }),

  email_templates: define({
    key: 'email_templates', entity: 'EmailTemplate', title: '電郵範本', plural: '電郵範本', listPath: '/emailtemplates', labelField: 'template_name', viewRoles: MANAGEMENT, editRoles: MANAGEMENT,
    search: ['template_name', 'document_type', 'subject', 'body'],
    columns: [column('template_name', '範本名稱'), column('document_type', '文件類型', 'pill'), column('subject', '主旨'), column('is_active', '啟用', 'pill'), actionColumn()],
    filters: [{ key: 'document_type', label: '文件類型', options: ['通用', '報價單', '發票', '收據', '採購單', '送貨單'] }],
    fields: [field('template_name', '範本名稱', 'text', { required: true }), field('document_type', '文件類型', 'select', { options: ['通用', '報價單', '發票', '收據', '採購單', '送貨單'] }), field('subject', '主旨', 'text', { required: true, wide: true }), field('body', '內容', 'textarea', { required: true, wide: true }), field('is_active', '啟用', 'checkbox')],
    original: { list: '/EmailTemplates' },
  }),

  addresses: define({
    key: 'addresses', entity: 'Address', title: '地址', plural: '地址庫', listPath: '/addresses', labelField: 'address_name', viewRoles: BACK_OFFICE,
    search: ['address_name', 'full_address', 'district', 'contact_person'],
    columns: [column('address_name', '地址名稱'), column('full_address', '完整地址'), column('address_type', '類型', 'pill'), column('district', '區域'), column('contact_person', '聯繫人'), column('contact_phone', '聯繫電話'), actionColumn()],
    filters: [{ key: 'address_type', label: '全部類型', options: ['服務地址', '送貨地址', '兩者'] }, { key: 'district', label: '全部區域', dynamic: true }, { key: 'is_active', label: '全部狀態', options: ['true', 'false'] }],
    fields: [field('address_name', '地址名稱', 'text', { required: true, placeholder: '例：總公司' }), field('full_address', '完整地址', 'textarea', { required: true, wide: true }), field('address_type', '類型', 'select', { options: ['服務地址', '送貨地址', '兩者'] }), field('district', '區域'), field('contact_person', '聯繫人'), field('contact_phone', '聯繫電話'), field('notes', '備註', 'textarea', { wide: true }), field('is_active', '啟用', 'checkbox')],
    original: { list: '/addresslibrary' },
  }),

  accounts: define({
    key: 'accounts', entity: 'Account', title: '會計科目', plural: '科目表', listPath: '/accounts', labelField: 'account_name', viewRoles: FINANCE, editRoles: FINANCE, importExport: true,
    search: ['account_code', 'account_name', 'description'],
    columns: [column('account_code', '科目編號'), column('account_name', '科目名稱'), column('account_type', '類型', 'pill'), column('account_category', '分類'), column('balance', '餘額', 'money'), column('is_active', '狀態', 'pill'), actionColumn()],
    filters: [{ key: 'account_type', label: '全部類型', options: ['資產', '負債', '權益', '收入', '支出'] }],
    fields: [field('account_code', '科目編號', 'text', { required: true, placeholder: '例：1001' }), field('account_name', '科目名稱', 'text', { required: true, placeholder: '例：銀行存款' }), field('account_type', '科目類型', 'select', { required: true, options: ['資產', '負債', '權益', '收入', '支出'] }), field('account_category', '科目分類', 'select', { required: true, options: ['流動資產', '固定資產', '流動負債', '長期負債', '股東權益', '營業收入', '其他收入', '營業成本', '營業費用', '其他支出'] }), field('description', '說明', 'textarea', { wide: true }), field('balance', '餘額', 'money'), field('is_active', '啟用', 'checkbox')],
    original: { list: '/accounts' },
  }),

  notifications: define({
    key: 'notifications', entity: 'Notification', title: '通知', plural: '通知記錄', listPath: '/notifications',
    labelField: 'title', viewRoles: MANAGEMENT, editRoles: [],
    search: ['title', 'message', 'type', 'status', 'source_entity', 'link_url'],
    columns: [column('created_date', '日期', 'date'), column('title', '標題'), column('message', '內容'), column('type', '類型', 'pill'), column('status', '狀態', 'pill'), column('source_entity', '來源實體'), actionColumn()],
    filters: [{ key: 'type', label: '全部類型', dynamic: true }, { key: 'status', label: '全部狀態', dynamic: true }],
    fields: [
      field('title', '標題'), field('message', '內容', 'textarea', { wide: true }), field('type', '類型'),
      field('status', '狀態'), field('link_url', '連結'), field('target_user_id', '目標用戶 ID'),
      field('source_id', '來源 ID'), field('source_entity', '來源實體'),
    ],
  }),

  company_settings: define({
    key: 'company_settings', entity: 'CompanySettings', title: '系統設置', plural: '系統設置', listPath: '/settings', labelField: 'company_email', viewRoles: MANAGEMENT, editRoles: MANAGEMENT,
    search: ['company_email', 'company_phone', 'company_address'],
    columns: [column('company_email', '公司電郵'), column('company_phone', '公司電話'), column('company_whatsapp', 'WhatsApp'), column('current_year', '目前年份'), actionColumn()],
    fields: [
      field('company_logo', '公司 Logo', 'files', { section: '公司資訊' }), field('company_signature', '公司簽名', 'files', { section: '公司資訊' }), field('company_stamp', '公司印章', 'files', { section: '公司資訊' }),
      field('company_email', '公司電郵', 'text', { section: '公司資訊' }), field('company_whatsapp', '公司 WhatsApp', 'text', { section: '公司資訊' }), field('company_phone', '公司電話', 'text', { section: '公司資訊' }), field('company_fax', '公司傳真', 'text', { section: '公司資訊' }),
      field('company_address', '公司地址', 'textarea', { wide: true, section: '公司資訊' }), field('company_website', '公司網站', 'text', { section: '公司資訊' }),
      field('third_party_insurance_expiry', '第三者保險到期日', 'date', { section: '證照與保險' }), field('labor_insurance_expiry', '勞工保險到期日', 'date', { section: '證照與保險' }),
      field('pesticide_permit_expiry', '除害劑許可證到期日', 'date', { section: '證照與保險' }), field('pesticide_license_expiry', '除害劑牌照到期日', 'date', { section: '證照與保險' }),
      field('customer_code_prefix', '客戶編號前綴', 'text', { section: '編號設置' }), field('customer_counter', '客戶編號計數器', 'number', { section: '編號設置' }),
      field('supplier_code_prefix', '供應商編號前綴', 'text', { section: '編號設置' }), field('supplier_counter', '供應商編號計數器', 'number', { section: '編號設置' }),
      field('quotation_prefix', '報價單前綴（舊欄位）', 'text', { section: '編號設置' }), field('quotation_counter', '報價單計數器（舊欄位）', 'number', { section: '編號設置' }),
      field('service_quotation_prefix', '服務報價單前綴', 'text', { section: '編號設置' }), field('service_quotation_counter', '服務報價單計數器', 'number', { section: '編號設置' }),
      field('product_quotation_prefix', '產品報價單前綴', 'text', { section: '編號設置' }), field('product_quotation_counter', '產品報價單計數器', 'number', { section: '編號設置' }),
      field('invoice_prefix', '發票前綴', 'text', { section: '編號設置' }), field('invoice_counter', '發票計數器', 'number', { section: '編號設置' }),
      field('receipt_prefix', '收據前綴', 'text', { section: '編號設置' }), field('receipt_counter', '收據計數器', 'number', { section: '編號設置' }),
      field('dn_counter', '送貨單計數器', 'number', { section: '編號設置' }), field('current_year', '目前年份', 'text', { section: '編號設置' }),
      field('work_time_slots', '工作時段', 'json', { wide: true, section: '工作設定' }),
    ],
    original: { list: '/settings' },
  }),
};

export const ENTITY_BY_NAME = Object.fromEntries(
  Object.values(ENTITIES).map((config) => [config.entity, config]),
);

export const ORIGINAL_ROUTES = {};
for (const config of Object.values(ENTITIES)) {
  for (const action of ['list', 'view', 'create', 'edit']) {
    const path = config.original[action];
    if (path && !ORIGINAL_ROUTES[path]) ORIGINAL_ROUTES[path] = { action, key: config.key };
  }
}

// 原 accessible_pages 菜單路由及 Settings／排程別名。
Object.assign(ORIGINAL_ROUTES, {
  '/': { action: 'list', key: 'dashboard' },
  '/dashboard': { action: 'list', key: 'dashboard' },
  '/Dashboard': { action: 'list', key: 'dashboard' },
  '/mywork': { action: 'list', key: 'mywork' },
  '/MyWork': { action: 'list', key: 'mywork' },
  '/pestcontrolwork': { action: 'list', key: 'schedules' },
  '/PestControlWork': { action: 'list', key: 'schedules' },
  '/serviceplans': { action: 'list', key: 'recurring_schedules' },
  '/ServicePlans': { action: 'list', key: 'recurring_schedules' },
  '/ServiceReports': { action: 'list', key: 'work_records' },
  '/workschedule': { action: 'list', key: 'schedules' },
  '/WorkSchedule': { action: 'list', key: 'schedules' },
  '/CheckIn': { action: 'list', key: 'check_ins' },
  '/myattendance': { action: 'list', key: 'attendances' },
  '/MyAttendance': { action: 'list', key: 'attendances' },
  '/myschedule': { action: 'list', key: 'schedules' },
  '/MySchedule': { action: 'list', key: 'schedules' },
  '/MySupply': { action: 'list', key: 'supply_records' },
  '/Customers': { action: 'list', key: 'customers' },
  '/Quotations': { action: 'list', key: 'quotations' },
  '/PurchaseOrders': { action: 'list', key: 'purchase_orders' },
  '/DeliveryNotes': { action: 'list', key: 'delivery_notes' },
  '/Products': { action: 'list', key: 'products' },
  '/Inventory': { action: 'list', key: 'stock_adjustments' },
  '/Services': { action: 'list', key: 'services' },
  '/Suppliers': { action: 'list', key: 'suppliers' },
  '/Schedules': { action: 'list', key: 'schedules' },
  '/Contracts': { action: 'list', key: 'contracts' },
  '/Vehicles': { action: 'list', key: 'vehicles' },
  '/LeaveRecords': { action: 'list', key: 'leave_records' },
  '/MonthlyAttendance': { action: 'list', key: 'attendances' },
  '/Invoices': { action: 'list', key: 'invoices' },
  '/Receipts': { action: 'list', key: 'receipts' },
  '/Accounting': { action: 'list', key: 'accounting' },
  '/Settings': { action: 'list', key: 'company_settings' },
  '/UserManagement': { action: 'list', key: 'users' },
  '/Employees': { action: 'list', key: 'employees' },
  '/WorkUnits': { action: 'list', key: 'work_units' },
  '/AddressLibrary': { action: 'list', key: 'addresses' },
  '/WorkInstructions': { action: 'list', key: 'work_instructions' },
  '/Pesticides': { action: 'list', key: 'pesticides' },
  '/Leads': { action: 'list', key: 'leads' },
  '/FollowUps': { action: 'list', key: 'follow_ups' },
  '/Payments': { action: 'list', key: 'payments' },
  '/Bills': { action: 'list', key: 'bills' },
  '/GeneralLedger': { action: 'list', key: 'transactions' },
  '/Accounts': { action: 'list', key: 'accounts' },
  '/RecurringSchedules': { action: 'list', key: 'recurring_schedules' },
  '/ExcelSchedule': { action: 'list', key: 'schedules' },
  '/PersonalSettings': { action: 'list', key: 'me' },
  '/EmailTemplates': { action: 'list', key: 'email_templates' },
});

export const AMOUNT_FIELDS = new Set([
  'amount', 'balance', 'subtotal', 'total', 'total_amount', 'paid_amount', 'balance_due',
  'freight_charges', 'discount', 'tax_amount', 'total_debit', 'total_credit', 'debit', 'credit',
  'unit_price', 'unit_cost', 'cost_price', 'supplier_price', 'standard_retail_price',
  'government_price', 'management_company_price', 'welfare_price', 'company_price',
  'regular_customer_price', 'old_customer_price', 'rat_price', 'base_price', 'estimated_value',
  'hourly_rate', 'monthly_salary',
]);
