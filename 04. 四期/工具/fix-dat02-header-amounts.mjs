// DAT-02 一次性核對／標記：歷史報價「只有表頭金額、明細 0 價或缺明細」
//
// 背景：1826 張報價裡有 22 張是舊系統匯入的，明細單價是 0 或根本沒有明細行，
// 金額只存在表頭 total_amount。修復後的重算邏輯會把「明細合計」寫回 total_amount，
// 若不先標記口徑，這 22 張打開再保存就會歸零。
//
// 用法：
//   node "04. 四期/工具/fix-dat02-header-amounts.mjs"                  乾跑，只出報表
//   node "04. 四期/工具/fix-dat02-header-amounts.mjs" --apply          寫入 amount_source='header'
//   node "04. 四期/工具/fix-dat02-header-amounts.mjs" --db <path> --out <dir>
//
// 乾跑與寫入都只碰 quotations；寫入走 store.save（會更新 updated_date 並寫審計），
// 不動任何金額欄位。

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const valueOf = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const apply = argv.includes('--apply');
const DB_PATH = path.resolve(valueOf('--db', path.join(ROOT, '04. 四期/系统代码/data.db')));
const OUT_DIR = path.resolve(valueOf('--out', path.join(ROOT, '04. 四期/五次修改_20261028')));
const EPS = 0.02;

const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const itemsOf = (row) => (Array.isArray(row.items) ? row.items : []);
const itemsTotal = (row) => itemsOf(row).reduce((sum, item) => sum + (Number(item.total) || num(item.quantity) * num(item.unit_price) - num(item.discount)), 0);
const pricedLines = (row) => itemsOf(row).filter((item) => num(item.unit_price) > 0 || num(item.total) > 0).length;
// 報價口徑是 total = 明細 + 運費 − 折扣，比對時不能只看明細合計，否則帶運費的正常單會被誤判。
const expectedTotal = (row) => itemsTotal(row) + num(row.freight_charges) - num(row.discount);

// 判定條件：表頭有金額，但明細對不上（空明細 / 全 0 價 / 差額 > 0.02），且尚未標記口徑
function isSuspect(row) {
  if (row.amount_source === 'header') return false;
  const total = num(row.total_amount);
  if (!(total > 0)) return false;
  const lines = pricedLines(row);
  const diff = expectedTotal(row) - total;
  return lines === 0 || Math.abs(diff) > EPS;
}

function scan() {
  const db = new DatabaseSync(DB_PATH);
  const rows = db.prepare("SELECT id, data, deleted FROM records WHERE entity='Quotation'").all()
    .map((r) => ({ id: r.id, deleted: !!r.deleted, ...JSON.parse(r.data) }));
  db.close();
  return { rows, suspects: rows.filter((row) => !row.deleted && isSuspect(row)) };
}

const { rows, suspects } = scan();
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const csv = [
  ['缺陷', '報價編號', '客戶', '報價日期', '表頭金額', '明細合計', '明細行數', '有價行數', '差額', '處置'].map(csvCell).join(','),
  ...suspects.map((row) => [
    'DAT-02', row.quotation_number || row.id, row.customer_name || '', row.document_date || '',
    num(row.total_amount).toFixed(2), itemsTotal(row).toFixed(2), itemsOf(row).length, pricedLines(row),
    (expectedTotal(row) - num(row.total_amount)).toFixed(2), apply ? '已標記 amount_source=header' : '待標記（乾跑）',
  ].map(csvCell).join(',')),
].join('\r\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
const csvPath = path.join(OUT_DIR, `DAT-02_歷史報價核對_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`);
fs.writeFileSync(csvPath, `\uFEFF${csv}`, 'utf8');

console.log(`資料庫：${DB_PATH}`);
console.log(`報價總數 ${rows.length}，命中 ${suspects.length} 張（表頭有金額、明細對不上）`);
for (const row of suspects.slice(0, 25)) {
  console.log(`  ${(row.quotation_number || row.id).padEnd(18)} 表頭 ${num(row.total_amount).toFixed(2).padStart(9)}  明細 ${itemsTotal(row).toFixed(2).padStart(9)}  ${itemsOf(row).length} 行`);
}
console.log(`報表：${csvPath}`);

if (!apply) {
  console.log('\n乾跑結束，未寫入。確認清單無誤後加 --apply 寫入 amount_source=header。');
} else {
  // Windows 下不能用檔案路徑直接 import（ERR_UNSUPPORTED_ESM_URL_SCHEME），要轉成 file:// URL
  const { Store } = await import(pathToFileURL(path.join(ROOT, '04. 四期/系统代码/lib/store.mjs')).href);
  const store = new Store({ dbPath: DB_PATH, dataDir: '', attachmentDir: '', uploadDir: path.join(OUT_DIR, '_tmp_uploads') });
  const user = { id: 'system', email: 'system@cpc.local', name: 'DAT-02 修復腳本', role: 'management' };
  let changed = 0;
  for (const suspect of suspects) {
    const row = store.get('quotations', suspect.id);
    if (!row) continue;
    row.amount_source = 'header';
    row.amount_source_note = `DAT-02 ${new Date().toISOString().slice(0, 10)}：歷史匯入僅有表頭金額（明細合計 ${itemsTotal(row).toFixed(2)}），標記為表頭口徑`;
    store.save('quotations', row, { id: row.id, user });
    store.audit({ user, action: 'tag-amount-source', entity: 'Quotation', id: row.id, label: row.quotation_number, shown: `header=${num(row.total_amount)};items=${itemsTotal(row)}`, via: 'dat02-script' });
    changed += 1;
  }
  store.db.close();
  console.log(`\n已標記 ${changed} 張。金額欄位未改動，只加了口徑標記與審計。`);
}
