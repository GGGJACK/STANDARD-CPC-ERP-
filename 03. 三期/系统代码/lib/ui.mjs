import { AMOUNT_FIELDS, NAV } from './config.mjs';
import { arr, displayDate, esc, money, nl2br, pageLinks, plain, sanitizeHtml, str, truncate } from './utils.mjs';

const ROLE_NAMES = { management: '管理層', office: '辦公室', front: '前線員工', accounting: '會計', public: '公開訪客' };
export const roleName = (role) => ROLE_NAMES[role] || role;

const COMMON_CSS = `
:root{--brand:#0f6e56;--brand2:#0a5946;--soft:#f5f7f8;--line:#e3e7eb;--ink:#182027;--muted:#6c7883;--danger:#a32d2d;--warn:#9a5b00}
*{box-sizing:border-box}html{background:#f4f6f8}body{margin:0;color:var(--ink);font:14px/1.55 "Microsoft JhengHei","PingFang HK","PingFang SC",system-ui,sans-serif}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}.app{display:flex;min-height:100vh}
aside{position:fixed;inset:0 auto 0 0;width:232px;overflow:auto;background:#fff;border-right:1px solid var(--line);z-index:20;padding:14px 0}
.brand{padding:2px 18px 14px;border-bottom:1px solid #eef0f2;margin-bottom:8px}.brand b{display:block;font-size:16px}.brand span{font-size:11px;color:var(--muted)}
.navg{padding:13px 18px 4px;color:#929ca5;font-size:10px;letter-spacing:.12em}aside nav a{display:block;padding:8px 18px;color:#3c4650;border-left:3px solid transparent;font-size:13px}
aside nav a:hover{background:#f6f8f9;text-decoration:none}aside nav a.on{color:var(--brand);background:#eaf5f0;border-left-color:var(--brand);font-weight:600}
.who{margin:16px 14px 0;padding:13px 5px 0;border-top:1px solid #eef0f2;font-size:11px;color:var(--muted);word-break:break-all}.who b{display:block;color:var(--ink);font-size:13px}.who .pill{margin-top:5px}
main{margin-left:232px;padding:24px 28px 60px;width:calc(100% - 232px);max-width:1680px}h1{font-size:22px;line-height:1.3;margin:0 0 4px}h2{font-size:17px;margin:24px 0 10px}h3{font-size:14px;margin:0 0 12px}.sub{color:var(--muted);font-size:12.5px;margin-bottom:17px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:17px 18px;margin:0 0 14px;box-shadow:0 1px 1px #00000003}.card.flush{padding:0;overflow:auto}.card h3{border-bottom:1px solid #f0f2f3;padding-bottom:9px}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 13px}.bar.right{justify-content:flex-end}.bar.center{justify-content:center}.spacer{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--brand);border-radius:7px;background:var(--brand);color:#fff;padding:7px 13px;font:13px inherit;cursor:pointer;min-height:34px;text-decoration:none}
.btn:hover{background:var(--brand2);text-decoration:none}.btn.ghost{background:#fff;color:#36414b;border-color:#d5dbe0}.btn.ghost:hover{background:#f5f7f8}.btn.danger{background:#fff;color:var(--danger);border-color:#e2b6b6}.btn.warn{background:#fff;color:var(--warn);border-color:#e4c58f}.btn.small{padding:3px 8px;min-height:27px;font-size:11.5px}.btn.active{background:#e8f4ef;color:var(--brand);border-color:#8ab9a8}
input,select,textarea{font:13px inherit;color:var(--ink);background:#fff;border:1px solid #d5dbe0;border-radius:7px;padding:7px 9px;max-width:100%}input:focus,select:focus,textarea:focus{outline:2px solid #0f6e5620;border-color:#6ca592}input[type=checkbox]{width:16px;height:16px;padding:0}textarea{resize:vertical}.search{min-width:280px;flex:1;max-width:520px}
table{width:100%;border-collapse:collapse;font-size:12.7px}th,td{padding:9px 10px;border-bottom:1px solid #edf0f2;text-align:left;vertical-align:top}th{background:#fafbfc;color:#66717b;font-size:11.7px;font-weight:600;white-space:nowrap}tbody tr:hover{background:#fbfcfd}.table-wrap{overflow:auto}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.actions{white-space:nowrap}.muted{color:var(--muted)}.empty{text-align:center;color:var(--muted);padding:28px!important}.mask{letter-spacing:3px;color:#89929a}
.pill{display:inline-block;border-radius:10px;background:#eef1f4;color:#53606b;padding:1px 8px;font-size:11px;line-height:1.8;white-space:nowrap}.pill.g{background:#e7f4ed;color:var(--brand)}.pill.r{background:#fdecec;color:var(--danger)}.pill.y{background:#fff3dd;color:var(--warn)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:15px}.kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}.kpi b{display:block;color:var(--brand);font-size:22px;line-height:1.35;font-variant-numeric:tabular-nums}.kpi span{font-size:11.5px;color:var(--muted)}
.notice{border-left:3px solid var(--brand);background:#edf7f2;padding:11px 14px;margin:0 0 14px;border-radius:0 7px 7px 0}.notice.warn{border-color:var(--warn);background:#fff6e8}.notice.risk{border-color:var(--danger);background:#fff0f0}.notice b{display:block;margin-bottom:2px}
.fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 20px}.frow{display:flex;flex-direction:column;gap:5px;min-width:0}.frow.wide{grid-column:1/-1}.frow>label{font-size:12px;color:#53606b;font-weight:500}.frow input,.frow select,.frow textarea{width:100%}.fsection{grid-column:1/-1;border-bottom:1px solid var(--line);margin:8px 0 0;padding-bottom:5px;font-size:14px;color:var(--brand);font-weight:600}.required{color:var(--danger)}
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}.detail-row{display:grid;grid-template-columns:minmax(110px,32%) 1fr;gap:10px;border-bottom:1px solid #f0f2f3;padding:8px 0}.detail-row.wide{grid-column:1/-1}.detail-row dt{color:var(--muted);font-size:12px}.detail-row dd{margin:0;min-width:0;word-break:break-word;white-space:normal}
.pager{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin:15px 0}.page-link,.page-current{min-width:29px;height:29px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d9dee2;border-radius:6px;background:#fff;font-size:12px}.page-current{background:var(--brand);color:#fff;border-color:var(--brand)}
.attachments{display:flex;gap:7px;flex-wrap:wrap}.attachment{display:inline-flex;align-items:center;gap:5px;border:1px solid #dfe4e7;background:#fff;border-radius:6px;padding:4px 8px;font-size:11.5px;max-width:100%}.attachment img{display:block;max-width:90px;max-height:70px;object-fit:cover;border-radius:4px}.attachment-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}.attachment-list .attachment{align-items:flex-start}.json{font:11.5px/1.55 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;background:#f7f8fa;padding:10px;border-radius:7px;max-height:360px;overflow:auto}
.hidden{display:none!important}.item-editor{overflow:auto}.item-editor table input{min-width:90px;padding:5px 6px}.item-editor .item-desc{min-width:210px}.item-toolbar{display:flex;justify-content:space-between;align-items:center;margin:6px 0}.rich-toolbar{display:flex;gap:4px;flex-wrap:wrap;border:1px solid #d5dbe0;border-bottom:0;border-radius:7px 7px 0 0;padding:5px;background:#f8f9fa}.rich-toolbar button{border:0;background:#fff;border-radius:4px;padding:4px 8px;cursor:pointer}.rich-editor{min-height:150px;border:1px solid #d5dbe0;border-radius:0 0 7px 7px;padding:10px;background:#fff;overflow:auto}.rich-editor:focus{outline:2px solid #0f6e5620}
.errbox{max-width:620px;margin:60px auto;background:#fff;border:1px solid var(--line);border-radius:12px;padding:30px;text-align:center}.errbox h2{margin-top:0}.flash{padding:10px 14px;border-radius:7px;background:#e9f5ef;color:var(--brand);margin-bottom:13px}.flash.error{background:#fdecec;color:var(--danger)}
.mobile-toggle{display:none}.breadcrumbs{font-size:12px;color:var(--muted);margin-bottom:9px}.signature-pad{border:1px dashed #aab4bc;border-radius:8px;background:#fff;touch-action:none;max-width:100%}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.calendar-head{text-align:center;background:#f7f8fa;color:var(--muted);padding:6px;border-radius:5px;font-size:11px}.calendar-cell{min-height:112px;background:#fff;border:1px solid var(--line);border-radius:7px;padding:5px;font-size:11px}.calendar-cell.empty{background:#f7f8fa}.calendar-day{color:var(--muted);margin-bottom:4px}.calendar-item{display:block;background:#eaf5f0;color:var(--brand);border-radius:4px;padding:3px 4px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab}.calendar-item:hover{text-decoration:none;background:#dcefe6}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(2,1fr)}.detail-grid{grid-template-columns:1fr}.detail-row.wide{grid-column:auto}.two-col{grid-template-columns:1fr}}
@media(max-width:760px){aside{transform:translateX(-100%);transition:transform .2s}aside.open{transform:translateX(0)}main{margin-left:0;width:100%;padding:18px 13px 45px}.mobile-toggle{display:inline-flex;position:fixed;right:12px;bottom:12px;z-index:30;border-radius:50%;width:46px;height:46px;padding:0}.fgrid{grid-template-columns:1fr}.frow.wide,.fsection{grid-column:auto}.search{min-width:160px}.kpis{grid-template-columns:1fr 1fr}.card{padding:13px}.detail-row{grid-template-columns:105px 1fr}.calendar-cell{min-height:78px}.calendar{font-size:10px}}
@media print{.noprint,aside,.mobile-toggle{display:none!important}main{margin:0;width:100%;max-width:none;padding:0}.card{box-shadow:none}}
`;

const COMMON_JS = `
document.addEventListener('click',e=>{const b=e.target.closest('[data-nav-toggle]');if(b)document.querySelector('aside')?.classList.toggle('open')});
function jsonParse(v,f){try{return JSON.parse(v)}catch{return f}}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.querySelectorAll('.item-editor').forEach(editor=>{
  const target=document.getElementById(editor.dataset.target);const columns=jsonParse(editor.dataset.columns,'[]');let rows=jsonParse(target.value,'[]');if(!Array.isArray(rows))rows=[];
  const table=document.createElement('table');const head=document.createElement('thead');head.innerHTML='<tr>'+columns.map(c=>'<th>'+escapeHtml(c.label||c.name)+'</th>').join('')+'<th></th></tr>';table.appendChild(head);const body=document.createElement('tbody');table.appendChild(body);editor.appendChild(table);
  const sync=()=>{target.value=JSON.stringify(rows)};
  const render=()=>{body.innerHTML='';rows.forEach((row,i)=>{const tr=document.createElement('tr');columns.forEach(c=>{const td=document.createElement('td');let input;if(c.type==='select'){input=document.createElement('select');(c.options||[]).forEach(o=>{const op=document.createElement('option');op.value=typeof o==='object'?o.value:o;op.textContent=typeof o==='object'?o.label:o;input.appendChild(op)})}else{input=document.createElement('input');input.type=c.type==='number'||c.type==='money'?'number':c.type==='date'?'date':'text';if(input.type==='number')input.step='0.01'}input.value=row[c.name]??'';if(c.name==='description'||c.name==='work_content'||c.name==='item_name')input.className='item-desc';input.addEventListener('input',()=>{row[c.name]=input.type==='number'?(input.value===''?'':Number(input.value)):input.value;sync()});td.appendChild(input);tr.appendChild(td)});const td=document.createElement('td');const del=document.createElement('button');del.type='button';del.className='btn danger small';del.textContent='刪除';del.onclick=()=>{rows.splice(i,1);sync();render()};td.appendChild(del);tr.appendChild(td);body.appendChild(tr)});sync()};
  const add=document.createElement('button');add.type='button';add.className='btn ghost small';add.textContent='＋ 新增一行';add.onclick=()=>{rows.push({});render()};const tools=document.createElement('div');tools.className='item-toolbar';tools.appendChild(add);editor.appendChild(tools);render();
});
document.querySelectorAll('[data-rich]').forEach(box=>{const target=document.getElementById(box.dataset.rich);const editor=box.querySelector('.rich-editor');editor.innerHTML=target.value;const sync=()=>target.value=editor.innerHTML;editor.addEventListener('input',sync);box.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>{document.execCommand(b.dataset.cmd,false,b.dataset.value||null);editor.focus();sync()}));box.closest('form')?.addEventListener('submit',sync)});
document.querySelectorAll('[data-upload]').forEach(input=>{input.addEventListener('change',async()=>{if(!input.files.length)return;const status=input.parentElement.querySelector('.upload-status');status.textContent='上傳中…';const target=document.getElementById(input.dataset.target);for(const file of input.files){const fd=new FormData();fd.append('file',file);fd.append('__csrf',input.dataset.csrf);fd.append('key',input.dataset.key);fd.append('id',input.dataset.id);fd.append('field',input.dataset.field);try{const r=await fetch('/upload',{method:'POST',body:fd});const data=await r.json();if(!r.ok)throw new Error(data.error||'上傳失敗');const values=jsonParse(target.value,'[]');values.push(data.file);target.value=JSON.stringify(values);const list=input.closest('.frow').querySelector('.uploaded-list');const a=document.createElement('a');a.className='attachment';a.href=data.file.file_url;a.target='_blank';a.textContent=data.file.file_name;list.appendChild(a);status.textContent='上傳完成'}catch(e){status.textContent=e.message}}input.value=''})});
document.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('submit',e=>{if(!confirm(el.dataset.confirm||'確定執行？'))e.preventDefault()}));
`;

export function layout({ title, body, user = null, active = '', csrf = '', wide = false, extraHead = '' }) {
  const nav = NAV.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(user?.role));
    if (!items.length) return '';
    return `<div class="navg">${esc(group.group)}</div><nav>${items.map((item) => `<a class="${active === item.key ? 'on' : ''}" href="${esc(item.path)}">${esc(item.label)}</a>`).join('')}</nav>`;
  }).join('');
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf" content="${esc(csrf)}"><title>${esc(title)} · 標準清潔滅蟲</title><style>${COMMON_CSS}${wide ? 'main{max-width:none}' : ''}</style>${extraHead}</head><body><div class="app"><aside><div class="brand"><b>標準清潔滅蟲</b><span>公司一站式管理系統</span></div>${nav}<div class="who"><b>${esc(user?.name || '')}</b>${esc(user?.email || '')}<br><span class="pill">${esc(roleName(user?.role))}</span> · <a href="/logout">登出</a></div></aside><main>${body}</main></div><button class="btn mobile-toggle" type="button" data-nav-toggle aria-label="選單">☰</button><script>${COMMON_JS}</script></body></html>`;
}

export function publicLayout({ title, body, extraHead = '' }) {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${COMMON_CSS}.public-main{max-width:920px;margin:0 auto;padding:28px 18px}</style>${extraHead}</head><body><div class="public-main">${body}</div><script>${COMMON_JS}</script></body></html>`;
}

export function loginPage({ error = '', csrf = '', demo = true }) {
  return publicLayout({ title: '登入', body: `<form class="card" style="max-width:390px;margin:60px auto" method="post" action="/login"><h1 style="text-align:center">標準清潔滅蟲</h1><div class="sub" style="text-align:center">公司一站式管理系統</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}<input type="hidden" name="__csrf" value="${esc(csrf)}"><div class="frow"><label for="email">電郵</label><input id="email" name="email" type="email" autocomplete="username" required></div><div class="frow" style="margin-top:12px"><label for="password">密碼</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="btn" style="width:100%;margin-top:17px">登入</button>${demo ? `<div class="bar" style="margin-top:15px"><a class="btn ghost small" href="/demo?as=office">辦公室</a><a class="btn ghost small" href="/demo?as=front">前線</a><a class="btn ghost small" href="/demo?as=accounting">會計</a><a class="btn ghost small" href="/demo?as=management">管理層</a></div><div class="muted" style="font-size:11px;text-align:center">示範帳號密碼：demo1234</div>` : ''}</form>` });
}

export function errorPage({ title = '找不到頁面', message = '', user = null, status = 404, csrf = '' }) {
  const body = `<div class="errbox"><h2>${esc(title)}</h2><p class="muted">${esc(message || `HTTP ${status}`)}</p><a class="btn ghost" href="/">返回首頁</a></div>`;
  return user ? layout({ title, body, user, csrf }) : publicLayout({ title, body });
}

export function pill(value) {
  const text = str(value);
  const green = ['已完成', '已付款', '生效中', '正常', '可用', '已批准', '已確認', '已接受', '在職', '完成', 'signed'];
  const red = ['逾期', '已到期', '低庫存', '已取消', '停用', '已拒絕', '離職'];
  const yellow = ['待執行', '待安排', '草稿', '待審批', '進行中', '部分收款', 'pending'];
  return `<span class="pill ${green.includes(text) ? 'g' : red.includes(text) ? 'r' : yellow.includes(text) ? 'y' : ''}">${esc(text || '—')}</span>`;
}

export function collectAttachments(value, key = '', output = []) {
  if (value === null || value === undefined || value === '') return output;
  if (Array.isArray(value)) {
    value.forEach((v) => collectAttachments(v, key, output));
    return output;
  }
  if (typeof value === 'object') {
    const direct = value.file_url || value.photo_url || value.url;
    if (direct && typeof direct === 'string') output.push({ name: value.file_name || value.name || value.caption || value.point_name || '附件', url: direct, contentType: value.content_type || '' });
    for (const [k, v] of Object.entries(value)) {
      if (k === 'file_url' || k === 'url') continue;
      if (/(file|photo|image|document|pdf|logo|signature|stamp|msds|map)/i.test(k) || typeof v === 'object') collectAttachments(v, k, output);
    }
    return output;
  }
  if (typeof value === 'string' && (/(file|photo|image|document|pdf|logo|signature|stamp|msds|map)/i.test(key) || /base44\.app\/api\/apps\//.test(value)) && /^(https?:\/\/|\/uploads\/)/.test(value)) {
    output.push({ name: value.split('/').pop() || '附件', url: value, contentType: '' });
  }
  return output;
}

export function attachmentHref(url, ctx = {}) {
  if (str(url).startsWith('/uploads/')) {
    if (ctx.publicToken) return `/public-upload?token=${encodeURIComponent(ctx.publicToken)}&path=${encodeURIComponent(url)}`;
    return url;
  }
  if (ctx.publicToken) return `/public-attachment?token=${encodeURIComponent(ctx.publicToken)}&url=${encodeURIComponent(url)}`;
  if (/^https?:\/\/base44\.app\//.test(url)) return `/attachment?url=${encodeURIComponent(url)}`;
  return url;
}

export function renderAttachments(value, ctx = {}) {
  const files = collectAttachments(value);
  const unique = [...new Map(files.map((f) => [f.url, f])).values()];
  if (!unique.length) return '<span class="muted">—</span>';
  return `<div class="attachment-list">${unique.map((file) => {
    const href = attachmentHref(file.url, ctx);
    const image = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(file.url) || /^image\//.test(file.contentType);
    const editable = image && !ctx.publicToken && (file.url.startsWith('/uploads/') || /^https?:\/\/base44\.app\//.test(file.url));
    return `<span class="attachment"><a href="${esc(href)}" target="_blank" rel="noopener">${image ? `<img src="${esc(href)}" alt="">` : '<span aria-hidden="true">[檔]</span>'}<span>${esc(file.name || '查看附件')}</span></a>${editable ? `<a class="btn ghost small" href="/image-editor?url=${encodeURIComponent(file.url)}">編輯</a>` : ''}</span>`;
  }).join('')}</div>`;
}

export function renderValue(value, field = {}, ctx = {}) {
  const type = field.type || 'text';
  if ((type === 'money' || AMOUNT_FIELDS.has(field.name || field.key)) && ctx.canSeeAmounts === false) return '<span class="mask">•••••</span>';
  if (type === 'money') return `<span class="num">${money(value)}</span>`;
  if (type === 'date') return displayDate(value);
  if (type === 'pill' || type === 'status') return pill(value);
  if (type === 'checkbox') return value ? '<span class="pill g">是</span>' : '<span class="pill">否</span>';
  if (type === 'richtext') return value ? `<div>${sanitizeHtml(value)}</div>` : '<span class="muted">—</span>';
  if (type === 'textarea') return value ? nl2br(value) : '<span class="muted">—</span>';
  if (type === 'files' || type === 'attachments') return renderAttachments(value, ctx);
  if (Array.isArray(value) && value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) return value.length ? esc(value.join('、')) : '<span class="muted">—</span>';
  if (type === 'items' || type === 'json' || typeof value === 'object') {
    if (!value || (Array.isArray(value) && !value.length)) return '<span class="muted">—</span>';
    if (type === 'items' && Array.isArray(value)) return renderItems(value, field.itemColumns || [], ctx);
    const files = collectAttachments(value);
    return `${files.length ? renderAttachments(value, ctx) : ''}<details><summary>查看結構化資料</summary><pre class="json">${esc(JSON.stringify(value, null, 2))}</pre></details>`;
  }
  if (type === 'truncate') return truncate(value, field.length || 80);
  return value === '' || value === null || value === undefined ? '<span class="muted">—</span>' : esc(value);
}

export function renderItems(items, columns, ctx = {}) {
  const cols = columns.length ? columns : [...new Set(items.flatMap((r) => Object.keys(r || {})))].filter((k) => !/^(id|created_|updated_)/.test(k)).slice(0, 8).map((name) => ({ name, label: name }));
  if (!items.length) return '<span class="muted">—</span>';
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c.label || c.name)}</th>`).join('')}</tr></thead><tbody>${items.map((row) => `<tr>${cols.map((c) => `<td>${renderValue(row?.[c.name], { ...c, key: c.name }, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function dataTable({ cfg, rows, ctx = {}, actions = true }) {
  const columns = (cfg.columns || []).filter((c) => !(c.key === 'id' && c.label === '操作'));
  const operations = (row) => {
    const parts = [`<a class="btn ghost small" href="${esc(ctx.viewHref ? ctx.viewHref(row) : `${cfg.listPath}/${encodeURIComponent(row.id)}`)}">查看</a>`];
    if (ctx.extraActions) parts.push(ctx.extraActions(row));
    if (ctx.canEdit !== false && cfg.editRoles?.includes(ctx.user?.role)) parts.push(`<a class="btn ghost small" href="${esc(ctx.editHref ? ctx.editHref(row) : `/edit/${cfg.key}/${encodeURIComponent(row.id)}`)}">編輯</a>`);
    if (ctx.deleteHref && cfg.editRoles?.includes(ctx.user?.role)) parts.push(`<form method="post" action="${esc(ctx.deleteHref(row))}" style="display:inline" data-confirm="確定移至回收筒？"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><button class="btn danger small">刪除</button></form>`);
    return parts.join(' ');
  };
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}${actions ? '<th>操作</th>' : ''}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td>${c.value ? c.value(row, ctx) : renderValue(row[c.key], { ...c, name: c.key }, ctx)}</td>`).join('')}${actions ? `<td class="actions">${operations(row)}</td>` : ''}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length + (actions ? 1 : 0)}">暫無資料</td></tr>`}</tbody></table></div>`;
}

export function pager({ url, page, pages, total }) {
  return `<div class="pager">${pageLinks(url, page, pages)}<span class="muted">第 ${page} / ${pages || 1} 頁 · 共 ${Number(total).toLocaleString()} 筆</span></div>`;
}

function optionsFor(field, ctx) {
  const source = field.options || ctx.options?.[field.name] || [];
  return source.map((o) => typeof o === 'object' ? o : { value: o, label: o });
}

function fieldInput(field, value, ctx) {
  const name = esc(field.name);
  const id = `f_${name}`;
  const required = field.required ? 'required' : '';
  const readonly = field.readOnly ? 'readonly' : '';
  const common = `id="${id}" name="${name}" ${required} ${readonly}`;
  const placeholder = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : '';
  if (field.type === 'textarea' || field.type === 'json') return `<textarea ${common} rows="${field.type === 'json' ? 6 : 4}"${placeholder}>${esc(field.type === 'json' && value && typeof value === 'object' ? JSON.stringify(value, null, 2) : value ?? '')}</textarea>`;
  if (field.type === 'richtext') return `<div data-rich="${id}"><div class="rich-toolbar noprint"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList">• 列表</button><button type="button" data-cmd="insertOrderedList">1. 列表</button><button type="button" data-cmd="removeFormat">清除格式</button></div><div class="rich-editor" contenteditable="true"></div></div><textarea class="hidden" ${common}>${esc(value ?? '')}</textarea>`;
  if (field.type === 'select') {
    const opts = optionsFor(field, ctx);
    return `<select ${common}><option value="">— 請選擇 —</option>${opts.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}${value && !opts.some((o) => String(o.value) === String(value)) ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : ''}</select>`;
  }
  if (field.type === 'checkbox') return `<input type="hidden" name="${name}" value="0"><label style="display:flex;align-items:center;gap:7px;font-weight:400"><input type="checkbox" name="${name}" value="1" ${value === true || value === 1 || value === '1' ? 'checked' : ''}> ${esc(field.checkboxLabel || '是')}</label>`;
  if (field.type === 'items') {
    const items = Array.isArray(value) ? value : [];
    return `<textarea class="hidden items-json" ${common}>${esc(JSON.stringify(items))}</textarea><div class="item-editor" data-target="${id}" data-columns="${esc(JSON.stringify(field.itemColumns || []))}"></div>`;
  }
  if (field.type === 'files') {
    const files = Array.isArray(value) ? value : value ? [value] : [];
    const uploadId = ctx.rowId || '';
    return `<textarea class="hidden" ${common}>${esc(JSON.stringify(files))}</textarea><div class="uploaded-list attachments">${renderAttachments(files, ctx)}</div><div class="bar noprint" style="margin:7px 0 0"><input type="file" multiple data-upload data-target="${id}" data-key="${esc(ctx.cfg.key)}" data-id="${esc(uploadId)}" data-field="${name}" data-csrf="${esc(ctx.csrf)}"><span class="upload-status muted">可上傳 PDF、圖片、Office 文件，單檔 20 MB</span></div>`;
  }
  const type = field.type === 'number' || field.type === 'money' ? 'number' : ['date', 'time', 'email', 'tel', 'url', 'password'].includes(field.type) ? field.type : 'text';
  const step = type === 'number' ? ' step="0.01"' : '';
  return `<input type="${type}" ${common} value="${esc(value ?? '')}"${step}${placeholder}>`;
}

export function formPage({ cfg, row = {}, ctx = {}, error = '', back = null }) {
  const isEdit = !!ctx.originalId;
  const rowId = ctx.rowId || row.id || '';
  const sections = [];
  let current = null;
  for (const field of cfg.fields) {
    if (field.section && field.section !== current) {
      sections.push({ type: 'section', label: field.section });
      current = field.section;
    }
    sections.push({ type: 'field', field });
  }
  const body = `<div class="breadcrumbs"><a href="${esc(back || cfg.listPath)}">${esc(cfg.plural)}</a> / ${isEdit ? '編輯' : '新增'}${esc(cfg.title)}</div><h1>${isEdit ? '編輯' : '新增'}${esc(cfg.title)}</h1><div class="sub">帶 <span class="required">*</span> 為必填；儲存後會寫入審計記錄</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}<form class="card" method="post" action="/save/${esc(cfg.key)}"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><input type="hidden" name="__id" value="${esc(ctx.originalId || '')}"><input type="hidden" name="__new_id" value="${esc(rowId)}"><input type="hidden" name="__expected_updated" value="${esc(row.updated_date || '')}"><input type="hidden" name="__back" value="${esc(back || cfg.listPath)}"><div class="fgrid">${sections.map((entry) => entry.type === 'section' ? `<div class="fsection">${esc(entry.label)}</div>` : `<div class="frow ${entry.field.wide || ['textarea', 'richtext', 'items', 'files', 'json'].includes(entry.field.type) ? 'wide' : ''}"><label for="f_${esc(entry.field.name)}">${esc(entry.field.label)}${entry.field.required ? ' <span class="required">*</span>' : ''}</label>${fieldInput(entry.field, row[entry.field.name], { ...ctx, cfg, rowId })}</div>`).join('')}</div><div class="bar" style="margin-top:20px"><button class="btn" type="submit">儲存</button><a class="btn ghost" href="${esc(back || cfg.listPath)}">取消</a>${isEdit ? `<span class="muted">記錄 ID：${esc(rowId)}</span>` : ''}</div></form>`;
  return layout({ title: `${isEdit ? '編輯' : '新增'}${cfg.title}`, body, user: ctx.user, active: cfg.active, csrf: ctx.csrf, wide: true });
}

export function detailPage({ cfg, row, ctx = {}, title = null, before = '', after = '', back = null }) {
  const sections = [];
  let currentSection = '';
  let currentFields = [];
  const flush = () => {
    if (!currentFields.length) return;
    sections.push(`<div class="card"><h3>${esc(currentSection || '基本資料')}</h3><dl class="detail-grid">${currentFields.join('')}</dl></div>`);
    currentFields = [];
  };
  for (const field of cfg.fields) {
    if (field.section && field.section !== currentSection) {
      flush();
      currentSection = field.section;
    }
    currentFields.push(`<div class="detail-row ${field.wide || ['textarea', 'richtext', 'items', 'files', 'json'].includes(field.type) ? 'wide' : ''}"><dt>${esc(field.label)}</dt><dd>${renderValue(row[field.name], field, ctx)}</dd></div>`);
  }
  flush();
  const label = title || row[cfg.labelField] || row.id;
  const body = `<div class="breadcrumbs"><a href="${esc(back || cfg.listPath)}">${esc(cfg.plural)}</a> / ${esc(label)}</div><h1>${esc(label)}</h1><div class="sub">${esc(cfg.title)} · ID ${esc(row.id)}${row.__deleted ? ' · <span class="pill r">回收筒</span>' : ''}</div>${before}<div class="bar noprint"><a class="btn ghost" href="${esc(back || cfg.listPath)}">返回</a>${cfg.editRoles?.includes(ctx.user?.role) ? `<a class="btn" href="/edit/${esc(cfg.key)}/${encodeURIComponent(row.id)}">編輯</a>` : ''}<a class="btn ghost" href="/print/${esc(cfg.key)}/${encodeURIComponent(row.id)}" target="_blank">列印 / PDF</a></div>${sections.join('')}${after}`;
  return layout({ title: label, body, user: ctx.user, active: cfg.active, csrf: ctx.csrf, wide: true });
}

export function kpis(items) {
  return `<div class="kpis">${items.map((item) => `<div class="kpi"><b>${item.raw ? item.value : esc(item.value)}</b><span>${esc(item.label)}</span></div>`).join('')}</div>`;
}

export function simpleTable(columns, rows, ctx = {}) {
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td>${c.value ? c.value(row, ctx) : renderValue(row[c.key], { ...c, name: c.key }, ctx)}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length}">暫無資料</td></tr>`}</tbody></table></div>`;
}
