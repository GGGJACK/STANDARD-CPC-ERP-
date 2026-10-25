import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SRC = 'F:/03 Standard CPC DataBase/02. 数据导出/json';
const HOL = 'F:/03 Standard CPC DataBase/04. 設定/hk_holidays.json';
const DB = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/system/data.db';

fs.mkdirSync(path.dirname(DB), { recursive: true });
for (const f of [DB, DB + '-wal', DB + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);

const db = new DatabaseSync(DB);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT,
  pass_hash TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE customers (
  id TEXT PRIMARY KEY, code TEXT, name TEXT, name_en TEXT, type TEXT,
  main_customer TEXT, contact TEXT, phone TEXT, fax TEXT, email TEXT,
  address TEXT, notes TEXT
);
CREATE TABLE quotations (
  id TEXT PRIMARY KEY, number TEXT, name TEXT, customer_id TEXT, customer_name TEXT,
  qtype TEXT, work_content TEXT, subtotal REAL, total REAL, doc_date TEXT, stage TEXT
);
CREATE TABLE quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quotation_id TEXT, item_name TEXT,
  quantity REAL, unit TEXT, unit_price REAL, amount REAL
);
CREATE TABLE products (
  id TEXT PRIMARY KEY, code TEXT, name TEXT, category TEXT,
  retail_price REAL, cost_price REAL, stock REAL, packing TEXT
);
CREATE TABLE holidays (date TEXT PRIMARY KEY, name TEXT);
CREATE TABLE quota (user_id TEXT, day TEXT, used INTEGER, extra INTEGER DEFAULT 0, PRIMARY KEY (user_id, day));
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, actor_name TEXT, actor_role TEXT,
  action TEXT, entity TEXT, record_id TEXT, record_label TEXT,
  fields_shown TEXT, masked_fields TEXT, ip TEXT, ua TEXT, via TEXT, at TEXT
);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, actor_name TEXT, message TEXT,
  detail TEXT, at TEXT, read INTEGER DEFAULT 0
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE contracts (
  id TEXT PRIMARY KEY, number TEXT, name TEXT, quotation_id TEXT, quotation_number TEXT,
  customer_id TEXT, customer_name TEXT, work_content TEXT, work_location TEXT,
  start_date TEXT, end_date TEXT, total REAL, status TEXT, po_number TEXT, payment_terms TEXT
);
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, number TEXT, itype TEXT, date TEXT, due_date TEXT,
  quotation_id TEXT, quotation_number TEXT, contract_id TEXT,
  customer_id TEXT, customer_name TEXT, address TEXT, tel TEXT, contact TEXT, po_number TEXT,
  subtotal REAL, freight REAL, total REAL, paid REAL, balance REAL,
  payment_terms TEXT, status TEXT, remarks TEXT
);
CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT, code TEXT, name TEXT,
  description TEXT, quantity REAL, unit TEXT, unit_price REAL, amount REAL
);
CREATE TABLE receipts (
  id TEXT PRIMARY KEY, number TEXT, date TEXT, invoice_id TEXT, invoice_number TEXT,
  customer_name TEXT, total REAL, method TEXT, cheque_no TEXT, bank TEXT, notes TEXT
);
`);

const rd = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const now = () => new Date().toISOString();
const s = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('、');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

function hash(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}

const users = [
  ['u-mgmt', 'enjinggao36@gmail.com', '高恩靖', 'management'],
  ['u-office', 'office@demo.hk', '陳小美（辦公室）', 'office'],
  ['u-front', 'front@demo.hk', '盧力峰（前線）', 'front'],
  ['u-acc', 'acc@demo.hk', '李會計', 'accounting'],
];
const insU = db.prepare('INSERT INTO users (id,email,name,role,pass_hash,active) VALUES (?,?,?,?,?,1)');
for (const [id, mail, name, role] of users) insU.run(id, mail, name, role, hash('demo1234'));

const insC = db.prepare(`INSERT INTO customers (id,code,name,name_en,type,main_customer,contact,phone,fax,email,address,notes)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const c of rd('Customer.json')) {
  insC.run(s(c.id), s(c.customer_code), s(c.customer_name), s(c.customer_name_en),
    s(c.customer_type), s(c.main_customer), s(c.contact_person), s(c.phone),
    s(c.fax), s(c.email), s(c.service_address || c.delivery_address), s(c.notes));
}

const insQ = db.prepare(`INSERT INTO quotations (id,number,name,customer_id,customer_name,qtype,work_content,subtotal,total,doc_date,stage)
VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insI = db.prepare(`INSERT INTO quotation_items (quotation_id,item_name,quantity,unit,unit_price,amount) VALUES (?,?,?,?,?,?)`);
let qn = 0, in_ = 0;
for (const q of rd('Quotation.json')) {
  insQ.run(s(q.id), s(q.quotation_number), s(q.quotation_name), s(q.customer_id),
    s(q.customer_name), s(q.quotation_type), s(q.work_content),
    n(q.subtotal), n(q.total_amount), s(q.document_date), s(q.stage));
  qn++;
  for (const it of q.items || []) {
    insI.run(s(q.id), s(it.item_name), n(it.quantity), s(it.unit), n(it.unit_price), n(it.total));
    in_++;
  }
}

const insP = db.prepare('INSERT INTO products (id,code,name,category,retail_price,cost_price,stock,packing) VALUES (?,?,?,?,?,?,?,?)');
for (const p of rd('Product.json')) {
  insP.run(s(p.id), s(p.product_code), s(p.product_name), s(p.category),
    n(p.standard_retail_price), n(p.cost_price), n(p.stock_quantity), s(p.packing));
}

const hol = JSON.parse(fs.readFileSync(HOL, 'utf8'));
const insH = db.prepare('INSERT OR REPLACE INTO holidays (date,name) VALUES (?,?)');
let hn = 0;
for (const y of Object.keys(hol.years)) for (const h of hol.years[y]) { insH.run(h.date, h.name); hn++; }

const setS = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
setS.run('quota_limit', '50');
setS.run('work_start', '08:30');
setS.run('work_end', '18:00');
setS.run('work_weekdays', '1,2,3,4,5');
setS.run('quota_scope_roles', 'office');
setS.run('tz', 'Asia/Hong_Kong');
setS.run('holiday_source', hol._source || '');


const insCT = db.prepare(`INSERT INTO contracts (id,number,name,quotation_id,quotation_number,customer_id,customer_name,
  work_content,work_location,start_date,end_date,total,status,po_number,payment_terms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const c of rd('Contract.json')) {
  insCT.run(s(c.id), s(c.contract_number), s(c.contract_name), s(c.quotation_id), s(c.quotation_number),
    s(c.customer_id), s(c.customer_name), s(c.work_content), s(c.work_location),
    s(c.contract_start_date), s(c.contract_end_date), n(c.total_amount), s(c.contract_status),
    s(c.po_number), s(c.payment_terms));
}

const insIV = db.prepare(`INSERT INTO invoices (id,number,itype,date,due_date,quotation_id,quotation_number,contract_id,
  customer_id,customer_name,address,tel,contact,po_number,subtotal,freight,total,paid,balance,payment_terms,status,remarks)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insIVI = db.prepare(`INSERT INTO invoice_items (invoice_id,code,name,description,quantity,unit,unit_price,amount)
  VALUES (?,?,?,?,?,?,?,?)`);
let ivn = 0, ivi = 0;
for (const v of rd('Invoice.json')) {
  insIV.run(s(v.id), s(v.invoice_number), s(v.invoice_type), s(v.invoice_date), s(v.due_date),
    s(v.quotation_id), s(v.quotation_number), '',
    s(v.customer_id), s(v.customer_name).trim(), s(v.customer_address), s(v.customer_tel), s(v.contact_person),
    s(v.po_number), n(v.subtotal), n(v.freight_charges), n(v.total_amount), n(v.paid_amount), n(v.balance_due),
    s(v.payment_terms), s(v.status), s(v.remarks));
  ivn++;
  for (const it of v.items || []) {
    insIVI.run(s(v.id), s(it.item_code), s(it.item_name), s(it.description), n(it.quantity), s(it.unit),
      n(it.unit_price), n(it.total ?? it.amount));
    ivi++;
  }
}

const insRC = db.prepare(`INSERT INTO receipts (id,number,date,invoice_id,invoice_number,customer_name,total,method,cheque_no,bank,notes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
let rcn = 0;
for (const r of rd('Receipt.json')) {
  insRC.run(s(r.id), s(r.receipt_number), s(r.receipt_date), s(r.invoice_id), s(r.invoice_number),
    s(r.customer_name), n(r.total_amount), s(r.payment_method), s(r.cheque_number), s(r.bank_name), s(r.notes));
  rcn++;
}

const c1 = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
const c2 = db.prepare('SELECT COUNT(*) c FROM quotations').get().c;
const c3 = db.prepare('SELECT COUNT(*) c FROM products').get().c;
const c4 = db.prepare('SELECT COUNT(*) c FROM contracts').get().c;
const c5 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
const c6 = db.prepare('SELECT COUNT(*) c FROM receipts').get().c;
console.log(`種子完成：客戶 ${c1} / 報價單 ${c2}（明細 ${in_}）/ 合約 ${c4} / 發票 ${c5}（明細 ${ivi}）/ 收據 ${c6} / 產品 ${c3} / 假期 ${hn} / 用戶 ${users.length}`);
db.close();
