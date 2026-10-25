import { arr, bool, esc, nl2br, num, plain, sanitizeHtml, str } from './utils.mjs';
import { attachmentHref } from './ui.mjs';

const COMPANY_ZH = '標準（香港）清潔滅蟲有限公司';
const COMPANY_EN = 'STANDARD (H.K.) CLEANING AND PEST CONTROL CO., LTD.';
const DEFAULT_ADDRESS = 'Rm 2, 3/F, Sunwise Ind. Bldg., 16-26 Wang Wo Tsai St., Tsuen Wan, NT.';
const DEFAULT_PHONE = '(852) 2371 3793';
const DEFAULT_FAX = '(852) 2370 8369';
const DEFAULT_EMAIL = 'info@standardcpc.com';

const BASE_CSS = `
@page{size:A4;margin:12mm}*{box-sizing:border-box}html{background:#eef1f3}body{margin:0;color:#111;font:12px/1.45 Arial,"Microsoft JhengHei","PingFang HK",sans-serif}.toolbar{position:sticky;top:0;z-index:5;padding:10px;text-align:center;background:#182027}.toolbar button{border:0;border-radius:6px;background:#0f6e56;color:#fff;padding:9px 18px;font:14px inherit;cursor:pointer}.document{width:210mm;min-height:297mm;margin:18px auto;padding:12mm;background:#fff;box-shadow:0 2px 14px #0002}.company-header{display:flex;align-items:flex-start;gap:14px;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:22px}.company-logo{width:72px;height:72px;object-fit:contain;flex:none}.company-name-zh{font-size:18px;font-weight:700;letter-spacing:.08em}.company-name-en{font-size:12px;font-weight:700}.company-details{font-size:10px;color:#444}.doc-title{font-size:25px;font-weight:400;margin:0 0 18px}.center{text-align:center}.right{text-align:right}.bold{font-weight:700}.muted{color:#666}.pre{white-space:pre-wrap;overflow-wrap:anywhere}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}.info-grid{display:grid;grid-template-columns:1fr 250px;gap:26px}.info-line{display:grid;grid-template-columns:100px 1fr;gap:5px;margin:3px 0}.data-table{width:100%;border-collapse:collapse;margin:10px 0}.data-table th,.data-table td{padding:7px 8px;border-bottom:1px solid #bbb;vertical-align:top}.data-table th{font-weight:600;text-align:left}.data-table .num,.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.total-line{display:flex;justify-content:space-between;gap:20px;padding:6px 0}.grand-total{border-top:2px solid #111;font-size:16px;font-weight:700}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:48px;break-inside:avoid;page-break-inside:avoid}.signature-line{border-top:1px solid #111;padding-top:5px;margin-top:8px}.signature-images{height:64px;display:flex;align-items:flex-end;gap:12px}.signature-images img{max-height:62px;max-width:45%;object-fit:contain}.section{margin:14px 0;break-inside:avoid}.section-title{font-size:15px;font-weight:700;border-bottom:1px solid #aaa;padding-bottom:4px;margin:16px 0 7px}.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}.field{display:grid;grid-template-columns:minmax(105px,32%) 1fr;gap:8px;border-bottom:1px solid #eee;padding:6px 0}.field.wide{grid-column:1/-1}.field dt{color:#555}.field dd{margin:0;min-width:0;overflow-wrap:anywhere}.rich{overflow-wrap:anywhere}.rich img{max-width:100%;height:auto}.avoid{break-inside:avoid;page-break-inside:avoid}.certificate-extra{border-top:1px solid #999;margin-top:8px;padding-top:5px;font-size:10px}.certificate-sign{border-top:1px solid #000;margin-top:10px;padding-top:6px;break-inside:avoid;page-break-inside:avoid}.certificate-sign img{display:block;max-width:180px;max-height:65px;object-fit:contain}.schedule-table th,.schedule-table td{border:1px solid #333;padding:6px}.schedule-table thead{display:table-header-group}.report-table th,.report-table td{border:1px solid #999;padding:8px}.report-table th{width:25%;background:#f4f4f4;text-align:left}.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.photo-grid img{width:100%;height:220px;object-fit:cover;border:1px solid #aaa;padding:2px}.empty-row td{height:22px}pre.json{white-space:pre-wrap;word-break:break-word;font:10px/1.4 monospace;margin:0}@media(max-width:850px){.document{width:auto;min-height:0;margin:0;padding:18px}.two-col,.info-grid,.field-grid{grid-template-columns:1fr}.signature-grid{gap:20px}}@media print{html,body{background:#fff}.toolbar{display:none!important}.document{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.company-header{break-inside:avoid}.data-table thead{display:table-header-group}.data-table tr{break-inside:avoid}.section-title{break-after:avoid}a{color:inherit;text-decoration:none}}`;

function documentShell(title, body, extraCss = '') {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">列印 / 另存 PDF</button></div><main class="document">${body}</main></body></html>`;
}

function list(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function object(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  }
  return {};
}

function safeList(store, key) {
  try { return store?.list ? arr(store.list(key)) : []; } catch { return []; }
}

function companySettings(store) {
  return safeList(store, 'company_settings')[0] || {};
}

function assetUrl(value) {
  if (Array.isArray(value)) return value.length ? assetUrl(value[0]) : '';
  if (value && typeof value === 'object') return assetUrl(value.file_url || value.photo_url || value.url || value.signature_data || '');
  return str(value);
}

function safeAttachmentHref(value, publicToken) {
  const source = assetUrl(value);
  if (!source) return '';
  const href = attachmentHref(source, { publicToken });
  return /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(href) ? href : '';
}

function image(value, publicToken, className = '', alt = '') {
  const href = safeAttachmentHref(value, publicToken);
  if (!href) return '';
  return `<img src="${esc(href)}"${className ? ` class="${esc(className)}"` : ''} alt="${esc(alt)}">`;
}

function companyHeader(settings, publicToken, { englishOnly = false } = {}) {
  const address = settings.company_address || settings.address || DEFAULT_ADDRESS;
  const phone = settings.company_phone || settings.phone || DEFAULT_PHONE;
  const fax = settings.company_fax || settings.fax || DEFAULT_FAX;
  const email = settings.company_email || settings.email || DEFAULT_EMAIL;
  const website = settings.company_website || settings.website || '';
  return `<header class="company-header">${image(settings.company_logo, publicToken, 'company-logo', 'Company Logo')}<div>${englishOnly ? '' : `<div class="company-name-zh">${COMPANY_ZH}</div>`}<div class="company-name-en">${COMPANY_EN}</div><div class="company-details pre">${nl2br(address)}</div><div class="company-details">Tel: ${esc(phone)}　Fax: ${esc(fax)}</div><div class="company-details">E: ${esc(email)}${website ? `　W: ${esc(website)}` : ''}</div></div></header>`;
}

function formatNumber(value, digits = 2) {
  if (value === '' || value === null || value === undefined) return '0.00';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : esc(value);
}

function formatDate(value, style = 'd/M/yyyy') {
  const text = str(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text ? esc(text) : '—';
  const [, year, month, day] = match;
  if (style === 'yyyy年MM月dd日') return `${year}年${month}月${day}日`;
  if (style === 'dd/MM/yyyy') return `${day}/${month}/${year}`;
  if (style === 'dd-MM-yyyy') return `${day}-${month}-${year}`;
  return `${Number(day)}/${Number(month)}/${year}`;
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return str(value);
}

function remarkList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) return list(value);
  return [value];
}

function itemDescription(value) {
  return value ? `<div class="rich pre">${sanitizeHtml(value)}</div>` : '';
}

function serviceQuotation(row, settings, publicToken) {
  const english = row.document_language === '英文' || row.document_language === 'English';
  const items = list(row.items);
  const labels = english ? {
    quoteNo: 'Quotation No.', main: 'Main Customer', officer: 'Responsible Officer', title: row.work_content ? `Service Quotation - ${row.work_content}` : 'SERVICE QUOTATION',
    ipm: 'Our company recommends using Integrated Pest Management (IPM) for pest control works. IPM focuses on preventive control measures, including regular inspections, monitoring and environmental improvement, together with good hygiene practices to remove favourable conditions for pest breeding and spreading. Where necessary, suitable pesticides and chemical control methods will be applied to achieve safe and effective pest control.',
    location: 'Work Location', scope: 'Service Scope', details: 'Work Details', pesticides: 'Pesticides Used', workDate: 'Work Date', fee: 'Service Fee', total: 'Total Amount', payment: 'Payment Terms', remarks: 'Remarks', company: 'Standard (HK) Cleaning & Pest Control Co. Ltd', manager: 'Choi Ping Yin', accepted: 'Accepted and Confirmed', signature: 'Signature and Company Chop',
  } : {
    quoteNo: '報價單編號', main: '主客戶', officer: '負責同事', title: row.work_content ? `${row.work_content}服務報價` : '服 務 報 價',
    ipm: '本公司建議採用綜合蟲害管理方法(Integrated Pest Management) 進行蟲害防治工作。蟲害防治管理方法(IPM)主要透過早期的預防控制措施，包括定期檢查、監察、協助環境整理等，再配合良好衛生環境，以消除有利害蟲繁殖滋生的有利條件，令牠們難以滋生及擴散。如有需要的情況下，使用合適的除害劑之化學防治方法，消滅蟲害，以達至安全而有效的防治工作。',
    location: '工 作 地 點', scope: '服 務 範 圍', details: '工 作 細 則', pesticides: '採 用 藥 物', workDate: '工 作 日 期', fee: '服 務 費 用', total: '總金額', payment: '付 款 方 法', remarks: '備 註', company: '標準(香港)清潔滅蟲有限公司', manager: '總經理 蔡炳然', accepted: '接納及確認', signature: '簽署及(公司)蓋章',
  };
  const officer = english && row.assigned_admin_nickname ? row.assigned_admin_nickname : row.assigned_admin_name;
  const payment = english && /[\u4e00-\u9fff]/.test(str(row.payment_terms)) ? 'Payment by invoice after completion (within 30 days)' : row.payment_terms;
  const workDate = english && /[\u4e00-\u9fff]/.test(str(row.work_date)) ? 'To be advised. (Office hours: Monday to Saturday, 9:00am to 6:00pm)' : row.work_date;
  let remarks = remarkList(row.remarks);
  if (english && (!remarks.length || remarks.some((entry) => /[\u4e00-\u9fff]/.test(str(entry))))) {
    remarks = ['This quotation is valid for 90 days from the issue date.', 'This quotation includes labour, materials, equipment and insurance.', 'All pesticides used are effective and safe products registered with the Agriculture, Fisheries and Conservation Department of Hong Kong.'];
  }
  const showQuantity = bool(row.show_service_item_quantity_unit);
  const showTotal = row.show_service_item_total !== false && row.show_service_item_total !== 0 && row.show_service_item_total !== '0';
  const showDescription = bool(row.show_item_description);
  const showIpm = row.show_ipm_description !== false && row.show_ipm_description !== 0 && row.show_ipm_description !== '0';
  const detailRow = (label, value, rich = false) => value === '' || value === null || value === undefined ? '' : `<div style="display:flex;margin:8px 0"><span class="bold" style="white-space:nowrap">${esc(label)}</span><span style="margin:0 8px">:</span><div class="pre" style="flex:1">${rich ? value : nl2br(valueText(value))}</div></div>`;
  const instructions = list(row.work_instructions);
  const pesticides = list(row.pesticides);
  const itemsHtml = items.map((item) => `<div style="display:flex;gap:12px;margin:7px 0;align-items:flex-start"><div class="pre" style="flex:1">${nl2br(item.item_name)}${showDescription ? itemDescription(item.description) : ''}</div>${showQuantity ? `<span style="white-space:nowrap">${esc(item.quantity ?? 0)} ${esc(item.unit || '')}</span>` : ''}<span class="bold num">HK$${formatNumber(item.total)}</span></div>`).join('');
  const total = row.total_amount || items.reduce((sum, item) => sum + num(item.total), 0);
  const body = `${companyHeader(settings, publicToken, { englishOnly: english })}<section style="margin-bottom:24px"><div class="two-col"><div><p><strong>${esc(labels.quoteNo)}:</strong> ${esc(row.quotation_number)}</p>${row.main_customer ? `<p>${esc(labels.main)}: ${esc(row.main_customer)}</p>` : ''}<p style="font-size:17px" class="bold">${esc(row.customer_name)}</p></div><div class="right"><p>${row.customer_tel ? `<strong>TEL</strong> : ${esc(row.customer_tel)}` : ''}</p><p>${row.customer_fax ? `<strong>FAX</strong> : ${esc(row.customer_fax)}` : ''}</p><p>${row.customer_email ? `<strong>Email</strong> : ${esc(row.customer_email)}` : ''}</p>${officer ? `<p><strong>${esc(labels.officer)}</strong> : ${esc(officer)}</p>` : ''}${row.submission_method ? `<p><strong>By</strong> : ${esc(row.submission_method)}</p>` : ''}</div></div>${row.contact_person ? `<p><strong>Attn:</strong> ${esc(row.contact_person)}</p>` : ''}</section><h2 class="center" style="letter-spacing:.12em;margin:24px 0">${esc(labels.title)}</h2>${showIpm ? `<p style="text-align:justify;margin-bottom:24px">${esc(labels.ipm)}</p>` : ''}<section>${detailRow(labels.location, row.service_location)}${detailRow(labels.scope, row.service_scope)}${instructions.length ? detailRow(labels.details, instructions.map((entry, index) => `${instructions.length > 1 ? `(${index + 1}) ` : ''}${valueText(entry)}`).join('\n')) : ''}${pesticides.length ? detailRow(labels.pesticides, pesticides.map((entry, index) => `${pesticides.length > 1 ? `(${index + 1}) ` : ''}${valueText(entry.name || entry.product_name)}${entry.reg_no ? ` (Reg. No.: ${entry.reg_no})` : ''}`).join('\n')) : ''}${detailRow(labels.workDate, workDate)}</section><section class="avoid" style="margin:22px 0"><div style="display:flex"><span class="bold">${esc(labels.fee)}</span><span style="margin:0 8px">:</span><div style="flex:1">${itemsHtml}${showTotal ? `<div class="total-line grand-total" style="justify-content:flex-end"><span style="margin-right:18px">${esc(labels.total)}</span><span>HK$${formatNumber(total)}</span></div>` : ''}</div></div>${detailRow(labels.payment, payment)}</section>${remarks.length ? `<section style="display:flex;margin-bottom:24px"><span class="bold">${esc(labels.remarks)}</span><span style="margin:0 8px">:</span><div>${remarks.map((entry, index) => `<p style="margin:0 0 4px">(${index + 1}) ${nl2br(str(entry).replace(/^\(?\d+\)?\s*/, ''))}</p>`).join('')}</div></section>` : ''}<div class="signature-grid"><div><p>${esc(labels.company)}</p><div class="signature-images">${image(settings.company_signature, publicToken, '', 'Signature')}${image(settings.company_stamp, publicToken, '', 'Stamp')}</div><div class="signature-line"><p>${esc(labels.manager)}</p>${english ? '<p>General Manager</p>' : ''}<p>${row.document_date || row.created_date ? formatDate(row.document_date || row.created_date, english ? 'dd/MM/yyyy' : 'yyyy年MM月dd日') : ''}</p></div></div><div><p>${esc(labels.accepted)}</p><div class="signature-images"></div><div class="signature-line"><p>${esc(labels.signature)}</p></div></div></div>`;
  return documentShell(`${row.quotation_number || labels.title} · ${labels.title}`, body, '.document{font-size:13px}.company-header{margin-bottom:28px}');
}

function productQuotation(row, settings, publicToken) {
  const english = row.document_language === '英文' || row.document_language === 'English';
  const items = list(row.items);
  const showDescription = bool(row.show_item_description);
  const deliveryTerms = row.delivery_terms || '1) 10-14 Days after received your confirmed order.\n2) Minimum order for delivery HK$1,000 per invoice.\n3) All orders below $1,000 will incur a $250 delivery fee.';
  const body = `${companyHeader(settings, publicToken, { englishOnly: english })}<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h1 style="margin:0">${english ? 'Quotation' : '報價單'}</h1><div class="right"><div style="font-size:22px" class="bold">${esc(row.quotation_number)}</div><div>${row.document_date || row.created_date ? formatDate(row.document_date || row.created_date, 'dd/MM/yyyy') : ''}</div></div></div><section class="two-col"><div>${row.main_customer ? `<p>${english ? 'Main Customer' : '主客戶'}: ${esc(row.main_customer)}</p>` : ''}<p class="bold">TO:</p><p class="bold">${esc(row.customer_name)}</p><p class="pre">${nl2br(row.delivery_address || row.service_address)}</p></div><div><p>${row.contact_person ? `<strong>Attn:</strong> ${esc(row.contact_person)}` : ''}</p><p>${row.customer_email ? `<strong>Email:</strong> ${esc(row.customer_email)}` : ''}</p><p>${row.assigned_admin_name ? `<strong>${english ? 'Responsible Officer' : '負責同事'}:</strong> ${esc(english && row.assigned_admin_nickname ? row.assigned_admin_nickname : row.assigned_admin_name)}` : ''}</p><p>${row.customer_code ? `<strong>Customer Code:</strong> ${esc(row.customer_code)}` : ''}</p><p>${row.customer_tel ? `<strong>TEL:</strong> ${esc(row.customer_tel)}` : ''}</p><p>${row.customer_fax ? `<strong>FAX:</strong> ${esc(row.customer_fax)}` : ''}</p></div></section><table class="data-table"><thead><tr style="border-top:2px solid #111;border-bottom:2px solid #111"><th>Item</th><th>Qty</th><th>Code No.</th><th>Description / Particular</th><th class="num">Unit Rate</th><th class="num">Disc</th><th class="num">Sub Total</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.quantity)}</td><td>${esc(item.code_no || '')}</td><td class="pre"><div>${nl2br(item.item_name)}</div>${showDescription ? itemDescription(item.description) : ''}</td><td class="num">${formatNumber(item.unit_price)}</td><td class="num">${num(item.discount) ? formatNumber(item.discount) : ''}</td><td class="num bold">${formatNumber(item.total)}</td></tr>`).join('')}</tbody></table><div style="width:290px;margin-left:auto">${num(row.freight_charges) > 0 ? `<div class="total-line"><span>Freight charges:</span><span>HK$${formatNumber(row.freight_charges)}</span></div>` : ''}<div class="total-line grand-total"><span>${english ? 'Total Amount' : '總金額'} :</span><span>HK$${formatNumber(row.total_amount)}</span></div></div><section style="margin:22px 0"><p><strong>${english ? 'Payment Terms' : '付 款 方 法'} :</strong> ${nl2br(row.payment_terms || 'Net 30 days')}</p>${row.validity ? `<p><strong>Validity:</strong> ${nl2br(row.validity)}</p>` : ''}<div style="display:flex;gap:8px"><strong>Delivery:</strong><div class="pre">${nl2br(deliveryTerms)}</div></div></section><p class="muted" style="font-style:italic">*Please sign and return a copy of this quotation to us should you find it acceptable.</p><div class="signature-grid"><div><p>For and on behalf of</p><p class="bold">Standard (HK) Cleaning &amp; Pest Control Co. Ltd</p><div class="signature-images">${image(settings.company_signature, publicToken, '', 'Signature')}${image(settings.company_stamp, publicToken, '', 'Stamp')}</div><div class="signature-line">Authorized Signature</div></div><div><p>Confirmed by:</p><div style="height:42px"></div><div class="signature-images"></div><div class="signature-line"><p>Company Chop and Authorized Signature</p><p>Date:</p></div></div></div>`;
  return documentShell(`${row.quotation_number || '報價單'} · 報價單`, body, '.document{font-size:12px}');
}

const INVOICE_REMARKS = [
  'Payment Terms : ☐ Cash On Delivery   ☐ Net 30 days',
  'Payment should be made by CASH or crossed Cheques in favour of STANDARD (HK) CLEANING AND PEST CONTROL CO LTD.Mail By Cheque: please write a crossed cheque marked with invoice and Ref.No.s.on the back of the cheque and sent to our office attention to Account Department.Direct bank-in or E-payment: please deposit to HSBC account number: 047-835079-001 or SCB account number 407-0087-2256, or FPS 110950797 remark the invoice or Ref. Nos. on the bank in slip, and send the image to us via email to info@standardcpc.com or Fax to 2370 8369.',
  'A late charge of 2% per month of the amount due will be imposed on your account. 逾期繳費本公司將按未付款額每月徵收2%逾期費用.',
];

function invoiceDocument(row, settings, publicToken) {
  const items = list(row.items);
  const blanks = Array.from({ length: Math.max(0, 4 - items.length) });
  const remarks = remarkList(row.remarks).length ? remarkList(row.remarks) : INVOICE_REMARKS;
  const address = row.service_address || row.customer_address;
  const body = `${companyHeader(settings, publicToken)}<section class="info-grid"><div><h2 class="doc-title">INVOICE: <span style="margin-left:12px">${esc(row.invoice_number)}</span></h2><p class="bold">Bill TO:</p><p style="font-size:15px" class="bold">${esc(row.customer_name)}</p><p class="pre">${nl2br(address)}</p>${row.contact_person ? `<p><strong>Attn:</strong> ${esc(row.contact_person)}</p>` : ''}${row.customer_tel ? `<p><strong>TEL:</strong> ${esc(row.customer_tel)}</p>` : ''}</div><div style="font-size:10px;padding-top:25px"><div class="info-line"><strong>Date :</strong><span>${formatDate(row.invoice_date)}</span></div>${row.due_date ? `<div class="info-line"><strong>Due Date :</strong><span>${formatDate(row.due_date)}</span></div>` : ''}${row.customer_code ? `<div class="info-line"><strong>Customer Code :</strong><span>${esc(row.customer_code)}</span></div>` : ''}${row.po_number ? `<div class="info-line"><strong>PO No. :</strong><span>${esc(row.po_number)}</span></div>` : ''}${row.dn_number ? `<div class="info-line"><strong>DN No. :</strong><span>${esc(row.dn_number)}</span></div>` : ''}${row.quotation_number ? `<div class="info-line"><strong>Quotation :</strong><span>${esc(row.quotation_number)}</span></div>` : ''}${row.delivery_site || row.customer_address ? `<div class="info-line"><strong>Delivery To :</strong><span class="pre">${nl2br(row.delivery_site || row.customer_address)}</span></div>` : ''}${row.invoice_type === '產品' && row.delivery_method ? `<div class="info-line"><strong>Delivery Method :</strong><span>${esc(row.delivery_method)}</span></div>` : ''}</div></section><div style="border-top:3px solid #111;margin:14px 0 8px"></div><table class="data-table" style="font-size:10.5px"><thead><tr><th style="width:60px">Qty</th><th style="width:100px">Item</th><th>Description / Particular</th><th class="num">Unit Rate</th><th class="num">Disc</th><th class="num">Sub Total</th></tr></thead><tbody>${items.map((item, index) => `<tr${index % 2 === 0 ? ' style="background:#f3f4f6"' : ''}><td class="center">${esc(item.quantity)}${item.unit ? ` ${esc(item.unit)}` : ''}</td><td>${esc(item.item_code || '')}</td><td class="pre">${nl2br(item.description || item.item_name)}</td><td class="num">${formatNumber(item.unit_price)}</td><td class="num">${num(item.discount) ? formatNumber(item.discount) : ''}</td><td class="num">${formatNumber(item.subtotal)}</td></tr>`).join('')}${blanks.map(() => '<tr class="empty-row"><td colspan="6"></td></tr>').join('')}</tbody></table><div style="width:330px;margin-left:auto;border-top:1px solid #777;border-bottom:2px solid #111"><div class="total-line"><span>Freight charges:</span><span>${num(row.freight_charges) ? formatNumber(row.freight_charges) : ''}</span></div></div><div style="display:flex;justify-content:flex-end;gap:35px;margin:12px 0 20px;position:relative"><span style="font-size:15px">Total Amount :</span><span style="font-size:15px;min-width:125px" class="num">HK$${formatNumber(row.total_amount)}</span></div>${row.show_stamp !== false && settings.company_stamp ? `<div class="right" style="height:0;position:relative;top:-20px">${image(settings.company_stamp, publicToken, '', 'Company Stamp')}</div>` : ''}<section style="font-size:9.5px"><p style="font-size:13px">Remark :</p>${remarks.map((entry, index) => `<p>(${index + 1}) ${nl2br(str(entry).replace(/^\(?\d\)?\s*/, ''))}</p>`).join('')}<div style="border-top:2px solid #111;margin-top:8px"></div></section><div style="width:320px;margin:30px 0 0 auto"><p style="margin-bottom:38px">Confirmed by :</p><div class="signature-line center">Goods received &amp; checked / chop &amp; signature</div></div>`;
  return documentShell(`${row.invoice_number || 'INVOICE'} · INVOICE`, body);
}

function receiptDocument(row, settings, publicToken) {
  const items = list(row.items);
  const body = `${companyHeader(settings, publicToken)}<div class="center" style="margin-bottom:28px"><h1 style="margin-bottom:4px">RECEIPT</h1><div style="font-size:20px;color:#0f6e56" class="bold">${esc(row.receipt_number)}</div><div class="muted">${formatDate(row.receipt_date)}</div></div><section><p class="bold">TO:</p><p style="font-size:16px" class="bold">${esc(row.customer_name)}</p><p class="pre">${nl2br(row.customer_address)}</p>${row.contact_person ? `<p>Attn: ${esc(row.contact_person)}</p>` : ''}<p>${row.customer_tel ? `TEL: ${esc(row.customer_tel)}` : ''}${row.customer_fax ? `　FAX: ${esc(row.customer_fax)}` : ''}</p></section><table class="data-table" style="border-top:2px solid #111;border-bottom:2px solid #111"><thead><tr><th>Item</th><th>INV#</th><th>Description / Particular</th><th class="num">Sub Total</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}.</td><td>${esc(item.invoice_number || row.invoice_number || '')}</td><td class="pre">${nl2br(item.description)}</td><td class="num bold">${formatNumber(item.subtotal)}</td></tr>`).join('')}</tbody></table><div style="width:320px;margin-left:auto;border-bottom:2px solid #111;margin-bottom:28px"><div class="total-line grand-total"><span>Total Amount :</span><span>HK$ ${formatNumber(row.total_amount)}</span></div></div><section style="margin-bottom:45px"><p class="bold" style="color:#a15c00">Form of Payment 付款方法 : <span style="font-weight:400;font-style:italic;margin-left:15px">Payment received with thanks.</span></p><p><span style="display:inline-block;width:20px;height:20px;border:2px solid #111;text-align:center;vertical-align:middle;margin-right:9px">${row.payment_method === '現金' ? '✓' : ''}</span>Cash 現金</p><p><span style="display:inline-block;width:20px;height:20px;border:2px solid #111;text-align:center;vertical-align:middle;margin-right:9px">${row.payment_method === '支票' ? '✓' : ''}</span>Cheque 支票 ${row.cheque_number ? `${esc(row.bank_name || 'DBS')}# ${esc(row.cheque_number)}` : ''}</p>${row.payment_method && !['現金', '支票'].includes(row.payment_method) ? `<p>付款方式：${esc(row.payment_method)}</p>` : ''}${row.notes ? `<p class="pre">${nl2br(row.notes)}</p>` : ''}</section><footer class="center muted" style="border-top:1px solid #ccc;padding-top:12px;font-style:italic">This is a Computer Printout. No signature is required.</footer>`;
  return documentShell(`${row.receipt_number || 'RECEIPT'} · RECEIPT`, body);
}

function monthsBetween(start, end) {
  const first = /^(\d{4})-(\d{2})/.exec(str(start));
  const last = /^(\d{4})-(\d{2})/.exec(str(end));
  if (!first || !last) return [];
  let year = Number(first[1]);
  let month = Number(first[2]) - 1;
  const endYear = Number(last[1]);
  const endMonth = Number(last[2]) - 1;
  const rows = [];
  while ((year < endYear || (year === endYear && month <= endMonth)) && rows.length < 120) {
    rows.push({ year, month, date: '', remark: '' });
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return rows;
}

function contractDocument(row, store, settings, publicToken) {
  const recurring = safeList(store, 'recurring_schedules').find((entry) => entry.contract_id === row.id || (row.contract_number && entry.contract_number === row.contract_number));
  const saved = object(recurring?.notes);
  const savedForm = object(saved.form);
  const customer = safeList(store, 'customers').find((entry) => entry.id === row.customer_id) || {};
  const form = {
    to: row.customer_name || '', location: row.work_location || '', attn: row.contact_person || customer.contact_person || '',
    date: row.document_date || row.created_date || '', tel_no: row.contact_phone || customer.phone || '', fax: row.customer_fax || customer.fax || '',
    from: '', from_tel: '', service_title: row.service_title || 'Pest and Rodent Control Services (Monthly)',
    contract_no_display: row.quotation_number || row.contract_number || '',
    schedule_from: str(row.contract_start_date).slice(0, 7).replace('-', '/'), schedule_to: str(row.contract_end_date).slice(0, 7).replace('-', '/'),
    footer_note: '**滅蟲工作時間可於雙方協議後隨時更改，如無另行通知，每月將按上表工作日期進行。', footer_contact: '', ...savedForm,
  };
  const monthRows = list(saved.monthRows).length ? list(saved.monthRows) : list(row.schedule_rows).length ? list(row.schedule_rows) : monthsBetween(row.contract_start_date, row.contract_end_date);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthZh = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const years = [...new Set(monthRows.map((entry) => entry.year))];
  const scheduleRows = years.map((year) => `<tr><td colspan="3" class="center bold" style="background:#eee">${esc(year)} 年</td></tr>${monthRows.filter((entry) => entry.year === year).map((entry) => `<tr><td>${esc(monthNames[entry.month] || '')} (${esc(monthZh[entry.month] || '')})</td><td class="center pre">${nl2br(entry.date)}</td><td class="pre">${nl2br(entry.remark)}</td></tr>`).join('')}`).join('') || '<tr><td></td><td></td><td></td></tr>';
  const scheduleTitle = form.schedule_from && form.schedule_to ? `SERVICE SCHEDULE FROM ${form.schedule_from}-${form.schedule_to}` : 'SERVICE SCHEDULE';
  const body = `${companyHeader(settings, publicToken)}<h2 class="center" style="text-decoration:underline">Working Schedule for Pest Control Service</h2><table style="width:100%;border-collapse:collapse;margin-bottom:15px"><tbody><tr><td class="bold" style="width:80px">To</td><td style="width:12px">:</td><td colspan="4" style="border-bottom:1px solid #111">${esc(form.to)}</td></tr><tr><td class="bold">Location</td><td>:</td><td colspan="4" style="border-bottom:1px solid #111" class="pre">${nl2br(form.location)}</td></tr><tr><td class="bold">Attn.</td><td>:</td><td style="border-bottom:1px solid #111">${esc(form.attn)}</td><td class="bold" style="width:60px">Date</td><td>:</td><td style="border-bottom:1px solid #111">${formatDate(form.date, 'd/M/yyyy')}</td></tr><tr><td class="bold">Tel No.</td><td>:</td><td style="border-bottom:1px solid #111">${esc(form.tel_no)}</td><td class="bold">Fax:</td><td></td><td style="border-bottom:1px solid #111">${esc(form.fax)}</td></tr><tr><td class="bold">From</td><td>:</td><td style="border-bottom:1px solid #111">${esc(form.from)}</td><td class="bold">Tel No.</td><td>:</td><td style="border-bottom:1px solid #111">${esc(form.from_tel)}</td></tr><tr><td class="bold">Total Page(s)</td><td>:</td><td style="border-bottom:1px solid #111">1</td><td colspan="3">(including this page)</td></tr></tbody></table><h3 class="center">${esc(scheduleTitle)}</h3><p>Contract No. : ${esc(form.contract_no_display)}</p><table class="data-table schedule-table"><thead><tr><th rowspan="2" style="width:30%">Month</th><th>Service Date</th><th rowspan="2" style="width:20%">Remark</th></tr><tr><th style="font-weight:400">${esc(form.service_title)}</th></tr></thead><tbody>${scheduleRows}</tbody></table>${form.footer_note ? `<p class="pre">${nl2br(form.footer_note)}</p>` : ''}${form.footer_contact ? `<p>Should you have any queries, please do not hesitate to ${esc(form.footer_contact)}</p>` : ''}<section class="section"><h3 class="section-title">合約資料</h3><div class="field-grid"><div class="field"><dt>合約名稱</dt><dd>${esc(row.contract_name)}</dd></div><div class="field"><dt>合約期</dt><dd>${formatDate(row.contract_start_date)} 至 ${formatDate(row.contract_end_date)}</dd></div><div class="field"><dt>服務頻率</dt><dd>${esc(row.service_frequency)}</dd></div><div class="field"><dt>合約總額</dt><dd>HK$ ${formatNumber(row.total_amount)}</dd></div><div class="field"><dt>工作內容</dt><dd class="pre">${nl2br(row.work_content)}</dd></div><div class="field"><dt>付款條款</dt><dd class="pre">${nl2br(row.payment_terms)}</dd></div></div>${row.notes ? `<p class="pre"><strong>備註：</strong>${nl2br(row.notes)}</p>` : ''}</section>`;
  return documentShell(`${row.contract_number || '合約'} · Working Schedule`, body, '.company-name-en{color:#b40000}.company-header{border-color:#b40000}.document{font-size:12px}');
}

function purchaseOrderDocument(row, settings, publicToken) {
  const items = list(row.items);
  const body = `${companyHeader(settings, publicToken)}<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1 class="doc-title">PURCHASE ORDER<br><span style="font-size:17px">採購單 / 工作訂單</span></h1></div><div class="right"><div style="font-size:22px" class="bold">${esc(row.po_number)}</div><div>Date: ${formatDate(row.po_date, 'dd/MM/yyyy')}</div></div></div><section class="two-col"><div><h3 class="section-title">客戶與工作</h3><p class="bold">${esc(row.customer_name)}</p><p>Attn: ${esc(row.contact_person)}</p><p>Tel: ${esc(row.contact_phone)}</p><p class="pre"><strong>工作地點：</strong>${nl2br(row.work_location)}</p><p class="pre"><strong>工作內容：</strong>${nl2br(row.work_content)}</p></div><div><h3 class="section-title">訂單資料</h3>${row.po_reference ? `<p>客戶 PO：${esc(row.po_reference)}</p>` : ''}<p>工作單位：${esc(row.work_unit_name)}</p><p>報價編號：${esc(row.quotation_number)}</p><p>PO 狀態：${esc(row.status)}</p><p>工作狀態：${esc(row.work_status)}</p>${list(row.work_dates).length ? `<p>工作日期：${list(row.work_dates).map((value) => formatDate(value)).join('、')}</p>` : ''}${row.delivery_date ? `<p>交貨日期：${formatDate(row.delivery_date)}</p>` : ''}${row.delivery_address ? `<p class="pre">交貨地址：${nl2br(row.delivery_address)}</p>` : ''}</div></section><table class="data-table"><thead><tr><th>Item</th><th>Code No.</th><th>Description / Particular</th><th class="num">Qty</th><th class="num">Unit Rate</th><th class="num">Disc</th><th class="num">Sub Total</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.code_no || item.item_code || '')}</td><td class="pre"><strong>${nl2br(item.item_name)}</strong>${item.description ? `<div>${nl2br(plain(item.description))}</div>` : ''}</td><td class="num">${esc(item.quantity)} ${esc(item.unit || '')}</td><td class="num">${formatNumber(item.unit_price)}</td><td class="num">${num(item.discount) ? formatNumber(item.discount) : ''}</td><td class="num">${formatNumber(item.total ?? item.subtotal)}</td></tr>`).join('')}</tbody></table><div style="width:310px;margin-left:auto">${row.subtotal !== undefined && row.subtotal !== '' ? `<div class="total-line"><span>Subtotal:</span><span>HK$${formatNumber(row.subtotal)}</span></div>` : ''}${num(row.tax_amount) ? `<div class="total-line"><span>Tax:</span><span>HK$${formatNumber(row.tax_amount)}</span></div>` : ''}<div class="total-line grand-total"><span>Total Amount:</span><span>HK$${formatNumber(row.total_amount)}</span></div></div>${row.payment_terms ? `<p class="pre"><strong>付款條款：</strong>${nl2br(row.payment_terms)}</p>` : ''}${row.notes ? `<p class="pre"><strong>備註：</strong>${nl2br(row.notes)}</p>` : ''}<div class="signature-grid"><div><p>For and on behalf of</p><p class="bold">${COMPANY_EN}</p><div class="signature-images">${image(settings.company_signature, publicToken, '', 'Signature')}${image(settings.company_stamp, publicToken, '', 'Stamp')}</div><div class="signature-line">Authorized Signature</div></div><div><p>Confirmed by:</p><div class="signature-images"></div><div class="signature-line">Company Chop and Authorized Signature<br>Date:</div></div></div>`;
  return documentShell(`${row.po_number || 'PO'} · PURCHASE ORDER`, body);
}

function deliveryNoteDocument(row, settings, publicToken) {
  const source = list(row.items);
  const items = source.length < 10 ? [...source, ...Array(10 - source.length).fill(null)] : source;
  const body = `${companyHeader(settings, publicToken)}<div style="display:flex;justify-content:space-between;margin-bottom:15px"><h2>送貨單 Delivery Note</h2><h2>${esc(row.dn_number)}</h2></div><section class="info-grid"><div><p style="font-size:16px"><strong>公司：</strong><strong>${esc(row.customer_name)}</strong></p>${row.delivery_address || row.delivery_site ? `<p style="font-size:15px" class="pre"><strong>送貨地址：</strong>${nl2br(row.delivery_address || row.delivery_site)}</p>` : ''}${row.contact_person ? `<p><strong>收貨人：</strong>${esc(row.contact_person)}</p>` : ''}${row.contact_phone ? `<p><strong>電話：</strong>${esc(row.contact_phone)}</p>` : ''}${row.delivery_method ? `<p><strong>送貨方式：</strong>${esc(row.delivery_method)}</p>` : ''}</div><div class="right"><p><strong>Date:</strong> <span style="display:inline-block;border:1px solid #111;min-width:120px;padding:3px 8px">${formatDate(row.dn_date, 'dd/MM/yyyy')}</span></p>${row.po_number ? `<p class="bold">PO No. : ${esc(row.po_number)}</p>` : ''}${row.invoice_number ? `<p>Invoice No. : ${esc(row.invoice_number)}</p>` : ''}</div></section><table class="data-table" style="border-top:2px solid #111"><thead><tr><th class="center" style="width:60px">Qty</th><th style="width:100px">Code No.</th><th>Product Description</th><th class="center" style="width:80px">Packing</th><th style="width:105px">Remark</th></tr></thead><tbody>${items.map((item, index) => `<tr${index % 2 ? ' style="background:#f5f5f5"' : ''}><td class="center">${esc(item?.qty || '')}</td><td>${esc(item?.code_no || '')}</td><td class="pre">${nl2br(item?.product_description || '')}</td><td class="center">${esc(item?.packing || '')}</td><td class="pre">${nl2br(item?.remark || '')}</td></tr>`).join('')}</tbody></table><div style="width:280px;margin:20px 0 20px auto" class="center avoid"><p>Confirmed by 驗收確認 :</p><div style="border:1px solid #111;height:80px"></div><p>Goods received &amp; checked / chop &amp; signature</p></div>${row.notes ? `<p class="pre"><strong>備註：</strong>${nl2br(row.notes)}</p>` : ''}<footer style="border-top:2px solid #111;padding-top:8px"><p style="color:#a32d2d" class="bold">Remark :</p><div style="font-size:10px"><p>(1) The receiver/customer should check carefully goods conditions upon goods arrivel, and put remark on delivery note if any damage or quantity missing.</p><p>(2) Clean sign or no special remarks from the customers means nothing abnormal on goods condition.</p><p>(3) Any claim or complaint related thereafter is not accepted.</p></div></footer>`;
  return documentShell(`${row.dn_number || 'Delivery Note'} · 送貨單`, body);
}

function genericItems(items, columns = []) {
  if (!items.length) return '<span class="muted">—</span>';
  const configured = columns.filter((column) => !column.hidden);
  const cols = configured.length ? configured : [...new Set(items.flatMap((item) => Object.keys(object(item))))].slice(0, 8).map((name) => ({ name, label: name }));
  return `<table class="data-table"><thead><tr>${cols.map((column) => `<th>${esc(column.label || column.name)}</th>`).join('')}</tr></thead><tbody>${items.map((item) => `<tr>${cols.map((column) => `<td>${column.type === 'money' ? `HK$ ${formatNumber(item?.[column.name])}` : column.type === 'richtext' ? sanitizeHtml(item?.[column.name]) : nl2br(valueText(item?.[column.name]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function genericFiles(value, publicToken) {
  const files = list(value).length ? list(value) : value ? [value] : [];
  if (!files.length) return '<span class="muted">—</span>';
  return `<ul>${files.map((file) => { const url = assetUrl(file); const name = file && typeof file === 'object' ? file.file_name || file.name || file.caption || url : url; const href = safeAttachmentHref(url, publicToken); return `<li>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(name || '附件')}</a>` : esc(name || valueText(file))}</li>`; }).join('')}</ul>`;
}

function genericDocument(cfg, row, publicToken) {
  let currentSection = '';
  const fields = (cfg.fields || []).map((field) => {
    const section = field.section && field.section !== currentSection ? `<h3 class="section-title" style="grid-column:1/-1">${esc(field.section)}</h3>` : '';
    if (field.section) currentSection = field.section;
    const value = row[field.name];
    let rendered;
    if (field.type === 'richtext') rendered = value ? `<div class="rich">${sanitizeHtml(value)}</div>` : '—';
    else if (field.type === 'money') rendered = `HK$ ${formatNumber(value)}`;
    else if (field.type === 'date') rendered = formatDate(value);
    else if (field.type === 'checkbox') rendered = bool(value) ? '是' : '否';
    else if (field.type === 'items') rendered = genericItems(list(value), field.itemColumns || []);
    else if (field.type === 'picks') rendered = list(value).map((entry) => (entry && typeof entry === 'object' ? entry.label || entry.name || entry.id : entry)).filter(Boolean).join('、') || '—';
    else if (field.type === 'files' || field.type === 'attachments') rendered = genericFiles(value, publicToken);
    else if (field.type === 'json' || (value && typeof value === 'object')) rendered = `<pre class="json">${esc(JSON.stringify(value ?? '', null, 2))}</pre>`;
    else rendered = value === '' || value === null || value === undefined ? '—' : nl2br(value);
    return `${section}<div class="field ${field.wide || ['textarea', 'richtext', 'items', 'files', 'json'].includes(field.type) ? 'wide' : ''}"><dt>${esc(field.label || field.name)}</dt><dd>${rendered}</dd></div>`;
  }).join('');
  const title = row[cfg.labelField] || row.id || cfg.title || cfg.entity || '文件';
  return documentShell(`${title} · ${cfg.title || '文件'}`, `<h1>${esc(title)}</h1><p class="muted">${esc(cfg.title || cfg.entity || '')}</p><div class="field-grid">${fields}</div>`);
}

export function printDocument({ cfg, row, store, user = null, publicToken = '' }) {
  void user;
  const settings = companySettings(store);
  const key = str(cfg.key || cfg.entity).toLowerCase();
  if (key === 'quotations' || key === 'quotation') return row.quotation_type === '服務' ? serviceQuotation(row, settings, publicToken) : productQuotation(row, settings, publicToken);
  if (key === 'invoices' || key === 'invoice') return invoiceDocument(row, settings, publicToken);
  if (key === 'receipts' || key === 'receipt') return receiptDocument(row, settings, publicToken);
  if (key === 'contracts' || key === 'contract') return contractDocument(row, store, settings, publicToken);
  if (key === 'purchase_orders' || key === 'purchaseorder') return purchaseOrderDocument(row, settings, publicToken);
  if (key === 'delivery_notes' || key === 'deliverynote') return deliveryNoteDocument(row, settings, publicToken);
  return genericDocument(cfg, row, publicToken);
}

function employeeNames(items) {
  return list(items).map((item) => item.employee_nickname || item.employee_name || item.name || '').filter(Boolean).join(', ');
}

function pesticideNames(items) {
  return list(items).map((item) => item.product_name || item.name || '').filter(Boolean).join(', ');
}

const PESTS_STANDARD = [
  ['Cockroaches', 'Ants', 'Booklice', 'Plant Flies'], ['Rodents', 'Lizards', 'Wasp', 'Container Fumigation'],
  ['Termite', 'Mites', 'Case Moths', 'Ticks'], ['Termite Preventive', 'Snakes', 'Woodborers', 'Spiders'],
  ['Fleas', 'Centipede', 'Flies', 'Others'], ['Mosquitoes', 'Silverfish', 'Carpet Beetles', ''],
];
const PESTS_EXTENDED = PESTS_STANDARD.map((line, index) => index === 4 ? ['Fleas', 'Centipede', 'Flies', 'Disinfection'] : index === 5 ? ['Mosquitoes', 'Silverfish', 'Carpet Beetles', 'Others'] : line);

function pestTable(rows, checked) {
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:5px">${rows.map((line) => `<tr>${line.map((name) => { if (!name) return '<td style="border:1px solid #000"></td>'; const selected = list(checked).includes(name); return `<td style="border:1px solid #000;padding:3px 6px;font-size:11px;background:${selected ? '#d4edda' : '#fff'};font-weight:${selected ? 'bold' : 'normal'}">${esc(name)}${selected ? ' ✓' : ''}</td>`; }).join('')}</tr>`).join('')}</table>`;
}

function certificateDate(value, chinese = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(value));
  if (!match) return value ? esc(value) : chinese ? '_____ 年 ____ 月 ____ 日' : '_______________';
  const [, year, month, day] = match;
  if (chinese) return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function certificateFields(data) {
  return `<table style="font-size:11px;margin:5px 0"><tr><td class="bold">Name</td><td>:</td><td><span style="border-bottom:1px solid #000;display:inline-block;min-width:160px">${esc(data.name)}</span></td></tr><tr><td class="bold">Address</td><td>:</td><td><span style="border-bottom:1px solid #000;display:inline-block;min-width:160px" class="pre">${nl2br(data.address)}</span></td></tr><tr><td class="bold">Tel</td><td>:</td><td><span style="border-bottom:1px solid #000;display:inline-block;min-width:160px">${esc(data.tel)}</span></td></tr></table>`;
}

function paymentTable(data, fiveColumns = false) {
  if (fiveColumns) return `<table style="width:100%;border-collapse:collapse;margin-bottom:5px"><tr><td style="border:1px solid #000"></td><td style="border:1px solid #000;padding:3px 6px">Cash　${esc(data.cash)}</td><td style="border:1px solid #000"></td><td style="border:1px solid #000;padding:3px 6px">Cheque No.　${esc(data.cheque_no)}</td><td style="border:1px solid #000;padding:3px 6px">Amount　${data.amount ? `HK$ ${esc(data.amount)}` : ''}</td></tr><tr><td colspan="2" style="border:1px solid #000;padding:3px 6px">Equipment　${esc(data.equipment)}</td><td style="border:1px solid #000"></td><td style="border:1px solid #000;padding:3px 6px">Pesticide　${esc(pesticideNames(data.pesticides_list))}</td><td style="border:1px solid #000;padding:3px 6px">Operators　${esc(employeeNames(data.operators_list))}</td></tr></table>`;
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:5px"><tr><td style="border:1px solid #000;padding:3px 6px">Cash　${esc(data.cash)}</td><td style="border:1px solid #000;padding:3px 6px">Cheque No.　${esc(data.cheque_no)}</td><td style="border:1px solid #000;padding:3px 6px">Amount　${data.amount ? `HK$ ${esc(data.amount)}` : ''}</td></tr><tr><td style="border:1px solid #000;padding:3px 6px">Equipment　${esc(data.equipment)}</td><td style="border:1px solid #000;padding:3px 6px">Pesticide　${esc(pesticideNames(data.pesticides_list))}</td><td style="border:1px solid #000;padding:3px 6px">Operators　${esc(employeeNames(data.operators_list))}</td></tr></table>`;
}

function standardCertificate(data, settings, publicToken) {
  const body = `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #333;padding-bottom:7px"><div style="display:flex;align-items:flex-start">${image(settings.company_logo, publicToken, 'company-logo', 'Logo')}<div>${certificateFields(data)}</div></div><div class="right"><div style="font-size:16px" class="bold">標準(香港)清潔滅蟲有限公司</div><div style="font-size:9px" class="bold">STANDARD (HK) CLEANING AND PEST CONTROL CO., LTD.</div><div style="font-size:9px">${esc(settings.company_address || DEFAULT_ADDRESS)}</div><div style="font-size:9px">Tel:${esc(settings.company_phone || DEFAULT_PHONE)}　Fax:${esc(settings.company_fax || DEFAULT_FAX)}　E-mail:${esc(settings.company_email || DEFAULT_EMAIL)}</div><div style="font-size:13px" class="bold">COMPLETION CERTIFICATE<br>工程滿意紙</div></div></div><p>Dear Sir/Madam,<br>We advice having called at your premises on <span style="border-bottom:1px solid #000">${certificateDate(data.visit_date)}</span> and were able to complete treatment in respect to:-</p>${pestTable(PESTS_STANDARD, data.checked_pests)}${paymentTable(data, true)}<p>Kindly signed hereunder, as evidence of treatment being completed and satisfied.</p><p>REMARKS: <span style="border-bottom:1px solid #000" class="pre">${nl2br(data.remarks)}</span></p><div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="width:44%">CLIENT<div class="signature-line"></div></div><div style="width:50%" class="right">STANDARD (HK) CLEANING AND PEST CONTROL CO., LTD.<div class="signature-images" style="justify-content:flex-end">${image(settings.company_signature, publicToken, '', 'Signature')}${image(settings.company_stamp, publicToken, '', 'Stamp')}</div><div class="signature-line center">Authorized Signature</div></div></div>`;
  return { body, used: ['name', 'address', 'tel', 'visit_date', 'cash', 'cheque_no', 'amount', 'equipment', 'remarks', 'checked_pests', 'operators_list', 'pesticides_list'] };
}

function sunbaseCertificate(data) {
  const body = `<div style="display:flex;align-items:center;border-bottom:2px solid #888;padding-bottom:8px"><div style="width:60px;height:60px;background:#6a1b9a;border-radius:8px;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;margin-right:10px">SB</div><div><div style="font-size:18px;letter-spacing:2px" class="bold">新 基 環 保 服 務 有 限 公 司</div><div class="bold">Sun Base Environmental services Limited</div></div><div style="margin-left:auto" class="right bold">COMPLETION CERTIFICATE<br>工程滿意紙</div></div>${certificateFields(data)}<p>Dear Sir/Madam,<br>We advice having called at your premises on <span style="border-bottom:1px solid #000">${certificateDate(data.visit_date)}</span> and were able to complete treatment in respect to:-</p>${pestTable(PESTS_STANDARD, data.checked_pests)}${paymentTable(data)}<p>Kindly signed hereunder, as evidence of treatment being completed and satisfied.</p><p>REMARKS: <span style="border-bottom:1px solid #000">${nl2br(data.remarks)}</span></p><div style="display:flex;justify-content:space-between;border-top:1px solid #000;padding-top:10px"><div style="width:45%">CLIENT<div class="signature-line"></div></div><div style="width:45%" class="right">Sun Base Environmental service Limited<div class="signature-line"></div></div></div>`;
  return { body, used: ['name', 'address', 'tel', 'visit_date', 'cash', 'cheque_no', 'amount', 'equipment', 'remarks', 'checked_pests', 'operators_list', 'pesticides_list'] };
}

function cityCertificate(data, waitat = false) {
  const company = waitat ? '<div><div class="bold">威達清潔服務有限公司</div><div class="bold">WAI TAT CLEANING SERVICE CO., LTD.</div></div><div class="right" style="font-size:10px">Flat B, 7/F, ZJ300,<br>300-306, Lockhart Road,<br>Wanchai H.K.<br>Tel : 2574 5768　Fax : 2834 3628</div>' : '<div><div style="font-size:24px;color:#1565c0" class="bold">城市清潔有限公司</div><div style="color:#1565c0;font-style:italic" class="bold">City Cleaning Limited</div></div><div class="right" style="font-size:10px">新界葵涌大連排道152-160號<br>金龍工業中心1座14樓E室<br>TEL: 2425 6333　FAX: 2612 1082</div>';
  const body = `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #000;padding-bottom:7px">${company}</div>${certificateFields(data)}<p>Dear Sir / Madam,<br>We advice having called at your premises on <span style="border-bottom:1px solid #000">${certificateDate(data.visit_date)}</span> and were able to complete treatment in respect to:-</p>${pestTable(PESTS_EXTENDED, data.checked_pests)}${paymentTable(data)}<p>Kindly signed hereunder, as evidence of treatment being completed and satisfied.</p><p>REMARKS: <span style="border-bottom:1px solid #000">${nl2br(data.remarks)}</span></p><div style="display:flex;justify-content:space-between;border-top:1px solid #000;padding-top:5px"><div>Client</div><div>${waitat ? 'Wai Tat Cleaning Service Co., Ltd.' : 'City Cleaning Limited'}</div></div><div style="display:flex;justify-content:space-between;margin-top:25px"><div style="border-top:1px solid #000;width:40%"></div><div style="border-top:1px solid #000;width:48%"></div></div>`;
  return { body, used: ['name', 'address', 'tel', 'visit_date', 'cash', 'cheque_no', 'amount', 'equipment', 'remarks', 'checked_pests', 'operators_list', 'pesticides_list'] };
}

function johnsonCertificate(data, workUnitLogo, publicToken) {
  const logo = workUnitLogo ? image(workUnitLogo, publicToken, 'company-logo', 'Logo') : '<div style="width:65px;height:65px;border:2px solid #000;display:flex;align-items:center;justify-content:center;margin-right:10px">LOGO</div>';
  const rows = Array.from({ length: 5 }, (_, index) => `<tr><td style="height:30px"></td><td>${index === 0 ? nl2br(data.work_content) : ''}</td><td>${index === 0 ? nl2br(data.remarks) : ''}</td></tr>`).join('');
  const body = `<div style="display:flex;align-items:center;border-bottom:1px solid #000;padding-bottom:8px">${logo}<div><div style="font-size:17px;letter-spacing:2px" class="bold">莊 臣 清 潔 服 務 有 限 公 司</div><div class="bold">Johnson Environmental Services Ltd.</div><div style="font-size:9px">香港中區永吉街3-7號永吉堂商業大廈4B室<br>4B, WING YEE COMMERCIAL BUILDING, 3-7 WING KUT ST, CENTRAL, H.K.<br>TEL (電話): 2541 8526　FAX (傳真): 2545 8720</div></div></div><p class="right">Date (日期): <span style="border-bottom:1px solid #000">${certificateDate(data.visit_date, true)}</span></p><p>Customer (客戶): <span style="border-bottom:1px solid #000">${esc(data.name)}</span></p><p>Address (地址): <span style="border-bottom:1px solid #000" class="pre">${nl2br(data.address)}</span></p><table class="data-table schedule-table"><thead><tr><th colspan="3" style="font-style:italic">Working Order ( 工 作 單 )</th></tr><tr><th style="width:15%">Item (項目)</th><th>Job Description (工作內容)</th><th style="width:20%">Remarks (備註)</th></tr></thead><tbody>${rows}</tbody></table><p class="center" style="font-style:italic">I certify the above work have been executed as schedules above.</p><p class="center">茲証明上列工作如期做妥</p><p class="right">Authorized Officer Signature(客戶負責人簽署): <span style="display:inline-block;border-bottom:1px solid #000;min-width:200px"></span></p><p class="right">Date (日期): <span style="display:inline-block;border-bottom:1px solid #000;min-width:150px"></span></p>`;
  return { body, used: ['name', 'address', 'tel', 'visit_date', 'work_content', 'remarks'] };
}

function goodenvCertificate(data) {
  const body = `<div class="center"><div style="font-size:15px" class="bold">好環境服務有限公司</div><div class="bold">GOOD ENVIRONMENTAL SERVICES LIMITED</div></div><div style="border:1px solid #000;padding:5px;text-align:center;margin:10px 0" class="bold">COMPLETION CERTIFICATE<br>工程滿意紙</div><p>Customer 客戶 : <span style="border-bottom:1px solid #000">${esc(data.name)}</span></p><p>Address 地址 : <span style="border-bottom:1px solid #000" class="pre">${nl2br(data.address)}</span></p><div class="two-col"><p>Work Place 工作地點: <span style="border-bottom:1px solid #000">${nl2br(data.address)}</span></p><p>工作日期 Work on: <span style="border-bottom:1px solid #000">${certificateDate(data.visit_date)}</span></p><p>Contact 接洽人 : <span style="border-bottom:1px solid #000">${esc(data.name)}</span></p><p>Telephone 電話 : <span style="border-bottom:1px solid #000">${esc(data.tel)}</span></p></div><p>Description of Works :<br>工作項目 :</p><table style="width:100%">${Array.from({ length: 6 }, (_, index) => `<tr><td style="border-bottom:1px solid #ccc;padding:5px 0">${index === 0 ? nl2br(data.work_content) : ''}</td></tr>`).join('')}</table><p>Certified that the required work has been completed to my entire satisfaction.<br>本人完全滿意上述之工作及服務。</p><p>Signed &amp; Company Chop<br>簽名及公司蓋印</p><div class="signature-grid"><div>Customer 客戶 :<div class="signature-line"></div><div style="margin-top:20px">Date 日期 :<div class="signature-line"></div></div></div><div>Staff 負責員工 :<div class="signature-line"></div><div style="margin-top:20px">Date 日期 :<div class="signature-line"></div></div></div></div>`;
  return { body, used: ['name', 'address', 'tel', 'visit_date', 'work_content'] };
}

function mastercleanCertificate(data) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(data.visit_date));
  const body = `<div style="display:flex;align-items:center"><div style="width:50px;height:50px;border:2px solid #000;display:flex;align-items:center;justify-content:center;margin-right:8px">LOGO</div><div><div style="font-size:15px;letter-spacing:1px" class="bold">宏 潔 服 務 有 限 公 司</div><div>Master Clean Service Limited</div></div></div><h2 class="center" style="text-decoration:underline">完工證明書</h2><p>茲證明宏潔服務有限公司於 <span style="border-bottom:1px solid #000">${match ? match[1] : '____'}</span> 年 <span style="border-bottom:1px solid #000">${match ? Number(match[2]) : '____'}</span> 月 <span style="border-bottom:1px solid #000">${match ? Number(match[3]) : '____'}</span> 日</p><p>已經完成</p><p>地點：<span style="border-bottom:1px solid #000" class="pre">${nl2br(data.address)}</span></p><p>工程：<span style="border-bottom:1px solid #000" class="pre">${nl2br(data.work_content)}</span><br>報價編號：<span style="border-bottom:1px solid #000">${esc(data.quotation_number)}</span></p><p>並由 貴公司（ <span style="border-bottom:1px solid #000">${esc(data.name)}</span> ）驗收妥當。</p><div style="display:inline-block;border-top:1px solid #000;margin-top:25px">簽署及公司蓋印</div><div style="display:flex;gap:20px;margin-top:25px"><div style="border-top:1px solid #000;min-width:80px">年</div><div style="border-top:1px solid #000;min-width:60px">月</div><div style="border-top:1px solid #000;min-width:60px">日</div></div><p>日　期</p><p style="font-size:9px">MC-FORM-07.02</p>`;
  return { body, used: ['name', 'address', 'visit_date', 'work_content', 'quotation_number'] };
}

function contractorCertificate(data, daily) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(data.visit_date));
  const body = `<div style="display:flex;align-items:center"><div style="border:2px solid #000;padding:4px 8px;margin-right:10px" class="bold">${daily ? 'DC' : '昇捷'}</div><div style="font-size:11px">${daily ? '日新清潔服務有限公司 Daily Cleaning Services Co., Ltd.' : '昇捷 SYNERGIS'}</div></div><h2 class="center" style="text-decoration:underline">工程/服務完成驗收表</h2><p class="right">採購單/標書編號：<span style="border-bottom:1px solid #000">${esc(data.po_number)}</span></p><h3>甲部份 (由承判商填寫)</h3><table class="data-table schedule-table"><tr><td>1.</td><td>物業名稱</td><td>${esc(data.name)}</td></tr><tr><td>2.</td><td>施工/服務地點</td><td class="pre">${nl2br(data.address)}</td></tr><tr><td>3.</td><td>工程/服務項目名稱</td><td class="pre">${nl2br(data.work_content)}</td></tr><tr><td>4.</td><td>工程/服務總金額</td><td>${data.amount ? `HK$ ${esc(data.amount)}` : ''}</td></tr><tr><td>5.</td><td>承判商名稱</td><td>標準(香港)清潔滅蟲有限公司</td></tr><tr><td>6.</td><td>施工/服務期</td><td>由 ${match ? match[1] : '____'} 年 ${match ? Number(match[2]) : '__'} 月 ${match ? Number(match[3]) : '__'} 日<br>至 ____________________</td></tr><tr><td>7.</td><td>申請工程/服務完成日期</td><td>____________________</td></tr><tr><td>8.</td><td colspan="2">工程/服務是否有保固期/保養期：□是 *(請註明)　□否</td></tr><tr><td>9.</td><td colspan="2">上述工程/服務是否需呈交測試報告：□是 *(請註明)　□否</td></tr><tr><td>10.</td><td colspan="2">附上上述工程/服務的數碼相片*：____ 張</td></tr></table><h3>乙部份 (由管業處填寫)</h3><table class="data-table schedule-table"><tr><td>1.</td><td>工程/服務完成驗收日期</td><td>____ 年 ____ 月 ____ 日</td></tr><tr><td>2.</td><td>工程/服務是否有變更</td><td>□是 *(請註明)　□否</td></tr><tr><td>3.</td><td>工程/服務已完成</td><td>□同意　□不同意 *(請註明)</td></tr></table><p>(備註：請於□ 位置加上"√"號)</p><p class="bold">負責人簽署及公司蓋印</p><table class="data-table schedule-table"><tr><td class="center">承判商簽署</td><td class="center">工程部簽署</td><td class="center">工程經理簽署</td><td class="center">管業處簽署</td></tr><tr><td style="height:40px"></td><td></td><td></td><td></td></tr><tr><td>姓名</td><td>姓名</td><td>姓名</td><td>姓名</td></tr><tr><td>日期</td><td>日期</td><td>日期</td><td>日期</td></tr></table>${data.remarks ? `<p class="pre">備註：${nl2br(data.remarks)}</p>` : ''}`;
  return { body, used: ['name', 'address', 'visit_date', 'work_content', 'amount', 'po_number', 'remarks'] };
}

function certificateTemplate(name) {
  const value = str(name);
  const lower = value.toLowerCase();
  if (value.includes('莊臣') || lower.includes('johnson')) return 'johnson';
  if (value.includes('新基') || lower.includes('sun base') || lower.includes('sunbase')) return 'sunbase';
  if (value.includes('日新') || lower.includes('daily cleaning') || lower.includes('dailycleaning')) return 'dailycleaning';
  if (value.includes('好環境') || lower.includes('good environmental') || lower.includes('goodenv')) return 'goodenv';
  if (value.includes('宏潔') || lower.includes('master clean') || lower.includes('masterclean')) return 'masterclean';
  if (value.includes('昇捷') || lower.includes('synergis')) return 'synergis';
  if (value.includes('城市') || lower.includes('city cleaning') || lower.includes('citycleaning')) return 'citycleaning';
  if (value.includes('威達') || lower.includes('wai tat') || lower.includes('waitat')) return 'waitat';
  return 'standard';
}

const CERT_LABELS = { name: 'Name', address: 'Address', tel: 'Tel', visit_date: 'Visit Date', cash: 'Cash', cheque_no: 'Cheque No.', amount: 'Amount', equipment: 'Equipment', remarks: 'Remarks', checked_pests: '已選害蟲', operators_list: 'Operators', pesticides_list: 'Pesticide', work_content: '工作內容', quotation_number: '報價編號', po_number: '採購單/標書編號', signed_by: '簽署人', signed_date: '簽署日期', signature_image: '簽署圖像', signing_status: '簽署狀態' };

export function completionCertificate({ row, store, publicToken = '', readOnly = false }) {
  const settings = companySettings(store);
  const cert = object(row.completion_certificate);
  const data = {
    name: cert.name || row.customer_name || '', address: row.work_location || cert.address || '', tel: row.contact_phone || cert.tel || '',
    visit_date: cert.visit_date || list(row.work_dates)[0] || row.po_date || '', cash: cert.cash || '', cheque_no: cert.cheque_no || '',
    amount: cert.amount || (row.total_amount ? String(row.total_amount) : ''), equipment: cert.equipment || '', remarks: cert.remarks || '',
    checked_pests: list(cert.checked_pests), operators_list: list(cert.operators_list), pesticides_list: list(cert.pesticides_list),
    work_content: cert.work_content || row.work_content || '', quotation_number: cert.quotation_number || row.quotation_number || '', po_number: cert.po_number || row.po_number || '',
  };
  const template = certificateTemplate(row.work_unit_name);
  const unit = safeList(store, 'work_units').find((entry) => entry.id === row.work_unit_id || entry.unit_name === row.work_unit_name) || {};
  let rendered;
  if (template === 'johnson') rendered = johnsonCertificate(data, unit.company_logo, publicToken);
  else if (template === 'sunbase') rendered = sunbaseCertificate(data);
  else if (template === 'citycleaning') rendered = cityCertificate(data, false);
  else if (template === 'waitat') rendered = cityCertificate(data, true);
  else if (template === 'goodenv') rendered = goodenvCertificate(data);
  else if (template === 'masterclean') rendered = mastercleanCertificate(data);
  else if (template === 'synergis') rendered = contractorCertificate(data, false);
  else if (template === 'dailycleaning') rendered = contractorCertificate(data, true);
  else rendered = standardCertificate(data, settings, publicToken);
  const used = new Set([...rendered.used, 'signed_by', 'signed_date', 'signature_image', 'signing_status']);
  const extras = Object.entries(cert).filter(([key]) => !used.has(key));
  const extraHtml = extras.length ? `<section class="certificate-extra"><strong>工程滿意紙其他資料</strong><dl>${extras.map(([key, value]) => `<div style="display:flex;gap:8px"><dt style="min-width:130px">${esc(CERT_LABELS[key] || key)}：</dt><dd class="pre" style="margin:0">${nl2br(valueText(value))}</dd></div>`).join('')}</dl></section>` : '';
  const signedBy = row.signed_by || cert.signed_by || cert.signer_name || '';
  const signedDate = row.signed_date || cert.signed_date || cert.signed_at || '';
  const signatureImage = row.signature_image || cert.signature_image || row.signature_data || cert.signature_data || '';
  const signingStatus = row.signing_status || cert.signing_status || '';
  const signature = `<section class="certificate-sign" data-read-only="${readOnly ? 'true' : 'false'}"><div class="two-col"><div><strong>客戶簽署 / Client Signature</strong><div style="min-height:65px;border-bottom:1px solid #000;padding-top:3px">${image(signatureImage, publicToken, '', 'Client Signature')}</div><p>簽署人：${esc(signedBy)}</p><p>簽署日期：${esc(signedDate)}</p>${signingStatus ? `<p>簽署狀態：${esc(signingStatus)}</p>` : ''}</div><div><strong>簽署及公司蓋章</strong><div style="min-height:65px;border-bottom:1px solid #000"></div><p>日期：</p></div></div></section>`;
  return documentShell(`${data.po_number || data.name || '工程滿意紙'} · 工程滿意紙`, `${rendered.body}${extraHtml}${signature}`, '.document{font-size:12px;min-height:0}');
}

export function schedulePrint({ rows, date = '', title = '工作排班' }) {
  const flattened = [];
  for (const schedule of arr(rows)) {
    const employees = employeeNames(schedule.assigned_employees);
    const items = list(schedule.work_items);
    if (!items.length) flattened.push({ schedule, item: {}, employees });
    else for (const item of items) flattened.push({ schedule, item, employees });
  }
  flattened.sort((a, b) => str(a.schedule.schedule_date).localeCompare(str(b.schedule.schedule_date)) || str(a.item.start_time).localeCompare(str(b.item.start_time)));
  const scheduleDates = [...new Set(arr(rows).map((entry) => entry.schedule_date).filter(Boolean))];
  const headingDate = date || (scheduleDates.length === 1 ? scheduleDates[0] : '');
  const body = `<h1 class="center">${esc(title)}</h1><p class="center">${esc(headingDate)}</p><table class="data-table schedule-table"><thead><tr><th>日期</th><th>時間</th><th>工作 / 客戶</th><th>工作地點</th><th>聯絡人</th><th>員工 / 車輛</th><th>狀態</th><th>備註</th></tr></thead><tbody>${flattened.length ? flattened.map(({ schedule, item, employees }) => `<tr><td>${formatDate(schedule.schedule_date)}</td><td style="white-space:nowrap">${esc(item.start_time || '')}${item.end_time ? ` - ${esc(item.end_time)}` : ''}</td><td class="pre"><strong>${nl2br(item.work_name || item.work_content || '')}</strong>${item.service_type ? `<br>${esc(item.service_type)}` : ''}</td><td class="pre">${nl2br(item.work_location)}</td><td>${esc(item.contact_person || '')}${item.contact_phone ? `<br>${esc(item.contact_phone)}` : ''}</td><td>${nl2br(employees)}${schedule.vehicle_plate ? `<br>車牌：${esc(schedule.vehicle_plate)}` : ''}</td><td>${esc(schedule.status || item.status || '')}</td><td class="pre">${nl2br([item.notes, schedule.notes].filter(Boolean).join('\n'))}</td></tr>`).join('') : '<tr><td colspan="8" class="center">此日期暫無排班</td></tr>'}</tbody></table><p>共 ${flattened.length} 個工作項目</p>`;
  return documentShell(`${title}${date ? ` · ${date}` : ''}`, body, '@page{size:A4 landscape;margin:10mm}.document{width:277mm;min-height:190mm;font-size:10px}.schedule-table th,.schedule-table td{padding:5px}@media print{.document{width:auto;min-height:0}}');
}

export function workRecordPrint({ row, store, publicToken = '' }) {
  const settings = companySettings(store);
  const pesticide = row.pesticide_applied || list(row.products_used).map((item) => `${item.product_name || ''}${item.quantity ? ` ${item.quantity} ${item.unit || ''}` : ''}${item.notes ? ` (${item.notes})` : ''}`).join('\n');
  const photos = list(row.photo_points);
  const photoKeys = ['close_up_photo', 'far_photo', 'work_photo', 'target_photo', 'photo_url'];
  const body = `${companyHeader(settings, publicToken)}<section class="center"><h1>${esc(row.report_title || '滅白蟻服務工作報告')}</h1><p class="right">Reference No.: ${esc(row.reference_no)}</p></section><table class="data-table report-table"><tbody><tr><th>Client<br>客戶</th><td>${esc(row.work_unit_name || row.work_name || row.customer_name || '—')}</td></tr><tr><th>Service Address<br>服務地址</th><td class="pre">${nl2br(row.work_location || '—')}</td></tr><tr><th>Service Area<br>服務範圍</th><td class="pre">${nl2br(row.remarks || '—')}</td></tr><tr><th>Services Description<br>服務細則</th><td class="pre">${nl2br(row.service_description)}</td></tr><tr><th>Pesticide Applied<br>使用藥物</th><td class="pre">${nl2br(pesticide)}</td></tr><tr><th>Services Date<br>工作日期</th><td>${formatDate(row.completion_date, 'dd-MM-yyyy')}</td></tr>${row.employee_name ? `<tr><th>Technician<br>工作人員</th><td>${esc(row.employee_name)}</td></tr>` : ''}</tbody></table><section class="section"><p class="pre">${nl2br(row.description_text)}</p></section>${photos.length ? `<section class="section"><p class="pre">${nl2br(row.photo_section_text)}</p>${photos.map((point, index) => `<div class="avoid" style="margin-bottom:18px">${point.point_name ? `<h3>${esc(point.point_name)}</h3>` : ''}<div class="photo-grid">${photoKeys.filter((key) => assetUrl(point[key])).map((key) => `<figure style="margin:0">${image(point[key], publicToken, '', `記錄 ${index + 1}`)}${point.caption && key === 'photo_url' ? `<figcaption>${esc(point.caption)}</figcaption>` : ''}</figure>`).join('')}</div>${point.notes ? `<p class="pre">${nl2br(point.notes)}</p>` : ''}</div>`).join('')}</section>` : ''}<footer class="center" style="border-top:1px solid #aaa;padding-top:12px">報告撰寫日期: ${row.report_created_date || row.created_date || row.updated_date ? formatDate(row.report_created_date || row.created_date || row.updated_date, 'yyyy年MM月dd日') : '—'}</footer>`;
  return documentShell(`${row.reference_no || row.report_title || '服務報告'} · 服務報告`, body, '.document{font-size:13px}.section{break-inside:auto}');
}
