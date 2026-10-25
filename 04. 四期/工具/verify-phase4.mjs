import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = process.env.PHASE4_DIR || 'F:/04 STANDARD CPC SYSTEM/04. 四期';
const errors = [];
const manifest = fs.readFileSync(`${root}/檔案清單_SHA256.csv`, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
for (const line of manifest.slice(1)) {
  const match = line.match(/^"?([^",]+)"?,(\d+),([a-f0-9]{64})$/);
  if (!match) { errors.push(`清单格式：${line.slice(0, 80)}`); continue; }
  const [, relative, size, expected] = match;
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { errors.push(`缺文件：${relative}`); continue; }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected || fs.statSync(file).size !== Number(size)) errors.push(`哈希/大小不符：${relative}`);
}
for (const name of ['四期交接總覽.html', '完整系統交接與審查報告_v4.html']) {
  const html = fs.readFileSync(`${root}/${name}`, 'utf8');
  for (const href of [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])) {
    if (/^(https?:|mailto:|#|\/)/.test(href)) continue;
    const clean = decodeURIComponent(href.split('#')[0]);
    if (clean && !fs.existsSync(path.join(root, clean))) errors.push(`失效链接：${name} -> ${href}`);
  }
}
const db = new DatabaseSync(`${root}/系统代码/data.db`);
const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
const records = db.prepare('SELECT COUNT(*) c FROM records').get().c;
const testRecords = db.prepare("SELECT COUNT(*) c FROM records WHERE id LIKE 't_%'").get().c;
db.close();
if (integrity !== 'ok') errors.push(`数据库 integrity_check=${integrity}`);
if (records !== 34046) errors.push(`记录数=${records}`);
if (testRecords !== 0) errors.push(`正式库测试记录=${testRecords}`);
const retest = JSON.parse(fs.readFileSync(`${root}/驗收歷程/四期包復測結果.json`, 'utf8'));
if (retest.failed !== 0 || retest.passed !== 411) errors.push(`四期包复测=${retest.passed}/${retest.total}, failed=${retest.failed}`);
const rowCount = (file) => fs.readFileSync(`${root}/${file}`, 'utf8').split(/\r?\n/).filter(Boolean).length - 1;
if (rowCount('驗收歷程/歷史數據質量_負庫存.csv') !== 22) errors.push('负库存 CSV 行数不是 22');
if (rowCount('驗收歷程/歷史數據質量_未同步送貨單.csv') !== 98) errors.push('未同步送货单 CSV 行数不是 98');
console.log(JSON.stringify({ root, manifestRows: manifest.length - 1, integrity, records, testRecords, packageRetest: `${retest.passed}/${retest.total}`, errors }, null, 2));
if (errors.length) process.exit(1);
