import { layout, pill, kpis, simpleTable, renderValue, renderAttachments, formGrid, attachmentHref } from './ui.mjs';
import { ENTITIES } from './config.mjs';
import { assertRole } from './core.mjs';
import { arr, displayDate, esc, hkNow, money, nl2br, num, queryWith, str, sum, uid, unique } from './utils.mjs';

const pick = (row, names, fallback = '') => {
  for (const name of names) if (row?.[name] !== null && row?.[name] !== undefined && row[name] !== '') return row[name];
  return fallback;
};
const day = (value) => str(value).slice(0, 10);
const personName = (user) => str(user?.name).replace(/（[^）]*）/g, '').trim();
const sameName = (a, b) => {
  const left = str(a).trim();
  const right = str(b).trim();
  return !!left && !!right && (left === right || personName({ name: left }) === personName({ name: right }));
};
const employees = (row) => arr(row?.assigned_employees);
const employeeNames = (row) => employees(row).map((e) => pick(e, ['employee_name', 'name'])).filter(Boolean).join('、');
const isMine = (row, user) => employees(row).some((e) =>
  ((user?.employee_id || user?.id) && [user?.employee_id, user?.id].filter(Boolean).map(str).includes(str(e.employee_id))) ||
  [e.employee_name, e.employee_nickname, e.full_name].some((name) => [user?.name, user?.nickname, user?.full_name].some((candidate) => sameName(name, candidate))));
const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
};
const canManageWork = (user) => user?.role === 'management';
const canSeeAmount = (user) => user?.role !== 'office';
const amount = (user, value) => canSeeAmount(user) ? `<span class="num">${money(num(value))}</span>` : '<span class="mask">•••••</span>';
const selected = (a, b) => str(a) === str(b) ? ' selected' : '';
const checked = (condition) => condition ? ' active' : '';
const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
const recordDate = (row, fields = ['date', 'work_date', 'attendance_date', 'check_in_date', 'completion_date', 'invoice_date', 'receipt_date', 'bill_date', 'payment_date', 'transaction_date', 'created_date']) => day(pick(row, fields));
const personRecord = (row, user) =>
  (user?.employee_id && str(pick(row, ['employee_id', 'user_id'])) === str(user.employee_id)) ||
  sameName(pick(row, ['employee_name', 'user_name', 'name']), user?.name) ||
  (user?.id && str(pick(row, ['user_id', 'employee_id'])) === str(user.id));
const sortByDate = (rows, fields, descending = true) => rows.sort((a, b) => {
  const result = recordDate(a, fields).localeCompare(recordDate(b, fields));
  return descending ? -result : result;
});
const emptyCard = (text = '暫無資料') => `<div class="card empty">${esc(text)}</div>`;
const notFound = (ctx, text = '找不到指定記錄') => layout({ title: '找不到記錄', user: ctx.user, csrf: ctx.csrf, body: `<div class="errbox"><h2>找不到記錄</h2><p class="muted">${esc(text)}</p><a class="btn ghost" href="/">返回首頁</a></div>` });
const optionList = (values, current, allLabel = '全部') => `<option value="">${esc(allLabel)}</option>${values.map((v) => `<option value="${esc(v)}"${selected(v, current)}>${esc(v)}</option>`).join('')}`;
const workItem = (schedule, index) => arr(schedule?.work_items)[index] || {};
const workTitle = (schedule, index = 0) => pick(workItem(schedule, index), ['work_name', 'po_name', 'quotation_number'], '未命名工作');
const workStatus = (schedule, index = 0) => pick(workItem(schedule, index), ['status'], schedule?.status || '待執行');
const workLink = (schedule, index = 0) => `/pestcontrolwork/${encodeURIComponent(schedule.id)}?index=${index}`;
const monthValid = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(str(value));
const dateValid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(str(value));
const monthShift = (month, offset) => {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
};
const daysInMonth = (month) => {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
};
const tableDate = (row, fields) => displayDate(recordDate(row, fields));

function workTable(rows, showPestTypes = false) {
  const columns = [
    { label: '日期', value: (r) => displayDate(r.schedule.schedule_date) },
    { label: '工作名稱', value: (r) => `<a href="${esc(workLink(r.schedule, r.index))}">${esc(workTitle(r.schedule, r.index))}</a>` },
    { label: '工作地點', value: (r) => esc(pick(r.item, ['work_location'], '—')) },
    { label: '服務種類', value: (r) => esc(pick(r.item, ['service_type'], '—')) },
  ];
  if (showPestTypes) columns.push({ label: '害蟲種類', value: (r) => esc(arr(r.report?.pest_types).join('、') || '—') });
  columns.push(
    { label: '員工', value: (r) => esc(employeeNames(r.schedule) || '—') },
    { label: '狀態', value: (r) => pill(workStatus(r.schedule, r.index)) },
  );
  return simpleTable(columns, rows);
}

function flattenWork(schedules, user, onlyMine = false) {
  const rows = [];
  for (const schedule of schedules) {
    if ((onlyMine || user?.role === 'front') && !isMine(schedule, user)) continue;
    arr(schedule.work_items).forEach((item, index) => rows.push({ schedule, item, index }));
  }
  return rows;
}

export function myWorkPage({ store, url, user, csrf }) {
  const now = hkNow();
  const schedules = store.list('Schedule');
  const visible = schedules.filter((s) => canManageWork(user) || isMine(s, user));
  const todayRows = flattenWork(visible.filter((s) => day(s.schedule_date) === now.date), user);
  const monthRows = flattenWork(visible.filter((s) => day(s.schedule_date).startsWith(now.month)), user);
  const announcements = store.list('Announcement').filter((a) => a.is_active !== false)
    .sort((a, b) => str(b.created_date).localeCompare(str(a.created_date)));
  const body = `<h1>我的工作</h1><div class="sub">${esc(now.date)} · ${canManageWork(user) ? '全部員工工作' : esc(personName(user))}</div>
    <div class="bar noprint"><a class="btn" href="/checkin">上班打卡</a><a class="btn ghost" href="/new/leave_records">申請請假</a><a class="btn ghost" href="/myattendance">我的出勤</a></div>
    ${kpis([{ label: '今日工作', value: todayRows.length }, { label: '本月工作', value: monthRows.length }, { label: '今日已完成', value: todayRows.filter((r) => workStatus(r.schedule, r.index) === '已完成').length }, { label: '公司公告', value: announcements.length }])}
    <h2>公司公告</h2>${announcements.length ? announcements.map((a) => `<div class="notice ${a.priority === '緊急' ? 'risk' : ''}"><b>${esc(a.title || '公告')} ${pill(a.priority || '一般')}</b><div>${nl2br(a.content)}</div><div class="muted">${displayDate(a.created_date)}</div></div>`).join('') : emptyCard('暫無公司公告')}
    <h2>今日工作</h2>${workTable(todayRows)}<h2>本月工作</h2>${workTable(monthRows.slice(0, 100))}${monthRows.length > 100 ? '<p class="muted">僅顯示本月首 100 項，請到滅蟲工作頁篩選。</p>' : ''}`;
  return layout({ title: '我的工作', body, user, csrf, active: url.pathname === '/' ? 'dashboard' : 'mywork', wide: true });
}

export function pestControlWorkPage({ store, url, user, csrf }) {
  const now = hkNow();
  const reports = store.list('WorkRecord');
  const reportMap = new Map(reports.map((r) => [`${r.schedule_id}|${num(r.work_item_index)}`, r]));
  const allRows = flattenWork(store.list('Schedule').filter((s) => !s.contract_id), user)
    .map((r) => ({ ...r, report: reportMap.get(`${r.schedule.id}|${r.index}`) }));
  const statuses = unique(allRows.map((r) => workStatus(r.schedule, r.index)));
  const types = unique(allRows.flatMap((r) => arr(r.report?.pest_types)));
  const tab = url.searchParams.get('tab') === 'today' ? 'today' : 'all';
  const view = ['year', 'month', 'day'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : '';
  const q = str(url.searchParams.get('q')).trim().toLowerCase();
  const status = str(url.searchParams.get('status'));
  const type = str(url.searchParams.get('type'));
  const year = /^\d{4}$/.test(str(url.searchParams.get('year'))) ? str(url.searchParams.get('year')) : now.date.slice(0, 4);
  const month = monthValid(url.searchParams.get('m')) ? url.searchParams.get('m') : now.month;
  const date = dateValid(url.searchParams.get('date')) ? url.searchParams.get('date') : now.date;
  let rows = allRows.filter((r) => {
    const d = day(r.schedule.schedule_date);
    if (tab === 'today' && d !== now.date) return false;
    if (tab === 'all' && view === 'year' && !d.startsWith(year)) return false;
    if (tab === 'all' && view === 'month' && !d.startsWith(month)) return false;
    if (tab === 'all' && view === 'day' && d !== date) return false;
    if (status && workStatus(r.schedule, r.index) !== status) return false;
    if (type && !arr(r.report?.pest_types).includes(type)) return false;
    if (q && ![r.item.work_name, r.item.work_location].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  rows = rows.sort((a, b) => day(a.schedule.schedule_date).localeCompare(day(b.schedule.schedule_date)) || a.schedule.id.localeCompare(b.schedule.id) || a.index - b.index);
  const years = Array.from({ length: 3 }, (_, i) => String(Number(now.date.slice(0, 4)) + i));
  const dateInput = view === 'year' ? `<select name="year" aria-label="年份">${years.map((y) => `<option value="${y}"${selected(y, year)}>${y}年</option>`).join('')}</select>`
    : view === 'month' ? `<input name="m" type="month" value="${esc(month)}" aria-label="月份">`
      : view === 'day' ? `<input name="date" type="date" value="${esc(date)}" aria-label="日期">` : '';
  const body = `<h1>滅蟲工作</h1><div class="sub">單次工作 · 共 ${rows.length} 項${user?.role === 'front' ? ' · 只顯示本人工作' : ''}</div>
    <div class="bar noprint"><a class="btn ghost${checked(tab === 'today')}" href="${esc(queryWith(url, { tab: 'today' }))}">今日工作</a><a class="btn ghost${checked(tab === 'all')}" href="${esc(queryWith(url, { tab: 'all' }))}">所有工作</a><span class="spacer"></span>${['year', 'month', 'day'].map((v) => `<a class="btn ghost${checked(view === v)}" href="${esc(queryWith(url, { tab: 'all', view: v }))}">${v === 'year' ? '按年' : v === 'month' ? '按月' : '按日'}</a>`).join('')}</div>
    <form class="bar noprint" method="get">${hidden('tab', tab)}${hidden('view', view)}${dateInput}<input class="search" name="q" value="${esc(q)}" placeholder="搜尋工作名稱、地址..."><select name="status">${optionList(statuses, status, '所有狀態')}</select><select name="type">${optionList(types, type, '所有種類')}</select><button class="btn">篩選</button></form>
    ${workTable(rows, true)}`;
  return layout({ title: '滅蟲工作', body, user, csrf, active: 'pestcontrolwork', wide: true });
}

export function pestControlWorkDetail({ store, url, user, csrf, id, index = 0 }) {
  const schedule = store.get('Schedule', id, { includeDeleted: false });
  const itemIndex = Math.max(0, Number.parseInt(index, 10) || 0);
  if (!schedule || !arr(schedule.work_items)[itemIndex]) return notFound({ user, csrf }, '找不到此排班工作明細');
  if (user?.role === 'front' && !isMine(schedule, user)) return notFound({ user, csrf }, '你沒有權限查看此工作');
  const item = workItem(schedule, itemIndex);
  const report = store.list('WorkRecord').find((r) => str(r.schedule_id) === str(id) && num(r.work_item_index) === itemIndex);
  const fields = [
    ['工作日期', schedule.schedule_date, 'date'], ['工作名稱', item.work_name], ['工作地點', item.work_location],
    ['工作單位', item.work_unit_name], ['服務種類', item.service_type], ['工作狀態', workStatus(schedule, itemIndex), 'status'],
    ['開始時間', item.start_time], ['結束時間', item.end_time], ['預計工時', item.estimated_hours], ['實際工時', item.work_hours],
    ['員工', employeeNames(schedule)], ['車輛', schedule.vehicle_plate], ['聯絡人', item.contact_person], ['聯絡電話', item.contact_phone],
    ['害蟲種類', arr(schedule.pest_types).join('、')], ['工作備註', item.notes, 'textarea'], ['排班備註', schedule.notes, 'textarea'], ['工作補充備註', schedule.work_notes, 'textarea'],
  ];
  const links = `${item.po_id ? `<a class="btn ghost" href="/purchaseorders/${encodeURIComponent(item.po_id)}">關聯採購單 ${esc(item.po_name || '')}</a>` : ''}${item.quotation_id ? `<a class="btn ghost" href="/quotations/${encodeURIComponent(item.quotation_id)}">關聯報價 ${esc(item.quotation_number || '')}</a>` : ''}`;
  const body = `<div class="breadcrumbs"><a href="/pestcontrolwork">滅蟲工作</a> / ${esc(workTitle(schedule, itemIndex))}</div><h1>${esc(workTitle(schedule, itemIndex))}</h1><div class="sub">排班 ID ${esc(schedule.id)} · 明細 ${itemIndex + 1}</div><div class="bar noprint"><a class="btn ghost" href="/pestcontrolwork">返回</a>${links}</div>
    <div class="card"><h3>工作詳情</h3><dl class="detail-grid">${fields.map(([label, value, type]) => `<div class="detail-row ${type === 'textarea' ? 'wide' : ''}"><dt>${esc(label)}</dt><dd>${renderValue(value, { type: type || 'text' }, { canSeeAmounts: canSeeAmount(user) })}</dd></div>`).join('')}</dl></div>
    <div class="card"><h3>服務報告與拍攝記錄點</h3>${report ? `<div class="bar"><span>${esc(report.report_title || '服務報告')}</span>${pill(report.status || workStatus(schedule, itemIndex))}<a class="btn ghost small" href="/servicereport/${encodeURIComponent(report.id)}">查看完整報告</a></div><p>${nl2br(report.remarks || report.description_text || '')}</p>${simpleTable([{ label: '記錄點', key: 'point_name' }, { label: '備註', key: 'notes' }, { label: '照片', value: (r) => renderAttachments(r) }], arr(report.photo_points))}${renderAttachments(report.photo_points)}` : '<div class="empty">暫無服務報告或拍攝記錄點</div>'}</div>
    <div class="card"><h3>同一排班的工作明細</h3>${simpleTable([{ label: '項目', value: (r) => r.index + 1 }, { label: '工作', value: (r) => `<a href="${esc(workLink(schedule, r.index))}">${esc(pick(r.item, ['work_name'], '未命名工作'))}</a>` }, { label: '地點', value: (r) => esc(r.item.work_location || '—') }, { label: '狀態', value: (r) => pill(workStatus(schedule, r.index)) }], arr(schedule.work_items).map((entry, i) => ({ item: entry, index: i })))}</div>`;
  return layout({ title: workTitle(schedule, itemIndex), body, user, csrf, active: 'pestcontrolwork', wide: true });
}

const ENDED = new Set(['已完成', '已取消']);
const REGION_KEYWORDS = {
  香港: ['中西區', '中環', '金鐘', '上環', '西營盤', '灣仔', '銅鑼灣', '天后', '北角', '鰂魚涌', '太古', '西灣河', '筲箕灣', '柴灣', '香港仔', '黃竹坑', '薄扶林', '赤柱', '南區', '跑馬地', '半山'],
  九龍: ['油尖旺', '尖沙咀', '油麻地', '佐敦', '旺角', '太子', '深水埗', '長沙灣', '荔枝角', '九龍城', '土瓜灣', '紅磡', '何文田', '黃大仙', '鑽石山', '新蒲崗', '樂富', '觀塘', '牛頭角', '九龍灣', '藍田', '油塘', '秀茂坪', '美孚'],
  新界: ['葵青', '葵涌', '青衣', '荃灣', '屯門', '元朗', '天水圍', '大埔', '粉嶺', '上水', '北區', '沙田', '馬鞍山', '火炭', '大圍', '西貢', '將軍澳', '坑口', '調景嶺', '清水灣', '沙頭角', '錦田', '落馬洲'],
  離島: ['離島', '東涌', '大嶼山', '赤鱲角', '機場', '愉景灣', '梅窩', '長洲', '坪洲', '南丫島', '榕樹灣', '索罟灣', '大澳'],
};
function contractEnded(contract, today = hkNow().date) {
  return ENDED.has(str(contract.contract_status)) || (dateValid(contract.contract_end_date) && contract.contract_end_date < today);
}
function contractRegion(contract) {
  if (['香港', '九龍', '新界', '離島', '未分類'].includes(contract.region)) return contract.region;
  const text = str(contract.work_location || contract.service_address || contract.address).replace(/\s+/g, '');
  if (!text) return '未分類';
  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) if (keywords.some((keyword) => text.includes(keyword))) return region;
  return '未分類';
}

export function servicePlansPage({ store, url, user, csrf }) {
  const q = str(url.searchParams.get('q')).trim().toLowerCase();
  const region = str(url.searchParams.get('region') || '全港');
  const sort = ['contract_start_date', 'customer_name', 'work_location', 'effective_region', 'contract_status'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'contract_start_date';
  const searched = store.list('Contract').filter((c) => !q || [c.contract_number, c.customer_name, c.work_location, c.work_content, c.service_type, c.pest_type, c.service_frequency].join(' ').toLowerCase().includes(q));
  const active = searched.filter((c) => !contractEnded(c));
  const ended = searched.filter((c) => contractEnded(c));
  const groups = { 全港: active.length, 香港: 0, 九龍: 0, 新界: 0, 離島: 0, 未分類: 0, 已結束: ended.length };
  for (const c of active) groups[contractRegion(c)]++;
  const sortValue = (c) => sort === 'effective_region' ? contractRegion(c) : str(c[sort]);
  const rows = (region === '已結束' ? ended : active.filter((c) => region === '全港' || contractRegion(c) === region))
    .sort((a, b) => sortValue(a).localeCompare(sortValue(b), 'zh-Hant'));
  const sortLabels = { contract_start_date: '開始日期', customer_name: '客戶', work_location: '地址', effective_region: '地區', contract_status: '狀態' };
  const body = `<h1>服務計劃</h1><div class="sub">以合約為本服務計劃 · 共 ${rows.length} 項</div><div class="bar noprint"><a class="btn" href="/new/contracts">新增服務計劃</a></div>
    <div class="bar noprint">${Object.entries(groups).map(([name, count]) => `<a class="btn ghost${checked(region === name)}" href="${esc(queryWith(url, { region: name === '全港' ? '' : name }))}">${esc(name)} ${count}</a>`).join('')}</div>
    <form class="bar noprint" method="get">${region !== '全港' ? hidden('region', region) : ''}<input class="search" name="q" value="${esc(q)}" placeholder="搜尋客戶、合約編號、地址、工作內容或頻率..."><select name="sort">${Object.entries(sortLabels).map(([value, label]) => `<option value="${value}"${selected(value, sort)}>按${label}排序</option>`).join('')}</select><button class="btn">搜尋</button></form>
    ${simpleTable([
      { label: '開始日期', value: (c) => `${displayDate(c.contract_start_date)}<br><span class="muted">至 ${displayDate(c.contract_end_date)}</span>` },
      { label: '客戶', value: (c) => `<a href="/serviceplans/${encodeURIComponent(c.id)}">${esc(c.customer_name || '—')}</a><br><span class="muted">${esc(c.contract_number || c.customer_code || '')}</span>` },
      { label: '詳細地址', value: (c) => `${esc(c.work_location || '—')}${c.work_content ? `<br><span class="muted">${esc(c.work_content)}</span>` : ''}` },
      { label: '地區', value: (c) => `${esc(contractRegion(c))}${c.is_manual_region ? '<br><span class="pill">手動</span>' : ''}` },
      { label: '狀態', value: (c) => pill(c.contract_status || (contractEnded(c) ? '已結束' : '生效中')) },
      { label: '服務頻率', value: (c) => esc(c.service_frequency || '—') },
      { label: '操作', value: (c) => `<a class="btn ghost small" href="/serviceplans/${encodeURIComponent(c.id)}">查看</a> <a class="btn ghost small" href="/edit/contracts/${encodeURIComponent(c.id)}">編輯</a>` },
    ], rows)}`;
  return layout({ title: '服務計劃', body, user, csrf, active: 'serviceplans', wide: true });
}

export function servicePlanDetail({ store, url, user, csrf, id }) {
  const contract = store.get('Contract', id, { includeDeleted: false });
  if (!contract) return notFound({ user, csrf }, '找不到此服務計劃');
  const dates = store.list('ServicePlanDate').filter((r) => str(r.contract_id) === str(id));
  const logs = store.list('ServicePlanLog').filter((r) => str(r.contract_id) === str(id));
  const recurring = store.list('RecurringSchedule').filter((r) => str(r.contract_id) === str(id) || (contract.contract_number && r.contract_number === contract.contract_number));
  const purchaseOrders = store.list('PurchaseOrder').filter((po) =>
    (contract.quotation_id && str(po.quotation_id) === str(contract.quotation_id)) ||
    (contract.contract_number && str(po.notes).includes(str(contract.contract_number))));
  const scheduleRows = [];
  for (const schedule of store.list('Schedule')) {
    arr(schedule.work_items).forEach((item, index) => {
      const matched = [schedule, item].some((row) =>
        (str(row.contract_id) && str(row.contract_id) === str(id)) ||
        (contract.contract_number && str(row.contract_number) === str(contract.contract_number)) ||
        (contract.quotation_id && str(row.quotation_id) === str(contract.quotation_id)) ||
        (contract.quotation_number && str(row.quotation_number) === str(contract.quotation_number)));
      if (matched) scheduleRows.push({ schedule, item, index });
    });
  }
  const fields = [
    ['合約編號', contract.contract_number], ['合約名稱', contract.contract_name], ['客戶', contract.customer_name],
    ['聯絡人', contract.contact_person], ['聯絡電話', contract.contact_phone], ['狀態', contract.contract_status, 'status'],
    ['開始日期', contract.contract_start_date, 'date'], ['結束日期', contract.contract_end_date, 'date'],
    ['詳細地址', contract.work_location], ['地區', `${contractRegion(contract)}${contract.is_manual_region ? '（手動）' : ''}`],
    ['服務種類', contract.service_type || contract.work_content], ['害蟲種類', contract.pest_type], ['用藥', contract.pesticides, 'items'], ['紀錄模式', contract.record_mode], ['紀錄點名稱', contract.record_points, 'json'],
    ['工作內容', contract.work_content, 'textarea'], ['服務頻率', contract.service_frequency], ['合約金額', contract.total_amount, 'money'],
    ['採購單號', contract.po_number], ['報價編號', contract.quotation_number], ['備註', contract.notes, 'textarea'],
  ];
  const recurringPreview = (r) => {
    const parsed = parseJsonObject(r.notes);
    const form = parsed?.form || {};
    const monthRows = arr(parsed?.monthRows);
    const workItems = arr(r.work_items);
    return `<details class="card"><summary>工作排程表預覽 · ${esc(r.schedule_name || r.id)}</summary>${parsed ? `<dl class="detail-grid"><div class="detail-row"><dt>服務標題</dt><dd>${esc(form.service_title || '—')}</dd></div><div class="detail-row"><dt>顯示合約號</dt><dd>${esc(form.contract_no_display || '—')}</dd></div><div class="detail-row wide"><dt>地點</dt><dd>${esc(form.location || '—')}</dd></div></dl>${simpleTable([{ label: '年份', key: 'year' }, { label: '月份', value: (m) => num(m.month) + 1 }, { label: '工作日期', value: (m) => esc(m.date || '—') }, { label: '備註', value: (m) => esc(m.remark || '—') }], monthRows)}` : r.notes ? `<p>${nl2br(r.notes)}</p>` : ''}${workItems.length ? simpleTable([{ label: '工作名稱', key: 'work_name' }, { label: '地點', key: 'work_location' }, { label: '服務種類', key: 'service_type' }, { label: '預計工時', key: 'estimated_hours' }], workItems) : '<p class="muted">此週期排程暫無工作項目</p>'}</details>`;
  };
  const body = `<div class="breadcrumbs"><a href="/serviceplans">服務計劃</a> / ${esc(contract.contract_number || contract.id)}</div><h1>${esc(contract.contract_name || contract.contract_number || '服務計劃')}</h1><div class="sub">${esc(contract.customer_name || '')}</div><div class="bar noprint"><a class="btn ghost" href="/serviceplans">返回</a><a class="btn" href="/edit/contracts/${encodeURIComponent(contract.id)}">編輯合約</a><a class="btn ghost" href="/PublicReportView?contract_id=${encodeURIComponent(contract.id)}" target="_blank" rel="noopener">公開報告</a>${contract.quotation_id ? `<a class="btn ghost" href="/quotations/${encodeURIComponent(contract.quotation_id)}">關聯報價</a>` : ''}</div>
    <div class="card"><h3>合約資料</h3><dl class="detail-grid">${fields.map(([label, value, type]) => `<div class="detail-row ${['textarea', 'items', 'json'].includes(type) ? 'wide' : ''}"><dt>${esc(label)}</dt><dd>${renderValue(value, { type: type || 'text' }, { canSeeAmounts: canSeeAmount(user) })}</dd></div>`).join('')}</dl></div>
    <div class="card"><h3>合約條款</h3><dl class="detail-grid"><div class="detail-row"><dt>付款條款</dt><dd>${renderValue(contract.payment_terms)}</dd></div><div class="detail-row wide"><dt>條款內容</dt><dd>${renderValue(pick(contract, ['terms', 'contract_terms', 'terms_and_conditions']), { type: 'textarea' })}</dd></div></dl></div>
    <div class="card"><h3>合約文件</h3>${renderAttachments(pick(contract, ['documents', 'contract_documents', 'files', 'attachments']))}</div>
    <h2>關聯採購單</h2>${simpleTable([{ label: 'PO 編號', value: (r) => `<a href="/purchaseorders/${encodeURIComponent(r.id)}">${esc(r.po_number || r.id)}</a>` }, { label: '名稱', key: 'po_name' }, { label: '日期', value: (r) => displayDate(r.po_date) }, { label: '狀態', value: (r) => pill(r.status) }, { label: '金額', value: (r) => amount(user, r.total_amount) }], purchaseOrders)}
    <h2>排班記錄</h2>${workTable(scheduleRows)}
    <h2>週期排程</h2>${simpleTable([{ label: '排程名稱', value: (r) => `<a href="/recurringschedules/${encodeURIComponent(r.id)}">${esc(r.schedule_name || r.id)}</a>` }, { label: '開始日期', value: (r) => displayDate(r.start_date) }, { label: '結束日期', value: (r) => displayDate(r.end_date) }, { label: '頻率', value: (r) => esc(r.frequency_type || '—') }, { label: '員工', value: (r) => esc(arr(r.default_employees).map((e) => e.employee_name || e.name || e).join('、') || '—') }, { label: '狀態', value: (r) => pill(r.status) }], recurring)}${recurring.map(recurringPreview).join('')}
    <h2>服務日期</h2>${simpleTable([{ label: '工作日期', value: (r) => displayDate(r.work_date) }, { label: '客戶', key: 'customer_name' }, { label: '員工', value: (r) => esc(employeeNames(r) || '—') }, { label: '狀態', value: (r) => pill(r.status) }, { label: '操作', value: (r) => `<a class="btn ghost small" href="/ServicePlanRecordDay?contract_id=${encodeURIComponent(id)}&date_id=${encodeURIComponent(r.id)}">填寫紀錄</a>` }], sortByDate(dates, ['work_date']))}
    <h2>服務紀錄</h2>${simpleTable([{ label: '工作日期', value: (r) => displayDate(r.work_date) }, { label: '記錄', value: (r) => esc(r.record_name || r.record_number || r.id) }, { label: '害蟲', key: 'pest_type' }, { label: '嚴重程度', key: 'severity' }, { label: '評估', key: 'assessment' }, { label: '客戶意見', key: 'customer_feedback' }, { label: '文字紀錄', key: 'free_text' }, { label: '備註', key: 'notes' }, { label: '照片', value: (r) => renderAttachments({ quadrants: r.quadrants, free_photos: r.free_photos }) }, { label: '狀態', value: (r) => pill(r.status) }], sortByDate(logs, ['work_date']))}`;
  return layout({ title: contract.contract_number || '服務計劃', body, user, csrf, active: 'serviceplans', wide: true });
}

export function serviceReportsPage({ store, url, user, csrf }) {
  const q = str(url.searchParams.get('q')).trim().toLowerCase();
  let rows = store.list('WorkRecord');
  if (user?.role === 'front') rows = rows.filter((r) => personRecord(r, user));
  rows = rows.filter((r) => !q || [r.report_title, r.work_name, r.work_location, r.employee_name, r.reference_no, r.service_description].join(' ').toLowerCase().includes(q));
  sortByDate(rows, ['completion_date', 'created_date']);
  const body = `<h1>服務報告</h1><div class="sub">真實工作報告 · 共 ${rows.length} 筆</div><div class="bar noprint"><a class="btn" href="/new/work_records">新增服務報告</a></div><form class="bar noprint" method="get"><input class="search" name="q" value="${esc(q)}" placeholder="搜尋已完成工作、報告、地點或員工..."><button class="btn">搜尋</button></form>
    ${simpleTable([{ label: '完成日期', value: (r) => displayDate(r.completion_date) }, { label: '報告標題', value: (r) => `<a href="/servicereport/${encodeURIComponent(r.id)}">${esc(r.report_title || r.work_name || r.id)}</a>` }, { label: '工作名稱', key: 'work_name' }, { label: '工作地點', key: 'work_location' }, { label: '員工', key: 'employee_name' }, { label: '狀態', value: (r) => pill(r.status) }, { label: '操作', value: (r) => `<a class="btn ghost small" href="/servicereport/${encodeURIComponent(r.id)}">查看</a>` }], rows)}`;
  return layout({ title: '服務報告', body, user, csrf, active: 'work_records', wide: true });
}

export function scheduleDialog({ store, user, csrf, row = null, isEdit = false, back = '/schedules', open = false }) {
  const cfg = ENTITIES.schedules;
  const data = row || {};
  const rowId = data.id || uid('sch');
  const ctx = { store, user, csrf, canSeeAmounts: false, options: {}, rowId, cfg };
  const canDelete = isEdit && cfg.editRoles.includes(user.role);
  return `<dialog class="modal" id="schedDlg"${open ? ' open' : ''}><form method="post" action="/save/schedules">${hidden('__csrf', csrf)}${hidden('__id', isEdit ? data.id : '')}${hidden('__new_id', rowId)}${hidden('__expected_updated', isEdit ? str(data.updated_date) : '')}${hidden('__back', back)}<div class="modal-head"><div><h3>${isEdit ? '編輯排班' : '新增排班'}</h3><div class="sub">選購採購單或合約會自動帶出工作名稱、地點、單位、聯絡人與服務類型；也可全部手動填寫</div></div><button type="button" class="btn ghost small" data-dlg-close aria-label="關閉">✕</button></div><div class="modal-body"><div class="fgrid">${formGrid(cfg.fields, data, ctx)}</div></div><div class="modal-foot">${canDelete ? `<button type="submit" class="btn danger" formaction="/delete/schedules/${encodeURIComponent(data.id)}" onclick="return confirm('確定將此排班移至回收桶？可在回收桶還原。')">移至回收桶</button>` : ''}${isEdit ? `<a class="btn ghost" href="/view/schedules/${encodeURIComponent(data.id)}">查看詳情</a>` : ''}<button type="button" class="btn ghost" data-dlg-close>取消</button><button class="btn" type="submit">${isEdit ? '儲存排班' : '建立排班'}</button></div></form></dialog>`;
}

export function workSchedulePage({ store, url, user, csrf, manage = false }) {
  const now = hkNow();
  const month = monthValid(url.searchParams.get('m')) ? url.searchParams.get('m') : now.month;
  const isManage = manage || url.pathname === '/schedules';
  const personal = url.pathname === '/myschedule' || user?.role === 'front';
  let schedules = store.list('Schedule').filter((s) => day(s.schedule_date).startsWith(month));
  if (personal) schedules = schedules.filter((s) => isMine(s, user));
  const units = store.list('WorkUnit');
  const calendarLabel = (s) => {
    const item = workItem(s, 0);
    if (s.contract_id || item.contract_id || item.contract_number) return s.schedule_name || item.work_name || item.work_location || workTitle(s);
    const unit = units.find((u) => (item.work_unit_id && str(u.id) === str(item.work_unit_id)) || (item.work_unit_name && u.unit_name === item.work_unit_name));
    const content = item.work_location || item.work_name;
    return content ? `${unit?.short_name || item.work_unit_name || '標準'} ${content}` : s.vehicle_plate || '排班';
  };
  const scheduleHref = (s) => isManage ? queryWith(url, { edit: s.id }) : !s.contract_id && arr(s.work_items).length ? workLink(s, 0) : `/schedules/${encodeURIComponent(s.id)}`;
  const editId = str(url.searchParams.get('edit'));
  const editRow = isManage && editId ? store.get('schedules', editId) : null;
  const byDate = {};
  for (const schedule of schedules) (byDate[day(schedule.schedule_date)] ||= []).push(schedule);
  const selectedDate = dateValid(url.searchParams.get('date')) && url.searchParams.get('date').startsWith(month) ? url.searchParams.get('date') : now.date.startsWith(month) ? now.date : `${month}-01`;
  const savedDate = dateValid(url.searchParams.get('saved')) ? url.searchParams.get('saved') : '';
  const poFocus = isManage && str(url.searchParams.get('po')) ? store.get('purchase_orders', str(url.searchParams.get('po'))) : null;
  const dialogBack = `${url.pathname}?${new URLSearchParams({ m: month, date: selectedDate }).toString()}`;
  const [year, mon] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="calendar-cell empty"></div>');
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const items = (byDate[date] || []).sort((a, b) => str(a.id).localeCompare(str(b.id)));
    cells.push(`<div class="calendar-cell${savedDate === date ? ' picked' : ''}" id="d-${esc(date)}" data-drop-date="${esc(date)}"><div class="calendar-day"><a href="${esc(queryWith(url, { date }))}">${d}</a>${date === now.date ? ' · 今日' : ''}</div>${items.slice(0, 3).map((s) => `<a class="calendar-item" ${isManage ? `draggable="true" data-schedule-id="${esc(s.id)}"` : ''} href="${esc(scheduleHref(s))}" title="${esc(employeeNames(s))}">${esc(calendarLabel(s))}</a>`).join('')}${items.length > 3 ? `<a class="muted" href="${esc(queryWith(url, { date }))}">+${items.length - 3} 更多</a>` : ''}</div>`);
  }
  while (cells.length % 7) cells.push('<div class="calendar-cell empty"></div>');
  const dragScript = isManage ? `<script>document.addEventListener('DOMContentLoaded',()=>{let dragged='';document.querySelectorAll('[data-schedule-id]').forEach(el=>el.addEventListener('dragstart',e=>{dragged=el.dataset.scheduleId;e.dataTransfer.setData('text/plain',dragged)}));document.querySelectorAll('[data-drop-date]').forEach(cell=>{cell.addEventListener('dragover',e=>e.preventDefault());cell.addEventListener('drop',async e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain')||dragged;if(!id)return;const body=new URLSearchParams({date:cell.dataset.dropDate,__csrf:${JSON.stringify(str(csrf))}});const response=await fetch('/schedules/'+encodeURIComponent(id)+'/move',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(response.ok)location.reload();else alert('移動排班失敗，請重新載入後再試')})})});</script>` : '';
  const selectedSchedules = byDate[selectedDate] || [];
  const dayDetail = selectedSchedules.length ? `<div class="two-col">${selectedSchedules.map((s) => `<div class="card"><h3>${esc(calendarLabel(s))}</h3><div class="bar">${pill(s.status)}<span class="muted">${esc(s.vehicle_plate || '無車輛')} · ${esc(employeeNames(s) || '未指派員工')}</span>${isManage ? `<a class="btn ghost small" href="${esc(queryWith(url, { edit: s.id }))}">編輯</a><a class="btn ghost small" href="/view/schedules/${encodeURIComponent(s.id)}">檢視</a><form method="post" action="/delete/schedules/${encodeURIComponent(s.id)}" style="display:inline" data-confirm="確定將此排班移至回收桶？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn danger small">刪除</button></form>` : ''}</div>${simpleTable([{ label: '地點／工作', value: (r) => `${esc(r.item.work_location || '—')}<br>${esc(r.item.work_name || '')}` }, { label: '聯絡', value: (r) => `${esc(r.item.contact_person || '—')}<br>${esc(r.item.contact_phone || '')}` }, { label: '時間', value: (r) => esc([r.item.start_time, r.item.end_time].filter(Boolean).join('–') || '—') }, { label: '備註', value: (r) => esc(r.item.notes || '—') }], arr(s.work_items).map((item, index) => ({ item, index })))}</div>`).join('')}</div>` : emptyCard('此日期暫無排班');
  const pendingPo = isManage ? store.list('purchase_orders').filter((r) => r.work_status === '待安排').length : 0;
  const dialog = isManage ? scheduleDialog({ store, user, csrf, row: editRow || { schedule_date: selectedDate }, isEdit: !!editRow, back: dialogBack, open: !!editRow }) : '';
  const autoOpen = editRow ? `<script>document.addEventListener('DOMContentLoaded',function(){var d=document.getElementById('schedDlg');if(d&&typeof d.showModal==='function')d.showModal();});</script>` : '';
  const poNotice = poFocus ? `<div class="notice warn"><b>此採購單待安排：${esc(poFocus.po_name || poFocus.po_number || poFocus.id)}</b>${esc(poFocus.customer_name || '')} · ${esc(poFocus.work_location || '')}　<a href="${esc(queryWith(url, { po: null, date: str(arr(poFocus.work_dates)[0] || selectedDate) }))}">帶入此日期</a> · <a href="/view/purchase_orders/${encodeURIComponent(poFocus.id)}">查看 PO</a></div>` : '';
  const savedNotice = savedDate ? `<div class="flash">已儲存 ${esc(savedDate)} 的排班，日曆已用綠框標示該日期。</div>` : '';
  const focusScript = savedDate ? `<script>document.addEventListener('DOMContentLoaded',function(){var el=document.getElementById('d-${esc(savedDate)}');if(el){el.scrollIntoView({block:'center',behavior:'smooth'});}});</script>` : '';
  const body = `<h1>${isManage ? '排班管理' : personal ? '我的排班' : '工作排班'}</h1><div class="sub">${esc(month)} · ${schedules.length} 個排班</div>
    ${savedNotice}${poNotice}
    <div class="bar noprint">${isManage ? `<a class="btn ghost" href="/print-schedule?m=${esc(month)}" target="_blank">打印</a><button class="btn" type="button" data-dlg-open="schedDlg" data-date="${esc(selectedDate)}">新增排班</button>${pendingPo ? `<a class="pill y" href="/purchaseorders" title="前往採購單管理">⚠ ${pendingPo} 張PO待安排</a>` : ''}` : ''}<a class="btn ghost" href="${esc(queryWith(url, { m: monthShift(month, -1), date: null }))}" aria-label="上一月">←</a><input type="month" value="${esc(month)}" onchange="location.href='${esc(url.pathname)}?m='+this.value" aria-label="選擇月份"><a class="btn ghost" href="${esc(queryWith(url, { m: monthShift(month, 1), date: null }))}" aria-label="下一月">→</a><a class="btn ghost" href="${esc(queryWith(url, { m: now.month, date: now.date }))}">本月</a></div>
    ${isManage ? '<div class="notice noprint">點「新增排班」在當前頁彈出表單，不需跳頁；選合約或採購單會自動帶出工作內容。日曆上的工作可拖曳到另一日期；點工作可進彈窗編輯或移至回收桶。</div>' : ''}<div class="calendar">${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div class="calendar-head">${d}</div>`).join('')}${cells.join('')}</div><h2>${esc(selectedDate)} 日詳情</h2>${dayDetail}${dialog}${autoOpen}${focusScript}`;
  return layout({ title: isManage ? '排班管理' : '工作排班', body, user, csrf, active: isManage ? 'schedules' : personal ? 'myschedule' : 'workschedule', wide: true, extraHead: `<style>@media print{@page{size:landscape;margin:1cm}}</style>${dragScript}` });
}

export function checkInPage({ store, url, user, csrf }) {
  const now = hkNow();
  const checks = store.list('CheckInRecord').filter((r) => personRecord(r, user));
  const todayChecks = checks.filter((r) => recordDate(r, ['check_in_date', 'work_date', 'date', 'created_date']) === now.date);
  const recent = sortByDate([...checks], ['check_in_date', 'work_date', 'date', 'created_date']).slice(0, 30);
  const attendance = store.list('Attendance').filter((r) => personRecord(r, user));
  sortByDate(attendance, ['attendance_date', 'created_date']);
  const todayAttendance = attendance.find((r) => day(r.attendance_date) === now.date);
  const body = `<h1>上班打卡</h1><div class="sub">${esc(now.full)} · ${esc(personName(user))}</div>
    ${kpis([{ label: '今日打卡次數', value: todayChecks.length }, { label: '今日出勤', value: todayAttendance?.attendance_type || (todayChecks.length ? '已打卡' : '未打卡') }, { label: '本月打卡', value: checks.filter((r) => recordDate(r, ['check_in_date', 'work_date', 'date', 'created_date']).startsWith(now.month)).length }, { label: '本月工時', value: sum(attendance.filter((r) => day(r.attendance_date).startsWith(now.month)), (r) => r.hours).toFixed(1) }])}
    <div class="card"><h3>今日狀態：${todayChecks.length ? '已打卡' : '尚未打卡'}</h3><form method="post" action="/checkin">${hidden('__csrf', csrf)}<div class="frow"><label for="checkin-notes">備註（選填）</label><textarea id="checkin-notes" name="notes" rows="2"></textarea></div><div class="bar" style="margin-top:12px"><button class="btn" type="submit">上班打卡</button><a class="btn ghost" href="/myattendance">我的出勤</a></div></form></div>
    <h2>近 30 筆打卡記錄</h2>${simpleTable([{ label: '日期', value: (r) => tableDate(r, ['check_in_date', 'work_date', 'date', 'created_date']) }, { label: '時間', value: (r) => esc(pick(r, ['check_in_time', 'checkin_time', 'time'], str(r.created_date).slice(11, 19)) || '—') }, { label: '員工', value: (r) => esc(pick(r, ['employee_name', 'user_name'], personName(user))) }, { label: '狀態', value: (r) => pill(pick(r, ['status', 'attendance_type'], '正常')) }, { label: '備註', key: 'notes' }], recent)}
    <h2>出勤記錄</h2>${simpleTable([{ label: '日期', value: (r) => displayDate(r.attendance_date) }, { label: '類型', value: (r) => pill(r.attendance_type) }, { label: '工時', value: (r) => esc(r.hours ?? '—') }, { label: '備註', key: 'notes' }], attendance.slice(0, 30))}`;
  return layout({ title: '上班打卡', body, user, csrf, active: 'check_ins', wide: true });
}

export function myAttendancePage({ store, url, user, csrf }) {
  const now = hkNow();
  const month = monthValid(url.searchParams.get('m')) ? url.searchParams.get('m') : now.month;
  const attendance = store.list('Attendance').filter((r) => personRecord(r, user) && day(r.attendance_date).startsWith(month));
  const checks = store.list('CheckInRecord').filter((r) => personRecord(r, user) && recordDate(r, ['check_in_date', 'work_date', 'date', 'created_date']).startsWith(month));
  sortByDate(attendance, ['attendance_date']);
  sortByDate(checks, ['check_in_date', 'work_date', 'date', 'created_date']);
  const body = `<h1>我的出勤</h1><div class="sub">${esc(personName(user))} · ${esc(month)}</div><form class="bar noprint" method="get"><input type="month" name="m" value="${esc(month)}"><button class="btn">查看</button><a class="btn ghost" href="/checkin">上班打卡</a></form>
    ${kpis([{ label: '出勤記錄', value: attendance.length }, { label: '總工時', value: sum(attendance, (r) => r.hours).toFixed(1) }, { label: '打卡記錄', value: checks.length }, { label: '正常出勤', value: attendance.filter((r) => /正常/.test(str(r.attendance_type))).length }])}
    <h2>出勤記錄</h2>${simpleTable([{ label: '日期', value: (r) => displayDate(r.attendance_date) }, { label: '類型', value: (r) => pill(r.attendance_type) }, { label: '工時', value: (r) => esc(r.hours ?? '—') }, { label: '備註', key: 'notes' }], attendance)}
    <h2>打卡記錄</h2>${simpleTable([{ label: '日期', value: (r) => tableDate(r, ['check_in_date', 'work_date', 'date', 'created_date']) }, { label: '時間', value: (r) => esc(pick(r, ['check_in_time', 'checkin_time', 'time'], str(r.created_date).slice(11, 19)) || '—') }, { label: '狀態', value: (r) => pill(r.status || '正常') }, { label: '備註', key: 'notes' }], checks)}`;
  return layout({ title: '我的出勤', body, user, csrf, active: 'myattendance', wide: true });
}

export function monthlyAttendancePage({ store, url, user, csrf }) {
  const now = hkNow();
  const requestedYear = str(url.searchParams.get('year') || url.searchParams.get('y'));
  const requestedMonth = str(url.searchParams.get('month') || url.searchParams.get('mo'));
  const constructed = /^\d{4}$/.test(requestedYear) && /^\d{1,2}$/.test(requestedMonth) ? `${requestedYear}-${requestedMonth.padStart(2, '0')}` : '';
  const month = monthValid(url.searchParams.get('m')) ? url.searchParams.get('m') : monthValid(constructed) ? constructed : now.month;
  const [year, mon] = month.split('-').map(Number);
  const canEdit = ['office', 'management'].includes(user?.role);
  const attendance = store.list('Attendance').filter((r) => day(r.attendance_date).startsWith(month));
  const checks = store.list('CheckInRecord').filter((r) => recordDate(r, ['check_in_date', 'work_date', 'date', 'created_date']).startsWith(month));
  const people = new Map();
  for (const u of store.users()) if (u.role === 'front' || u.employee_id) people.set(personName(u), { id: u.employee_id || u.id, name: personName(u) });
  for (const r of [...attendance, ...checks]) {
    const name = str(pick(r, ['employee_name', 'user_name'])).trim();
    if (name) people.set(name, { id: pick(r, ['employee_id', 'user_id']), name });
  }
  const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).map((p, index) => ({ ...p, index: index + 1 }));
  const columns = [{ label: '序號', value: (p) => p.index }, { label: '員工姓名', value: (p) => esc(p.name) }];
  const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const weekday = weekdayNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
    columns.push({ label: `${d} ${weekday}`, value: (p) => {
      const records = attendance.filter((r) => day(r.attendance_date) === date && ((p.id && str(r.employee_id) === str(p.id)) || sameName(r.employee_name, p.name)));
      const check = checks.find((r) => recordDate(r, ['check_in_date', 'work_date', 'date', 'created_date']) === date && ((p.id && str(pick(r, ['employee_id', 'user_id'])) === str(p.id)) || sameName(pick(r, ['employee_name', 'user_name']), p.name)));
      const hours = sum(records, (r) => r.hours);
      const type = unique(records.map((r) => r.attendance_type)).join('、');
      if (canEdit) {
        const value = records.length ? (hours ? String(hours) : type) : check ? '到' : '';
        return `<input name="${esc(p.id || p.name)}|${date}" value="${esc(value)}" aria-label="${esc(p.name)} ${date}" style="width:52px;padding:4px;text-align:center">`;
      }
      if (records.length) return `<span title="${esc(type)}${hours ? ` · ${hours} 小時` : ''}">${/正常/.test(type) ? '✓' : esc(type || '—')}</span>`;
      return check ? '<span class="pill g">到</span>' : '<span class="muted">—</span>';
    } });
  }
  columns.push({ label: '總工時', value: (p) => esc(sum(attendance.filter((r) => (p.id && str(r.employee_id) === str(p.id)) || sameName(r.employee_name, p.name)), (r) => r.hours).toFixed(1)) });
  const body = `<h1>月度出勤表</h1><div class="sub">滅蟲部 ${year}年${mon}月 出勤表</div>${url.searchParams.has('saved') ? `<div class="flash">已保存 ${esc(url.searchParams.get('saved'))} 個出勤單元格</div>` : ''}<form class="bar noprint" method="get"><select name="year" aria-label="年份">${Array.from({ length: 7 }, (_, i) => now.date.slice(0, 4) - 3 + i).map((y) => `<option value="${y}"${selected(y, year)}>${y}年</option>`).join('')}</select><select name="month" aria-label="月份">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}"${selected(m, mon)}>${m}月</option>`).join('')}</select><button class="btn">查看</button></form><form method="post" action="/monthlyattendance/save">${hidden('__csrf', csrf)}${hidden('__month', month)}<div class="bar noprint">${canEdit ? '<button class="btn" type="submit">保存</button>' : ''}${user?.role === 'management' ? `<a class="btn ghost" href="/export-attendance.csv?m=${esc(month)}">導出CSV</a>` : ''}<a class="btn ghost" href="/print-attendance?m=${esc(month)}" target="_blank">導出PDF</a><span class="muted">${canEdit ? '可直接編輯每天工時或出勤類型' : '此角色為唯讀'}</span></div>${simpleTable(columns, rows)}</form>`;
  return layout({ title: '月度出勤表', body, user, csrf, active: 'monthlyattendance', wide: true });
}

export function excelSchedulePage({ store, url, user, csrf }) {
  const now = hkNow();
  const date = dateValid(url.searchParams.get('date')) ? url.searchParams.get('date') : '';
  const month = monthValid(url.searchParams.get('month') || url.searchParams.get('m')) ? str(url.searchParams.get('month') || url.searchParams.get('m')) : '';
  const year = /^\d{4}$/.test(str(url.searchParams.get('year'))) ? str(url.searchParams.get('year')) : '';
  const effectiveDate = !month && !year && !date ? now.date : date;
  const schedules = store.list('Schedule').filter((s) => {
    const d = day(s.schedule_date);
    return effectiveDate ? d === effectiveDate : month ? d.startsWith(month) : year ? d.startsWith(year) : true;
  }).sort((a, b) => day(a.schedule_date).localeCompare(day(b.schedule_date)) || str(a.id).localeCompare(str(b.id)));
  const statuses = unique([...schedules.map((s) => s.status), '待安排', '待執行', '進行中', '已完成', '已取消'].filter(Boolean));
  const exportQuery = queryWith(url, { date: effectiveDate, m: null });
  const unitIndex = new Map(store.list('work_units').map((u) => [str(u.id), str(u.unit_name)]));
  const newDate = effectiveDate || (month ? `${month}-01` : year ? `${year}-01-01` : now.date);
  const dialogBack = `${url.pathname}${url.search}`;
  const body = `<h1>排班Excel</h1><div class="sub">${effectiveDate ? `${esc(effectiveDate)} 工作安排` : month ? `${esc(month)} 工作安排` : `${esc(year)} 工作安排`} · ${schedules.length} 筆</div>
    <form class="bar noprint" method="get"><input type="date" name="date" value="${esc(date)}" aria-label="日期"><input type="month" name="month" value="${esc(month)}" aria-label="月份"><input type="number" name="year" value="${esc(year)}" placeholder="年份" min="1900" max="2999" aria-label="年份"><button class="btn">篩選</button><button class="btn" type="button" data-dlg-open="schedDlg" data-date="${esc(newDate)}">新增工作欄</button><a class="btn ghost" href="${esc(url.pathname)}">重新載入</a><a class="btn ghost" href="/trash?module=schedules">回收筒</a><a class="btn ghost" href="${esc(exportQuery.replace(url.pathname, '/export-excelschedule.csv'))}">導出CSV</a><a class="btn ghost" href="${esc(queryWith(url, { date: effectiveDate, m: null }).replace(url.pathname, '/print-excelschedule'))}" target="_blank">打印</a></form>
    <div class="bar noprint">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<a class="btn ghost small" href="${esc(queryWith(url, { date: null, year: year || now.date.slice(0, 4), month: `${year || now.date.slice(0, 4)}-${String(m).padStart(2, '0')}`, m: null }))}">${m}月</a>`).join('')}</div>
    <form method="post" action="/excelschedule/save">${hidden('__csrf', csrf)}<div class="bar noprint"><button class="btn" type="submit">儲存全部</button><span class="muted">可逐行修改日期、工作單位、狀態、員工及車輛</span></div><div class="card flush table-wrap"><table><thead><tr><th>日期</th><th>工作單位</th><th>工作內容</th><th>地點</th><th>狀態</th><th>員工（以頓號分隔）</th><th>車輛</th><th>操作</th></tr></thead><tbody>${schedules.length ? schedules.map((s) => {
      const id = esc(s.id);
      const item = workItem(s, 0);
      const unitName = item.work_unit_name || unitIndex.get(str(item.work_unit_id)) || '';
      return `<tr><td><input type="date" name="${id}|schedule_date" value="${esc(s.schedule_date)}"></td><td><input name="${id}|work_unit_name" value="${esc(unitName)}"></td><td>${esc(arr(s.work_items).map((w) => w.work_name).filter(Boolean).join('；') || '—')}</td><td>${esc(arr(s.work_items).map((w) => w.work_location).filter(Boolean).join('；') || '—')}</td><td><select name="${id}|status">${statuses.map((status) => `<option value="${esc(status)}"${selected(status, s.status)}>${esc(status)}</option>`).join('')}</select></td><td><input name="${id}|employees" value="${esc(employeeNames(s))}"></td><td><input name="${id}|vehicle_plate" value="${esc(s.vehicle_plate)}"></td><td><form method="post" action="/delete/schedules/${id}" data-confirm="確定將此排班移至回收桶？" style="display:inline"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn danger small">刪除</button></form></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">此日暫時未有排班，按上方「新增工作欄」開始記錄</td></tr>'}</tbody></table></div></form>${scheduleDialog({ store, user, csrf, row: { schedule_date: newDate }, back: dialogBack })}`;
  return layout({ title: '排班Excel', body, user, csrf, active: 'excelschedule', wide: true });
}

export function accountingPage({ store, url, user, csrf }) {
  const now = hkNow();
  const month = monthValid(url.searchParams.get('m')) ? url.searchParams.get('m') : now.month;
  const invoices = store.list('Invoice');
  const receipts = store.list('Receipt');
  const bills = store.list('Bill');
  const payments = store.list('Payment');
  const monthInvoices = invoices.filter((r) => day(r.invoice_date).startsWith(month));
  const monthReceipts = receipts.filter((r) => day(r.receipt_date).startsWith(month));
  const receivable = sum(invoices, (r) => Math.max(0, num(pick(r, ['balance_due'], num(r.total_amount) - num(r.paid_amount)))));
  const body = `<h1>會計系統</h1><div class="sub">發票、收款及應收概覽</div><div class="bar noprint"><a class="btn ghost" href="/accounts">會計科目</a><a class="btn ghost" href="/generalledger">總分類賬</a><a class="btn ghost" href="/transactions">交易記錄</a><a class="btn" href="/receivables">應收台賬</a></div>
    ${kpis([{ label: '發票總額', value: amount(user, sum(invoices, (r) => r.total_amount)), raw: true }, { label: '收款總額', value: amount(user, sum(receipts, (r) => r.total_amount)), raw: true }, { label: '應收餘額', value: amount(user, receivable), raw: true }, { label: '未收清發票', value: invoices.filter((r) => num(pick(r, ['balance_due'], num(r.total_amount) - num(r.paid_amount))) > 0).length }])}
    <form class="bar noprint" method="get"><input type="month" name="m" value="${esc(month)}"><button class="btn">查看月份</button></form>
    <h2>${esc(month)} 月度匯總</h2>${simpleTable([{ label: '類別', key: 'label' }, { label: '筆數', key: 'count' }, { label: '金額', value: (r) => amount(user, r.total) }], [
      { label: '發票', count: monthInvoices.length, total: sum(monthInvoices, (r) => r.total_amount) },
      { label: '收款', count: monthReceipts.length, total: sum(monthReceipts, (r) => r.total_amount) },
      { label: '賬單', count: bills.filter((r) => recordDate(r, ['bill_date', 'date', 'created_date']).startsWith(month)).length, total: sum(bills.filter((r) => recordDate(r, ['bill_date', 'date', 'created_date']).startsWith(month)), (r) => pick(r, ['total_amount', 'amount'], 0)) },
      { label: '付款', count: payments.filter((r) => recordDate(r, ['payment_date', 'date', 'created_date']).startsWith(month)).length, total: sum(payments.filter((r) => recordDate(r, ['payment_date', 'date', 'created_date']).startsWith(month)), (r) => pick(r, ['total_amount', 'amount'], 0)) },
    ])}`;
  return layout({ title: '會計系統', body, user, csrf, active: 'accounting', wide: true });
}

export function receivablesPage({ store, url, user, csrf }) {
  if (!['accounting', 'management'].includes(user?.role)) return layout({ title: '無權限', user, csrf, active: 'receivables', body: '<div class="errbox"><h2>只有會計與管理層可以查看應收台賬</h2></div>' });
  const now = hkNow();
  const rows = store.list('Invoice').map((r) => ({ ...r, __balance: Math.max(0, num(pick(r, ['balance_due'], num(r.total_amount) - num(r.paid_amount)))) })).filter((r) => r.__balance > 0)
    .sort((a, b) => day(a.due_date || a.invoice_date).localeCompare(day(b.due_date || b.invoice_date)));
  const bucket = (r) => {
    const due = day(r.due_date || r.invoice_date);
    const diff = due ? Math.floor((new Date(`${now.date}T00:00:00Z`) - new Date(`${due}T00:00:00Z`)) / 86400000) : 0;
    return diff <= 0 ? '未到期' : diff <= 30 ? '1–30 天' : diff <= 60 ? '31–60 天' : diff <= 90 ? '61–90 天' : '90 天以上';
  };
  const order = ['未到期', '1–30 天', '31–60 天', '61–90 天', '90 天以上'];
  const byBucket = Object.fromEntries(order.map((b) => [b, { count: 0, total: 0 }]));
  const byCustomer = {};
  for (const r of rows) {
    const b = bucket(r);
    byBucket[b].count++; byBucket[b].total += r.__balance;
    const name = str(r.customer_name || '未命名客戶');
    (byCustomer[name] ||= { customer_name: name, count: 0, total: 0 });
    byCustomer[name].count++; byCustomer[name].total += r.__balance;
  }
  const total = sum(rows, (r) => r.__balance);
  const body = `<h1>應收台賬</h1><div class="sub">截至 ${esc(now.date)} · ${rows.length} 張未收清發票</div>
    <div class="kpis">${order.map((b) => `<div class="kpi"><b>${amount(user, byBucket[b].total)}</b><span>${esc(b)}（${byBucket[b].count} 張）</span></div>`).join('')}</div>
    <div class="notice"><b>應收總額：${amount(user, total)}</b>按到期日計算賬齡</div>
    <h2>客戶匯總</h2>${simpleTable([{ label: '客戶', key: 'customer_name' }, { label: '未收發票', key: 'count' }, { label: '未收金額', value: (r) => amount(user, r.total) }, { label: '佔比', value: (r) => esc(total ? `${(r.total / total * 100).toFixed(1)}%` : '0.0%') }], Object.values(byCustomer).sort((a, b) => b.total - a.total))}
    <h2>未收發票</h2>${simpleTable([{ label: '發票', value: (r) => `<a href="/invoices/${encodeURIComponent(r.id)}">${esc(r.invoice_number || r.id)}</a>` }, { label: '客戶', key: 'customer_name' }, { label: '發票日期', value: (r) => displayDate(r.invoice_date) }, { label: '到期日', value: (r) => displayDate(r.due_date) }, { label: '賬齡', value: (r) => pill(bucket(r)) }, { label: '總額', value: (r) => amount(user, r.total_amount) }, { label: '餘額', value: (r) => amount(user, r.__balance) }], rows)}`;
  return layout({ title: '應收台賬', body, user, csrf, active: 'receivables', wide: true });
}

function journalEntries(store) {
  const entries = [];
  const baseFor = (row, source, derived, description = '') => ({
    date: recordDate(row, ['transaction_date', 'invoice_date', 'receipt_date', 'bill_date', 'payment_date', 'date', 'created_date']),
    number: str(pick(row, ['reference_number', 'transaction_number', 'invoice_number', 'receipt_number', 'bill_number', 'payment_number', 'number', 'reference_no'], row.id)),
    description: str(description || pick(row, ['description', 'notes', 'memo', 'customer_name'], '交易')),
    source, derived, status: derived ? '衍生' : str(row.status), source_id: str(row.id),
  });
  for (const row of store.list('Transaction')) {
    const base = baseFor(row, '原交易', false);
    const originalEntries = arr(row.entries);
    if (originalEntries.length) {
      for (const entry of originalEntries) entries.push({
        ...base,
        account: [entry.account_code, entry.account_name].filter((v) => v !== '' && v !== null && v !== undefined).map(str).join(' ') || '未指定科目',
        debit: num(entry.debit), credit: num(entry.credit), description: str(entry.description || base.description),
      });
      continue;
    }
    const type = str(pick(row, ['transaction_type', 'type', 'category'])).toLowerCase();
    const expense = /expense|支出|費用|付款/.test(type);
    const payable = /payable|應付/.test(type);
    const receivable = /receivable|應收/.test(type);
    const value = num(pick(row, ['amount', 'total_amount', 'total_debit', 'total_credit', 'debit_amount', 'credit_amount'], 0));
    if (value) {
      const debitAccount = str(pick(row, ['debit_account', 'debitAccount'], expense || payable ? '費用' : receivable ? '應收賬款' : '現金'));
      const creditAccount = str(pick(row, ['credit_account', 'creditAccount'], payable ? '應付賬款' : expense ? '現金' : '服務收入'));
      entries.push({ ...base, source: '原交易（欄位推定）', account: debitAccount, debit: value, credit: 0 }, { ...base, source: '原交易（欄位推定）', account: creditAccount, debit: 0, credit: value });
    }
  }
  const addDerivedPair = (row, { description, debitAccount, creditAccount, value, source }) => {
    const valueNumber = num(value);
    if (!valueNumber) return;
    const base = baseFor(row, `衍生·${source}`, true, `衍生分錄 · ${description}`);
    entries.push({ ...base, account: debitAccount, debit: valueNumber, credit: 0 }, { ...base, account: creditAccount, debit: 0, credit: valueNumber });
  };
  for (const row of store.list('Invoice')) addDerivedPair(row, { description: `發票 · ${str(row.customer_name)}`, debitAccount: '應收賬款', creditAccount: '服務收入', value: row.total_amount, source: '發票' });
  for (const row of store.list('Receipt')) addDerivedPair(row, { description: `收款 · ${str(row.customer_name)}`, debitAccount: '現金', creditAccount: '應收賬款', value: row.total_amount, source: '收據' });
  for (const row of store.list('Bill')) addDerivedPair(row, { description: `賬單 · ${str(pick(row, ['supplier_name', 'vendor_name', 'customer_name']))}`, debitAccount: '費用', creditAccount: '應付賬款', value: pick(row, ['total_amount', 'amount'], 0), source: '賬單' });
  for (const row of store.list('Payment')) addDerivedPair(row, { description: `付款 · ${str(pick(row, ['supplier_name', 'vendor_name', 'payee_name']))}`, debitAccount: '應付賬款', creditAccount: '現金', value: pick(row, ['total_amount', 'amount'], 0), source: '付款' });
  return entries;
}

export function generalLedgerPage({ store, url, user, csrf }) {
  const month = monthValid(url.searchParams.get('m')) ? str(url.searchParams.get('m')) : '';
  const account = str(url.searchParams.get('account'));
  const origin = ['original', 'derived'].includes(url.searchParams.get('origin')) ? url.searchParams.get('origin') : '';
  const all = journalEntries(store);
  const accounts = unique(all.map((e) => e.account));
  const rows = all.filter((e) => (!month || e.date.startsWith(month)) && (!account || e.account === account) && (!origin || (origin === 'derived') === e.derived))
    .sort((a, b) => Number(a.derived) - Number(b.derived) || a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.source_id.localeCompare(b.source_id) || b.debit - a.debit);
  const debit = sum(rows, (r) => r.debit);
  const credit = sum(rows, (r) => r.credit);
  const balanced = Math.abs(Math.round(debit * 100) - Math.round(credit * 100)) <= 1;
  const body = `<h1>總分類賬</h1><div class="sub">以原 Transaction.entries 為主；發票、收據、賬單及付款只作清楚標記的「衍生」分錄，不寫入資料庫</div><form class="bar noprint" method="get"><input type="month" name="m" value="${esc(month)}" aria-label="月份"><select name="account">${optionList(accounts, account, '全部科目')}</select><select name="origin"><option value="">原交易及衍生</option><option value="original"${selected(origin, 'original')}>只看原交易</option><option value="derived"${selected(origin, 'derived')}>只看衍生</option></select><button class="btn">篩選</button><a class="btn ghost" href="/generalledger">清除</a></form>
    ${kpis([{ label: '借方合計', value: amount(user, debit), raw: true }, { label: '貸方合計', value: amount(user, credit), raw: true }, { label: '差額', value: amount(user, debit - credit), raw: true }, { label: '平衡狀態（容差 0.01）', value: balanced ? '已平衡' : '未平衡' }])}
    ${simpleTable([{ label: '日期', value: (r) => displayDate(r.date) }, { label: '單據', value: (r) => esc(r.number) }, { label: '來源', value: (r) => `<span class="pill ${r.derived ? 'y' : 'g'}">${esc(r.source)}</span>` }, { label: '狀態', value: (r) => pill(r.status || '—') }, { label: '摘要', key: 'description' }, { label: '科目', key: 'account' }, { label: '借方', value: (r) => r.debit ? amount(user, r.debit) : '—' }, { label: '貸方', value: (r) => r.credit ? amount(user, r.credit) : '—' }], rows)}
    <div class="notice ${balanced ? '' : 'risk'}"><b>借貸${balanced ? '平衡' : '不平衡'}</b>借方 ${amount(user, debit)} · 貸方 ${amount(user, credit)}</div>`;
  return layout({ title: '總分類賬', body, user, csrf, active: 'transactions', wide: true });
}

// ─────────────────────────────────────────────────────────────
// 四期追加：回收桶 / 車輛彈窗 / 客戶詳情（對齊原系統版面）
// ─────────────────────────────────────────────────────────────
const TRASH_MODULES = [
  ['schedules', '排班'], ['recurring_schedules', '定期服務排程'], ['contracts', '合約'], ['vehicles', '車輛'],
  ['purchase_orders', '採購單'], ['stock_adjustments', '庫存調整'], ['stock_counts', '盤點'],
  ['products', '產品'], ['quotations', '報價單'], ['delivery_notes', '送貨單'], ['vehicle_expenses', '車輛費用'],
];
export const TRASH_DAILY_LIMIT = 10;

export function trashUsedToday(store, user) {
  const row = store.db.prepare("SELECT COUNT(*) c FROM audit_log WHERE actor_id=? AND action IN ('restore','purge') AND substr(at,1,10)=?").get(user.id, hkNow().date);
  return Number(row?.c || 0);
}

export function trashPage({ store, url, user, csrf, message = '', error = '' }) {
  const module = str(url.searchParams.get('module'));
  const q = str(url.searchParams.get('q')).trim().toLowerCase();
  const all = store.trashRows(module ? [module] : null);
  const rows = q
    ? all.filter((r) => [r.__entityLabel, r.__trashTitle, r[ENTITIES[r.__entity]?.labelField || 'id'], r.deleted_by, r.deleted_at]
      .map((v) => str(v).toLowerCase()).join(' ').includes(q))
    : all;
  const used = trashUsedToday(store, user);
  const isOffice = user.role === 'office';
  const remain = Math.max(0, TRASH_DAILY_LIMIT - used);
  const counts = new Map();
  for (const row of all) counts.set(row.__entity, (counts.get(row.__entity) || 0) + 1);
  const moduleOptions = TRASH_MODULES.map(([key, label]) => {
    const cfg = ENTITIES[key];
    if (!cfg || !cfg.softDelete) return '';
    if (!cfg.viewRoles.includes(user.role)) return '';
    const n = counts.get(key) || 0;
    return `<option value="${key}"${module === key ? ' selected' : ''}>${esc(label)}（${n}）</option>`;
  }).join('');
  const title = (row) => {
    const cfg = ENTITIES[row.__entity];
    const value = row[cfg?.labelField] || row.adjustment_number || row.count_number || row.plate_number || row.id;
    return str(value) || row.id;
  };
  const sub = (row) => {
    if (row.__entity === 'schedules') return `${str(row.schedule_date)} · ${esc(employeeNames(row) || '未指派')}`;
    if (row.__entity === 'contracts') return `${esc(row.customer_name || '')} ${esc(row.contract_start_date || '')}`;
    if (row.__entity === 'products') return `${esc(row.product_code || '')} · 庫存 ${esc(row.stock_quantity ?? 0)}`;
    if (row.__entity === 'purchase_orders') return `${esc(row.po_number || '')} · ${esc(row.customer_name || '')}`;
    if (row.__entity === 'vehicles') return `牌照 ${esc(row.license_expiry_date || '—')} · 保險 ${esc(row.insurance_expiry_date || '—')}`;
    if (row.__entity === 'stock_counts') return `${esc(row.count_date || '')} · ${esc(row.status || '')}`;
    if (row.__entity === 'stock_adjustments') return `${esc(row.adjustment_date || '')} · ${esc(row.product_name || '')}`;
    return esc(row.customer_name || row.notes || '');
  };
  const table = rows.length ? `<div class="card flush table-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="trashAll" aria-label="全選"></th><th>模組</th><th>名稱</th><th>摘要</th><th>移至回收桶時間</th><th>操作人</th><th>操作</th></tr></thead><tbody>${rows.map((row) => `<tr data-trash-row><td><input type="checkbox" name="item" value="${esc(row.__entity)}|${esc(row.id)}" aria-label="選取"></td><td><span class="pill">${esc(row.__entityLabel)}</span></td><td><a class="tlink" href="/view/${esc(row.__entity)}/${encodeURIComponent(row.id)}">${esc(title(row))}</a></td><td class="muted">${sub(row)}</td><td>${esc(str(row.deleted_at || row.updated_date).replace('T', ' ').slice(0, 16))}</td><td>${esc(row.deleted_by || '—')}</td><td class="actions"><a class="btn ghost small" href="/view/${esc(row.__entity)}/${encodeURIComponent(row.id)}">查看</a></td></tr>`).join('')}</tbody></table></div>` : `<div class="card empty">回收桶沒有${module ? esc(TRASH_MODULES.find((m) => m[0] === module)?.[1] || '') : ''}記錄</div>`;
  const body = `<h1>回收桶</h1><div class="sub">刪除的記錄會先移到這裡，可還原或永久刪除 · 共 ${rows.length} 筆${module ? `（已篩選）` : ''}</div>
    ${message ? `<div class="flash">${esc(message)}</div>` : ''}${error ? `<div class="flash error">${esc(error)}</div>` : ''}
    ${isOffice ? `<div class="notice ${remain === 0 ? 'warn' : ''}"><b>辦公室每日可處理 ${TRASH_DAILY_LIMIT} 條，今日已用 ${used} 條${remain === 0 ? '（已達上限，請聯絡管理層）' : `，剩 ${remain} 條`}</b>還原與永久刪除都會計入；超出上限時系統會通知管理層。</div>` : ''}
    <form class="bar noprint" method="get"><input class="search" name="q" value="${esc(url.searchParams.get('q') || '')}" placeholder="搜尋名稱、客戶、操作人…"><select name="module" onchange="this.form.submit()"><option value="">全部模組（${all.length}）</option>${moduleOptions}</select><button class="btn ghost">搜尋</button>${url.search ? `<a class="btn ghost" href="/trash">重設</a>` : ''}</form>
    <form method="post" action="/trash/restore" id="trashForm">${hidden('__csrf', csrf)}${hidden('__module', module)}
      <div class="trash-bar noprint"><b>已選 <span id="trashCount">0</span> 條</b><button class="btn ghost" type="submit" formaction="/trash/restore" onclick="return confirm('確定還原選取的記錄？')">還原選取</button><button class="btn danger" type="submit" formaction="/trash/purge" onclick="return confirm('永久刪除所選記錄，無法復原，確定？')">永久刪除選取</button><span class="muted">或直接在右側操作單條記錄</span></div>
      ${table}
    </form>
    <script>(function(){var all=document.getElementById('trashAll');var boxes=function(){return Array.prototype.slice.call(document.querySelectorAll('input[name="item"]'))};function sync(){var n=boxes().filter(function(b){return b.checked}).length;var c=document.getElementById('trashCount');if(c)c.textContent=n;boxes().forEach(function(b){var tr=b.closest('tr');if(tr)tr.classList.toggle('picked',b.checked)})}if(all)all.addEventListener('change',function(){boxes().forEach(function(b){b.checked=all.checked});sync()});document.addEventListener('change',function(e){if(e.target&&e.target.name==='item')sync()});sync()})();</script>`;
  return layout({ title: '回收桶', body, user, csrf, active: 'trash', wide: true });
}

export function vehicleCard({ store, url, user, csrf, id }) {
  const row = store.get('vehicles', id);
  if (!row) return '<p class="muted">找不到車輛</p>';
  const plate = str(row.plate_number);
  const expenses = store.list('vehicle_expenses')
    .filter((r) => (plate && str(r.vehicle_plate) === plate) || str(r.vehicle_id) === str(row.id))
    .sort((a, b) => str(b.expense_date).localeCompare(str(a.expense_date)));
  const year = str(url.searchParams.get('year'));
  const month = str(url.searchParams.get('month'));
  const years = [...new Set(expenses.map((r) => str(r.expense_date).slice(0, 4)).filter(Boolean))].sort().reverse();
  const shown = expenses.filter((r) => (!year || str(r.expense_date).startsWith(year)) && (!month || str(r.expense_date).slice(5, 7) === month));
  const total = shown.reduce((s, r) => s + num(r.amount), 0);
  const byType = {};
  for (const r of shown) byType[r.expense_type || '其他'] = (byType[r.expense_type || '其他'] || 0) + num(r.amount);
  const canEdit = ENTITIES.vehicle_expenses.editRoles.includes(user.role);
  const options = (values, current, label) => `<option value="">${label}</option>${values.map((v) => `<option value="${esc(v)}"${current === String(v) ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;
  return `<div class="vcard-h"><div><div class="vcard-plate">${esc(plate)}</div><div class="muted">${esc(row.status || '—')}</div></div><div class="spacer"></div>${pill(row.status)}</div>
    <dl class="vcard-kv"><div><dt>車輛牌照到期日</dt><dd>${displayDate(row.license_expiry_date) || '—'}</dd></div><div><dt>車輛保險到期日</dt><dd>${displayDate(row.insurance_expiry_date) || '—'}</dd></div><div><dt>費用筆數</dt><dd>${expenses.length} 筆</dd></div><div><dt>費用合計</dt><dd>HK$ ${expenses.reduce((s, r) => s + num(r.amount), 0).toLocaleString('en-HK', { maximumFractionDigits: 2 })}</dd></div>${row.notes ? `<div style="grid-column:1/-1"><dt>備註</dt><dd>${esc(row.notes)}</dd></div>` : ''}</dl>
    <h3 style="margin-top:18px">費用記錄（${shown.length} 筆 · HK$ ${total.toLocaleString('en-HK', { maximumFractionDigits: 2 })}）</h3>
    <div class="bar noprint"><select onchange="vcFetch('${esc(row.id)}')" id="vcYear">${options(years, year, '全部年份')}</select><select onchange="vcFetch('${esc(row.id)}')" id="vcMonth">${options(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), month, '全部月份')}</select>${canEdit ? `<a class="btn small" href="/new/vehicle_expenses?vehicleId=${encodeURIComponent(row.id)}" target="_blank">添加費用記錄</a><a class="btn ghost small" href="/TollEmailImport" target="_blank">易通行費用匯入</a>` : ''}</div>
    ${Object.keys(byType).length ? `<div class="bar">${Object.entries(byType).map(([k, v]) => `<span class="pill">${esc(k)} HK$ ${v.toLocaleString('en-HK')}</span>`).join('')}</div>` : ''}
    ${simpleTable([{ key: 'expense_date', label: '日期', type: 'date' }, { key: 'expense_time', label: '時間' }, { key: 'expense_type', label: '類型', type: 'pill' }, { key: 'amount', label: '金額', type: 'money' }, { key: 'location', label: '地點' }, { key: 'reference_number', label: '參考編號' }, { key: 'notes', label: '備註' }], shown, { canSeeAmounts: canSeeAmount(user) })}
    <div class="bar" style="margin-top:14px"><a class="btn ghost" href="/view/vehicles/${encodeURIComponent(row.id)}" target="_blank">開啟完整頁面</a><button class="btn ghost" type="button" onclick="document.getElementById('vehDlg').close()">關閉</button></div>`;
}

export function customerDetailPage({ store, url, user, csrf, id }) {
  assertRole(user, ENTITIES.customers.viewRoles, 'customers');
  const row = store.get('customers', id);
  if (!row) return notFound({ user, csrf }, '找不到客戶');
  const tab = str(url.searchParams.get('tab') || 'quotations');
  const name = str(row.customer_name);
  const quotations = store.list('quotations').filter((q) => (row.id && str(q.customer_id) === str(row.id)) || str(q.customer_name) === name);
  const contracts = store.list('contracts').filter((c) => (row.id && str(c.customer_id) === str(row.id)) || str(c.customer_name) === name);
  const deliveries = store.list('delivery_notes').filter((d) => (row.id && str(d.customer_id) === str(row.id)) || str(d.customer_name) === name);
  const reports = store.list('work_records').filter((w) => (row.id && str(w.customer_id) === str(row.id)) || str(w.customer_name) === name);
  const accepted = quotations.filter((q) => q.accepted === true || str(q.stage) === '已成交');
  const income = sum(accepted, (q) => q.total_amount);
  const contractFiles = contracts.flatMap((c) => arr(c.documents).map((f) => ({ ...f, source: c.contract_number })));
  const poFiles = store.list('purchase_orders').filter((p) => str(p.customer_id) === str(row.id) || str(p.customer_name) === name)
    .flatMap((p) => arr(p.po_documents).map((f) => ({ ...f, source: p.po_number })));
  const tabs = [
    ['quotations', '報價記錄', quotations.length], ['contracts', '合約列表', contracts.length], ['deliveries', '送貨單記錄', deliveries.length],
    ['reports', '報告文件', reports.length], ['contract-files', '合約文件', contractFiles.length], ['po-files', 'PO文件', poFiles.length],
  ];
  const tabsHtml = `<div class="tabs noprint">${tabs.map(([key, label, count]) => `<a class="${tab === key ? 'on' : ''}" href="${esc(queryWith(url, { tab: key }))}">${esc(label)} (${count})</a>`).join('')}</div>`;
  let content = '';
  if (tab === 'quotations') {
    content = quotations.length ? `<div class="card flush"><table><thead><tr><th>報價單號</th><th>工作內容</th><th>階段</th><th>金額</th><th>日期</th></tr></thead><tbody>${quotations.map((q) => `<tr><td><a class="tlink" href="/view/quotations/${encodeURIComponent(q.id)}">${esc(q.quotation_number || q.id)}</a><div class="muted">${esc(q.quotation_name || '')}</div></td><td>${esc(q.work_content || q.service_location || '—')}</td><td>${pill(q.stage)}</td><td class="num">${money(q.total_amount)}</td><td>${displayDate(q.document_date)}</td></tr>`).join('')}</tbody></table></div>` : emptyCard('暫無報價記錄');
  } else if (tab === 'contracts') {
    content = contracts.length ? simpleTable([{ label: '合約編號', value: (c) => `<a class="tlink" href="/view/contracts/${encodeURIComponent(c.id)}">${esc(c.contract_number)}</a>` }, { label: '合約名稱', key: 'contract_name' }, { label: '合約期', value: (c) => `${esc(c.contract_start_date || '—')} ~ ${esc(c.contract_end_date || '—')}` }, { label: '服務頻率', key: 'service_frequency' }, { label: '總額', value: (c) => money(c.total_amount) }, { label: '狀態', value: (c) => pill(c.contract_status) }], contracts) : emptyCard('暫無合約記錄');
  } else if (tab === 'deliveries') {
    content = deliveries.length ? simpleTable([{ label: '送貨單號', value: (d) => `<a class="tlink" href="/view/delivery_notes/${encodeURIComponent(d.id)}">${esc(d.dn_number)}</a>` }, { label: '日期', value: (d) => displayDate(d.dn_date) }, { label: '地盤', key: 'delivery_site' }, { label: '狀態', value: (d) => pill(d.status) }], deliveries) : emptyCard('暫無送貨單記錄');
  } else if (tab === 'reports') {
    content = reports.length ? simpleTable([{ label: '完成日期', value: (r) => displayDate(r.completion_date) }, { label: '報告', value: (r) => `<a class="tlink" href="/servicereport/${encodeURIComponent(r.id)}">${esc(r.report_title || r.work_name || r.id)}</a>` }, { label: '地點', key: 'work_location' }, { label: '狀態', value: (r) => pill(r.status) }], reports) : emptyCard('暫無報告文件');
  } else {
    const files = tab === 'contract-files' ? contractFiles : poFiles;
    content = files.length ? `<div class="card"><div class="attachment-list">${files.map((f) => `<a class="attachment" href="${esc(attachmentHref(f.file_url || f.url || '', {}))}" target="_blank">[檔] ${esc(f.file_name || f.name || '文件')}<span class="muted">${esc(f.source || '')}</span></a>`).join('')}</div></div>` : emptyCard(tab === 'contract-files' ? '暫無合約文件' : '暫無採購單文件');
  }
  const canEdit = ENTITIES.customers.editRoles.includes(user.role);
  const body = `<div class="breadcrumbs"><a href="/customers">客戶管理</a> / ${esc(name)}</div>
    <div class="cust-head"><div><h1 style="margin:0">${esc(name)}</h1><div class="sub" style="margin:4px 0 0">${esc(row.customer_code || '')} ${row.customer_name_en ? `· ${esc(row.customer_name_en)}` : ''}</div></div>
      <div class="bar" style="margin:0">${canEdit ? `<a class="btn" href="/edit/customers/${encodeURIComponent(row.id)}">編輯</a>` : ''}${canEdit ? `<a class="btn ghost" href="/customers/merge">合併</a>` : ''}${canEdit ? `<form method="post" action="/delete/customers/${encodeURIComponent(row.id)}" style="display:inline" data-confirm="確定移至回收桶？"><input type="hidden" name="__csrf" value="${esc(csrf)}"><button class="btn danger">刪除</button></form>` : ''}<a class="btn ghost" href="/customers">返回</a></div></div>
    ${kpis([{ label: '總報價單', value: quotations.length }, { label: '已接受報價', value: accepted.length }, { label: '總收入', value: `HK$ ${income.toLocaleString('en-HK', { maximumFractionDigits: 2 })}` }])}
    <div class="cust-grid"><div class="card"><h3>客戶資訊</h3><dl class="detail-grid" style="grid-template-columns:1fr"><div class="detail-row"><dt>聯絡人</dt><dd>${esc(row.contact_person || '—')}</dd></div><div class="detail-row"><dt>電話</dt><dd>${esc(row.phone || '—')}</dd></div><div class="detail-row"><dt>傳真</dt><dd>${esc(row.fax || '—')}</dd></div><div class="detail-row"><dt>電郵</dt><dd>${esc(row.email || '—')}</dd></div><div class="detail-row"><dt>服務地址</dt><dd>${esc(row.service_address || '—')}</dd></div><div class="detail-row"><dt>送貨地址</dt><dd>${esc(row.delivery_address || '—')}</dd></div><div class="detail-row"><dt>客戶類型</dt><dd>${pill(row.customer_type || '—')}</dd></div><div class="detail-row"><dt>備註</dt><dd>${esc(row.notes || '—')}</dd></div></dl></div>
      <div>${tabsHtml}${content}</div></div>`;
  return layout({ title: name || '客戶詳情', body, user, csrf, active: 'customers', wide: true });
}
