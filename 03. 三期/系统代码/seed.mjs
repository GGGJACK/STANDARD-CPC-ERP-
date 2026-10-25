import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(ROOT, 'data.db');
const DATA_DIR = process.env.CPC_DATA_DIR || 'F:/03 Standard CPC DataBase/02. 数据导出/json';
const ATTACHMENT_DIR = process.env.CPC_ATTACHMENT_DIR || 'F:/03 Standard CPC DataBase/03. 附件';
const UPLOAD_DIR = process.env.CPC_UPLOAD_DIR || path.join(ROOT, 'uploads');
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('用法：node seed.mjs [Entity 名稱…]');
  console.log('默认先备份，再以 INSERT OR IGNORE 补齐原始记录；不会删除或覆盖现有业务修改。');
  console.log('例：node seed.mjs Customer Quotation');
  process.exit(0);
}

const store = new Store({ dbPath: DB_PATH, dataDir: DATA_DIR, attachmentDir: ATTACHMENT_DIR, uploadDir: UPLOAD_DIR });
try {
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(ROOT, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `data-before-seed-${stamp}.db`);
  fs.copyFileSync(DB_PATH, backup);
  console.log(`備份完成：${backup}`);
  const report = store.importAll({ entities: only.length ? only : null });
  for (const row of report) console.log(`${row.entity.padEnd(24)} 原始 ${String(row.count).padStart(6)} · 新增 ${String(row.imported).padStart(6)} · ${row.status}`);
  const total = store.counts().reduce((sum, row) => sum + row.total, 0);
  console.log(`完成。目前原始記錄共 ${total.toLocaleString()} 筆；現有修改未被覆蓋。`);
} finally {
  store.close();
}
