import crypto from 'node:crypto';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const money = (value, currency = 'HK$') => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return esc(value);
  return `${currency} ${n.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// 數量類欄位一律整數：瓶、包、支、件沒有「半個」。
// 只認這幾個欄名，避免誤傷 quantity_before / quantity_after 這類由庫存推算的中間值
// （歷史資料裡仍有小數庫存，硬性取整會讓舊記錄無法儲存）。
export const INTEGER_FIELD_NAMES = /^(quantity|qty|stock_quantity|quantity_change)$/;
export const isIntegerField = (field) => field?.integer === true
  || (field?.integer !== false && INTEGER_FIELD_NAMES.test(String(field?.name || field?.key || '')));

export const num = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const bool = (value) => value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes';
export const arr = (value) => Array.isArray(value) ? value : [];
export const str = (value) => value === null || value === undefined ? '' : String(value);
export const uid = (prefix = 'r') => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
export const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const nowISO = () => new Date().toISOString();

export function hkNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return {
    date: day,
    month: day.slice(0, 7),
    hm: `${get('hour')}:${get('minute')}`,
    full: `${day} ${get('hour')}:${get('minute')}:${get('second')}`,
    weekday: weekdays[get('weekday')],
  };
}

export function displayDate(value) {
  if (!value) return '—';
  return esc(String(value).slice(0, 10));
}

export function nl2br(value) {
  return esc(value).replace(/\r?\n/g, '<br>');
}

export function plain(value) {
  return str(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeHtml(input) {
  const allowed = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'hr']);
  const voidTags = new Set(['br', 'img', 'hr']);
  let source = str(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)[^>]*\/?>/gi, '');
  source = source.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (whole, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return esc(whole);
    const closing = /^<\s*\//.test(whole);
    if (closing) return voidTags.has(tag) ? '' : `</${tag}>`;
    const attrs = [];
    if (tag === 'a') {
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
      const url = href?.[1] ?? href?.[2] ?? href?.[3] ?? '';
      if (/^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(url)) attrs.push(`href="${esc(url)}"`, 'target="_blank"', 'rel="noopener noreferrer nofollow"');
    }
    if (tag === 'img') {
      const src = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
      const alt = /alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
      const url = src?.[1] ?? src?.[2] ?? src?.[3] ?? '';
      if (/^(\/attachment\?|\/uploads\/|https?:\/\/)/i.test(url)) attrs.push(`src="${esc(url)}"`);
      if (alt) attrs.push(`alt="${esc(alt[1] ?? alt[2] ?? alt[3] ?? '')}"`);
      attrs.push('loading="lazy"', 'style="max-width:100%;height:auto"');
    }
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${voidTags.has(tag) ? ' /' : ''}>`;
  });
  return source;
}

export function parseCookies(req) {
  const out = {};
  for (const part of str(req.headers.cookie).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readRawBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('提交內容超過 32 MB 上限');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(raw, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return { fields: {}, files: {} };
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const fields = {};
  const files = {};
  let cursor = raw.indexOf(boundary);
  while (cursor >= 0) {
    const start = cursor + boundary.length;
    if (raw.slice(start, start + 2).toString() === '--') break;
    const next = raw.indexOf(boundary, start);
    if (next < 0) break;
    let part = raw.slice(start, next);
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > 0) {
      const header = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const name = /name="([^"]+)"/i.exec(header)?.[1];
      const filename = /filename="([^"]*)"/i.exec(header)?.[1];
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(header)?.[1] || 'application/octet-stream';
      if (name && filename !== undefined) {
        if (filename) files[name] = { filename: safeFileName(filename), contentType: type.trim(), data: content };
      } else if (name) {
        fields[name] = content.toString('utf8');
      }
    }
    cursor = next;
  }
  return { fields, files };
}

export async function parseBody(req, limit) {
  const raw = await readRawBody(req, limit);
  const type = str(req.headers['content-type']).toLowerCase();
  if (type.startsWith('multipart/form-data')) return { ...parseMultipart(raw, req.headers['content-type']), raw };
  if (type.startsWith('application/json')) {
    let fields = {};
    try { fields = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { fields = {}; }
    return { fields, files: {}, raw };
  }
  const params = new URLSearchParams(raw.toString('utf8'));
  const fields = {};
  for (const [key, value] of params) {
    if (fields[key] !== undefined) fields[key] = [].concat(fields[key], value);
    else fields[key] = value;
  }
  return { fields, files: {}, raw };
}

export function safeFileName(value) {
  const name = str(value).replace(/\\/g, '/').split('/').pop()
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').trim();
  return (name || 'file').slice(0, 180);
}

export function parseCSV(input) {
  const text = str(input).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

export function csvCell(value) {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : str(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label || c.key)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

export function queryWith(url, changes) {
  const q = new URLSearchParams(url.searchParams);
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value === null || value === undefined) q.delete(key);
    else q.set(key, String(value));
  }
  return `${url.pathname}${q.size ? '?' + q.toString() : ''}`;
}

export function pageLinks(url, page, pages) {
  const current = Math.max(1, Math.min(page, pages || 1));
  const start = Math.max(1, current - 3);
  const end = Math.min(pages, start + 6);
  const out = [];
  if (current > 1) out.push(`<a class="btn ghost" href="${esc(queryWith(url, { page: current - 1 }))}">上一頁</a>`);
  else out.push('<button class="btn ghost" type="button" disabled aria-disabled="true">上一頁</button>');
  for (let i = start; i <= end; i++) out.push(i === current ? `<span class="page-current">${i}</span>` : `<a class="page-link" href="${esc(queryWith(url, { page: i }))}">${i}</a>`);
  if (current < pages) out.push(`<a class="btn ghost" href="${esc(queryWith(url, { page: current + 1 }))}">下一頁</a>`);
  return out.join('');
}

export function truncate(value, length = 100) {
  const text = plain(value);
  return esc(text.length > length ? text.slice(0, length) + '…' : text);
}

export function maskName(value) {
  const text = str(value);
  if (!text) return '';
  return text.length <= 1 ? text + 'X' : text[0] + 'XX';
}

export function maskPhone(value) {
  return str(value).replace(/\d/g, (d, i) => i < 4 ? d : '*');
}

export function safeEqual(a, b) {
  const aa = Buffer.from(str(a));
  const bb = Buffer.from(str(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(str(password), salt, 32).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = str(stored).split(':');
  if (!salt || !expected) return false;
  return safeEqual(crypto.scryptSync(str(password), salt, 32).toString('hex'), expected);
}

export function sum(items, selector) {
  return items.reduce((total, item) => total + num(selector(item)), 0);
}

export function groupBy(items, selector) {
  const out = {};
  for (const item of items) {
    const key = str(selector(item)) || '未分類';
    (out[key] ||= []).push(item);
  }
  return out;
}

export function unique(values) {
  return [...new Set(values.filter((v) => v !== '' && v !== null && v !== undefined).map(String))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}
