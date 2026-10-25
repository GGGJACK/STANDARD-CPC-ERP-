import { AMOUNT_FIELDS, NAV } from './config.mjs';
import { pickLabel } from './pickers.mjs';
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
.mobile-toggle{display:none}.breadcrumbs{font-size:12px;color:var(--muted);margin-bottom:9px}
.navgrp{border:0;margin:0;display:block}.navgrp>summary{display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer;list-style:none;padding:11px 18px 5px;color:#3c4650;font-size:13px;font-weight:700;letter-spacing:0;user-select:none}
.navgrp>summary::-webkit-details-marker{display:none}.navgrp>summary::after{content:'▾';font-size:10px;opacity:.75;transition:transform .15s}
.navgrp:not([open])>summary::after{content:'▸'}.navgrp>summary:hover{color:var(--brand)}.navgrp>summary b{font-weight:700}
.pk{position:relative;min-width:0}.pk>input.pk-input{width:100%;padding-right:24px;background:#fff url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a959e'/%3E%3C/svg%3E") no-repeat right 9px center}
input[list]{width:100%;padding-right:24px;background:#fff url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a959e'/%3E%3C/svg%3E") no-repeat right 9px center}
.pk-menu{position:absolute;z-index:80;left:0;right:0;top:calc(100% + 3px);background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 26px #0000001f;max-height:420px;overflow:auto;min-width:220px}
.pk-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #f2f4f5;background:#fff;padding:7px 10px;cursor:pointer;font:12.5px inherit;color:var(--ink)}
.pk-item:last-child{border-bottom:0}.pk-item:hover,.pk-item.hl{background:#eef6f2}.pk-item b{display:block;font-weight:600}.pk-item i{display:block;font-style:normal;color:var(--muted);font-size:11px;margin-top:1px}
.pk-empty{padding:10px;color:var(--muted);font-size:12px}
.pk-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.pk-chip{display:inline-flex;gap:5px;align-items:center;background:#eaf5f0;color:var(--brand);border-radius:12px;padding:2px 9px;font-size:11.5px;max-width:100%}
.pk-chip button{border:0;background:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 0 1px}
dialog.modal{width:min(1000px,95vw);max-height:94vh;border:0;border-radius:14px;padding:0;box-shadow:0 24px 70px #00000047;color:var(--ink)}
dialog.modal::backdrop{background:#0d1b2499}.modal-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-bottom:1px solid var(--line);padding:14px 20px}
.modal-head h3{margin:0;border:0;padding:0;font-size:16px}.modal-head .sub{margin:2px 0 0;font-size:11.5px}.modal-body{padding:16px 20px 6px;max-height:72vh;overflow:auto}
.modal-foot{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:9px;background:#fff;border-top:1px solid var(--line);padding:12px 20px}
.wf-card{border:1px solid #e1e6ea;border-radius:10px;background:#fbfcfd;padding:12px 13px;margin-bottom:10px}
.wf-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.wf-head b{font-size:12.5px}.wf-head .muted{font-size:11px}
.wf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 12px}.wf-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
.wf-cell>span{font-size:11px;color:#5b6672}.wf-cell.wide{grid-column:1/-1}.wf-link{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 12px;padding-bottom:9px;border-bottom:1px dashed #dfe5e9;margin-bottom:2px}
.wf-hint{font-size:11px;color:var(--brand);background:#eef6f2;border-radius:6px;padding:4px 8px;margin-top:2px}
.wf-empty{border:1px dashed #cfd7dd;border-radius:9px;padding:20px;text-align:center;color:var(--muted);font-size:12.5px}
.item-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.item-card{border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:#fbfcfd}
.item-card-h{font-weight:600;color:var(--brand);font-size:12px;margin-bottom:7px}
.item-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0;font-size:12px}
.item-card dt{color:var(--muted);white-space:nowrap}
.item-card dd{margin:0;word-break:break-word}
.tlink{color:#1a5fb4;font-weight:600}.tlink:hover{text-decoration:underline}
.tlink.plain{color:var(--ink);font-weight:500}
.trash-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#fff8f0;border:1px solid #f0dcc0;border-radius:9px;margin-bottom:12px}
tr.picked td{background:#eef6f2}
.badge-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#eaf5f0;color:var(--brand);font-size:11px;font-weight:600}
.vcard-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.vcard-plate{font-size:22px;font-weight:700;letter-spacing:1px}
.vcard-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin:12px 0 0}
.vcard-kv div{border-bottom:1px solid #f0f2f3;padding-bottom:7px}
.vcard-kv dt{font-size:11.5px;color:var(--muted);margin-bottom:2px}
.vcard-kv dd{margin:0;font-size:13px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:0 0 14px;padding-bottom:0}
.tabs a,.tabs span.tab{padding:7px 11px;border-radius:7px 7px 0 0;font-size:12.5px;color:#4d5862;border:1px solid transparent;border-bottom:0;cursor:pointer}
.tabs a.on,.tabs span.tab.on{background:#fff;border-color:var(--line);color:var(--brand);font-weight:600;margin-bottom:-1px}
.cust-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.cust-grid{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:980px){.cust-grid{grid-template-columns:1fr}}
@media(max-width:760px){.wf-grid,.wf-link{grid-template-columns:1fr}}.signature-pad{border:1px dashed #aab4bc;border-radius:8px;background:#fff;touch-action:none;max-width:100%}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.calendar-head{text-align:center;background:#f7f8fa;color:var(--muted);padding:6px;border-radius:5px;font-size:11px}.calendar-cell{min-height:112px;background:#fff;border:1px solid var(--line);border-radius:7px;padding:5px;font-size:11px}.calendar-cell.empty{background:#f7f8fa}.calendar-day{color:var(--muted);margin-bottom:4px}.calendar-item{display:block;background:#eaf5f0;color:var(--brand);border-radius:4px;padding:3px 4px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab}.calendar-item:hover{text-decoration:none;background:#dcefe6}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(2,1fr)}.detail-grid{grid-template-columns:1fr}.detail-row.wide{grid-column:auto}.two-col{grid-template-columns:1fr}}
@media(max-width:760px){aside{transform:translateX(-100%);transition:transform .2s}aside.open{transform:translateX(0)}main{margin-left:0;width:100%;padding:18px 13px 45px}.mobile-toggle{display:inline-flex;position:fixed;right:12px;bottom:12px;z-index:30;border-radius:50%;width:46px;height:46px;padding:0}.fgrid{grid-template-columns:1fr}.frow.wide,.fsection{grid-column:auto}.search{min-width:160px}.kpis{grid-template-columns:1fr 1fr}.card{padding:13px}.detail-row{grid-template-columns:105px 1fr}.calendar-cell{min-height:78px}.calendar{font-size:10px}}
@media print{.noprint,aside,.mobile-toggle{display:none!important}main{margin:0;width:100%;max-width:none;padding:0}.card{box-shadow:none}}
`;

const COMMON_JS = `
document.addEventListener('click',e=>{const b=e.target.closest('[data-nav-toggle]');if(b)document.querySelector('aside')?.classList.toggle('open')});
function jsonParse(v,f){try{return JSON.parse(v)}catch{return f}}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
(function(){
  var KEY='cpc.navgroups';
  var saved=jsonParse(localStorage.getItem(KEY),null)||{};
  document.querySelectorAll('details.navgrp').forEach(function(d){
    var g=d.dataset.g;
    if(Object.prototype.hasOwnProperty.call(saved,g)) d.open=!!saved[g];
    var s=d.querySelector('summary');
    if(s) s.addEventListener('click',function(){setTimeout(function(){var cur=jsonParse(localStorage.getItem(KEY),{})||{};cur[g]=d.open;localStorage.setItem(KEY,JSON.stringify(cur));},0);});
  });
})();
var PK_CACHE={};
function pkFetch(source,q){
  var key=source+'|'+q;
  if(PK_CACHE[key]) return Promise.resolve(PK_CACHE[key]);
  return fetch('/api/pick?source='+encodeURIComponent(source)+'&q='+encodeURIComponent(q)+'&limit=50')
    .then(function(r){return r.ok?r.json():[]})
    .then(function(list){PK_CACHE[key]=list;return list});
}
function pkApplyFill(root,item){
  var scope=root.closest('.wf-card')||root.closest('form')||document;
  var ownHidden=root.querySelector('.pk-val'),ownText=root.querySelector('.pk-input');
  var fill=item.fill||{};
  Object.keys(fill).forEach(function(k){
    var els=scope.querySelectorAll('[data-f="'+k+'"], [name="'+k+'"]');
    Array.prototype.forEach.call(els,function(el){
      if(el===ownHidden||el===ownText) return;
      var next=fill[k]==null?'':fill[k];
      if(String(el.value)===String(next)) return;
      el.value=next;
      if(el.classList.contains('pk-val')){
        var box=el.closest('.pk'),txt=box?box.querySelector('.pk-input'):null;
        if(txt) txt.value=next;
        el.dispatchEvent(new Event('input',{bubbles:true}));
        return;
      }
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
  });
}
function pkMount(root){
  if(root.dataset.pkReady==='1') return;
  root.dataset.pkReady='1';
  var input=root.querySelector('.pk-input'),menu=root.querySelector('.pk-menu'),hidden=root.querySelector('.pk-val');
  var multi=root.dataset.multi==='1',chips=root.querySelector('.pk-chips'),items=[],seq=0,active=-1;
  function close(){menu.hidden=true;active=-1;}
  function sync(){hidden.dispatchEvent(new Event('input',{bubbles:true}));}
  // 下拉在 item-editor / modal 這類 overflow:auto 容器裡會被裁掉，
  // 改成 fixed 定位並按視窗剩餘高度翻轉，對齊會議「下拉不夠高、看不到」。
  function place(){
    var r=input.getBoundingClientRect();
    var maxH=Math.max(220,Math.min(420,window.innerHeight-24));
    var openUp=r.bottom>window.innerHeight*0.6&&r.top>maxH+20;
    menu.style.position='fixed';
    menu.style.left=r.left+'px';
    menu.style.width=Math.max(r.width,240)+'px';
    menu.style.right='auto';
    menu.style.maxHeight=maxH+'px';
    menu.style.top=(openUp?Math.max(8,r.top-maxH-3):Math.min(window.innerHeight-8,r.bottom+3))+'px';
  }
  function render(){
    if(!items.length){menu.innerHTML='<div class="pk-empty">無匹配結果，可直接輸入</div>';}
    else menu.innerHTML=items.map(function(it,i){return '<button type="button" class="pk-item" data-i="'+i+'"><b>'+escapeHtml(it.label)+'</b>'+(it.sub?'<i>'+escapeHtml(it.sub)+'</i>':'')+'</button>';}).join('');
    menu.hidden=false;
    place();
  }
  function load(){
    var my=++seq;
    pkFetch(root.dataset.source,input.value.trim()).then(function(list){if(my===seq){items=list;render();}});
  }
  function selected(){
    var raw=hidden.value||'';
    try{var v=JSON.parse(raw);if(Array.isArray(v))return v;}catch(e){}
    if(multi&&raw.trim())return raw.split(/[、,，]/).map(function(s){s=s.trim();return s?{id:s,label:s,name:s}:null;}).filter(Boolean);
    return [];
  }
  function paintChips(){
    if(!chips) return;
    chips.innerHTML='';
    selected().forEach(function(it,idx){
      var chip=document.createElement('span');chip.className='pk-chip';
      var lab=document.createElement('span');lab.textContent=it.label||it.name||it.id;chip.appendChild(lab);
      var x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','移除');
      x.onclick=function(){var arr=selected();arr.splice(idx,1);hidden.value=JSON.stringify(arr);sync();paintChips();};
      chip.appendChild(x);chips.appendChild(chip);
    });
  }
  function choose(it){
    if(!it) return;
    if(multi){
      var arr=selected();
      if(!arr.some(function(v){return String(v.id)===String(it.id);})) arr.push({id:it.id,label:it.label,name:it.label});
      hidden.value=JSON.stringify(arr);input.value='';sync();paintChips();
    }else{
      var mode=root.dataset.valuemode||'id';
      hidden.value=mode==='id'?it.id:it.label;input.value=it.label;
      root.dispatchEvent(new CustomEvent('pk-picked',{detail:{id:it.id,label:it.label,fill:it.fill||{}}}));
      pkApplyFill(root,it);
    }
    close();
  }
  input.addEventListener('focus',function(){load();});
  input.addEventListener('input',function(){
    var mode=root.dataset.valuemode||'id';
    if(!multi&&mode==='text'){hidden.value=input.value;root.dispatchEvent(new CustomEvent('pk-picked',{detail:{id:input.value,label:input.value}}));}
    if(!multi&&input.value.trim()===''){hidden.value='';root.dispatchEvent(new CustomEvent('pk-cleared'));}
    load();
  });
  input.addEventListener('keydown',function(e){
    if(e.key==='Escape'){close();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(menu.hidden){load();return;}
      var list=menu.querySelectorAll('.pk-item');if(!list.length)return;
      active=e.key==='ArrowDown'?Math.min(list.length-1,active+1):Math.max(0,active-1);
      list.forEach(function(b,i){b.classList.toggle('hl',i===active);});
      list[active].scrollIntoView({block:'nearest'});e.preventDefault();
    }
    if(e.key==='Enter'&&!menu.hidden&&active>=0){e.preventDefault();choose(items[active]);}
  });
  input.addEventListener('blur',function(){setTimeout(close,170);});
  window.addEventListener('scroll',close,true);
  window.addEventListener('resize',close);
  menu.addEventListener('mousedown',function(e){e.preventDefault();});
  menu.addEventListener('click',function(e){var b=e.target.closest('.pk-item');if(b)choose(items[Number(b.dataset.i)]);});
  if(multi) paintChips();
}
function wfMount(root){root.querySelectorAll('.pk').forEach(pkMount);}
document.querySelectorAll('.pk').forEach(pkMount);
function wfInput(col,row,after){
  var el;
  if(col.type==='select'){
    el=document.createElement('select');
    (col.options||[]).forEach(function(o){
      var op=document.createElement('option');
      op.value=typeof o==='object'?o.value:o;
      op.textContent=typeof o==='object'?o.label:o;
      el.appendChild(op);
    });
    el.value=row[col.name]==null?'':row[col.name];
    el.addEventListener('change',function(){row[col.name]=el.value;after();});
    el.setAttribute('data-f',col.name);
    return el;
  }
  if(col.type==='pick'||col.type==='picks'){
    var multi=col.type==='picks';
    var initial=row[col.name];
    if(multi&&!Array.isArray(initial)) initial=(typeof initial==='string'&&initial.trim())?initial.split(/[、,，]/).map(function(s){s=s.trim();return s?{id:s,label:s,name:s}:null;}).filter(Boolean):[];
    var pk=document.createElement('div');
    pk.className='pk';pk.dataset.source=col.source||'';pk.dataset.multi=multi?'1':'0';pk.dataset.valuemode=col.valueMode||'id';
    var hid=document.createElement('input');hid.type='hidden';hid.className='pk-val';hid.value=multi?JSON.stringify(initial):(initial||'');
    hid.setAttribute('data-f',col.name);
    var txt=document.createElement('input');txt.type='text';txt.className='pk-input';txt.autocomplete='off';
    txt.placeholder=col.placeholder||(multi?'輸入關鍵字搜尋並加入…':('搜尋'+(col.pickLabel||col.label||'')+'…'));
    if(!multi){
      txt.value=(col.displayField&&row[col.displayField])?row[col.displayField]:((col.valueMode||'id')!=='id'?(row[col.name]||''):'');
      if(col.displayField)txt.setAttribute('data-f',col.displayField);
    }
    var mn=document.createElement('div');mn.className='pk-menu';mn.hidden=true;
    pk.appendChild(hid);pk.appendChild(txt);pk.appendChild(mn);
    if(multi){
      var chips=document.createElement('div');chips.className='pk-chips';pk.appendChild(chips);
      hid.addEventListener('input',function(){try{row[col.name]=JSON.parse(hid.value||'[]');}catch(e){row[col.name]=[];}after();});
    } else {
      hid.addEventListener('input',function(){row[col.name]=hid.value;after();});
      txt.addEventListener('input',function(){
        if((col.valueMode||'id')!=='id'&&!col.displayField){row[col.name]=txt.value;}
        if(col.displayField){row[col.displayField]=txt.value;}
        after();
      });
      pk.addEventListener('pk-picked',function(e){
        row[col.name]=(col.valueMode||'id')==='id'?e.detail.id:e.detail.label;
        if(col.displayField){
          var raw=e.detail.fill?e.detail.fill[col.displayField]:'';
          row[col.displayField]=(raw===undefined||raw===null||raw==='')?e.detail.label:raw;
        }
        after();
      });
      pk.addEventListener('pk-cleared',function(){row[col.name]='';if(col.displayField)row[col.displayField]='';after();});
    }
    return pk;
  }
  el=document.createElement('input');
  el.type=col.type==='number'||col.type==='money'?'number':col.type==='date'?'date':col.type==='time'?'time':'text';
  if(el.type==='number')el.step='0.01';
  el.value=row[col.name]==null?'':row[col.name];
  el.setAttribute('data-f',col.name);
  if(col.name==='description'||col.name==='work_content'||col.name==='item_name'||col.name==='work_location')el.className='item-desc';
  el.addEventListener('input',function(){row[col.name]=el.type==='number'?(el.value===''?'':Number(el.value)):el.value;after();});
  return el;
}
document.querySelectorAll('.item-editor').forEach(function(editor){
  var target=document.getElementById(editor.dataset.target);
  var columns=jsonParse(editor.dataset.columns,'[]');
  var layout=editor.dataset.layout||'table';
  var visible=columns.filter(function(c){return !c.hidden;});
  var rows=jsonParse(target.value,'[]');if(!Array.isArray(rows))rows=[];
  var body=document.createElement('div');
  var tools=document.createElement('div');tools.className='item-toolbar';
  var add=document.createElement('button');add.type='button';add.className='btn ghost small';
  add.textContent='＋ '+(editor.dataset.addLabel||'新增一行');
  var count=document.createElement('span');count.className='muted';
  tools.appendChild(add);tools.appendChild(count);
  editor.appendChild(body);editor.appendChild(tools);
  var sync=function(){target.value=JSON.stringify(rows);count.textContent=rows.length?('共 '+rows.length+' 項'):'';};
  var render=function(){
    body.innerHTML='';
    if(!rows.length){
      var empty=document.createElement('div');empty.className='wf-empty';
      empty.textContent='尚未添加項目，點「'+(editor.dataset.addLabel||'新增一行')+'」開始';
      body.appendChild(empty);
    } else if(layout==='cards'){
      rows.forEach(function(row,i){
        var card=document.createElement('div');card.className='wf-card';
        var head=document.createElement('div');head.className='wf-head';
        var title=document.createElement('b');title.textContent=(editor.dataset.rowLabel||'工作')+' '+(i+1);
        var del=document.createElement('button');del.type='button';del.className='btn danger small';del.textContent='刪除';
        del.onclick=function(){rows.splice(i,1);sync();render();};
        head.appendChild(title);head.appendChild(del);card.appendChild(head);
        var links=visible.filter(function(c){return c.link;});
        var grid=visible.filter(function(c){return !c.link;});
        if(links.length){
          var linkBox=document.createElement('div');linkBox.className='wf-link';
          links.forEach(function(c){
            var cell=document.createElement('label');cell.className='wf-cell';
            var cap=document.createElement('span');cap.textContent=c.label||c.name;cell.appendChild(cap);
            cell.appendChild(wfInput(c,row,function(){sync();}));
            if(c.hintField&&row[c.hintField]){
              var hint=document.createElement('span');hint.className='wf-hint';hint.textContent=row[c.hintField];cell.appendChild(hint);
            }
            linkBox.appendChild(cell);
          });
          card.appendChild(linkBox);
        }
        var g=document.createElement('div');g.className='wf-grid';
        grid.forEach(function(c){
          var cell=document.createElement('label');cell.className='wf-cell'+(c.wide?' wide':'');
          var cap=document.createElement('span');cap.textContent=c.label||c.name;cell.appendChild(cap);
          cell.appendChild(wfInput(c,row,function(){sync();}));
          g.appendChild(cell);
        });
        card.appendChild(g);
        body.appendChild(card);
        wfMount(card);
      });
    } else {
      var table=document.createElement('table');var thead=document.createElement('thead');
      thead.innerHTML='<tr>'+visible.map(function(c){return '<th>'+escapeHtml(c.label||c.name)+'</th>';}).join('')+'<th></th></tr>';
      table.appendChild(thead);
      var tbody=document.createElement('tbody');table.appendChild(tbody);
      rows.forEach(function(row,i){
        var tr=document.createElement('tr');
        visible.forEach(function(c){
          var td=document.createElement('td');td.appendChild(wfInput(c,row,function(){sync();}));tr.appendChild(td);
        });
        var td=document.createElement('td');
        var del=document.createElement('button');del.type='button';del.className='btn danger small';del.textContent='刪除';
        del.onclick=function(){rows.splice(i,1);sync();render();};
        td.appendChild(del);tr.appendChild(td);tbody.appendChild(tr);
        wfMount(tr);
      });
      body.appendChild(table);
    }
    sync();
  };
  add.onclick=function(){var seed={};visible.forEach(function(c){if(c.default!==undefined)seed[c.name]=c.default;});rows.push(seed);render();};
  render();
});
document.querySelectorAll('[data-rich]').forEach(box=>{const target=document.getElementById(box.dataset.rich);const editor=box.querySelector('.rich-editor');editor.innerHTML=target.value;const sync=()=>target.value=editor.innerHTML;editor.addEventListener('input',sync);box.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>{document.execCommand(b.dataset.cmd,false,b.dataset.value||null);editor.focus();sync()}));box.closest('form')?.addEventListener('submit',sync)});
document.querySelectorAll('[data-upload]').forEach(input=>{input.addEventListener('change',async()=>{if(!input.files.length)return;const status=input.parentElement.querySelector('.upload-status');status.textContent='上傳中…';const target=document.getElementById(input.dataset.target);for(const file of input.files){const fd=new FormData();fd.append('file',file);fd.append('__csrf',input.dataset.csrf);fd.append('key',input.dataset.key);fd.append('id',input.dataset.id);fd.append('field',input.dataset.field);try{const r=await fetch('/upload',{method:'POST',body:fd});const data=await r.json();if(!r.ok)throw new Error(data.error||'上傳失敗');const values=jsonParse(target.value,'[]');values.push(data.file);target.value=JSON.stringify(values);const list=input.closest('.frow').querySelector('.uploaded-list');const a=document.createElement('a');a.className='attachment';a.href=data.file.file_url;a.target='_blank';a.textContent=data.file.file_name;list.appendChild(a);status.textContent='上傳完成'}catch(e){status.textContent=e.message}}input.value=''})});
document.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('submit',e=>{if(!confirm(el.dataset.confirm||'確定執行？'))e.preventDefault()}));
// datalist 在輸入框有值時只會顯示匹配項（例：車輛狀態只看到「可用」）。
// 聚焦時暫存並清空，讓全部選項出現；沒打字就失焦則還原。
document.querySelectorAll('input[list]').forEach(function(inp){
  var held='';
  inp.addEventListener('focus',function(){held=inp.value;inp.dataset.dirty='';if(inp.value)inp.value='';});
  inp.addEventListener('input',function(){inp.dataset.dirty='1';});
  inp.addEventListener('blur',function(){if(!inp.value&&!inp.dataset.dirty&&held)inp.value=held;held='';});
});
document.querySelectorAll('dialog[data-auto-open]').forEach(function(d){if(typeof d.showModal==='function'){try{d.showModal()}catch(e){}}});
// 排班儲存後自動捲到該日期，解決「新增完不知道加到哪去」
document.querySelectorAll('[data-focus-date]').forEach(function(el){el.scrollIntoView({block:'center'});el.classList.add('picked');});
document.querySelectorAll('dialog.modal').forEach(function(d){
  d.querySelectorAll('[data-dlg-close]').forEach(function(b){b.addEventListener('click',function(){d.close();});});
  d.addEventListener('click',function(e){if(e.target===d)d.close();});
});
document.querySelectorAll('[data-dlg-open]').forEach(function(b){
  b.addEventListener('click',function(){
    var d=document.getElementById(b.dataset.dlgOpen);
    if(!d)return;
    if(b.dataset.date){var inp=d.querySelector('[name="schedule_date"]');if(inp)inp.value=b.dataset.date;}
    if(typeof d.showModal==='function'){d.showModal();}else{d.setAttribute('open','');}
    var first=d.querySelector('.pk-input');if(first)first.focus();
  });
});
`;

export function layout({ title, body, user = null, active = '', csrf = '', wide = false, extraHead = '' }) {
  const nav = NAV.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(user?.role));
    if (!items.length) return '';
    const open = items.some((item) => item.key === active);
    return `<details class="navgrp" data-g="${esc(group.group)}"${open ? ' open' : ''}><summary><b>${esc(group.group)}</b></summary><nav>${items.map((item) => `<a class="${active === item.key ? 'on' : ''}" href="${esc(item.path)}">${esc(item.label)}</a>`).join('')}</nav></details>`;
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
  if (type === 'pick' && ctx.store && field.source) {
    const label = pickLabel(ctx.store, field.source, value);
    return label ? esc(label) : (value ? esc(value) : '<span class="muted">—</span>');
  }
  if (type === 'picks') {
    const list = Array.isArray(value)
      ? value
      : (typeof value === 'string' && value.trim() ? value.split(/[、,，]/).map((v) => v.trim()).filter(Boolean) : []);
    if (!list.length) return '<span class="muted">—</span>';
    return `<span>${list.map((v) => esc(typeof v === 'object' ? (v.label || v.name || v.id) : v)).join('、')}</span>`;
  }
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
    if (type === 'items' && Array.isArray(value)) return renderItems(value, field.itemColumns || [], ctx, field.layout || 'table');
    const files = collectAttachments(value);
    return `${files.length ? renderAttachments(value, ctx) : ''}<details><summary>查看結構化資料</summary><pre class="json">${esc(JSON.stringify(value, null, 2))}</pre></details>`;
  }
  if (type === 'truncate') return truncate(value, field.length || 80);
  return value === '' || value === null || value === undefined ? '<span class="muted">—</span>' : esc(value);
}

export function renderItems(items, columns, ctx = {}, layout = 'table') {
  const configured = columns.filter((c) => !c.hidden);
  const cols = configured.length ? configured : [...new Set(items.flatMap((r) => Object.keys(r || {})))].filter((k) => !/^(id|created_|updated_)/.test(k)).slice(0, 8).map((name) => ({ name, label: name }));
  if (!items.length) return '<span class="muted">—</span>';
  if (layout === 'cards') {
    return `<div class="item-cards">${items.map((row, index) => `<div class="item-card"><div class="item-card-h">工作 ${index + 1}</div><dl>${cols.map((c) => `<dt>${esc(c.label || c.name)}</dt><dd>${renderValue(row?.[c.name], { ...c, key: c.name }, ctx)}</dd>`).join('')}</dl></div>`).join('')}</div>`;
  }
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c.label || c.name)}</th>`).join('')}</tr></thead><tbody>${items.map((row) => `<tr>${cols.map((c) => `<td>${renderValue(row?.[c.name], { ...c, key: c.name }, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function dataTable({ cfg, rows, ctx = {}, actions = true }) {
  const columns = (cfg.columns || []).filter((c) => !(c.key === 'id' && c.label === '操作'));
  const hrefFor = (column, row) => {
    if (column.link === 'detail') return ctx.viewHref ? ctx.viewHref(row) : `/view/${cfg.key}/${encodeURIComponent(row.id)}`;
    if (column.link === 'customer') return row.customer_id ? `/view/customers/${encodeURIComponent(row.customer_id)}` : '';
    if (column.link === 'vehicle-card') return `/view/vehicles/${encodeURIComponent(row.id)}`;
    return '';
  };
  const cell = (column, row) => {
    if (column.value) return column.value(row, ctx);
    const raw = renderValue(row[column.key], { ...column, name: column.key }, ctx);
    const href = hrefFor(column, row);
    if (!href || row[column.key] === '' || row[column.key] === null || row[column.key] === undefined) return raw;
    const extra = column.link === 'vehicle-card' ? ` data-vehicle-card="${esc(row.id)}"` : '';
    return `<a class="tlink" href="${esc(href)}"${extra}>${raw}</a>`;
  };
  const operations = (row) => {
    if (ctx.rowActions) return ctx.rowActions(row);
    if (ctx.trash) {
      return `<form method="post" action="/trash/restore" style="display:inline"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><input type="hidden" name="key" value="${esc(cfg.key)}"><input type="hidden" name="id" value="${esc(row.id)}"><button class="btn ghost small">還原</button></form> <form method="post" action="/trash/purge" style="display:inline" data-confirm="永久刪除後無法還原，確定？"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><input type="hidden" name="key" value="${esc(cfg.key)}"><input type="hidden" name="id" value="${esc(row.id)}"><button class="btn danger small">永久刪除</button></form>`;
    }
    const parts = [`<a class="btn ghost small" href="${esc(ctx.viewHref ? ctx.viewHref(row) : `${cfg.listPath}/${encodeURIComponent(row.id)}`)}">查看</a>`];
    if (ctx.extraActions) parts.push(ctx.extraActions(row));
    const editable = ctx.canEdit !== false && (!ctx.canEditRow || ctx.canEditRow(row));
    if (editable && cfg.editRoles?.includes(ctx.user?.role)) parts.push(`<a class="btn ghost small" href="${esc(ctx.editHref ? ctx.editHref(row) : `/edit/${cfg.key}/${encodeURIComponent(row.id)}`)}">編輯</a>`);
    if (editable && ctx.deleteHref && cfg.editRoles?.includes(ctx.user?.role)) parts.push(`<form method="post" action="${esc(ctx.deleteHref(row))}" style="display:inline" data-confirm="確定移至回收桶？"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><button class="btn danger small">刪除</button></form>`);
    return parts.join(' ');
  };
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}${actions ? '<th>操作</th>' : ''}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td>${cell(c, row)}</td>`).join('')}${actions ? `<td class="actions">${operations(row)}</td>` : ''}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length + (actions ? 1 : 0)}">暫無資料</td></tr>`}</tbody></table></div>`;
}

export function pager({ url, page, pages, total }) {
  return `<div class="pager">${pageLinks(url, page, pages)}<span class="muted">第 ${page} / ${pages || 1} 頁 · 共 ${Number(total).toLocaleString()} 筆</span></div>`;
}

function optionsFor(field, ctx) {
  const source = field.options || ctx.options?.[field.name] || [];
  return source.map((o) => typeof o === 'object' ? o : { value: o, label: o });
}

export function pickerControl({ source, name = '', value = '', valueLabel = '', displayField = '', fill = {}, multi = false, placeholder = '', valueMode = 'id', ctx = {} }) {
  const label = valueLabel || (displayField ? '' : '');
  if (multi) {
    const list = Array.isArray(value) ? value : [];
    return `<div class="pk" data-source="${esc(source)}" data-multi="1" data-valuemode="${esc(valueMode)}"><input type="hidden" class="pk-val"${name ? ` name="${esc(name)}"` : ''} value="${esc(JSON.stringify(list))}"><input type="text" class="pk-input" autocomplete="off" placeholder="${esc(placeholder || '輸入關鍵字搜尋並加入…')}"><div class="pk-menu" hidden></div><div class="pk-chips"></div></div>`;
  }
  return `<div class="pk" data-source="${esc(source)}" data-multi="0" data-valuemode="${esc(valueMode)}"><input type="hidden" class="pk-val"${name ? ` name="${esc(name)}"` : ''} value="${esc(value ?? '')}"><input type="text" class="pk-input" autocomplete="off" value="${esc(label)}" placeholder="${esc(placeholder || '輸入關鍵字搜尋…')}"><div class="pk-menu" hidden></div></div>`;
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
  if (field.type === 'pick' || field.type === 'picks') {
    const multi = field.type === 'picks';
    const valueMode = field.valueMode || 'id';
    const raw = multi
      ? (Array.isArray(value) ? value : (typeof value === 'string' && value.trim() ? value.split(/[、,，]/).map((v) => ({ id: v.trim(), label: v.trim(), name: v.trim() })) : []))
      : (value ?? '');
    const label = multi ? '' : ((field.valueMode || 'id') === 'id' ? (ctx.store ? pickLabel(ctx.store, field.source, raw) : '') : str(raw));
    return pickerControl({ source: field.source, name, value: raw, valueLabel: label, displayField: field.displayField || '', fill: field.fill || {}, multi, valueMode, placeholder: field.placeholder || (multi ? `輸入關鍵字搜尋${field.pickLabel || ''}…` : `搜尋${field.pickLabel || ''}…`), ctx });
  }
  if (field.type === 'select') {
    const opts = optionsFor(field, ctx);
    const listId = `dl_${id}`;
    const current = value === null || value === undefined ? '' : String(value);
    return `<input ${common} list="${listId}" value="${esc(current)}" autocomplete="off" placeholder="可輸入搜尋或下拉選擇"${field.placeholder ? ` data-ph="${esc(field.placeholder)}"` : ''}><datalist id="${listId}">${opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</datalist>`;
  }
  if (field.type === 'checkbox') return `<input type="hidden" name="${name}" value="0"><label style="display:flex;align-items:center;gap:7px;font-weight:400"><input type="checkbox" name="${name}" value="1" ${value === true || value === 1 || value === '1' ? 'checked' : ''}> ${esc(field.checkboxLabel || '是')}</label>`;
  if (field.type === 'items') {
    const items = Array.isArray(value) ? value : [];
    return `<textarea class="hidden items-json" ${common}>${esc(JSON.stringify(items))}</textarea><div class="item-editor" data-target="${id}" data-columns="${esc(JSON.stringify(field.itemColumns || []))}" data-layout="${esc(field.layout || 'table')}" data-add-label="${esc(field.addLabel || '新增一行')}" data-row-label="${esc(field.rowLabel || '工作')}"></div>`;
  }
  if (field.type === 'files') {
    const files = Array.isArray(value) ? value : value ? [value] : [];
    const uploadId = ctx.rowId || '';
    return `<textarea class="hidden" ${common}>${esc(JSON.stringify(files))}</textarea><div class="uploaded-list attachments">${renderAttachments(files, ctx)}</div><div class="bar noprint" style="margin:7px 0 0"><input type="file" multiple data-upload data-target="${id}" data-key="${esc(ctx.cfg.key)}" data-id="${esc(uploadId)}" data-field="${name}" data-csrf="${esc(ctx.csrf)}"><span class="upload-status muted">可上傳 PDF、圖片、Office 文件，單檔 20 MB</span></div>`;
  }
  const type = field.type === 'number' || field.type === 'money' ? 'number' : ['date', 'time', 'email', 'tel', 'url', 'password', 'color'].includes(field.type) ? field.type : 'text';
  const step = type === 'number' ? ' step="0.01"' : '';
  return `<input type="${type}" ${common} value="${esc(value ?? '')}"${step}${placeholder}>`;
}

export function formGrid(fields, row = {}, ctx = {}) {
  const hidden = fields.filter((f) => f.hidden).map((f) => {
    const raw = row[f.name];
    const value = raw !== null && raw !== undefined && typeof raw === 'object' ? JSON.stringify(raw) : (raw ?? '');
    return `<input type="hidden" name="${esc(f.name)}" value="${esc(value)}">`;
  }).join('');
  return hidden + fields.filter((f) => !f.hidden).map((f) => `<div class="frow ${f.wide || ['textarea', 'richtext', 'items', 'files', 'json', 'picks'].includes(f.type) ? 'wide' : ''}"><label for="f_${esc(f.name)}">${esc(f.label)}${f.required ? ' <span class="required">*</span>' : ''}</label>${fieldInput(f, row[f.name], ctx)}</div>`).join('');
}

export function formPage({ cfg, row = {}, ctx = {}, error = '', back = null }) {
  const isEdit = !!ctx.originalId;
  const rowId = ctx.rowId || row.id || '';
  const sections = [];
  const hiddenFields = [];
  let current = null;
  for (const field of cfg.fields) {
    if (field.hidden) {
      const raw = row[field.name];
      const value = raw !== null && raw !== undefined && typeof raw === 'object' ? JSON.stringify(raw) : (raw ?? '');
      hiddenFields.push(`<input type="hidden" name="${esc(field.name)}" value="${esc(value)}">`);
      continue;
    }
    if (field.section && field.section !== current) {
      sections.push({ type: 'section', label: field.section });
      current = field.section;
    }
    sections.push({ type: 'field', field });
  }
  const body = `<div class="breadcrumbs"><a href="${esc(back || cfg.listPath)}">${esc(cfg.plural)}</a> / ${isEdit ? '編輯' : '新增'}${esc(cfg.title)}</div><h1>${isEdit ? '編輯' : '新增'}${esc(cfg.title)}</h1><div class="sub">帶 <span class="required">*</span> 為必填；儲存後會寫入審計記錄</div>${error ? `<div class="flash error">${esc(error)}</div>` : ''}<form class="card" method="post" action="/save/${esc(cfg.key)}"><input type="hidden" name="__csrf" value="${esc(ctx.csrf)}"><input type="hidden" name="__id" value="${esc(ctx.originalId || '')}"><input type="hidden" name="__new_id" value="${esc(rowId)}"><input type="hidden" name="__expected_updated" value="${esc(row.updated_date || '')}"><input type="hidden" name="__back" value="${esc(back || cfg.listPath)}">${hiddenFields.join('')}<div class="fgrid">${sections.map((entry) => entry.type === 'section' ? `<div class="fsection">${esc(entry.label)}</div>` : `<div class="frow ${entry.field.wide || ['textarea', 'richtext', 'items', 'files', 'json'].includes(entry.field.type) ? 'wide' : ''}"><label for="f_${esc(entry.field.name)}">${esc(entry.field.label)}${entry.field.required ? ' <span class="required">*</span>' : ''}</label>${fieldInput(entry.field, row[entry.field.name], { ...ctx, cfg, rowId })}</div>`).join('')}</div><div class="bar" style="margin-top:20px"><button class="btn" type="submit">儲存</button><a class="btn ghost" href="${esc(back || cfg.listPath)}">取消</a>${isEdit ? `<span class="muted">記錄 ID：${esc(rowId)}</span>` : ''}</div></form>`;
  return layout({ title: `${isEdit ? '編輯' : '新增'}${cfg.title}`, body, user: ctx.user, active: cfg.active, csrf: ctx.csrf, wide: true });
}

export function detailPage({ cfg, row, ctx = {}, title = null, before = '', after = '', back = null, tools = '' }) {
  const sections = [];
  let currentSection = '';
  let currentFields = [];
  const flush = () => {
    if (!currentFields.length) return;
    sections.push(`<div class="card"><h3>${esc(currentSection || '基本資料')}</h3><dl class="detail-grid">${currentFields.join('')}</dl></div>`);
    currentFields = [];
  };
  for (const field of cfg.fields) {
    if (field.hidden) continue;
    if (field.section && field.section !== currentSection) {
      flush();
      currentSection = field.section;
    }
    currentFields.push(`<div class="detail-row ${field.wide || ['textarea', 'richtext', 'items', 'files', 'json'].includes(field.type) ? 'wide' : ''}"><dt>${esc(field.label)}</dt><dd>${renderValue(row[field.name], field, ctx)}</dd></div>`);
  }
  flush();
  const label = title || row[cfg.labelField] || row.id;
  const body = `<div class="breadcrumbs"><a href="${esc(back || cfg.listPath)}">${esc(cfg.plural)}</a> / ${esc(label)}</div><h1>${esc(label)}</h1><div class="sub">${esc(cfg.title)} · ID ${esc(row.id)}${row.__deleted ? ' · <span class="pill r">回收筒</span>' : ''}</div>${before}<div class="bar noprint"><a class="btn ghost" href="${esc(back || cfg.listPath)}">返回</a>${cfg.editRoles?.includes(ctx.user?.role) ? `<a class="btn" href="/edit/${esc(cfg.key)}/${encodeURIComponent(row.id)}">編輯</a>` : ''}<a class="btn ghost" href="/print/${esc(cfg.key)}/${encodeURIComponent(row.id)}" target="_blank">列印 / PDF</a>${tools}</div>${sections.join('')}${after}`;
  return layout({ title: label, body, user: ctx.user, active: cfg.active, csrf: ctx.csrf, wide: true });
}

export function kpis(items) {
  return `<div class="kpis">${items.map((item) => `<div class="kpi"><b>${item.raw ? item.value : esc(item.value)}</b><span>${esc(item.label)}</span></div>`).join('')}</div>`;
}

export function simpleTable(columns, rows, ctx = {}) {
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td>${c.value ? c.value(row, ctx) : renderValue(row[c.key], { ...c, name: c.key }, ctx)}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length}">暫無資料</td></tr>`}</tbody></table></div>`;
}
