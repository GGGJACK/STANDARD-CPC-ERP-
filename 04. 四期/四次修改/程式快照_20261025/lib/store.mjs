import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ENTITIES, ENTITY_BY_NAME } from './config.mjs';
import { hashPassword, hkNow, nowISO, parseCSV, safeFileName, str, uid } from './utils.mjs';

const SYSTEM_TABLES = new Set(['users', 'settings', 'quota', 'audit_log', 'notifications', 'holidays']);

export class Store {
  constructor(options) {
    this.dbPath = options.dbPath;
    this.dataDir = options.dataDir;
    this.attachmentDir = options.attachmentDir;
    this.uploadDir = options.uploadDir;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.mkdirSync(this.uploadDir, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.attachmentIndex = null;
    this.migrate();
    this.ensureUsers();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        entity TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_date TEXT,
        updated_date TEXT,
        PRIMARY KEY (entity, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_entity_deleted ON records(entity, deleted);
      CREATE INDEX IF NOT EXISTS idx_records_updated ON records(entity, updated_date);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT,
        pass_hash TEXT, active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS quota (
        user_id TEXT, day TEXT, used INTEGER DEFAULT 0, extra INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, day)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT, actor_name TEXT, actor_role TEXT, action TEXT,
        entity TEXT, record_id TEXT, record_label TEXT,
        fields_shown TEXT, masked_fields TEXT, ip TEXT, ua TEXT, via TEXT, at TEXT
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT, actor_name TEXT, message TEXT, detail TEXT, at TEXT, read INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE IF NOT EXISTS login_failures (
        key TEXT PRIMARY KEY, count INTEGER DEFAULT 0, locked_until TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS signatures (
        token TEXT PRIMARY KEY, entity TEXT NOT NULL, record_id TEXT NOT NULL,
        signer_name TEXT, signer_title TEXT, signature_data TEXT,
        signed_at TEXT, ip TEXT, ua TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_signatures_record ON signatures(entity, record_id);
    `);
    this.ensureColumn('users', 'employee_id', 'TEXT');
    this.ensureColumn('users', 'must_change', 'INTEGER DEFAULT 0');
    this.ensureColumn('users', 'avatar_url', 'TEXT');
    this.ensureColumn('users', 'accessible_pages', 'TEXT');
    const defaults = {
      quota_limit: '50', work_start: '08:30', work_end: '18:00', work_weekdays: '1,2,3,4,5',
      window_enforced: '0', quota_scope_roles: 'office', tz: 'Asia/Hong_Kong', demo_mode: '1',
    };
    const stmt = this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    for (const [key, value] of Object.entries(defaults)) stmt.run(key, value);
  }

  ensureColumn(table, column, definition) {
    if (!SYSTEM_TABLES.has(table)) throw new Error('invalid migration table');
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (!columns.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  ensureUsers() {
    if (this.db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
    const users = [
      ['u-mgmt', 'enjinggao36@gmail.com', '高恩靖', 'management'],
      ['u-office', 'office@demo.hk', '陳小美（辦公室）', 'office'],
      ['u-front', 'front@demo.hk', '盧力峰（前線）', 'front'],
      ['u-acc', 'acc@demo.hk', '李會計', 'accounting'],
    ];
    const stmt = this.db.prepare('INSERT INTO users(id,email,name,role,pass_hash,active,must_change) VALUES (?,?,?,?,?,1,0)');
    for (const [id, email, name, role] of users) stmt.run(id, email, name, role, hashPassword('demo1234'));
  }

  resolve(keyOrEntity) {
    const cfg = ENTITIES[keyOrEntity] || ENTITY_BY_NAME[keyOrEntity];
    if (!cfg) throw new Error(`未知實體：${keyOrEntity}`);
    return cfg;
  }

  importAll({ refresh = false, entities = null } = {}) {
    const report = [];
    const allowed = entities ? new Set(entities) : null;
    for (const cfg of Object.values(ENTITIES)) {
      if (allowed && !allowed.has(cfg.entity) && !allowed.has(cfg.key)) continue;
      const file = path.join(this.dataDir, `${cfg.entity}.json`);
      if (!fs.existsSync(file)) {
        report.push({ entity: cfg.entity, count: 0, imported: 0, status: 'no-source' });
        continue;
      }
      let rows;
      try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { report.push({ entity: cfg.entity, count: 0, imported: 0, status: error.message }); continue; }
      if (!Array.isArray(rows)) rows = [];
      let imported = 0;
      this.transaction(() => {
        const insert = this.db.prepare(`INSERT ${refresh ? 'OR REPLACE' : 'OR IGNORE'} INTO records
          (entity,id,data,deleted,created_date,updated_date) VALUES (?,?,?,?,?,?)`);
        for (const row of rows) {
          if (!row || !row.id) continue;
          const result = insert.run(cfg.entity, String(row.id), JSON.stringify(row), row.is_deleted === true ? 1 : 0,
            str(row.created_date), str(row.updated_date));
          imported += Number(result.changes || 0);
        }
      });
      report.push({ entity: cfg.entity, count: rows.length, imported, status: 'ok' });
    }
    return report;
  }

  count(keyOrEntity, { includeDeleted = false, onlyDeleted = false } = {}) {
    const cfg = this.resolve(keyOrEntity);
    const clause = onlyDeleted ? 'deleted=1' : includeDeleted ? '1=1' : 'deleted=0';
    return this.db.prepare(`SELECT COUNT(*) c FROM records WHERE entity=? AND ${clause}`).get(cfg.entity).c;
  }

  get(keyOrEntity, id, { includeDeleted = true } = {}) {
    const cfg = this.resolve(keyOrEntity);
    const row = this.db.prepare(`SELECT data,deleted FROM records WHERE entity=? AND id=? ${includeDeleted ? '' : 'AND deleted=0'}`).get(cfg.entity, String(id));
    if (!row) return null;
    const data = JSON.parse(row.data);
    Object.defineProperty(data, '__deleted', { value: !!row.deleted, enumerable: false, configurable: true });
    return data;
  }

  list(keyOrEntity, { includeDeleted = false, onlyDeleted = false, month = null, date = null } = {}) {
    const cfg = this.resolve(keyOrEntity);
    const clauses = ['entity=?'];
    const args = [cfg.entity];
    if (onlyDeleted) clauses.push('deleted=1');
    else if (!includeDeleted) clauses.push('deleted=0');
    if (month && cfg.dateField && /^[A-Za-z0-9_]+$/.test(cfg.dateField)) {
      clauses.push(`json_extract(data,'$.${cfg.dateField}') LIKE ?`);
      args.push(`${month}%`);
    }
    if (date && cfg.dateField && /^[A-Za-z0-9_]+$/.test(cfg.dateField)) {
      clauses.push(`json_extract(data,'$.${cfg.dateField}') = ?`);
      args.push(date);
    }
    const rows = this.db.prepare(`SELECT data,deleted FROM records WHERE ${clauses.join(' AND ')}`).all(...args);
    return rows.map((row) => {
      const data = JSON.parse(row.data);
      Object.defineProperty(data, '__deleted', { value: !!row.deleted, enumerable: false, configurable: true });
      return data;
    });
  }

  save(keyOrEntity, data, { id = null, user = null, expectedUpdated = null } = {}) {
    const cfg = this.resolve(keyOrEntity);
    const recordId = String(id || data.id || uid(cfg.key.slice(0, 3)));
    const previous = this.get(cfg.key, recordId);
    if (previous && expectedUpdated && previous.updated_date !== expectedUpdated) {
      const error = new Error('記錄已被其他人更新，請重新載入後再儲存');
      error.statusCode = 409;
      throw error;
    }
    const timestamp = nowISO();
    const output = { ...(previous || {}), ...data, id: recordId };
    if (data._draft === false) delete output._draft;
    if (!previous && !output.created_date) output.created_date = timestamp;
    output.updated_date = timestamp;
    if (user) {
      if (!previous && !output.created_by) output.created_by = user.email;
      if (!previous && !output.created_by_id) output.created_by_id = user.id;
    }
    if (output.is_deleted !== undefined) output.is_deleted = output.is_deleted === true;
    const deleted = output.is_deleted === true || previous?.__deleted ? 1 : 0;
    this.db.prepare(`INSERT INTO records(entity,id,data,deleted,created_date,updated_date) VALUES (?,?,?,?,?,?)
      ON CONFLICT(entity,id) DO UPDATE SET data=excluded.data,deleted=excluded.deleted,created_date=excluded.created_date,updated_date=excluded.updated_date`)
      .run(cfg.entity, recordId, JSON.stringify(output), deleted, str(output.created_date), timestamp);
    return this.get(cfg.key, recordId);
  }

  setDeleted(keyOrEntity, id, deleted, user = null) {
    const cfg = this.resolve(keyOrEntity);
    const row = this.get(cfg.key, id);
    if (!row) return null;
    if (cfg.softDelete) row.is_deleted = !!deleted;
    const output = { ...row };
    delete output.is_deleted;
    if (cfg.softDelete) output.is_deleted = !!deleted;
    const timestamp = nowISO();
    output.updated_date = timestamp;
    // 回收桶要顯示「回收時間／操作人」，還原時清空，避免歷史資料誤讀
    if (deleted) {
      output.deleted_at = hkNow().full;
      output.deleted_by = user?.name || user?.email || '';
      output.deleted_by_id = user?.id || '';
    } else {
      delete output.deleted_at;
      delete output.deleted_by;
      delete output.deleted_by_id;
    }
    this.db.prepare('UPDATE records SET data=?,deleted=?,updated_date=? WHERE entity=? AND id=?')
      .run(JSON.stringify(output), deleted ? 1 : 0, timestamp, cfg.entity, String(id));
    if (user) this.audit({ user, action: deleted ? 'trash' : 'restore', entity: cfg.entity, id, label: output[cfg.labelField], via: 'record' });
    return this.get(cfg.key, id);
  }

  // 永久刪除：只允許回收桶內（deleted=1）的記錄，避免誤刪仍在用的資料
  purge(keyOrEntity, id, user = null) {
    const cfg = this.resolve(keyOrEntity);
    const row = this.get(cfg.key, id);
    if (!row) return false;
    if (!row.__deleted) {
      const error = new Error('只能永久刪除回收桶內的記錄');
      error.statusCode = 409;
      throw error;
    }
    this.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run(cfg.entity, String(id));
    if (user) this.audit({ user, action: 'purge', entity: cfg.entity, id, label: row[cfg.labelField], via: 'trash' });
    return true;
  }

  // 回收桶清單：跨實體聚合，帶回收時間，供 /trash 使用
  trashRows(keys = null) {
    const targets = (keys && keys.length ? keys : Object.keys(ENTITIES))
      .map((key) => ENTITIES[key])
      .filter((cfg) => cfg && cfg.softDelete);
    const rows = [];
    for (const cfg of targets) {
      for (const row of this.list(cfg.key, { onlyDeleted: true })) {
        if (row._draft) continue;
        rows.push({ ...row, __entity: cfg.key, __entityLabel: cfg.plural, __trashTitle: cfg.title });
      }
    }
    return rows.sort((a, b) => str(b.deleted_at || b.updated_date).localeCompare(str(a.deleted_at || a.updated_date)));
  }

  transaction(callback) {
    if (this.db.isTransaction) return callback();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  setting(key, fallback = '') {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? row.value : fallback;
  }

  setSetting(key, value) {
    this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, str(value));
  }

  userByEmail(email) {
    return this.db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(str(email).trim());
  }

  userById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }

  users() {
    return this.db.prepare('SELECT id,email,name,role,active,must_change,employee_id,avatar_url,accessible_pages FROM users ORDER BY role,name').all();
  }

  saveUser(data) {
    const id = data.id || uid('u');
    const existing = this.userById(id);
    const values = [data.email, data.name, data.role, data.employee_id || '', data.active === false ? 0 : 1, data.must_change ? 1 : 0, data.avatar_url || '', data.accessible_pages || '', id];
    if (existing) {
      this.db.prepare('UPDATE users SET email=?,name=?,role=?,employee_id=?,active=?,must_change=?,avatar_url=?,accessible_pages=? WHERE id=?').run(...values);
      if (data.password) this.db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(data.password), id);
    } else {
      this.db.prepare('INSERT INTO users(email,name,role,employee_id,active,must_change,avatar_url,accessible_pages,id,pass_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(...values, hashPassword(data.password || uid('pw')));
    }
    return this.userById(id);
  }

  setPassword(id, password, mustChange = false) {
    this.db.prepare('UPDATE users SET pass_hash=?,must_change=? WHERE id=?').run(hashPassword(password), mustChange ? 1 : 0, id);
  }

  loginFailure(key) {
    return this.db.prepare('SELECT * FROM login_failures WHERE key=?').get(key);
  }

  recordLoginFailure(key) {
    const current = this.loginFailure(key);
    const count = Number(current?.count || 0) + 1;
    const locked = count >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : '';
    this.db.prepare(`INSERT INTO login_failures(key,count,locked_until,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET count=excluded.count,locked_until=excluded.locked_until,updated_at=excluded.updated_at`)
      .run(key, count, locked, nowISO());
    return { count, locked_until: locked };
  }

  clearLoginFailures(key) {
    this.db.prepare('DELETE FROM login_failures WHERE key=?').run(key);
  }

  quota(userId, day = hkNow().date) {
    let row = this.db.prepare('SELECT * FROM quota WHERE user_id=? AND day=?').get(userId, day);
    if (!row) {
      this.db.prepare('INSERT INTO quota(user_id,day,used,extra) VALUES (?,?,0,0)').run(userId, day);
      row = { user_id: userId, day, used: 0, extra: 0 };
    }
    return row;
  }

  audit({ user = null, action, entity, id = '', label = '', shown = '', masked = '', via = '', req = null }) {
    this.db.prepare(`INSERT INTO audit_log
      (actor_id,actor_name,actor_role,action,entity,record_id,record_label,fields_shown,masked_fields,ip,ua,via,at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      user?.id || 'public', user?.name || '公開訪客', user?.role || 'public', action, entity, String(id), str(label), shown, masked,
      str(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim(),
      str(req?.headers?.['user-agent']).slice(0, 500), via, hkNow().full,
    );
  }

  notify(message, detail = '', kind = 'system') {
    this.db.prepare('INSERT INTO notifications(kind,actor_name,message,detail,at,read) VALUES (?,?,?,?,?,0)')
      .run(kind, '', message, detail, hkNow().full);
  }

  nextNumber(keyOrEntity, field, prefix, year, width = 4) {
    const cfg = this.resolve(keyOrEntity);
    const start = `${prefix}${year}`;
    const values = this.list(cfg.key, { includeDeleted: true }).map((r) => str(r[field])).filter((v) => v.startsWith(start));
    let max = 0;
    for (const value of values) {
      const n = Number(value.slice(start.length).replace(/\D.*$/, ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${start}${String(max + 1).padStart(width, '0')}`;
  }

  createSignature({ entity, recordId }) {
    const value = uid('sign') + crypto.randomBytes(18).toString('base64url');
    this.db.prepare('INSERT INTO signatures(token,entity,record_id) VALUES (?,?,?)').run(value, entity, recordId);
    return value;
  }

  signature(token) {
    return this.db.prepare('SELECT * FROM signatures WHERE token=?').get(token);
  }

  sign(tokenValue, data, req) {
    this.db.prepare(`UPDATE signatures SET signer_name=?,signer_title=?,signature_data=?,signed_at=?,ip=?,ua=? WHERE token=?`)
      .run(data.signer_name, data.signer_title || '', data.signature_data, nowISO(),
        str(req.socket.remoteAddress), str(req.headers['user-agent']).slice(0, 500), tokenValue);
    return this.signature(tokenValue);
  }

  loadAttachmentIndex() {
    if (this.attachmentIndex) return this.attachmentIndex;
    this.attachmentIndex = new Map();
    const file = path.join(this.attachmentDir, '_附件索引.csv');
    if (fs.existsSync(file)) {
      const rows = parseCSV(fs.readFileSync(file, 'utf8'));
      const header = rows[0] || [];
      const at = (name) => header.indexOf(name);
      for (const row of rows.slice(1)) {
        const url = row[at('原始URL')];
        const local = row[at('本地路徑')];
        if (url && local && !this.attachmentIndex.has(url)) this.attachmentIndex.set(url, local.replace(/\\/g, '/'));
      }
    }
    return this.attachmentIndex;
  }

  resolveAttachment(url) {
    const source = str(url);
    if (!source || source.startsWith('/uploads/')) return null;
    const local = this.loadAttachmentIndex().get(source);
    if (!local) return null;
    const root = path.resolve(this.attachmentDir);
    const resolved = path.resolve(root, local);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return resolved;
  }

  resolveUpload(urlPath) {
    const root = path.resolve(this.uploadDir);
    let relative;
    try { relative = decodeURIComponent(str(urlPath).replace(/^\/uploads\//, '')); } catch { return null; }
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return resolved;
  }

  saveUpload({ keyOrEntity, id, field, file, user }) {
    const cfg = this.resolve(keyOrEntity);
    const fieldCfg = cfg.fields.find((f) => f.name === field && f.type === 'files');
    if (!fieldCfg) throw new Error('此欄位不允許上傳');
    if (!file?.data?.length) throw new Error('沒有收到檔案');
    if (file.data.length > 20 * 1024 * 1024) throw new Error('單一檔案不可超過 20 MB');
    const filename = safeFileName(file.filename);
    const ext = path.extname(filename).toLowerCase();
    const allowed = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.csv', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.zip']);
    if (!allowed.has(ext)) throw new Error('不支援的檔案類型');
    const record = this.get(cfg.key, id);
    if (!record) throw new Error('請先建立記錄再上傳');
    const relative = path.join(cfg.entity, String(id), field, `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${filename}`);
    const destination = path.resolve(this.uploadDir, relative);
    const root = path.resolve(this.uploadDir);
    if (!destination.startsWith(root + path.sep)) throw new Error('無效路徑');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.data, { flag: 'wx' });
    const publicPath = '/uploads/' + relative.split(path.sep).map(encodeURIComponent).join('/');
    const meta = {
      file_name: filename, file_url: publicPath, content_type: file.contentType || 'application/octet-stream',
      size: file.data.length, uploaded_date: nowISO(), uploaded_by: user?.email || '',
    };
    const existing = Array.isArray(record[field]) ? record[field] : record[field] ? [record[field]] : [];
    record[field] = [...existing, meta];
    this.save(cfg.key, record, { id, user });
    this.audit({ user, action: 'upload', entity: cfg.entity, id, label: filename, via: 'attachment' });
    return meta;
  }

  counts() {
    return Object.values(ENTITIES).map((cfg) => ({
      entity: cfg.entity,
      active: this.count(cfg.key),
      deleted: this.count(cfg.key, { onlyDeleted: true }),
      total: this.count(cfg.key, { includeDeleted: true }),
    }));
  }

  close() {
    this.db.close();
  }
}
