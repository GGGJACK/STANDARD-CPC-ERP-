import { AMOUNT_FIELDS, NAV } from './config.mjs';
import { pickLabel } from './pickers.mjs';
import { arr, displayDate, esc, isIntegerField, money, nl2br, pageLinks, plain, sanitizeHtml, str, truncate } from './utils.mjs';

const ROLE_NAMES = { management: '管理層', office: '辦公室', front: '前線員工', accounting: '會計', public: '公開訪客' };
export const roleName = (role) => ROLE_NAMES[role] || role;

const COMMON_CSS = `
:root{
  --brand:#0f766e;--brand-2:#0b5f58;--brand-50:#ecfdf5;--brand-100:#d3f2e9;
  --grad:linear-gradient(135deg,#2563eb 0%,#0d9488 100%);
  --ink:#0f172a;--ink-2:#334155;--muted:#64748b;--muted-2:#94a3b8;
  --line:#e4e9f0;--line-2:#eef2f7;--bg:#f6f8fb;--card:#ffffff;
  --danger:#b42318;--danger-50:#fef3f2;--warn:#b54708;--warn-50:#fffaeb;--info:#1d4ed8;
  --r:12px;--r-sm:8px;--r-xs:6px;
  --sh-sm:0 1px 2px rgba(16,24,40,.05);
  --sh:0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04);
  --sh-lg:0 12px 34px rgba(16,24,40,.13);
  --side:250px;
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--ink);font:14px/1.6 "Microsoft JhengHei","PingFang HK","PingFang SC",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:none;color:var(--brand-2)}
.ic{width:16px;height:16px;flex:none;display:inline-block;vertical-align:-2px}
.app{display:flex;min-height:100vh}

/* ── 側邊欄 ───────────────────────────────────────────── */
aside{position:fixed;inset:0 auto 0 0;width:var(--side);overflow:auto;background:#fff;border-right:1px solid var(--line);z-index:20;display:flex;flex-direction:column;scrollbar-width:thin}
.brand{display:flex;align-items:center;gap:11px;padding:18px 16px;border-bottom:1px solid var(--line-2)}
.brand-logo{width:38px;height:38px;border-radius:11px;background:var(--grad);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(37,99,235,.28);flex:none}
.brand-logo svg{width:20px;height:20px;color:#fff}
.brand b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:1.3}
.brand span{display:block;font-size:11px;color:var(--muted);margin-top:1px}
.navscroll{flex:1;padding:8px 10px 14px;overflow:auto}
.navg{padding:12px 8px 5px;color:var(--muted-2);font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.navgrp{border:0;margin:0;display:block}
.navgrp>summary{display:flex;align-items:center;gap:9px;cursor:pointer;list-style:none;padding:8px 10px;margin:1px 0;border-radius:var(--r-sm);color:var(--ink-2);font-size:13px;font-weight:700;user-select:none;transition:background .14s,color .14s}
.navgrp>summary::-webkit-details-marker{display:none}
.navgrp>summary::after{content:'';width:14px;height:14px;margin-left:auto;background:currentColor;opacity:.5;mask:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 18 6-6-6-6'/%3E%3C/svg%3E") center/contain no-repeat;-webkit-mask:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 18 6-6-6-6'/%3E%3C/svg%3E") center/contain no-repeat;transition:transform .18s}
.navgrp[open]>summary::after{transform:rotate(90deg)}
.navgrp>summary:hover{background:#f1f5f9;color:var(--brand)}
.navgrp>summary b{font-weight:600}
.navgrp>summary .ic{color:var(--muted);transition:color .14s}
.navgrp[open]>summary .ic,.navgrp>summary:hover .ic{color:var(--brand)}
.navgrp nav{padding:2px 0 5px}
aside nav a{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 33px;margin:1px 0;border-radius:var(--r-sm);color:#475569;font-size:13px;line-height:1.45;position:relative;transition:background .14s,color .14s}
aside nav a::before{content:'';position:absolute;left:19px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#cbd5e1;transition:background .14s}
aside nav a:hover{background:#f1f5f9;color:var(--brand)}
aside nav a:hover::before{background:var(--brand)}
aside nav a.on{background:var(--grad);color:#fff;font-weight:600;box-shadow:0 4px 12px rgba(37,99,235,.24)}
aside nav a.on::before{background:#fff;opacity:.9}
.who{border-top:1px solid var(--line-2);padding:12px 14px;display:flex;align-items:center;gap:10px}
.who-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#60a5fa,#2dd4bf);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex:none}
.who-main{min-width:0;flex:1}
.who b{display:block;font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who small{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who a{color:var(--muted);display:flex;padding:5px;border-radius:6px}
.who a:hover{background:#f1f5f9;color:var(--danger)}

/* ── 主區域 ───────────────────────────────────────────── */
main{margin-left:var(--side);padding:22px 28px 64px;width:calc(100% - var(--side));max-width:1720px;min-width:0}
.pagehead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 22px;flex-wrap:wrap;margin:0 0 18px}
.pagehead-main{min-width:0}
.pagehead-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h1{font-size:25px;line-height:1.25;letter-spacing:-.015em;font-weight:700;margin:0}
h2{font-size:15.5px;font-weight:700;letter-spacing:-.005em;margin:26px 0 11px;color:var(--ink)}
h3{font-size:14px;font-weight:700;margin:0 0 12px;color:var(--ink)}
.sub{color:var(--muted);font-size:12.5px;margin:5px 0 0;line-height:1.55}
.breadcrumbs{font-size:12px;color:var(--muted);margin-bottom:8px}
.breadcrumbs a{color:var(--muted)}
.breadcrumbs a:hover{color:var(--brand)}

/* ── 卡片 ─────────────────────────────────────────────── */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;margin:0 0 15px;box-shadow:var(--sh-sm)}
.card.flush{padding:0;overflow:auto}
.card h3{padding-bottom:11px;border-bottom:1px solid var(--line-2);margin-bottom:14px}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.bar.right{justify-content:flex-end}
.bar.center{justify-content:center}
.spacer{flex:1}

/* ── 按鈕 ─────────────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--brand);border-radius:var(--r-sm);background:var(--brand);color:#fff;padding:0 13px;font-size:13px;font-weight:500;line-height:1;height:36px;cursor:pointer;text-decoration:none;transition:background .14s,border-color .14s,box-shadow .14s,color .14s;white-space:nowrap;box-shadow:0 1px 2px rgba(16,24,40,.06)}
.btn:hover{background:var(--brand-2);border-color:var(--brand-2);color:#fff;text-decoration:none}
.btn .ic{width:15px;height:15px}
.btn.ghost{background:#fff;color:var(--ink-2);border-color:#d6dee8}
.btn.ghost:hover{background:#f8fafc;border-color:#c3cedb;color:var(--ink)}
.btn.danger{background:#fff;color:var(--danger);border-color:#f0c9c4}
.btn.danger:hover{background:var(--danger-50);border-color:#e6a9a2;color:var(--danger)}
.btn.warn{background:#fff;color:var(--warn);border-color:#f2d9a8}
.btn.warn:hover{background:var(--warn-50)}
.btn.small{height:28px;padding:0 9px;font-size:12px;border-radius:var(--r-xs);gap:4px}
.btn.small .ic{width:13px;height:13px}
.btn.active{background:var(--brand-50);color:var(--brand);border-color:#9fd6c8}
.btn.block{width:100%}
.btn:disabled{opacity:.55;cursor:not-allowed}

/* ── 表單 ─────────────────────────────────────────────── */
input,select,textarea{font-family:inherit;font-size:13px;color:var(--ink);background:#fff;border:1px solid #d6dee8;border-radius:var(--r-sm);padding:7px 10px;max-width:100%;transition:border-color .14s,box-shadow .14s;line-height:1.5}
input{height:36px}
select{height:36px;padding-right:26px}
textarea{padding:9px 10px}
input:hover,select:hover,textarea:hover{border-color:#c3cedb}
input:focus,select:focus,textarea:focus{outline:none;border-color:#5eb3a3;box-shadow:0 0 0 3px rgba(15,118,110,.14)}
input[type=checkbox]{width:15px;height:15px;height:15px;padding:0;accent-color:var(--brand);border-radius:4px;vertical-align:-2px;cursor:pointer}
input[type=radio]{accent-color:var(--brand);width:15px;height:15px;height:15px;padding:0}
input[type=file]{height:auto;padding:6px 9px;font-size:12.5px}
input[type=color]{width:62px;height:36px;padding:3px;cursor:pointer;border-radius:var(--r-sm)}
input[type=color]::-webkit-color-swatch-wrapper{padding:0}
input[type=color]::-webkit-color-swatch{border:0;border-radius:5px}
.search{min-width:240px;flex:1;max-width:420px}
.fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 20px}
.frow{display:flex;flex-direction:column;gap:6px;min-width:0}
.frow.wide{grid-column:1/-1}
.frow>label{font-size:12.5px;color:#475569;font-weight:600}
.frow input,.frow select,.frow textarea{width:100%}
.frow input[type=checkbox],.frow input[type=radio]{width:15px;height:15px}
.frow input[type=color]{width:62px}
.frow input[type=file]{width:auto}
.fsection{grid-column:1/-1;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line);margin:10px 0 2px;padding-bottom:8px;font-size:13.5px;color:var(--ink);font-weight:700}
.fsection::before{content:'';width:3px;height:14px;border-radius:2px;background:var(--grad)}
.required{color:var(--danger)}
.hint{font-size:11.5px;color:var(--muted);margin-top:1px}

/* ── 表格 ─────────────────────────────────────────────── */
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
th,td{padding:10px 13px;border-bottom:1px solid var(--line-2);text-align:left;vertical-align:middle}
th{background:#f8fafc;color:#64748b;font-size:11.5px;font-weight:700;letter-spacing:.03em;white-space:nowrap;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:1}
thead tr:first-child th:first-child{border-top-left-radius:var(--r)}
thead tr:first-child th:last-child{border-top-right-radius:var(--r)}
tbody tr{transition:background .1s}
tbody tr:hover{background:#f9fbfd}
tbody tr:last-child td{border-bottom:0}
.table-wrap{overflow:auto}
.nw{white-space:nowrap}
td.nw{max-width:210px;overflow:hidden;text-overflow:ellipsis}
td{max-width:340px}
form.card>.bar{margin:20px -20px -18px;padding:14px 20px;border-top:1px solid var(--line);background:#fbfcfd;border-radius:0 0 var(--r) var(--r)}
.act-col{position:sticky;right:0;background:#fff;z-index:2;box-shadow:-8px 0 10px -8px rgba(16,24,40,.16)}
th.act-col{background:#f8fafc;z-index:3}
tbody tr:hover td.act-col{background:#f9fbfd}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.actions{white-space:nowrap}
td.actions{display:table-cell}
td.actions .btn.small{background:transparent;border-color:transparent;color:#475569;box-shadow:none}
td.actions .btn.small:hover{background:#eef2f7;color:var(--brand)}
td.actions .btn.danger{background:transparent;border-color:transparent;color:var(--danger)}
td.actions .btn.danger:hover{background:var(--danger-50)}
td.actions form{display:inline}
.muted{color:var(--muted)}
.dim{color:#b6c0cc}
.empty{text-align:center;color:var(--muted);padding:46px 20px!important;font-size:13px}
td.empty::before,.card.empty::before{content:'';display:block;width:34px;height:34px;margin:0 auto 10px;opacity:.45;background:currentColor;mask:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6'%3E%3Cpath d='M3 13h4l2 3h6l2-3h4'/%3E%3Cpath d='M5 5h14l2 8v6H3v-6z'/%3E%3C/svg%3E") center/contain no-repeat;-webkit-mask:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6'%3E%3Cpath d='M3 13h4l2 3h6l2-3h4'/%3E%3Cpath d='M5 5h14l2 8v6H3v-6z'/%3E%3C/svg%3E") center/contain no-repeat}
.card.empty{padding:50px 20px;box-shadow:none;border-style:dashed;background:#fcfdfe}
.mask{letter-spacing:3px;color:#98a2b1}

/* ── 標籤 ─────────────────────────────────────────────── */
.pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:#f1f5f9;color:#475569;padding:2px 9px;font-size:11.5px;font-weight:600;line-height:1.65;white-space:nowrap;border:1px solid transparent}
.pill.g{background:#ecfdf5;color:#047857;border-color:#b8e8d6}
.pill.r{background:var(--danger-50);color:var(--danger);border-color:#f6d2ce}
.pill.y{background:var(--warn-50);color:var(--warn);border-color:#f5e2b8}
.pill.b{background:#eff6ff;color:#1d4ed8;border-color:#c9ddfb}
.badge-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 6px;border-radius:999px;background:var(--brand-50);color:var(--brand);font-size:11px;font-weight:700}
tr.picked td{background:#f0fbf6}

/* ── KPI ──────────────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:14px;margin-bottom:18px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:15px 16px;display:flex;align-items:center;gap:13px;box-shadow:var(--sh-sm);transition:box-shadow .15s,transform .15s}
.kpi:hover{box-shadow:var(--sh);transform:translateY(-1px)}
.kpi-ico{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none;background:#eff6ff;color:#2563eb}
.kpi-ico .ic{width:19px;height:19px}
.kpi-ico.amber{background:var(--warn-50);color:#d97706}
.kpi-ico.rose{background:var(--danger-50);color:#e0533f}
.kpi-ico.emerald{background:var(--brand-50);color:#0f766e}
.kpi-ico.violet{background:#f5f3ff;color:#7c3aed}
.kpi-main{min-width:0}
.kpi b{display:block;color:var(--ink);font-size:23px;line-height:1.2;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kpi span{display:block;font-size:12px;color:var(--muted);margin-top:2px}

/* ── 提示條 ───────────────────────────────────────────── */
.notice{border:1px solid #cfe9df;border-left:3px solid var(--brand);background:#f2fbf7;padding:11px 14px;margin:0 0 14px;border-radius:var(--r-sm)}
.notice.warn{border-color:#f4e0b6;border-left-color:#d97706;background:var(--warn-50)}
.notice.risk{border-color:#f6d2ce;border-left-color:var(--danger);background:var(--danger-50)}
.notice b{display:flex;align-items:center;gap:7px;margin-bottom:3px;font-weight:600}
.flash{padding:11px 14px;border-radius:var(--r-sm);background:#ecfdf5;color:#047857;border:1px solid #b8e8d6;margin-bottom:14px;font-size:13px}
.flash.error{background:var(--danger-50);color:var(--danger);border-color:#f6d2ce}
.trash-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 14px;background:var(--warn-50);border:1px solid #f4e0b6;border-radius:var(--r-sm);margin-bottom:14px;font-size:13px}

/* ── 分頁 ─────────────────────────────────────────────── */
.pager{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin:16px 0 4px;font-size:12.5px}
.page-link,.page-current{min-width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #dbe2ea;border-radius:var(--r-xs);background:#fff;font-size:12.5px;color:#475569;padding:0 8px;transition:all .13s}
.page-link:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-50)}
.page-current{background:var(--brand);color:#fff;border-color:var(--brand);font-weight:600}
.pager .muted{margin-left:4px;color:var(--muted)}

/* ── 頁籤 ─────────────────────────────────────────────── */
.tabs{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:0 0 16px;padding:0}
.tabs a,.tabs span.tab{padding:9px 13px;font-size:13px;color:#5a6674;border:0;border-bottom:2px solid transparent;cursor:pointer;border-radius:0;font-weight:500;display:inline-flex;align-items:center;gap:6px}
.tabs a:hover,.tabs span.tab:hover{color:var(--brand);background:#f8fafc}
.tabs a.on,.tabs span.tab.on{background:none;border-color:transparent;border-bottom-color:var(--brand);color:var(--brand);font-weight:700}

/* ── 明細 ─────────────────────────────────────────────── */
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}
.detail-row{display:grid;grid-template-columns:minmax(105px,30%) 1fr;gap:12px;border-bottom:1px solid var(--line-2);padding:9px 0}
.detail-row.wide{grid-column:1/-1}
.detail-row dt{color:var(--muted);font-size:12.5px}
.detail-row dd{margin:0;min-width:0;word-break:break-word;white-space:normal}

/* ── 附件 / 內嵌元件 ─────────────────────────────────── */
.attachments{display:flex;gap:8px;flex-wrap:wrap}
.attachment{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:var(--r-xs);padding:5px 9px;font-size:11.5px;max-width:100%}
.attachment:hover{border-color:#b9c6d4}
.attachment img{display:block;max-width:88px;max-height:68px;object-fit:cover;border-radius:5px}
.attachment-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:9px}
.attachment-list .attachment{align-items:flex-start}
.json{font:11.5px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid var(--line-2);padding:11px;border-radius:var(--r-xs);max-height:360px;overflow:auto}
.hidden{display:none!important}
.item-editor{overflow:auto}
.item-editor table input{min-width:90px;padding:5px 7px;height:31px}
.item-editor .item-desc{min-width:210px}
.item-toolbar{display:flex;justify-content:space-between;align-items:center;margin:6px 0}
.rich-toolbar{display:flex;gap:4px;flex-wrap:wrap;border:1px solid #d6dee8;border-bottom:0;border-radius:var(--r-sm) var(--r-sm) 0 0;padding:5px;background:#f8fafc}
.rich-toolbar button{border:1px solid transparent;background:#fff;border-radius:5px;padding:4px 9px;cursor:pointer;font-size:12px;font-family:inherit}
.rich-toolbar button:hover{border-color:var(--line)}
.rich-editor{min-height:150px;border:1px solid #d6dee8;border-radius:0 0 var(--r-sm) var(--r-sm);padding:11px;background:#fff;overflow:auto}
.rich-editor:focus{outline:none;border-color:#5eb3a3;box-shadow:0 0 0 3px rgba(15,118,110,.14)}

/* ── 錯誤頁 ───────────────────────────────────────────── */
.errbox{max-width:560px;margin:64px auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:34px;text-align:center;box-shadow:var(--sh)}
.errbox h2{margin:0 0 8px;font-size:19px}
.public-main{max-width:920px;margin:0 auto;padding:28px 18px}
.login-main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:34px 16px;background:radial-gradient(900px 420px at 50% -8%,#e4f2ee 0%,rgba(246,248,251,0) 70%),var(--bg)}
.login-card{width:min(100%,404px);background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 48px rgba(16,24,40,.10),0 2px 6px rgba(16,24,40,.04);padding:28px 26px;margin:0}
.login-brand{display:flex;align-items:center;gap:11px;padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid var(--line-2)}
.login-brand b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em}
.login-brand span{display:block;font-size:11.5px;color:var(--muted);margin-top:1px}
.login-card .frow{gap:7px}
.login-card .lb-actions{margin-top:20px}
.login-demo{margin-top:20px;padding-top:16px;border-top:1px solid var(--line-2)}
.login-demo .lb-title{font-size:11px;color:var(--muted-2);letter-spacing:.08em;font-weight:700;margin-bottom:8px}
.login-roles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.login-roles .btn{height:34px;font-size:12.5px;font-weight:500}
.login-note{margin-top:12px;font-size:11px;color:var(--muted);text-align:center}
.mobile-toggle{display:none}

/* ── 選項器 ───────────────────────────────────────────── */
.pk{position:relative;min-width:0}
.pk>input.pk-input{width:100%;padding-right:26px;background:#fff url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a959e'/%3E%3C/svg%3E") no-repeat right 10px center}
input[list]{width:100%;padding-right:26px;background:#fff url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a959e'/%3E%3C/svg%3E") no-repeat right 10px center}
.pk-menu{position:absolute;z-index:80;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:var(--sh-lg);max-height:420px;overflow:auto;min-width:230px;padding:4px}
.pk-item{display:block;width:100%;text-align:left;border:0;border-radius:7px;background:#fff;padding:7px 10px;cursor:pointer;font:12.5px inherit;color:var(--ink)}
.pk-item:hover,.pk-item.hl{background:var(--brand-50)}
.pk-item b{display:block;font-weight:600}
.pk-item i{display:block;font-style:normal;color:var(--muted);font-size:11px;margin-top:1px}
.pk-empty{padding:12px;color:var(--muted);font-size:12px;text-align:center}
.pk-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.pk-chip{display:inline-flex;gap:5px;align-items:center;background:var(--brand-50);color:var(--brand);border:1px solid #c9e7de;border-radius:999px;padding:2px 9px;font-size:11.5px;max-width:100%}
.pk-chip button{border:0;background:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 0 1px}

/* ── 彈窗 ─────────────────────────────────────────────── */
dialog.modal{width:min(1020px,95vw);max-height:94vh;border:0;border-radius:14px;padding:0;box-shadow:0 28px 80px rgba(15,23,42,.32);color:var(--ink);background:#fff}
dialog.modal::backdrop{background:rgba(15,23,42,.55);backdrop-filter:blur(2px)}
.modal-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-bottom:1px solid var(--line);padding:15px 20px;border-radius:14px 14px 0 0}
.modal-head h3{margin:0;border:0;padding:0;font-size:16px}
.modal-head .sub{margin:3px 0 0;font-size:11.5px}
.modal-body{padding:17px 20px 6px;max-height:72vh;overflow:auto}
.modal-foot{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:9px;background:#fbfcfd;border-top:1px solid var(--line);padding:13px 20px;border-radius:0 0 14px 14px}
.dlg-x{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}
.dlg-x:hover{background:#f1f5f9;color:var(--ink)}

/* ── 工單 / 卡片清單 ─────────────────────────────────── */
.wf-card{border:1px solid var(--line);border-radius:10px;background:#fcfdfe;padding:13px 14px;margin-bottom:11px}
.wf-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.wf-head b{font-size:12.5px}
.wf-head .muted{font-size:11px}
.wf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 13px}
.wf-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
.wf-cell>span{font-size:11px;color:#64748b}
.wf-cell.wide{grid-column:1/-1}
.wf-link{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 13px;padding-bottom:10px;border-bottom:1px dashed var(--line);margin-bottom:3px}
.wf-hint{font-size:11px;color:var(--brand);background:var(--brand-50);border-radius:5px;padding:4px 8px;margin-top:2px}
.wf-empty{border:1px dashed #cfd8e2;border-radius:10px;padding:22px;text-align:center;color:var(--muted);font-size:12.5px;background:#fcfdfe}
.item-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:11px}
.item-card{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#fcfdfe}
.item-card-h{font-weight:700;color:var(--brand);font-size:12px;margin-bottom:8px}
.item-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0;font-size:12px}
.item-card dt{color:var(--muted);white-space:nowrap}
.item-card dd{margin:0;word-break:break-word}
.tlink{color:#0f5f57;font-weight:600}
.tlink:hover{color:var(--brand-2);text-decoration:underline;text-underline-offset:2px}
.tlink.plain{color:var(--ink);font-weight:500}

/* ── 車輛 / 客戶 ─────────────────────────────────────── */
.vcard-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.vcard-plate{font-size:22px;font-weight:700;letter-spacing:.06em}
.vcard-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 18px;margin:14px 0 0}
.vcard-kv div{border-bottom:1px solid var(--line-2);padding-bottom:8px}
.vcard-kv dt{font-size:11.5px;color:var(--muted);margin-bottom:2px}
.vcard-kv dd{margin:0;font-size:13px}
.cust-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:15px}
.cust-grid{display:grid;grid-template-columns:290px minmax(0,1fr);gap:17px;align-items:start}

/* ── 日曆 ─────────────────────────────────────────────── */
.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.calendar-head{text-align:center;background:#f8fafc;color:var(--muted);padding:7px;border-radius:var(--r-xs);font-size:11px;font-weight:600;letter-spacing:.05em}
.calendar-cell{min-height:112px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:11px;transition:border-color .13s,box-shadow .13s;overflow:hidden}
.calendar-cell:hover{border-color:#c3d3e3;box-shadow:var(--sh-sm)}
.calendar-cell.is-empty{background:#fafbfd;border-style:dashed}
.calendar-day{color:var(--muted);margin-bottom:5px;font-weight:600;display:flex;justify-content:space-between}
.calendar-day a{color:var(--muted)}
.calendar-item{display:block;background:var(--brand-50);color:#0b5f58;border-left:2px solid #5eb3a3;border-radius:4px;padding:3px 5px;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab;font-size:10.5px}
.calendar-item:hover{text-decoration:none;background:#d9f2ea}
.signature-pad{border:1px dashed #b6c2cf;border-radius:8px;background:#fff;touch-action:none;max-width:100%}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:15px}

/* ── 響應式 ───────────────────────────────────────────── */
@media(max-width:1180px){.kpis{grid-template-columns:repeat(2,1fr)}.detail-grid{grid-template-columns:1fr}.detail-row.wide{grid-column:auto}.two-col{grid-template-columns:1fr}.cust-grid{grid-template-columns:1fr}}
@media(max-width:900px){.wf-grid,.wf-link{grid-template-columns:1fr}}
@media(max-width:820px){
  aside{transform:translateX(-100%);transition:transform .22s;box-shadow:var(--sh-lg)}
  aside.open{transform:translateX(0)}
  main{margin-left:0;width:100%;padding:16px 13px 60px}
  .mobile-toggle{display:inline-flex;position:fixed;right:14px;bottom:14px;z-index:40;border-radius:50%;width:48px;height:48px;padding:0;box-shadow:var(--sh-lg)}
  h1{font-size:21px}
  .pagehead{gap:10px;margin-bottom:14px}
  .fgrid{grid-template-columns:1fr}
  .frow.wide,.fsection{grid-column:auto}
  .search{min-width:140px}
  .kpis{grid-template-columns:1fr 1fr;gap:10px}
  .card{padding:13px}
  .detail-row{grid-template-columns:100px 1fr}
  .calendar-cell{min-height:76px}
  .calendar{font-size:10px}
  th,td{padding:9px 10px}
}
@media print{.noprint,aside,.mobile-toggle,.pagehead-actions{display:none!important}main{margin:0;width:100%;max-width:none;padding:0}.card{box-shadow:none;border:1px solid #ddd}}
`;

// ── 圖示（lucide 風格，1.8 描邊） ─────────────────────────
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M2.5 12h19"/>',
  users: '<path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-1.6a4 4 0 0 0-3-3.8"/><path d="M16.5 3.6a3.2 3.2 0 0 1 0 6.2"/>',
  trend: '<path d="M3 17.5 9.5 11l4 4L21 7.5"/><path d="M15.5 7.5H21v5.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-2.5h4V21"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><circle cx="16.5" cy="12.5" r="1.2"/><path d="M3 9h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.05A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.05a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.05a1.7 1.7 0 0 0-1.55 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 4h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6 2v-8.6z"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 4-1.5 5.5-2 6h16c-.5-.5-2-2-2-6"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
  alert: '<path d="M10.3 4.3 2.6 17.7A2 2 0 0 0 4.3 20.7h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0"/><path d="M12 9.5v4M12 17.2h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  'calendar-days': '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7l.8 12.1A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
  edit: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.4 3.6a2 2 0 0 1 2.8 2.8L12 15.6l-3.5.9.9-3.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12"/><circle cx="12" cy="12" r="3"/>',
  restore: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V10h5.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 17h10v4H7z"/>',
  merge: '<path d="M7 4v6a4 4 0 0 0 4 4h6"/><path d="m14 11 3 3-3 3"/><path d="M7 20v-2"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9"/><path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9"/><path d="M18 2.5v4.2h-4.2M6 21.5v-4.2h4.2"/>',
  logout: '<path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  truck: '<path d="M3 7h10v9H3z"/><path d="M13 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
};
const NAV_ICONS = { 主要功能: 'dashboard', 前線員工: 'users', 市場管理: 'trend', 營運管理: 'building', 公司財務: 'wallet', 設置: 'settings' };
export function icon(name, cls = '') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const ACTION_ICON_RULES = [
  [/^(新增|建立|創建|開立)/, 'plus'],
  [/^匯出/, 'download'],
  [/^(匯入|導入|批量導入)/, 'upload'],
  [/^篩選/, 'filter'],
  [/^(列印|打印)/, 'printer'],
  [/^合併/, 'merge'],
  [/^回收/, 'trash'],
  [/^(還原)/, 'restore'],
  [/^(重新|重算|刷新)/, 'refresh'],
  [/^(搜尋|查詢)/, 'search'],
  [/^(下載)/, 'download'],
  [/^(\+)/, 'plus'],
];
function actionIcon(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 14) return '';
  for (const [re, name] of ACTION_ICON_RULES) if (re.test(t)) return icon(name);
  return '';
}
function decorateActions(html) {
  if (!html) return html;
  return html
    .replace(/<(a|button)([^>]*class="[^"]*\bbtn\b[^"]*"[^>]*)>([^<]{1,14})<\/(a|button)>/g, (m, tag, attrs, text, close) => {
      if (/<svg/i.test(m)) return m;
      const ic = actionIcon(text);
      return ic ? `<${tag}${attrs}>${ic}${text}</${close}>` : m;
    });
}

// 把 <h1> / .sub / 首個純按鈕 .bar 組成頁首（標題在左、操作在右）
function splitHead(body) {
  let rest = String(body);
  let crumbs = '';
  const cm = rest.match(/^<div class="breadcrumbs">[\s\S]*?<\/div>\s*/);
  if (cm) { crumbs = cm[0]; rest = rest.slice(cm[0].length); }
  const hm = rest.match(/^<h1>[\s\S]*?<\/h1>\s*/);
  if (!hm) return null;
  const h1 = hm[0].trimEnd();
  rest = rest.slice(hm[0].length);
  let sub = '';
  const sm = rest.match(/^<div class="sub">[\s\S]*?<\/div>\s*/);
  if (sm) { sub = sm[0].trimEnd(); rest = rest.slice(sm[0].length); }
  let actions = '';
  const bm = rest.match(/^<div class="bar[^"]*">/);
  if (bm) {
    let i = bm[0].length;
    let depth = 1;
    while (i < rest.length && depth > 0) {
      const open = rest.indexOf('<div', i);
      const close = rest.indexOf('</div>', i);
      if (close === -1) break;
      if (open !== -1 && open < close) { depth += 1; i = open + 4; }
      else { depth -= 1; i = close + 6; }
    }
    const inner = rest.slice(bm[0].length, i - 6);
    if (!/<(input|select|textarea|table|dialog|details|form|canvas|video)/i.test(inner)) {
      actions = inner.trim();
      rest = rest.slice(i);
    }
  }
  const head = `<div class="pagehead"><div class="pagehead-main">${crumbs}${h1}${sub}</div>${actions ? `<div class="pagehead-actions noprint">${decorateActions(actions)}</div>` : ''}</div>`;
  return { head, rest };
}


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
  // 捲動時不要一律關閉下拉：
  //   1. 在下拉清單裡自己捲（50 筆就超過 420px 高）→ 本來就會冒泡到 window，
  //      以前用 capture 監聽直接 close()，所以「一滑就關」。
  //   2. 捲動彈窗/頁面時錨點還在畫面上 → 重新定位就好，不必關。
  //   3. 只有輸入框被捲出視窗才關。
  window.addEventListener('scroll',function(e){
    if(menu.hidden) return;
    var t=e.target;
    if(t&&t!==document&&(t===menu||menu.contains(t))) return;
    if(!input.isConnected){close();return;}
    var r=input.getBoundingClientRect();
    if(r.bottom<0||r.top>window.innerHeight){close();return;}
    place();
  },true);
  window.addEventListener('resize',close);
  menu.addEventListener('mousedown',function(e){e.preventDefault();});
  menu.addEventListener('click',function(e){var b=e.target.closest('.pk-item');if(b)choose(items[Number(b.dataset.i)]);});
  if(multi) paintChips();
}
function wfMount(root){root.querySelectorAll('.pk').forEach(pkMount);}
document.querySelectorAll('.pk').forEach(pkMount);
function wfInput(col,row,after,allowed){
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
        // 選中產品/員工時，把 fill 內「本明細有宣告的欄位」（如 product_id、unit）一併寫回，
        // 否則明細只剩名稱，產品關聯與單位會丟失。
        if(e.detail.fill&&allowed){
          Object.keys(e.detail.fill).forEach(function(k){
            if(k===col.name||k===col.displayField) return;
            if(allowed.indexOf(k)>=0) row[k]=e.detail.fill[k];
          });
        }
        after();
      });
      pk.addEventListener('pk-cleared',function(){row[col.name]='';if(col.displayField)row[col.displayField]='';after();});
    }
    return pk;
  }
  el=document.createElement('input');
  var numeric=col.type==='number'||col.type==='money';
  var intMode=numeric&&col.integer===true;
  el.type=intMode?'text':(numeric?'number':col.type==='date'?'date':col.type==='time'?'time':'text');
  if(intMode){
    // 用 text + 數字鍵盤，直接在輸入層擋掉小數點與負號（type=number 無法阻止打 2.5）
    el.inputMode='numeric';el.setAttribute('pattern','[0-9]*');el.autocomplete='off';
  }else if(el.type==='number'){
    el.step='0.01';
  }
  el.value=row[col.name]==null?'':row[col.name];
  el.setAttribute('data-f',col.name);
  if(intMode)el.title='只接受整數';
  if(col.name==='description'||col.name==='work_content'||col.name==='item_name'||col.name==='work_location')el.className='item-desc';
  el.addEventListener('input',function(){
    if(intMode){
      // 遇到小數點就截斷整數部分（2.5 → 2），不要把所有非數字刪掉（那樣會變成 25）
      var kept=el.value.replace(/[^0-9.]/g,'');
      var dot=kept.indexOf('.');
      if(dot>=0)kept=kept.slice(0,dot);
      if(kept!==el.value)el.value=kept;
      row[col.name]=el.value===''?'':Number(el.value);
    }else{
      row[col.name]=el.type==='number'?(el.value===''?'':Number(el.value)):el.value;
    }
    after();
  });
  return el;
}
document.querySelectorAll('.item-editor').forEach(function(editor){
  var target=document.getElementById(editor.dataset.target);
  var columns=jsonParse(editor.dataset.columns,'[]');
  var layout=editor.dataset.layout||'table';
  var visible=columns.filter(function(c){return !c.hidden;});
  var allowed=columns.map(function(c){return c.name;});
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
            cell.appendChild(wfInput(c,row,function(){sync();},allowed));
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
          cell.appendChild(wfInput(c,row,function(){sync();},allowed));
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
          var td=document.createElement('td');td.appendChild(wfInput(c,row,function(){sync();},allowed));tr.appendChild(td);
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
    const gicon = NAV_ICONS[group.group] ? icon(NAV_ICONS[group.group]) : '';
    return `<details class="navgrp" data-g="${esc(group.group)}"${open ? ' open' : ''}><summary>${gicon}<b>${esc(group.group)}</b></summary><nav>${items.map((item) => `<a class="${active === item.key ? 'on' : ''}" href="${esc(item.path)}">${esc(item.label)}</a>`).join('')}</nav></details>`;
  }).join('');
  const split = splitHead(body);
  const inner = split ? split.head + split.rest : body;
  const who = user ? `<div class="who"><div class="who-avatar">${esc((user.name || user.email || 'U').trim().charAt(0))}</div><div class="who-main"><b>${esc(user.name || '')}</b><small>${esc(user.email || '')} · ${esc(roleName(user.role))}</small></div><a href="/logout" title="登出" aria-label="登出">${icon('logout')}</a></div>` : '';
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf" content="${esc(csrf)}"><title>${esc(title)} · 標準清潔滅蟲</title><style>${COMMON_CSS}${wide ? 'main{max-width:none}' : ''}</style>${extraHead}</head><body><div class="app"><aside><div class="brand"><div class="brand-logo">${icon('box')}</div><div><b>標準清潔滅蟲</b><span>公司一站式管理系統</span></div></div><div class="navscroll">${nav}</div>${who}</aside><main>${inner}</main></div><button class="btn mobile-toggle" type="button" data-nav-toggle aria-label="選單">☰</button><script>${COMMON_JS}</script></body></html>`;
}

export function publicLayout({ title, body, extraHead = '', mainClass = 'public-main' }) {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${COMMON_CSS}.public-main{max-width:920px;margin:0 auto;padding:28px 18px}</style>${extraHead}</head><body><div class="${mainClass}">${body}</div><script>${COMMON_JS}</script></body></html>`;
}

export function loginPage({ error = '', csrf = '', demo = true }) {
  const roles = [['office', '辦公室'], ['front', '前線'], ['accounting', '會計'], ['management', '管理層']];
  const body = `<form class="login-card" method="post" action="/login">
    <div class="login-brand"><div class="brand-logo">${icon('box')}</div><div><b>標準清潔滅蟲</b><span>公司一站式管理系統</span></div></div>
    ${error ? `<div class="flash error">${esc(error)}</div>` : ''}
    <input type="hidden" name="__csrf" value="${esc(csrf)}">
    <div class="frow"><label for="email">電郵</label><input id="email" name="email" type="email" autocomplete="username" placeholder="name@company.com" required></div>
    <div class="frow" style="margin-top:14px"><label for="password">密碼</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
    <button class="btn block lb-actions" type="submit">登入</button>
    ${demo ? `<div class="login-demo"><div class="lb-title">示範帳號快速登入</div><div class="login-roles">${roles.map(([key, label]) => `<a class="btn ghost" href="/demo?as=${key}">${esc(label)}</a>`).join('')}</div><div class="login-note">示範帳號密碼一律 <b>demo1234</b></div></div>` : ''}
  </form>`;
  return publicLayout({ title: '登入', body, mainClass: 'login-main' });
}

export function errorPage({ title = '找不到頁面', message = '', user = null, status = 404, csrf = '' }) {
  const body = `<div class="errbox"><h2>${esc(title)}</h2><p class="muted">${esc(message || `HTTP ${status}`)}</p><a class="btn ghost" href="/">返回首頁</a></div>`;
  return user ? layout({ title, body, user, csrf }) : publicLayout({ title, body });
}

export function pill(value) {
  const text = str(value);
  const green = ['已完成', '已付款', '生效中', '正常', '可用', '已批准', '已確認', '已接受', '在職', '完成', 'signed', '已送達', '已收貨', '已過賬', '已入賬', '已簽約', '已核對', '已開票', '已結清'];
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

// 明細若沒宣告 itemColumns，就從資料自動推導欄位；但要把內部 ID、空欄位濾掉，並給中文標題，
// 否則補給記錄的「產品」欄會顯示 product_id 這種內部欄名。
const ITEM_LABELS = {
  product_name: '產品', product_code: '產品編號', quantity: '數量', qty: '數量', unit: '單位',
  tool_name: '工具', name: '名稱', description: '說明', notes: '備註', amount: '金額', price: '單價',
};
export function renderItems(items, columns, ctx = {}, layout = 'table') {
  const configured = columns.filter((c) => !c.hidden);
  const cols = configured.length ? configured : [...new Set(items.flatMap((r) => Object.keys(r || {})))]
    .filter((k) => !/^(id|created_|updated_|_)/.test(k) && !/_id$/.test(k))
    .filter((k) => items.some((r) => String(r?.[k] ?? '').trim() !== ''))
    .slice(0, 6)
    .map((name) => ({ name, label: ITEM_LABELS[name] || name }));
  if (!items.length) return '<span class="muted">—</span>';
  if (layout === 'cards') {
    return `<div class="item-cards">${items.map((row, index) => `<div class="item-card"><div class="item-card-h">工作 ${index + 1}</div><dl>${cols.map((c) => `<dt>${esc(c.label || c.name)}</dt><dd>${renderValue(row?.[c.name], { ...c, key: c.name }, ctx)}</dd>`).join('')}</dl></div>`).join('')}</div>`;
  }
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c.label || c.name)}</th>`).join('')}</tr></thead><tbody>${items.map((row) => `<tr>${cols.map((c) => `<td>${renderValue(row?.[c.name], { ...c, key: c.name }, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const NOWRAP_RE = /(^|_)(number|no|id|code|date|start|end|phone|fax|mobile|amount|total|price|qty|quantity|plate|type)(_|$)/i;
function colNw(c) {
  if (c.nw === false) return false;
  if (c.nw === true) return true;
  return NOWRAP_RE.test(String(c.key || c.name || ''));
}
// 依欄位語意給最小寬度，避免密集表把文字擠成多行；總寬超出時由 .table-wrap 橫向捲動
function colMin(c) {
  if (c.w) return c.w;
  const label = String(c.label || c.name || '');
  if (colNw(c)) return 104;
  if (/名稱|地址|地盤|內容|備註|描述|標題|條款|說明|摘要/.test(label)) return 210;
  if (/單位|員工|客戶|地點|位置|區域|部門|負責|聯絡|聯繫|收貨/.test(label)) return 148;
  return 100;
}
export function dataTable({ cfg, rows, ctx = {}, actions = true }) {
  const columns = (cfg.columns || []).filter((c) => !(c.key === 'id' && c.label === '操作'));
  const hrefFor = (column, row) => {
    if (column.link === 'detail') return ctx.viewHref ? ctx.viewHref(row) : `/view/${cfg.key}/${encodeURIComponent(row.id)}`;
    if (column.link === 'customer') return row.customer_id ? `/view/customers/${encodeURIComponent(row.customer_id)}` : '';
    if (column.link === 'vehicle-card') return `/view/vehicles/${encodeURIComponent(row.id)}`;
    return '';
  };
  const isNum = (c) => c.align === 'right' || c.type === 'money' || AMOUNT_FIELDS.has(String(c.key || ''));
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
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th class="${colNw(c) ? 'nw' : ''}${isNum(c) ? ' num' : ''}" style="min-width:${colMin(c)}px">${esc(c.label)}</th>`).join('')}${actions ? '<th class="nw act-col" style="min-width:104px">操作</th>' : ''}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td class="${colNw(c) ? 'nw' : ''}${isNum(c) ? ' num' : ''}">${cell(c, row)}</td>`).join('')}${actions ? `<td class="actions act-col">${operations(row)}</td>` : ''}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length + (actions ? 1 : 0)}">暫無資料</td></tr>`}</tbody></table></div>`;
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
  // SEC-02：金額欄位在無權限時只顯示佔位符，原值改用 hidden 提交。
  // 必須在通用 input 之前攔截，否則編輯頁的 value 會把總額原樣吐進 HTML。
  if (ctx.canSeeAmounts === false && (field.type === 'money' || AMOUNT_FIELDS.has(field.name))) {
    const raw = value === null || value === undefined ? '' : value;
    return `<input type="text" id="${id}" value="" placeholder="•••••" readonly autocomplete="off" aria-label="金額依權限隱藏"><input type="hidden" name="${name}" value="${esc(raw)}">`;
  }
  if (field.type === 'textarea' || field.type === 'json') return `<textarea ${common} rows="${field.type === 'json' ? 6 : 3}"${placeholder}>${esc(field.type === 'json' && value && typeof value === 'object' ? JSON.stringify(value, null, 2) : value ?? '')}</textarea>`;
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
    const itemCols = (field.itemColumns || []).map((c) => ({ ...c, integer: isIntegerField(c) }));
    return `<textarea class="hidden items-json" ${common}>${esc(JSON.stringify(items))}</textarea><div class="item-editor" data-target="${id}" data-columns="${esc(JSON.stringify(itemCols))}" data-layout="${esc(field.layout || 'table')}" data-add-label="${esc(field.addLabel || '新增一行')}" data-row-label="${esc(field.rowLabel || '工作')}"></div>`;
  }
  if (field.type === 'files') {
    const files = Array.isArray(value) ? value : value ? [value] : [];
    const uploadId = ctx.rowId || '';
    return `<textarea class="hidden" ${common}>${esc(JSON.stringify(files))}</textarea><div class="uploaded-list attachments">${renderAttachments(files, ctx)}</div><div class="bar noprint" style="margin:7px 0 0"><input type="file" multiple data-upload data-target="${id}" data-key="${esc(ctx.cfg.key)}" data-id="${esc(uploadId)}" data-field="${name}" data-csrf="${esc(ctx.csrf)}"><span class="upload-status muted">可上傳 PDF、圖片、Office 文件，單檔 20 MB</span></div>`;
  }
  const numeric = field.type === 'number' || field.type === 'money';
  const intMode = numeric && isIntegerField(field);
  const type = intMode ? 'text' : numeric ? 'number' : ['date', 'time', 'email', 'tel', 'url', 'password', 'color'].includes(field.type) ? field.type : 'text';
  const step = !intMode && type === 'number' ? ' step="0.01"' : '';
  const intAttrs = intMode ? ' inputmode="numeric" pattern="[0-9]*" autocomplete="off" title="只接受整數"' : '';
  return `<input type="${type}" ${common} value="${esc(value ?? '')}"${step}${intAttrs}${placeholder}>`;
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

const KPI_DEFAULT_ICONS = ['calendar', 'clock', 'alert', 'check-circle', 'trend', 'box'];
const KPI_DEFAULT_TONES = ['', 'amber', 'rose', 'emerald', 'violet', ''];
export function kpis(items) {
  return `<div class="kpis">${items.map((item, i) => {
    const name = item.icon || KPI_DEFAULT_ICONS[i % KPI_DEFAULT_ICONS.length];
    const tone = item.tone ?? KPI_DEFAULT_TONES[i % KPI_DEFAULT_TONES.length];
    return `<div class="kpi"><div class="kpi-ico ${esc(tone)}">${icon(name)}</div><div class="kpi-main"><b>${item.raw ? item.value : esc(item.value)}</b><span>${esc(item.label)}</span></div></div>`;
  }).join('')}</div>`;
}

export function simpleTable(columns, rows, ctx = {}) {
  return `<div class="card flush table-wrap"><table><thead><tr>${columns.map((c) => `<th class="${colNw(c) ? 'nw' : ''}" style="min-width:${colMin(c)}px">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((c) => `<td class="${colNw(c) ? 'nw' : ''}">${c.value ? c.value(row, ctx) : renderValue(row[c.key], { ...c, name: c.key }, ctx)}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${columns.length}">暫無資料</td></tr>`}</tbody></table></div>`;
}
