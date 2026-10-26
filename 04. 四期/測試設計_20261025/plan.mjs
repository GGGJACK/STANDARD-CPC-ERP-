// 測試設計單一資料源：方案文件與自動化報告都由此生成
// 每個 case：id / 模組 / 測試項 / 優先級 / 方法 / 前置 / 步驟 / 預期（含判定標準）/ 自動化對應
export const META = {
  title: '標準清潔滅蟲 ERP · 測試設計與驗收方案',
  version: 'v1.0',
  date: '2026-10-25',
  system: '標準清潔滅蟲管理系統（本地 Node.js + SQLite 復刻版）',
  scope: '38 個實體、4 個角色、5 大業務域、62 條路由、34,053 條既有記錄',
  owner: '測試工程師（QA）',
  environment: 'Windows 11 · Node 22.22.2 · SQLite (node:sqlite) · 生產 :3000 / 隔離 :3101-3102',
};

export const PRIORITY_DEF = [
  { key: 'P0', label: '阻斷', rule: '核心業務不可用、資料錯誤、越權、金額/庫存失真；必須 100% 通過纔可交付。' },
  { key: 'P1', label: '重要', rule: '主要功能缺陷或有明確繞過方式；通過率 ≥ 98%，且不得有未關閉項。' },
  { key: 'P2', label: '一般', rule: '體驗、文案、次要欄位、極端邊界；通過率 ≥ 95%，可排期修復。' },
];

export const TYPE_DEF = [
  ['功能', '正向流程、CRUD、狀態流轉'],
  ['邊界', '空值、0、負數、小數、超長、最大/最小日期'],
  ['異常', '必填缺失、非法枚舉、重複提交、庫存不足、借貸不平'],
  ['權限', '角色可見性、直鏈訪問、表單/動作/匯出/回收桶'],
  ['資料', '寫入後 DB 斷言、計算一致性、軟刪除與沖銷'],
  ['安全', 'CSRF、XSS、越權 IDOR、上傳路徑、會話'],
  ['效能', '首字節、整頁耗時、資料量下的穩定性'],
  ['UI', '版面、彈窗、選擇器、列印、響應式'],
];

// 模組：code, name, goal, risk, auto（自動化覆蓋說明）
export const MODULES = [
  {
    code: 'SYS', name: '啟動、部署與健康檢查', goal: '服務可啟動、資料庫可讀、錯誤頁可控', risk: '高',
    auto: '啟動/登入頁/404/靜態資源/DB 連通',
    cases: [
      { id: 'SYS-01', title: '冷啟動與埠監聽', p: 'P0', t: '功能', pre: '乾淨副本 DB、未佔用埠', steps: ['以 PORT/DB_PATH/CPC_UPLOAD_DIR 啟動 server.mjs', '請求 /login'], expect: '進程不退出；/login 回 200 且含登入表單；日誌印出實際 DB 路徑' },
      { id: 'SYS-02', title: '資料庫缺失/損壞的失敗姿態', p: 'P1', t: '異常', pre: '指向不存在的 DB 路徑', steps: ['啟動服務', '觀察退出碼與日誌'], expect: '快速失敗並印出可讀錯誤，不得靜默建立空庫覆蓋正式資料' },
      { id: 'SYS-03', title: '未知路由與錯誤頁', p: 'P1', t: '異常', pre: '已登入', steps: ['GET /no-such-page', 'GET /view/customers/not-exist'], expect: '404 錯誤頁含導航與返回；不得拋堆疊或空白頁' },
      { id: 'SYS-04', title: '啟動自動匯入開關', p: 'P1', t: '資料', pre: '副本 DB、CPC_AUTO_IMPORT=0', steps: ['啟動後統計 records 總數', '對照啟動前'], expect: '筆數不變；正式庫不會被測試資料污染' },
      { id: 'SYS-05', title: '時區與 HK 日期', p: 'P1', t: '邊界', pre: '系統時區非 HK', steps: ['新增一筆記錄', '檢查 created_date 與編號年份'], expect: '日期/年份按 Asia/Hong_Kong 計算，23:30 與 00:30 不跨錯日' },
      {
        id: 'SYS-06', title: '驗收腳本換機可跑', p: 'P1', t: '功能',
        pre: '非作者本機的新部署；正式庫不在程式目錄（如 D:\\CPC-ERP\\_runtime\\data.db）',
        steps: ['不改任何路徑，直接執行 run-tests.mjs / compare-ui.mjs / rollback-drill.mjs', '對比隔離副本與來源庫的 demo_mode'],
        expect: '三套腳本無需改路徑即可執行（支援 CPC_ROOT / CPC_DB / CPC_OUT 與 --src / --db）；隔離副本內 demo_mode=1 而來源庫保持 0；不得出現整批 302 假失敗',
      },
    ],
  },
  {
    code: 'AUTH', name: '認證、會話與 CSRF', goal: '只有合法身份能進入，會話與表單令牌不可繞過', risk: '極高',
    auto: '四角色登入、登出、無會話、缺 CSRF、錯誤密碼、鎖定、Cookie 旗標',
    cases: [
      { id: 'AUTH-01', title: '四角色快捷登入', p: 'P0', t: '功能', pre: 'demo_mode=1', steps: ['GET /demo?as=front|office|accounting|management', '跟隨 302'], expect: '各自進入 / 或 /mywork；側欄身份與角色一致' },
      { id: 'AUTH-02', title: '未登入訪問受保護頁', p: 'P0', t: '權限', pre: '無 Cookie', steps: ['GET /customers', 'GET /receivables'], expect: '302 → /login?from=...；不得回 200 或資料片段' },
      { id: 'AUTH-03', title: '未登入提交寫操作', p: 'P0', t: '安全', pre: '無 Cookie', steps: ['POST /save/customers'], expect: '401（登入已失效），不得寫入任何記錄' },
      { id: 'AUTH-04', title: 'CSRF 令牌缺失/錯誤', p: 'P0', t: '安全', pre: '已登入', steps: ['POST /save/customers 不帶 __csrf', '再帶錯誤 __csrf'], expect: '兩次均 403；DB 筆數不變' },
      { id: 'AUTH-05', title: '錯誤密碼與鎖定', p: 'P1', t: '異常', pre: '已知帳號、demo 關閉', steps: ['連續 5 次錯誤密碼', '第 6 次再試'], expect: '前 5 次回登入頁錯誤提示；第 6 次 429 並提示 15 分鐘後再試' },
      { id: 'AUTH-06', title: '登出使會話失效', p: 'P0', t: '功能', pre: '已登入', steps: ['GET /logout', '用舊 sid 再 GET /mywork'], expect: '302 → /login；舊 sid 不可再用' },
      { id: 'AUTH-07', title: 'Cookie 安全旗標', p: 'P1', t: '安全', pre: '登入回應', steps: ['檢查 Set-Cookie'], expect: 'sid 含 HttpOnly、SameSite=Lax、Path=/、有 Max-Age；不得缺 HttpOnly' },
      { id: 'AUTH-08', title: '公開簽署連結邊界', p: 'P1', t: '安全', pre: '取得 /sign-certificate?token=', steps: ['無 token 訪問', '用已簽署 token 再提交'], expect: '無 token 需登入；已簽署回 409；不得改到其他記錄' },
    ],
  },
  {
    code: 'PERM', name: '角色與權限矩陣', goal: '菜單、直鏈、表單、動作、匯出、回收桶六層一致', risk: '極高',
    auto: 'NAV 可見性、44 頁 × 4 角色直鏈、38 實體 × 4 角色列表/表單、匯出與回收桶',
    cases: [
      { id: 'PERM-01', title: '側欄菜單按角色渲染', p: 'P0', t: '權限', pre: '四角色會話', steps: ['抓取 aside 導航', '對照 NAV.roles'], expect: '有權限的項必須出現；無權限的項不得出現（含設定/財務/回收桶）' },
      { id: 'PERM-02', title: '直鏈訪問越權攔截', p: 'P0', t: '權限', pre: 'front 會話', steps: ['GET /customers、/invoices、/users、/trash、/settings'], expect: '全部 403「無權限」頁；不得回 200 或空殼頁' },
      { id: 'PERM-03', title: '實體列表與表單權限', p: 'P0', t: '權限', pre: '四角色', steps: ['對 38 實體逐一 GET listPath', '逐一 GET /new/<key>'], expect: '列表：viewRoles 內 200，否則 403；表單：editRoles 內 200，否則 403' },
      { id: 'PERM-04', title: '動作級權限（審批/轉換/匯出）', p: 'P0', t: '權限', pre: 'front + office', steps: ['front POST /leaves/:id/decide', 'office GET /export/contracts.csv'], expect: 'front 403；office 403；只有 management 可匯出' },
      { id: 'PERM-05', title: '回收桶角色邊界', p: 'P1', t: '權限', pre: 'office / accounting / front', steps: ['GET /trash', 'POST /trash/purge'], expect: 'office、management 可進；accounting、front 403；永久刪除僅 office/management' },
      { id: 'PERM-06', title: '菜單與路由可用性一致', p: 'P1', t: '權限', pre: '四角色', steps: ['遍歷側欄每一項', '比對該角色實際 HTTP 狀態'], expect: '菜單可見的頁面必須 200；不得出現看得到卻 403 的死連結' },
      { id: 'PERM-07', title: '選擇器不得繞過實體權限', p: 'P0', t: '權限', pre: '四角色', steps: ['front GET /api/pick?source=customers', 'front GET /api/pick?source=products', 'office／management GET products', 'front GET employees'], expect: 'front→customers/products 403；office 無 cost_price、management 有；front→employees 200（補給請假要用）；每次調用留 pick 審計' },
      { id: 'PERM-08', title: '編輯表單金額掩碼', p: 'P0', t: '權限', pre: 'office／management + 一張帶金額報價', steps: ['office GET /edit/quotations/:id', '檢查可見 input 是否帶明文', '檢查是否有 hidden 保值'], expect: '可見控件無明文、有 ••••• 佔位符、hidden 保留原值；management 仍見真實金額' },
    ],
  },
  {
    code: 'CUS', name: '客戶管理', goal: '客戶主檔正確、可搜尋、有關聯保護', risk: '高',
    auto: '新增必填、建立、編輯、搜尋、詳情、前線越權',
    cases: [
      { id: 'CUS-01', title: '新增客戶必填校驗', p: 'P0', t: '異常', pre: 'office', steps: ['提交 customer_name 空字串', '其餘欄位正常'], expect: '400 + 「請填寫必填欄位：客戶名稱」；records 無新增' },
      { id: 'CUS-02', title: '新增客戶成功與落庫', p: 'P0', t: '功能', pre: 'office', steps: ['填名稱/類型/電話/地址提交'], expect: '302 → /view/customers/<id>；DB 欄位一致；列表可搜到' },
      { id: 'CUS-03', title: '客戶名稱模糊搜尋', p: 'P1', t: '功能', pre: '已有客戶', steps: ['/customers?q=關鍵字', '再搜不存在的字串'], expect: '命中行含關鍵字；不存在時顯示空狀態而非報錯' },
      { id: 'CUS-04', title: '編輯保留未提交欄位', p: 'P1', t: '資料', pre: '已存在客戶', steps: ['只改電話提交', '讀 DB'], expect: '電話更新；名稱/地址/類型不變；updated_date 遞增' },
      { id: 'CUS-05', title: '客戶詳情聚合', p: 'P1', t: '功能', pre: '有報價/合約的客戶', steps: ['GET /view/customers/<id>'], expect: '3 個 KPI + 聯絡人卡 + 6 頁簽載入；金額遮罩依角色' },
      { id: 'CUS-06', title: '前線直鏈客戶詳情', p: 'P0', t: '權限', pre: 'front', steps: ['GET /view/customers/<id>'], expect: '403；不得泄露名稱/電話/地址' },
    ],
  },
  {
    code: 'LEA', name: '線索與跟進', goal: 'Lead 到報價前不漏、不重', risk: '中',
    auto: '新增必填、編號、列表、跟進關聯',
    cases: [
      { id: 'LEA-01', title: 'Lead 自動編號與必填', p: 'P1', t: '功能', pre: 'office', steps: ['lead_number 留空、填名稱/類型提交'], expect: '生成 LEAD-YYYY-####；缺名稱或類型回 400' },
      { id: 'LEA-02', title: 'Lead 狀態流轉', p: 'P2', t: '功能', pre: '已有 Lead', steps: ['改為跟進中 → 已報價 → 成交', '再改為失敗'], expect: '狀態保存正確；converted_to_quotation 不被誤改' },
      { id: 'LEA-03', title: '跟進記錄關聯報價', p: 'P1', t: '資料', pre: '有報價單', steps: ['新增 follow_up 綁 quotation_id', '查看報價詳情'], expect: '跟進記錄可查；報價詳情顯示跟進歷史；刪報價後跟進不崩' },
    ],
  },
  {
    code: 'QUO', name: '報價管理', goal: '金額、編號、階段、轉換四件事必須對', risk: '極高',
    auto: '編號、明細小計/總額、必填、階段、轉 PO/合同、軟刪除',
    cases: [
      { id: 'QUO-01', title: '報價自動編號', p: 'P0', t: '功能', pre: 'office', steps: ['quotation_number 留空，類型=服務提交', '再看產品類型'], expect: '服務 SQP-YYYY-####；產品 SQM-YYYY-####；序號不跳號不重號' },
      { id: 'QUO-02', title: '明細小計與總額', p: 'P0', t: '資料', pre: 'office', steps: ['2×100 折扣 10；運費 20', '讀 DB'], expect: '行小計 190；subtotal 190；total=190+20=210；整單折扣已依 T0-5 從表單移除（欄位留 JSON 兼容舊資料）' },
      { id: 'QUO-03', title: '必填與空明細', p: 'P0', t: '異常', pre: 'office', steps: ['缺 customer_name', '缺 items', 'items=[]'], expect: '均 400 並指出欄位；不得產生半成品記錄' },
      { id: 'QUO-04', title: '報價階段與成交標記', p: 'P1', t: '功能', pre: '已有報價', steps: ['POST /quotations/:id/stage stage=已成交', '再提交非法 stage'], expect: '已成交時 accepted=true、accepted_date 有值；非法值 400' },
      { id: 'QUO-05', title: '報價轉採購單', p: 'P1', t: '功能', pre: '報價含 2 行明細', steps: ['POST /quotations/:id/to-po', '讀 PO 與報價'], expect: '302 → PO 詳情；quotation_id/customer/total 一致；PO 編號與名稱為非空（PO-YYYY-####）' },
      { id: 'QUO-06', title: '報價轉合約', p: 'P0', t: '功能', pre: '報價含客戶/地點/內容', steps: ['POST /to-contract', '讀合約'], expect: 'contract.quotation_id 對上；contract_number=報價編號；contract_name 自動組合' },
      { id: 'QUO-07', title: '重複轉換冪等', p: 'P1', t: '異常', pre: '已轉過 PO', steps: ['再次 POST /to-po', '統計 PO 筆數'], expect: '返回既有 PO；不新增第二張' },
      { id: 'QUO-08', title: '報價軟刪除與回收桶', p: 'P1', t: '資料', pre: 'office、有報價', steps: ['POST /delete/quotations/:id', 'GET /trash?module=quotations'], expect: 'deleted=1、deleted_at/by 有值；回收桶可見；列表預設不顯示' },
      { id: 'QUO-09', title: '報價詳情與列印', p: 'P1', t: 'UI', pre: '有明細報價', steps: ['GET /view/quotations/:id', 'GET /print/quotations/:id'], expect: '明細、合計、條款完整；列印頁不帶導航；金額格式 HK$ x,xxx.00' },
    ],
  },
  {
    code: 'PO', name: '採購單管理', goal: 'PO 可排班、可轉單、可簽署', risk: '高',
    auto: '編號/名稱、必填、金額、詳情、軟刪除',
    cases: [
      { id: 'PO-01', title: 'PO 自動編號與名稱', p: 'P0', t: '功能', pre: 'office', steps: ['po_number 留空、填客戶/內容提交'], expect: 'PO-YYYY-####；po_name=編號_工作單位_內容（空值自動省略）' },
      { id: 'PO-02', title: 'PO 必填校驗', p: 'P0', t: '異常', pre: 'office', steps: ['缺 po_number', '缺 customer_name'], expect: '皆 400；提示對應欄位' },
      { id: 'PO-03', title: 'PO 金額含稅', p: 'P0', t: '資料', pre: 'office', steps: ['明細 2×300，稅額 50 提交'], expect: 'subtotal 600、total 650；DB 與頁面一致' },
      { id: 'PO-04', title: 'PO 詳情與行操作', p: 'P1', t: '功能', pre: '有 PO', steps: ['GET /view/purchase_orders/:id'], expect: '工程滿意紙/由 PO 新增送貨單/轉為發票/前往排班/簽署連結按鈕齊全；連結帶正確 poId' },
      { id: 'PO-05', title: 'PO 軟刪除與還原', p: 'P1', t: '資料', pre: 'office', steps: ['刪除 → 回收桶 → 還原'], expect: 'deleted 1→0；列表恢復；關聯報價不受影響' },
      { id: 'PO-06', title: 'PO 簽署連結', p: 'P1', t: '功能', pre: '有 PO', steps: ['POST /purchase_orders/:id/share', '開 signing_link'], expect: 'signing_status=待簽署；連結可開；簽名後 signed_date/status 更新且不可重簽' },
      { id: 'PO-07', title: '由 PO 新增送貨單預填', p: 'P1', t: '功能', pre: '產品類 PO', steps: ['GET /new/delivery_notes?poId=:id'], expect: '表單預填客戶/PO 號/明細；儲存後 DN 帶 po_number；服務類 PO 不應引導此操作' },
    ],
  },
  {
    code: 'CON', name: '合約與服務安排', goal: '一約一計劃、名稱規則、關聯不斷鏈', risk: '高',
    auto: '必填、編號規則、名稱、軟刪除、轉合約',
    cases: [
      { id: 'CON-01', title: '合約新增必填與編號', p: 'P0', t: '功能', pre: 'office', steps: ['contract_number 留空提交', '再填 C-TEST-001 提交'], expect: '留空回 400（required 先於自動編號，屬已知設計缺口）；填值 302' },
      { id: 'CON-02', title: '合約名稱自動生成', p: 'P1', t: '功能', pre: 'office', steps: ['名稱留空，填客戶/地點/內容提交'], expect: 'contract_name=編號_客戶_地點_內容；空段自動省略' },
      { id: 'CON-03', title: '合約 13 欄彈窗', p: 'P1', t: 'UI', pre: 'office', steps: ['GET /contracts 開新增彈窗'], expect: '13 欄齊全；客戶/工作單位選擇器可回填；合約文件可上傳' },
      { id: 'CON-04', title: '合約詳情與連結', p: 'P1', t: '功能', pre: '有合約', steps: ['從列表點合約編號/客戶名'], expect: '合約編號→詳情；客戶名→客戶詳情；不得 404' },
      { id: 'CON-05', title: '合約軟刪除與還原', p: 'P1', t: '資料', pre: 'office', steps: ['刪除 → 回收桶可見 → 還原'], expect: 'deleted 1→0；服務計劃關聯仍可開' },
      { id: 'CON-06', title: '服務計劃一約一計劃', p: 'P1', t: '資料', pre: '有合約', steps: ['從合約列表新增服務計劃', '再次對同合約新增'], expect: '同合約僅一份計劃；名稱/日期同步；不得重複建' },
    ],
  },
  {
    code: 'DN', name: '送貨單與出庫', goal: '送達即扣庫存、不可重複扣、不可改明細', risk: '極高',
    auto: '自動編號、送達扣庫、重複扣攔截、明細鎖定',
    cases: [
      { id: 'DN-01', title: '送貨單自動編號', p: 'P0', t: '功能', pre: 'office', steps: ['dn_number 留空提交'], expect: 'DNP + yyMM + 3 位序號；同月連續不重號' },
      { id: 'DN-02', title: '送達扣庫存', p: 'P0', t: '資料', pre: '產品庫存 10、DN 明細 qty 3', steps: ['建立 DN 狀態=已送達', '讀產品與調整單'], expect: '庫存 7；生成 -3 的「送貨出庫」調整；stock_synced=true' },
      { id: 'DN-03', title: '庫存不足攔截', p: 'P0', t: '異常', pre: '庫存 2、qty 5', steps: ['提交狀態=已送達'], expect: '409 庫存不足；DN 不落庫或保持草稿；庫存不變' },
      { id: 'DN-04', title: '已過賬明細鎖定', p: 'P0', t: '異常', pre: '已同步 DN', steps: ['修改 items 後再提交'], expect: '409「已過賬送貨單不可修改貨品明細」；庫存不變' },
      { id: 'DN-05', title: '重複過賬攔截', p: 'P0', t: '異常', pre: '同一 DN', steps: ['再次儲存為已送達', '或補錄歷史'], expect: '不重複扣庫存；已有 source_delivery_id 時拒絕' },
    ],
  },
  {
    code: 'INV', name: '發票管理', goal: '金額、狀態、收款聯動正確', risk: '極高',
    auto: '編號、金額/餘額、必填、收款核銷',
    cases: [
      { id: 'INV-01', title: '發票新增與金額', p: 'P0', t: '資料', pre: 'accounting', steps: ['明細 3×200 折扣 50、運費 30 提交'], expect: 'subtotal 550、total 580、balance_due 580；編號 INV-YYYY-####' },
      { id: 'INV-02', title: '發票必填', p: 'P0', t: '異常', pre: 'accounting', steps: ['缺 customer_name', '缺 items'], expect: '400；不得寫入' },
      { id: 'INV-03', title: '收款核銷', p: 'P0', t: '資料', pre: '發票 580、未付', steps: ['POST /invoices/:id/receipt 收 300', '再收 280'], expect: '第一次 paid 300、狀態部分付款、餘額 280；第二次 paid 580、已付款、餘額 0；生成 2 張收據' },
      { id: 'INV-04', title: '超額收款', p: 'P1', t: '邊界', pre: '發票餘額 100', steps: ['收款 150'], expect: '拒絕或明確提示（不得默默把餘額做成負數）' },
      { id: 'INV-05', title: '發票作廢與關聯', p: 'P1', t: '功能', pre: '已收款發票', steps: ['改狀態=已作廢'], expect: '狀態保存；應收臺賬不再計入；關聯收據保留可追溯' },
      { id: 'INV-06', title: '發票轉收據明細', p: 'P1', t: '資料', pre: '收款成功', steps: ['查看收據詳情'], expect: '收據 items 含發票編號/說明/小計；總額等於本次收款' },
      { id: 'INV-07', title: '收款後狀態字典一致', p: 'P1', t: '資料', pre: '發票部分收款', steps: ['收款 40/100', '查看狀態與篩選器'], expect: '狀態必須是「部分付款」（與下拉/篩選字典一致），不得出現字典外的「部分收款」' },
    ],
  },
  {
    code: 'RCP', name: '收據管理', goal: '編號、金額、關聯發票一致', risk: '中',
    auto: '自動編號、必填、列表',
    cases: [
      { id: 'RCP-01', title: '收據自動編號', p: 'P1', t: '功能', pre: 'accounting', steps: ['receipt_number 留空手動新增'], expect: 'R + yy + 4 位序號；不與發票號混淆' },
      { id: 'RCP-02', title: '收據必填', p: 'P1', t: '異常', pre: 'accounting', steps: ['缺號碼/客戶提交'], expect: '400 並指出欄位' },
      { id: 'RCP-03', title: '收據列印', p: 'P2', t: 'UI', pre: '有收據', steps: ['GET /print/receipts/:id'], expect: '公司抬頭/印章/金額/付款方式完整；分頁不截斷' },
    ],
  },
  {
    code: 'BIL', name: '帳單管理', goal: '供應商帳單與付款餘額正確', risk: '中',
    auto: '金額、必填、餘額',
    cases: [
      { id: 'BIL-01', title: '帳單金額與餘額', p: 'P1', t: '資料', pre: 'accounting', steps: ['明細 2×100、稅 20、已付 50 提交'], expect: 'subtotal 200、total 220、balance 170' },
      { id: 'BIL-02', title: '帳單必填', p: 'P1', t: '異常', pre: 'accounting', steps: ['缺 vendor_name / items'], expect: '400' },
      { id: 'BIL-03', title: '帳單付款狀態', p: 'P1', t: '功能', pre: '帳單餘額 0', steps: ['改狀態=已付款'], expect: '狀態保存；列表 pill 顏色正確；不得影響發票' },
    ],
  },
  {
    code: 'PAY', name: '付款記錄', goal: '收付款流水可追溯', risk: '中',
    auto: '必填、列表',
    cases: [
      { id: 'PAY-01', title: '付款新增與必填', p: 'P1', t: '功能', pre: 'accounting', steps: ['填類型/方式/金額提交', '再缺金額提交'], expect: '成功 302；缺金額 400' },
      { id: 'PAY-02', title: '付款篩選', p: 'P2', t: '功能', pre: '有收款與付款記錄', steps: ['/payments?payment_type=收款'], expect: '只顯示收款；筆數與 DB 一致' },
    ],
  },
  {
    code: 'TXN', name: '總帳與會計', goal: '借貸平衡、過賬狀態、報表口徑', risk: '極高',
    auto: '不平衡攔截、平衡入帳、總帳頁、應收頁',
    cases: [
      { id: 'TXN-01', title: '借貸不平衡攔截', p: 'P0', t: '異常', pre: 'accounting', steps: ['分錄借 100/貸 50，狀態=已過賬'], expect: '400「憑證借貸不平衡」；不落庫' },
      { id: 'TXN-02', title: '平衡分錄入帳', p: 'P0', t: '資料', pre: 'accounting', steps: ['借 100/貸 100 提交'], expect: 'total_debit=total_credit=100；總帳可見' },
      { id: 'TXN-03', title: '草稿允許不平衡', p: 'P1', t: '邊界', pre: 'accounting', steps: ['狀態=草稿，借 100/貸 50'], expect: '允許暫存；狀態改已過賬時必須攔截' },
      { id: 'TXN-04', title: '總帳分頁與合計', p: 'P1', t: '效能', pre: '522 行資料', steps: ['GET /generalledger', '翻到最後一頁'], expect: '總筆數/合計與 DB 一致；分頁不重不漏；回應 < 3s' },
      { id: 'TXN-05', title: '應收臺賬口徑', p: 'P0', t: '資料', pre: '有未付/部分付/已付發票', steps: ['GET /receivables', '對照 DB 餘額'], expect: '只列未結案；合計=Σ balance_due；已作廢不計' },
    ],
  },
  {
    code: 'STK', name: '庫存、調整與盤點', goal: '每一次數量變動都可追溯且可逆', risk: '極高',
    auto: '調整入/出庫、負庫存、盤點過賬、刪除沖銷、還原重過賬、編輯鎖定',
    cases: [
      { id: 'STK-01', title: '產品新增與必填', p: 'P0', t: '功能', pre: 'office', steps: ['填名稱/零售價/庫存 10', '再缺零售價'], expect: '成功；缺價 400；庫存與價格正確' },
      { id: 'STK-02', title: '入庫調整', p: 'P0', t: '資料', pre: '產品庫存 10', steps: ['新增調整 類型=入庫 數量 5'], expect: '庫存 15；調整單 before 10/change +5/after 15；stock_posted=true' },
      { id: 'STK-03', title: '出庫與負庫存', p: 'P0', t: '邊界', pre: '庫存 5', steps: ['出庫 3', '再出庫 10'], expect: '第一次庫存 2；第二次 409 庫存不足；不得出現負數' },
      { id: 'STK-04', title: '調整單不可編輯', p: 'P0', t: '異常', pre: '已有調整單', steps: ['對既有 id 再提交修改'], expect: '409「請新增反向調整」；原單與庫存不變' },
      { id: 'STK-05', title: '盤點完成過賬', p: 'P0', t: '資料', pre: '產品庫存 15', steps: ['新增盤點 actual=12 狀態=已完成'], expect: '庫存 12；生成 -3 盤點調整；盤點 items 寫入 system_quantity/difference' },
      { id: 'STK-06', title: '刪除已過賬盤點沖銷', p: 'P0', t: '資料', pre: '已過賬盤點（-3）', steps: ['POST /delete/stock_counts/:id'], expect: '庫存回到 15；生成 +3 沖銷調整；stock_reversed=true；記錄進回收桶' },
      { id: 'STK-07', title: '還原盤點重新過賬', p: 'P0', t: '資料', pre: '已沖銷盤點', steps: ['POST /trash/restore'], expect: '庫存再回到 12；生成 -3 調整；stock_reversed=false' },
      { id: 'STK-08', title: '已過賬盤點不可改', p: 'P0', t: '異常', pre: '已過賬盤點', steps: ['改 items 或狀態再提交'], expect: '409；庫存不變' },
      { id: 'STK-09', title: '自動調整單編號', p: 'P2', t: '資料', pre: '盤點/送貨自動生成調整', steps: ['查看 adjustment_number'], expect: '符合 ADJ-YYYY-#####；列表不得空白' },
    ],
  },
  {
    code: 'SCH', name: '排班與定期排程', goal: '排班可改期、工作項關聯 PO、定期不重複', risk: '高',
    auto: '新增、改期、工作項關聯、權限',
    cases: [
      { id: 'SCH-01', title: '排班新增與總工時', p: 'P0', t: '功能', pre: 'office', steps: ['選日期、加 2 個工作項（含開始/結束時間）提交'], expect: '302 回 /schedules?saved=日期；total_hours 等於工時合計；日曆對應日有卡片' },
      { id: 'SCH-02', title: '拖拽改期', p: 'P0', t: '功能', pre: '有排班', steps: ['POST /schedules/:id/move date=+1'], expect: 'JSON ok；schedule_date 更新；原日消失、新日出現' },
      { id: 'SCH-03', title: '工作項關聯 PO 回寫日期', p: 'P1', t: '資料', pre: '有 PO', steps: ['排班工作項填 po_id 儲存', '讀 PO'], expect: 'PO.work_dates 追加該日期，去重排序' },
      { id: 'SCH-04', title: '同合同同日重複排程', p: 'P1', t: '異常', pre: '已有定期排程生成的排班', steps: ['同日再生成同 recurring_schedule'], expect: '409 不可重複生成；不產生第二筆' },
      { id: 'SCH-05', title: '定期排程產生排班', p: 'P1', t: '功能', pre: '啟用中的定期排程', steps: ['POST /recurring_schedules/:id/generate'], expect: '按頻率生成；next_schedule_date 前移；不重複' },
      { id: 'SCH-07', title: '排班總工時計算', p: 'P2', t: '資料', pre: '工作項含起止時間', steps: ['新增 09:00–11:00 與 13:00–14:30 兩項', '讀 total_hours'], expect: 'total_hours=3.5；列表/詳情同值' },
      { id: 'SCH-06', title: '排班權限', p: 'P0', t: '權限', pre: 'front', steps: ['GET /schedules', 'POST /save/schedules'], expect: '皆 403' },
    ],
  },
  {
    code: 'SPL', name: '服務計劃與紀錄日', goal: '合約→計劃→紀錄日→報告鏈路完整', risk: '中',
    auto: '計劃頁、紀錄日詳情、權限',
    cases: [
      { id: 'SPL-01', title: '服務計劃列表與篩選', p: 'P1', t: '功能', pre: '有合約計劃', steps: ['GET /serviceplans', '按狀態/客戶篩選'], expect: '只列計劃；筆數與 DB 一致；空狀態正常' },
      { id: 'SPL-02', title: '紀錄日詳情', p: 'P1', t: '功能', pre: '有 service_plan_dates', steps: ['GET /serviceplans/:id'], expect: '日期、合約、客戶、負責員工、報告內容正確；不得被 /serviceplans/:id 路由喫掉' },
      { id: 'SPL-03', title: '紀錄點四格照片', p: 'P1', t: '功能', pre: '有紀錄日', steps: ['新增/編輯 quadrants 四格', '上傳照片'], expect: '四格保存、圖片可開、公開分享頁可見' },
      { id: 'SPL-04', title: '公開報告分享', p: 'P1', t: '安全', pre: '有 shared_token', steps: ['GET /PublicReportView?token=...', '改 token 一字'], expect: '正確 token 200；錯誤 token 404；不得枚舉其他報告' },
    ],
  },
  {
    code: 'SR', name: '服務報告與簽署', goal: '前線可讀、辦公室可編、客戶可簽', risk: '高',
    auto: '建立必填、列表、分享、簽署邊界',
    cases: [
      { id: 'SR-01', title: '報告建立必填', p: 'P0', t: '異常', pre: 'office', steps: ['缺 report_title 提交'], expect: '400；不落庫' },
      { id: 'SR-02', title: '前線唯讀可見', p: 'P0', t: '權限', pre: 'front', steps: ['GET /servicereports', 'GET /view/work_records/:id'], expect: '200 可讀；不出現編輯/刪除按鈕；POST 保存 403' },
      { id: 'SR-03', title: '報告分享連結', p: 'P1', t: '功能', pre: '有報告', steps: ['POST /work_records/:id/share'], expect: 'shared_token 生成；公開頁可讀；金額遮罩' },
      { id: 'SR-04', title: '客戶簽名', p: 'P1', t: '功能', pre: '有簽署 token', steps: ['提交簽名人+PNG dataURL'], expect: 'signed_by/date/status 更新；再次提交 409；簽名圖可讀' },
      { id: 'SR-05', title: '非法簽名數據', p: 'P1', t: '安全', pre: '簽署頁', steps: ['提交非 data:image/png 或超大內容'], expect: '400 提示；不寫入；不得存任意 HTML/SVG' },
    ],
  },
  {
    code: 'ATT', name: '出勤、打卡與月度表', goal: '打卡→出勤→月度匯總一致', risk: '中',
    auto: '打卡、月度頁、權限',
    cases: [
      { id: 'ATT-01', title: '上班/下班打卡', p: 'P1', t: '功能', pre: 'front', steps: ['POST /checkin 上班', '同日再下班'], expect: '生成/更新當日記錄；total_hours 正確；重複上班不新增第二筆' },
      { id: 'ATT-02', title: '打卡時間窗', p: 'P1', t: '邊界', pre: 'window_enforced=1', steps: ['在 08:30 前與 18:00 後打卡'], expect: '依設定允許或提示；提示語明確；不得寫入錯誤日期' },
      { id: 'ATT-03', title: '月度出勤匯總', p: 'P1', t: '資料', pre: '當月有出勤/請假', steps: ['GET /monthlyattendance?month=YYYY-MM', '對照 DB'], expect: '每人每日一格；工時合計與 attendance 一致；請假顯示假別' },
      { id: 'ATT-04', title: 'Excel 排班/出勤匯出', p: 'P2', t: '功能', pre: 'office', steps: ['GET /excelschedule', '下載'], expect: '檔案可開；欄位與頁面一致；中文不亂碼' },
      { id: 'ATT-05', title: '前線僅見自己', p: 'P0', t: '權限', pre: 'front', steps: ['GET /myattendance', 'GET /attendance'], expect: '我的出勤 200 且只含本人；月度表 403' },
    ],
  },
  {
    code: 'LV', name: '請假管理', goal: '前線申請、管理層審批、天數正確', risk: '中',
    auto: '天數計算、狀態強制、越權審批、批准',
    cases: [
      { id: 'LV-01', title: '請假天數與狀態', p: 'P0', t: '資料', pre: 'front', steps: ['start=2026-11-02 end=2026-11-04 提交'], expect: 'total_days=3；status 強制為待審批（即使提交已批准）' },
      { id: 'LV-02', title: '前線不可代他人請假', p: 'P0', t: '安全', pre: 'front', steps: ['表單填他人姓名提交'], expect: 'employee_name 被強制改為本人；employee_id 為本人' },
      { id: 'LV-03', title: '審批權限與流轉', p: 'P0', t: '權限', pre: 'front / management', steps: ['front POST /leaves/:id/decide', 'management 批准'], expect: 'front 403；management 200 且 status=已批准、decided_by/at 有值' },
      { id: 'LV-04', title: '非法審批狀態', p: 'P1', t: '異常', pre: 'management', steps: ['status=亂填'], expect: '400；原狀態不變' },
    ],
  },
  {
    code: 'SUP', name: '補給記錄', goal: '前線補給可存、數量整數、可追溯', risk: '中',
    auto: '建立、整數攔截、列表、__id 空值',
    cases: [
      { id: 'SUP-01', title: '補給建立（產品明細）', p: 'P0', t: '功能', pre: 'front', steps: ['選產品、數量 2、位置=個人 提交'], expect: '302；列表出現；products 明細含 product_id/unit/quantity' },
      { id: 'SUP-02', title: '數量必須整數', p: 'P0', t: '邊界', pre: 'front', steps: ['數量填 2.5 提交'], expect: '400「必須為整數，不可有小數」；不落庫' },
      { id: 'SUP-03', title: '新增彈窗 __id 為空', p: 'P0', t: 'UI', pre: 'front', steps: ['GET /mysupply?new=1', '檢查 recDlg 的 __id'], expect: '__id value=""；__new_id 有值；提交後不是 404' },
      { id: 'SUP-04', title: '員工欄位隱藏但提交', p: 'P1', t: 'UI', pre: 'front', steps: ['檢查彈窗', '提交後讀 DB'], expect: '畫面不顯示員工 ID；hidden input 存在；DB employee_id 為本人' },
    ],
  },
  {
    code: 'VEH', name: '車輛與費用', goal: '車輛檔案、費用錄入、易通行去重', risk: '中',
    auto: '車輛新增、費用必填、列表、權限',
    cases: [
      { id: 'VEH-01', title: '車輛檔案與到期提醒', p: 'P1', t: '功能', pre: 'office', steps: ['新增車牌/牌照/保險到期日'], expect: '列表 pill 與到期狀態正確；重複車牌提示' },
      { id: 'VEH-02', title: '車輛費用新增', p: 'P1', t: '功能', pre: 'front', steps: ['填車牌/類型/日期/金額提交'], expect: '前線可新增；金額/地點保存；不可編輯既有（403）' },
      { id: 'VEH-03', title: '費用必填', p: 'P1', t: '異常', pre: 'office', steps: ['缺金額/車牌'], expect: '400' },
      { id: 'VEH-04', title: '易通行匯入去重', p: 'P1', t: '資料', pre: 'office', steps: ['貼 2 筆相同參考編號', '再匯入一次'], expect: '首次新增 1 跳過 1；二次全部跳過；不得重複計費' },
    ],
  },
  {
    code: 'MDM', name: '主數據（產品/服務/供應商/藥物/單位/細則/地址）', goal: '主數據可維護、被引用不崩', risk: '中',
    auto: '新增必填、列表、權限',
    cases: [
      { id: 'MDM-01', title: '產品新增與價格', p: 'P1', t: '功能', pre: 'office', steps: ['名稱/零售價/庫存/供應商提交'], expect: '成功；價格分級保存；庫存為整數' },
      { id: 'MDM-02', title: '服務/供應商必填', p: 'P1', t: '異常', pre: 'office', steps: ['服務缺名稱/價格', '供應商缺名稱'], expect: '各 400 並指出欄位' },
      { id: 'MDM-03', title: '工作細則與藥物權限', p: 'P0', t: '權限', pre: 'front', steps: ['GET /workinstructions /pesticides', 'POST 保存'], expect: '可讀 200；保存 403（僅 management）' },
      { id: 'MDM-04', title: '被引用主數據刪除', p: 'P1', t: '資料', pre: '產品已被報價/送貨引用', steps: ['嘗試刪除產品', '查看歷史單據'], expect: '有引用時阻止或軟刪除；歷史單據仍顯示名稱，不變 undefined' },
      { id: 'MDM-05', title: '地址庫與選擇器', p: 'P2', t: 'UI', pre: 'office', steps: ['新增地址', '在客戶表單用地址選擇器'], expect: '可選中並回填完整地址；搜尋 50 筆內不卡' },
    ],
  },
  {
    code: 'USR', name: '用戶、員工與系統設置', goal: '帳號安全、員工綁定、設置生效', risk: '高',
    auto: '用戶列表權限、設置頁權限、員工必填',
    cases: [
      { id: 'USR-01', title: '用戶管理僅管理層', p: 'P0', t: '權限', pre: 'office/accounting', steps: ['GET /users', 'POST /users/save'], expect: '皆 403' },
      { id: 'USR-02', title: '員工新增必填', p: 'P1', t: '異常', pre: 'management', steps: ['缺姓名/類型'], expect: '400' },
      { id: 'USR-03', title: '運行參數生效', p: 'P1', t: '功能', pre: 'management', steps: ['改 quota_limit=3、work_start=09:00 保存', '再開新會話驗證'], expect: '設置落庫；配額/時間窗按新值生效；不影響既有資料' },
      { id: 'USR-04', title: '個人資料與密碼', p: 'P1', t: '功能', pre: '任一角色', steps: ['改姓名/頭像', '改密碼後重登'], expect: '資料更新；舊密碼失效、新密碼可登入；錯誤舊密碼拒絕' },
    ],
  },
  {
    code: 'TRS', name: '回收桶', goal: '刪除可逆、永久刪除受限、盤點可沖銷', risk: '高',
    auto: '入口權限、列表、還原、永久刪除、稽覈',
    cases: [
      { id: 'TRS-01', title: '回收桶入口與篩選', p: 'P1', t: '功能', pre: 'office', steps: ['GET /trash', '按模組/關鍵字篩選'], expect: '只列已刪記錄；顯示刪除時間/人；篩選正確' },
      { id: 'TRS-02', title: '還原記錄', p: 'P0', t: '資料', pre: '有已刪報價', steps: ['POST /trash/restore'], expect: 'deleted=0；列表恢復；關聯仍在' },
      { id: 'TRS-03', title: '永久刪除邊界', p: 'P0', t: '權限', pre: 'office/management', steps: ['office 勾選 → 永久刪除', 'management 同操作'], expect: 'office 每日上限 10 條；超出推送管理層；management 不受限' },
      { id: 'TRS-04', title: '永久刪除不可逆', p: 'P1', t: '資料', pre: '已永久刪除', steps: ['再次 restore', '查 DB'], expect: '404 或明確失敗；DB 無此記錄' },
      { id: 'TRS-05', title: '盤點刪除自動沖銷', p: 'P0', t: '資料', pre: '已過賬盤點', steps: ['永久刪除'], expect: '先沖銷再刪；庫存回到盤點前；留下沖銷調整單可追溯' },
      { id: 'TRS-06', title: '刪除操作稽覈', p: 'P1', t: '安全', pre: '任一刪除', steps: ['查 audit_log'], expect: '記錄操作者/實體/ID/時間/動作；不得缺 shown 欄位' },
    ],
  },
  {
    code: 'EXP', name: '匯入、匯出與列印', goal: '資料出入不變形、權限正確、檔案可開', risk: '中',
    auto: 'CSV 權限、內容類型、BOM、列印頁',
    cases: [
      { id: 'EXP-01', title: 'CSV 匯出權限', p: 'P0', t: '權限', pre: 'office/accounting/front', steps: ['GET /export/customers.csv'], expect: '全部 403；只有 management 200' },
      { id: 'EXP-02', title: 'CSV 內容與編碼', p: 'P1', t: '資料', pre: 'management', steps: ['下載客戶 CSV', '以 Excel 開啟'], expect: 'text/csv; charset=utf-8；有 BOM；中文不亂碼；欄位與列表一致' },
      { id: 'EXP-03', title: 'CSV 注入防護', p: 'P1', t: '安全', pre: '客戶名以 = 開頭', steps: ['匯出並打開'], expect: '以 ="..." 或前置單引號轉義，不在 Excel 執行公式' },
      { id: 'EXP-04', title: '匯入校驗與回滾', p: 'P1', t: '異常', pre: 'office', steps: ['上傳缺必填/型別錯誤 CSV'], expect: '逐行報錯；整批不錯位；成功筆數與失敗筆數清楚' },
      { id: 'EXP-05', title: '列印版面', p: 'P2', t: 'UI', pre: '有單據', steps: ['列印報價/發票/排班'], expect: 'A4 不截斷；頁首頁尾正確；金額/日期格式一致' },
    ],
  },
  {
    code: 'DAT', name: '資料完整性與遷移品質', goal: '歷史資料可讀、可算、可改而不失真', risk: '高',
    auto: 'JSON 可解析、報價合計、發票餘額、分錄平衡、軟刪除欄位',
    cases: [
      { id: 'DAT-01', title: '全部記錄 JSON 可解析', p: 'P0', t: '資料', pre: '副本 DB', steps: ['掃描 records 全表', '逐筆 JSON.parse'], expect: '0 筆壞 JSON；若有，定位 entity/id 並阻斷上線' },
      { id: 'DAT-02', title: '報價合計與明細一致', p: 'P1', t: '資料', pre: '1,826 張報價', steps: ['抽樣 400 張重算', '比對 subtotal/total_amount'], expect: '差額 ≤ 0.02；歷史「表頭有金額、明細 0 價」需單獨列出並評估編輯風險' },
      { id: 'DAT-03', title: '發票餘額一致', p: 'P0', t: '資料', pre: '全部發票', steps: ['重算 total−paid', '比對 balance_due'], expect: '全部一致；已作廢按規則處理' },
      { id: 'DAT-04', title: '已過賬分錄借貸平衡', p: 'P0', t: '資料', pre: '全部交易', steps: ['篩 status≠草稿', '比對借貸總額'], expect: '差額 ≤ 0.01；不平衡不得存在' },
      { id: 'DAT-05', title: '軟刪除欄位完整', p: 'P1', t: '資料', pre: 'deleted=1 記錄', steps: ['檢查 deleted_at/deleted_by', '區分歷史匯入與近兩日操作'], expect: '新刪除必須有時間與操作人；歷史遺留單獨列帳' },
      { id: 'DAT-06', title: '重名關聯不猜（409）', p: 'P0', t: '資料', pre: '庫內重名客戶', steps: ['取一組同名客戶', '以 customer_name 提交、customer_id 留空', '再用不同名客戶提交'], expect: '同名多筆 → 409 並提示；不同名不攔截；不得把單據改掛到別人名下' },
    ],
  },
  {
    code: 'SEC', name: '安全專項', goal: '無越權、無注入、無泄露', risk: '極高',
    auto: 'XSS 轉義、IDOR、CSRF、Cookie、上傳路徑、錯誤頁泄露',
    cases: [
      { id: 'SEC-01', title: '存儲型 XSS', p: 'P0', t: '安全', pre: 'office', steps: ['客戶名填 <script>alert(1)</script>', '列表/詳情/列印查看'], expect: '全部輸出轉義為 &lt;script&gt;；無彈窗；列印同樣轉義' },
      { id: 'SEC-02', title: '越權 IDOR', p: 'P0', t: '安全', pre: 'front', steps: ['遍歷 /view/invoices/:id、/view/contracts/:id'], expect: '403；不得因知道 ID 而讀到金額/合約' },
      { id: 'SEC-03', title: '上傳路徑穿越', p: 'P0', t: '安全', pre: 'office', steps: ['上傳檔名 ../../evil.png', '檢查目標目錄'], expect: '檔名洗淨；寫入僅限 uploads/<entity>/<id>；不得逃逸' },
      { id: 'SEC-04', title: '上傳型別與大小', p: 'P1', t: '安全', pre: 'office', steps: ['上傳 .exe / 超大檔'], expect: '拒絕或隔離；不作為可執行內容提供；錯誤提示明確' },
      { id: 'SEC-05', title: '錯誤頁不泄露', p: 'P1', t: '安全', pre: '任意', steps: ['觸發 500（如壞參數）'], expect: '只顯示通用訊息；不含堆疊、SQL、絕對路徑' },
      { id: 'SEC-06', title: '登入枚舉', p: 'P1', t: '安全', pre: '登入頁', steps: ['不存在帳號 vs 存在帳號錯密碼'], expect: '提示一致；回應時間無明顯差異' },
      { id: 'SEC-07', title: '會話固定/併發', p: 'P1', t: '安全', pre: '登入前後', steps: ['記錄登入前 sid', '登入後比較；同帳號兩地登入'], expect: '登入後簽發新 sid；舊 sid 失效；併發策略明確' },
      { id: 'SEC-08', title: '敏感欄位遮罩', p: 'P1', t: '安全', pre: 'front', steps: ['查看車輛費用/庫存總值/客戶金額'], expect: '無金額權限者看到 •••••；不得在 HTML 註釋/JSON 中泄露原值' },
    ],
  },
  {
    code: 'PERF', name: '效能與容量', goal: '大數據量下頁面可用', risk: '高',
    auto: '四個重頁 TTFB、列表頁耗時',
    cases: [
      { id: 'PERF-01', title: '重頁首字節', p: 'P1', t: '效能', pre: '34k records', steps: ['GET /receivables /generalledger /inventory /schedules', '各測 3 次取中位'], expect: 'P95 < 3s；無 500；記憶體無持續增長' },
      { id: 'PERF-02', title: '列表分頁', p: 'P1', t: '效能', pre: '3,000+ 報價', steps: ['/quotations 首頁/末頁/每頁 50'], expect: '單頁 ≤ 50 行；翻頁 < 1.5s；總數正確' },
      { id: 'PERF-03', title: '搜尋響應', p: 'P2', t: '效能', pre: '1,600 客戶', steps: ['關鍵字搜尋 5 次'], expect: '每次 < 1s；結果穩定' },
      { id: 'PERF-04', title: '併發讀取', p: 'P2', t: '效能', pre: '10 個併發', steps: ['同時 GET 5 個重頁'], expect: '全部 200；無 SQLITE_BUSY；P95 < 5s' },
      { id: 'PERF-05', title: '寫入鎖等待', p: 'P2', t: '效能', pre: '兩個會話同時保存', steps: ['併發新增排班/報價'], expect: '皆成功或明確重試；不得丟資料/500' },
    ],
  },
  {
    code: 'UI', name: '介面與相容性', goal: '版面不漂移、彈窗可用、列印可讀', risk: '中',
    auto: '設計令牌、__id、HK$ 重複、pagehead、act-col',
    cases: [
      { id: 'UI-01', title: '側欄分組字級', p: 'P2', t: 'UI', pre: '任一頁', steps: ['檢查 .navgrp>summary 樣式'], expect: 'font-size 13px、font-weight 700；與次欄目同字號' },
      { id: 'UI-02', title: '表格操作列黏性', p: 'P2', t: 'UI', pre: '寬表格', steps: ['橫向捲動列表'], expect: '操作列固定右緣；不遮擋內容；表頭同步' },
      { id: 'UI-03', title: '金額格式', p: 'P1', t: 'UI', pre: '有金額頁', steps: ['檢查 KPI/表格/詳情'], expect: '只出現一次 HK$；千分位；空值為 —；不得 HK$ HK$' },
      { id: 'UI-04', title: '空狀態與日曆', p: 'P2', t: 'UI', pre: '無資料月份', steps: ['打開 /schedules 空月'], expect: '日曆格不被 empty 圖示撐高；顯示「暫無資料」' },
      { id: 'UI-05', title: '彈窗與選擇器', p: 'P1', t: 'UI', pre: '新增合約/補給', steps: ['開彈窗', '搜尋並選客戶/產品'], expect: '彈窗不裁切下拉；選中回填名稱與 ID；捲動清單不自動關閉' },
      { id: 'UI-06', title: '1366×768 與列印', p: 'P2', t: 'UI', pre: '1366 寬', steps: ['檢查 12 欄表格/側欄/頁首', 'Ctrl+P 預覽'], expect: '無水平溢出（表格內滾動）；列印隱藏導航與按鈕' },
    ],
  },
  {
    code: 'ANN', name: '公告發布與啟用狀態', goal: '公告發布後必出現在公告欄；複選框勾選可落庫', risk: '高',
    auto: 'ANN-01~04 已入 test.mjs「公告發布與公告欄可見性」分組',
    cases: [
      {
        id: 'ANN-01', title: '公告發布後出現在公告欄', p: 'P0', t: '資料',
        pre: '管理層登入、隔離副本',
        steps: ['POST /save/announcements，is_active 以 hidden "0" + 勾選 "1" 兩個同名參數送出', '讀 records 表確認 is_active', 'GET / 檢查公告欄'],
        expect: '落庫 is_active === true；首頁公告欄出現該標題。舊版此處落庫為 false，公告靜默消失',
      },
      {
        id: 'ANN-02', title: '未啟用公告不顯示', p: 'P1', t: '功能',
        pre: '同上',
        steps: ['POST /save/announcements，僅送出 is_active=0', 'GET / 檢查公告欄'],
        expect: '落庫 is_active === false；公告欄不含該標題（未啟用即草稿，屬預期行為）',
      },
      {
        id: 'ANN-03', title: '編輯頁切換啟用可保存', p: 'P1', t: '功能',
        pre: '已存在一筆未啟用公告',
        steps: ['GET /edit/announcements/:id 取 __expected_updated', 'POST /save/announcements 帶 is_active 兩個同名參數', 'GET / 檢查公告欄'],
        expect: '落庫轉為 true；公告欄出現。舊版編輯同樣存不進去，使用者會反覆嘗試仍無效',
      },
      {
        id: 'ANN-04', title: '用戶管理「啟用」勾選可保存', p: 'P1', t: '權限',
        pre: '管理層登入',
        steps: ['POST /users/save，active 以兩個同名參數送出', '查 users.active'],
        expect: 'users.active === 1。舊版 server.mjs 用 fields.active === \'1\' 比較陣列，恆為 false，帳號永遠無法啟用',
      },
    ],
  },
];

export const REQUIREMENTS = [
  { id: 'R-01', name: '四角色權限與菜單', source: 'NAV + assertEntity/assertRole', cases: ['PERM-01', 'PERM-02', 'PERM-03', 'PERM-04', 'PERM-05'] },
  { id: 'R-02', name: '報價→PO→合約→發票→收據主鏈', source: 'convertQuotation / collectReceipt', cases: ['QUO-05', 'QUO-06', 'INV-03', 'QUO-07'] },
  { id: 'R-03', name: '金額計算與編號', source: 'recalculate / defaultNumber', cases: ['QUO-01', 'QUO-02', 'PO-01', 'PO-03', 'INV-01', 'DN-01'] },
  { id: 'R-04', name: '庫存與盤點可逆', source: 'saveStockAdjustment / saveStockCount / reverseStockCount', cases: ['STK-02', 'STK-05', 'STK-06', 'STK-07', 'TRS-05'] },
  { id: 'R-05', name: '軟刪除與回收桶', source: 'store.softDelete / trashPage', cases: ['QUO-08', 'PO-05', 'CON-05', 'TRS-01', 'TRS-02', 'TRS-03'] },
  { id: 'R-06', name: '前線唯讀與自助', source: 'WORK_READ / ownsRecord', cases: ['SR-02', 'ATT-05', 'LV-02', 'SUP-01'] },
  { id: 'R-07', name: '數量整數化', source: 'assertIntegerQuantities', cases: ['SUP-02', 'STK-01', 'DN-02'] },
  { id: 'R-08', name: '匯出僅管理層', source: 'server /export/*', cases: ['EXP-01', 'EXP-02', 'EXP-03'] },
  { id: 'R-09', name: '送貨即時扣庫存且不可重複', source: 'saveDeliveryNote', cases: ['DN-02', 'DN-03', 'DN-04', 'DN-05'] },
  { id: 'R-10', name: 'CSRF/會話/上傳安全', source: 'bodyWithCsrf / saveUpload', cases: ['AUTH-03', 'AUTH-04', 'SEC-01', 'SEC-03', 'SEC-07'] },
  { id: 'R-11', name: 'UI 設計令牌與不變量', source: 'lib/ui.mjs 註釋與 CSS', cases: ['UI-01', 'UI-02', 'UI-03', 'UI-05'] },
  { id: 'R-12', name: '大數據量可用性', source: '實測 378/522 行頁面', cases: ['TXN-04', 'PERF-01', 'PERF-02'] },
];

// 五條主業務鏈（文件用）
export const CHAINS = [
  { id: 'C1', name: '銷售主鏈', nodes: ['線索 Lead', '報價 Quotation', '採購單 PO', '合約 Contract', '排班 Schedule', '服務報告 WorkRecord', '發票 Invoice', '收據 Receipt'], verify: '每一步外鍵與金額可反查；任一步刪除不破壞上下游' },
  { id: 'C2', name: '產品交付鏈', nodes: ['報價（產品）', 'PO', '送貨單 DN', '庫存扣減', '發票'], verify: '送達才扣庫存；重複送達不重扣；明細鎖定' },
  { id: 'C3', name: '庫存盤點鏈', nodes: ['產品', '庫存調整', '盤點單', '自動調整', '回收桶'], verify: '完成過賬、刪除沖銷、還原重過賬，三步數量閉環' },
  { id: 'C4', name: '前線作業鏈', nodes: ['我的工作', '打卡', '補給', '請假', '服務報告（唯讀）'], verify: '只能為本人建檔；不能審批；不能看金額' },
  { id: 'C5', name: '財務結算鏈', nodes: ['發票', '收款', '收據', '應收臺賬', '總帳'], verify: '餘額=總額−已付；借貸平衡；作廢不計入應收' },
];
