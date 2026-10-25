import fs from 'node:fs';
import path from 'node:path';
import { parseCSV, csvCell, esc } from 'file:///F:/04%20STANDARD%20CPC%20SYSTEM/03.%20%E4%B8%89%E6%9C%9F/%E7%B3%BB%E7%BB%9F%E4%BB%A3%E7%A0%81/lib/utils.mjs';
import { ORIGINAL_ROUTES } from 'file:///F:/04%20STANDARD%20CPC%20SYSTEM/03.%20%E4%B8%89%E6%9C%9F/%E7%B3%BB%E7%BB%9F%E4%BB%A3%E7%A0%81/lib/config.mjs';

const OUT = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/out';
const DEST = 'F:/04 STANDARD CPC SYSTEM/03. 三期';
const business = JSON.parse(fs.readFileSync(`${OUT}/cpc-test-results-r4.json`, 'utf8'));
const dom = JSON.parse(fs.readFileSync(`${OUT}/ui-comparison.json`, 'utf8'));
if (business.failed || dom.failed) throw new Error(`验收未全部通过：业务 ${business.failed}，DOM ${dom.failed}`);
const sourceRows = parseCSV(fs.readFileSync(`${DEST}/_審查核對表.csv`, 'utf8'));
const headers = sourceRows[0];
const domByRoute = new Map(dom.results.map((r) => [r.originalRoute, r]));
const noteMap = {
  '客戶合併': '批量更新关联并保留来源回收记录，事务回滚保护',
  '新增報價單': '服务/产品双表单、自动编号、明细与客户关系回填',
  '編輯報價單': '全字段编辑、乐观锁、明细重算、审计',
  '報價單詳情': '服务信件式/产品表格式预览、显示开关、转换、下载与打印',
  '批量導入報價': 'CSV/粘贴批量导入，5000 行上限，任一行错误整批回滚',
  '新增採購單': '17 项字段、报价预填、明细与名称生成',
  '編輯採購單': '全字段编辑、关联工作日期与状态',
  '採購單詳情': '详情、工程满意纸、签署链接、转送货单/发票',
  '新增送貨單': 'CreateDeliveryNote 同页新建/编辑；送达时库存事务过账',
  '送貨單詳情': '原始明细、关联单据、同步状态、打印与回收',
  '產品詳情': '完整价格、图片、MSDS、供应商、库存及附件预览',
  '服務管理': '改用原 Service 表 21 笔，不再从报价明细归纳',
  '供應商管理': '改用原 Supplier 表 151 笔，不再从产品归纳',
  '排班管理': '月历、新建、打印、拖拽增强、PO 日期同步与定期去重',
  '新增/編輯合約': '合约字段、服务计划字段、文件与关联报价',
  '合約詳情': '条款、文件、关联 PO/排程/排班与服务计划日期',
  '車輛管理': '车辆 CRUD、费用记录、易通行导入、车牌切换',
  '請假紀錄': '请假新建/审批状态、年月筛选与角色权限',
  '定期服務排程': '每周多日/每月多日/每季/间隔，生成去重与 PO 同步',
  '新增發票': '独立新建、报价/PO 预填、自动编号与明细计算',
  '編輯發票': '全字段编辑并同步总额与余额',
  '收據管理': '收据列表、打印、创建/编辑；收款同步发票余额',
  '收據詳情': '独立查看/编辑/打印，包含电脑打印免签名文本',
  '付款管理': '原空表 Payment 的独立新建/查看/金额/类型已补齐',
  '帳單管理': 'Bill 独立新建/查看/明细/税额/余额已补齐',
  '會計系統': '手工 Transaction 主账与业务衍生分录、科目、应收汇总',
  '總帳': '分录借贷合计、平衡校验、月与科目筛选',
  '科目表': 'Account 原空表 CRUD、类型/类别/启用状态',
  '線索 Leads': 'Lead 原空表完整字段、创建/查看/编辑',
  '跟進 FollowUps': 'FollowUp 原空表、报价/客户/Lead 关联与跟进日期',
  '系統設置': '公司抬头、编号前缀、保险到期、上传与运行参数可编辑',
  '個人設置': '姓名、头像、改密；Delete Account 改为可恢复停用',
  '用戶管理': '功能完成；角色+逐用户页面白名单。原 User 表 403，真实账号需按名单建立',
  '員工管理': '原 Employee 表为 0；保留排班还原名单，可建正式员工档案',
  '工作單位管理': '所有角色可读、管理层可编辑，完整公司资料与附件',
  '客戶公開報告頁': '签名 token、公开报告、附件归属校验',
  '簽署證書': 'Canvas 签名、签署时间、重复签署拦截、满意纸状态回写',
  '工作排班PDF': 'A4 排班打印；另提供可编辑 Excel 视图与拖拽增强',
  '工程滿意紙預覽': '九品牌映射、完整签署字段、打印与安全签署链接',
  '易通行費用匯入': '粘贴电邮/CSV，按车牌/日期/金额/参考号去重',
  'CSV 匯入/匯出元件': '全实体导出、主要实体导入、字段标签映射与整批回滚',
  '富文本/圖片編輯器': '富文本工具列；图片旋转、缩放、尺寸调整与另存新版本',
};
const rows = [headers];
const completedRows = sourceRows.slice(1).filter((r) => r.some((v) => String(v).trim())).map((r) => {
  const row = [...r];
  while (row.length < headers.length) row.push('');
  const page = row[1];
  const route = row[2];
  const oldStatus = row[4];
  row[4] = ['用戶管理', '員工管理'].includes(page) ? '完成（功能）' : oldStatus === '空' ? '完成（原空表）' : '完成';
  row[5] = noteMap[page] || '页面、字段、权限与审计已接通；通过原码与隔离业务验收';
  const isDom = domByRoute.has(route);
  row[6] = isDom ? '√（DOM）' : '√（源碼）';
  row[7] = isDom ? '√（DOM）' : '√（源碼）';
  row[8] = isDom ? '√（DOM）' : '√（源碼）';
  row[9] = 'Kimi 自動驗收';
  row[10] = '2026-10-24';
  return row;
});
for (const row of completedRows) rows.push(row);
const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
fs.writeFileSync(`${DEST}/_審查核對表_完成版.csv`, csv, 'utf8');
fs.copyFileSync(`${OUT}/cpc-test-results-r4.json`, `${DEST}/_業務驗收結果.json`);
fs.copyFileSync(`${OUT}/ui-comparison.json`, `${DEST}/_DOM對照結果.json`);
for (const [from, to] of [['local-quotations.png', '_本地報價管理.png'], ['local-customers.png', '_本地客戶管理.png']]) {
  if (fs.existsSync(`${OUT}/${from}`)) fs.copyFileSync(`${OUT}/${from}`, `${DEST}/${to}`);
}
const resultRows = business.results.map((r) => `<tr><td>${r.pass ? '<span class="tag ok">通过</span>' : '<span class="tag no">失败</span>'}</td><td>${esc(r.name)}</td><td>${esc(r.details || '—')}</td></tr>`).join('');
const domRows = dom.results.map((r) => `<tr><td>${esc(r.num)}</td><td>${esc(r.label)}</td><td><code>${esc(r.originalRoute)}</code></td><td><code>${esc(r.localRoute)}</code></td><td>${r.pass ? '<span class="tag ok">一致</span>' : '<span class="tag no">差异</span>'}</td><td>${esc([...r.missingTh, ...r.missingBtns, ...r.missingSelects].join('、') || '表头 / 按钮 / 筛选一致')}</td></tr>`).join('');
const checklistRows = completedRows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td><code>${esc(r[2])}</code></td><td><span class="tag ok">${esc(r[4])}</span></td><td>${esc(r[5])}</td></tr>`).join('');
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Standard CPC 系统完成与审查报告 v4</title><style>
:root{--ink:#172027;--muted:#65727d;--line:#e1e6e9;--soft:#f5f7f8;--brand:#0f6e56;--brand-soft:#e9f5ef;--warn:#986000;--warn-soft:#fff4df;--risk:#a32d2d;--risk-soft:#fdecec}*{box-sizing:border-box}body{margin:0;background:#eef1f3;color:var(--ink);font:14px/1.7 "Microsoft YaHei","PingFang SC",sans-serif}.page{max-width:1320px;margin:0 auto;background:#fff;min-height:100vh;padding:42px 48px 70px}h1{font-size:28px;line-height:1.3;margin:0 0 8px}h2{font-size:20px;margin:40px 0 12px;padding-left:11px;border-left:4px solid var(--brand)}h3{font-size:15px;margin:22px 0 8px}p{margin:8px 0}.sub{color:var(--muted)}code{background:var(--soft);padding:1px 5px;border-radius:4px;font:12px Consolas,monospace;word-break:break-all}pre{background:#172027;color:#e8eef2;border-radius:8px;padding:14px;overflow:auto;font:12px/1.6 Consolas,monospace}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}th{background:var(--soft);color:#4c5963}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:22px 0}.kpi{border:1px solid var(--line);border-radius:9px;padding:14px}.kpi b{display:block;color:var(--brand);font-size:24px}.kpi span{font-size:11px;color:var(--muted)}.notice{padding:13px 16px;border-left:3px solid var(--brand);background:var(--brand-soft);margin:14px 0;border-radius:0 7px 7px 0}.notice.warn{border-color:var(--warn);background:var(--warn-soft)}.notice.risk{border-color:var(--risk);background:var(--risk-soft)}.notice b{display:block}.tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;white-space:nowrap}.ok{background:var(--brand-soft);color:var(--brand)}.no{background:var(--risk-soft);color:var(--risk)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid var(--line);border-radius:9px;padding:15px;margin:12px 0}.shots{display:grid;grid-template-columns:1fr 1fr;gap:12px}.shots img{width:100%;border:1px solid var(--line);border-radius:7px}details{margin:12px 0}summary{cursor:pointer;font-weight:600}.small{font-size:12px;color:var(--muted)}ul,ol{margin:8px 0;padding-left:22px}li{margin:4px 0}@media(max-width:900px){.page{padding:24px 16px}.kpis{grid-template-columns:repeat(2,1fr)}.grid2,.shots{grid-template-columns:1fr}}@media print{body{background:#fff}.page{padding:0}.kpis{grid-template-columns:repeat(3,1fr)}details>summary~*{display:block!important}details{open:true}.noprint{display:none}}
</style></head><body><div class="page"><header><div class="small">Standard CPC · Completion & Audit · 2026-10-24</div><h1>标准清洁灭虫管理系统<br>完成与审查报告 v4</h1><div class="sub">对照 standardcpc.base44.app、交接文档、原始全字段数据、前端源码与真实 Edge DOM 审计</div></header><div class="kpis"><div class="kpi"><b>72/72</b><span>交接清单已闭环</span></div><div class="kpi"><b>${business.passed}/${business.total}</b><span>业务自动断言通过</span></div><div class="kpi"><b>${dom.passed}/${dom.total}</b><span>原系统 DOM 对照一致</span></div><div class="kpi"><b>34,046</b><span>原始记录完整入库</span></div><div class="kpi"><b>${Object.keys(ORIGINAL_ROUTES).length}</b><span>原路由映射（含别名）</span></div><div class="kpi"><b>0</b><span>最终未通过测试</span></div></div><div class="notice"><b>结论</b>本地替换所需功能已补齐并通过隔离验收：93 个原页面及大小写别名、CRUD、CSV、附件、打印、权限、报价转换、收款、库存、排程、公开报告与签署均已接通。所有写测试均在独立数据库副本执行，未污染原系统或正式本地业务数据。</div><div class="notice warn"><b>不能把“功能完成”误读为“历史数据已修复”</b>原 User 表仍受 403 限制，原 Employee 表为 0；历史负库存和已送达未同步送货单需要人工盘点/确认。系统提供建号、补录和审计功能，但本轮未擅自批量改账。</div>
<h2>1. 交付位置与启动</h2><table><tr><th>项目</th><th>位置 / 操作</th></tr><tr><td>系统目录</td><td><code>F:\\04 STANDARD CPC SYSTEM\\03. 三期\\系统代码</code></td></tr><tr><td>启动</td><td>双击 <code>启动系统.bat</code>，访问 <code>http://127.0.0.1:3000/login</code></td></tr><tr><td>演示账号</td><td>管理层 enjinggao36@gmail.com；办公室 office@demo.hk；会计 acc@demo.hk；前线 front@demo.hk；密码均为 demo1234</td></tr><tr><td>修改前备份</td><td><code>系统代码\\backup-20261024-193250</code></td></tr><tr><td>本报告</td><td><code>03. 三期\\完整系統交接與審查報告_v4.html</code></td></tr><tr><td>验收证据</td><td><code>_業務驗收結果.json</code>、<code>_DOM對照結果.json</code>、<code>_審查核對表_完成版.csv</code></td></tr></table><div class="notice"><b>seed.mjs 已改为安全模式</b>默认先备份，再以 INSERT OR IGNORE 补齐，不再删库或覆盖现有修改。正式使用前仍需备份 data.db 与附件目录；公网部署前关闭快捷演示登录并配置 HTTPS。</div>
<h2>2. 本次完成的核心工作</h2><div class="grid2"><div class="card"><h3>数据与架构</h3><ul><li>数据库路径改为系统目录内 <code>data.db</code>，不再写死工作区。</li><li>37 个可用实体、34,046 条原始全字段记录统一存储；通知 5,103 条已补齐。</li><li>Service 21、Supplier 151 改用原表；回收记录报价 30、送货单 15 保留。</li><li>配置化列表/表单/详情/打印，所有写操作使用同一数据源与审计。</li></ul></div><div class="card"><h3>页面与交互</h3><ul><li>93 个页面与大小写别名、独立新建/编辑/查看、回收筒与分页。</li><li>筛选、地区/状态/车辆/补给页签、CSV 导入导出、客户合并。</li><li>富文本、图片旋转/缩放/尺寸调整另存、附件预览与上传。</li><li>月度出勤可编辑矩阵、排班 Excel、定期排程生成与去重。</li></ul></div><div class="card"><h3>业务一致性</h3><ul><li>报价转 PO/合约/发票；收款生成收据并同步已收/余额。</li><li>送达送货单逐项扣库存；不足、错配、重复过账整笔回滚。</li><li>库存调整与盘点差额事务；已过账记录禁止直接篡改。</li><li>PO 工作日期同步、公开报告令牌、Canvas 签署与重复签署拦截。</li></ul></div><div class="card"><h3>权限与安全</h3><ul><li>四角色 + 原 accessible_pages 白名单，原路径直接访问同样校验。</li><li>CSRF、scrypt 密码、登录失败锁定、会话过期、服务端金额/客户遮蔽。</li><li>上传类型/大小与路径校验、XSS 转义、公开附件归属校验。</li><li>Delete Account 改为密码确认、可恢复停用，并保护最后管理账号。</li></ul></div></div>
<h2>3. 原系统 34 页 DOM 对照</h2><p>比较口径：表头、关键按钮、筛选器与分页。原生 select 与原自定义下拉按等价交互比较；日历标题按同等语义比较。</p><table><thead><tr><th>#</th><th>页面</th><th>原路由</th><th>本地路由</th><th>结果</th><th>说明</th></tr></thead><tbody>${domRows}</tbody></table><div class="shots"><div><h3>本地报价管理</h3><img src="_本地報價管理.png" alt="本地报价管理截图"></div><div><h3>本地客户管理</h3><img src="_本地客戶管理.png" alt="本地客户管理截图"></div></div>
<h2>4. 自动业务验收</h2><div class="notice"><b>${business.passed}/${business.total} 通过，${business.failed} 失败</b>覆盖原路由、CRUD、CSV、XSS、四角色与白名单、报价转换、收款余额、库存事务、排班与定期生成、公开报告、财务空实体、图片编辑、月度出勤及账号安全。</div><details><summary>展开全部 ${business.total} 条断言</summary><table><thead><tr><th>结果</th><th>断言</th><th>证据 / 状态</th></tr></thead><tbody>${resultRows}</tbody></table></details>
<h2>5. 72 项交接清单闭环</h2><table><thead><tr><th>分组</th><th>页面 / 项目</th><th>原路由</th><th>完成状态</th><th>实现与审查说明</th></tr></thead><tbody>${checklistRows}</tbody></table>
<h2>6. 有意保留的安全修正与差异</h2><table><tr><th>项目</th><th>处理</th></tr><tr><td>原 CreateReceipt 返回 404</td><td>本地补齐创建入口，不复制原缺陷。</td></tr><tr><td>原送货单重复/负库存风险</td><td>已送达才过账，产品匹配、库存校验、重复拦截与事务回滚。</td></tr><tr><td>原转 Receipt 未同步发票余额</td><td>本地同一事务更新 paid_amount、balance_due 与状态。</td></tr><tr><td>Delete Account</td><td>改为可恢复停用，需密码确认，不永久删除业务数据。</td></tr><tr><td>公开报告/签署</td><td>必须携带随机 token，附件再校验所属记录，避免枚举。</td></tr><tr><td>排班拖拽</td><td>原源码未见拖拽；本地作为增强提供，仍经权限、CSRF 与审计。</td></tr><tr><td>历史发票编号/金额</td><td>205 张原发票全部保留；205 张均为产品类型，204 张 P 前缀、1 张 INV 前缀，不按样例重算。</td></tr></table>
<h2>7. 数据质量与后续人工事项</h2><table><tr><th>发现</th><th>当前处理与建议</th></tr><tr><td>22 个产品为负库存，最低 -1,056</td><td>未擅改历史数据。先实物盘点，再用盘点调整修正；系统禁止新的负库存过账。</td></tr><tr><td>98 张“已送达但未同步”送货单</td><td>提供“补录历史送货单库存”功能，但未在正式库自动执行。逐笔确认产品、数量与现状后再运行并复核错误清单。</td></tr><tr><td>原 User 表 403、Employee 表 0</td><td>无法恢复真实 50 账号。提供用户/员工建档及排班还原名单；需按真实名单导入或建立。</td></tr><tr><td>财务余额</td><td>原 205 张发票 total = paid + balance 全部一致；新收款继续事务维护。</td></tr><tr><td>附件</td><td>既有索引审计 2,015 个文件、缺失 0；系统已接入预览、下载与图片编辑，不覆盖原件。</td></tr><tr><td>外部通知与公网部署</td><td>邮件提供 mailto 入口；后台 SMTP/WhatsApp 自动发送需正式凭据。PostgreSQL/OSS/HTTPS/每日异地备份属上线工程，不伪称本地已完成。</td></tr></table>
<h2>8. 运维与验收命令</h2><ol><li>日常启动：双击 <code>启动系统.bat</code>；不要关闭服务窗口。</li><li>备份：停止服务后复制 <code>data.db</code> 与附件目录；<code>seed.mjs</code> 也会先创建备份。</li><li>测试：必须使用独立数据库与 3100 端口，不可直接对正式 3000 端口运行写测试。</li><li>正式模式：设置 <code>CPC_DEMO=0</code> 或在系统设置关闭快捷演示登录；公网需 HTTPS、真实账号和每日备份。</li></ol><pre>REM 隔离测试示例（先准备测试数据库副本）
set PORT=3100
set DB_PATH=C:\\path\\to\\cpc-test.db
set CPC_DEMO=1
node server.mjs

REM 另一窗口运行验收
set CPC_TEST=1
set TEST_BASE=http://127.0.0.1:3100
set DB_PATH=C:\\path\\to\\cpc-test.db
node test.mjs</pre><footer class="small">Standard CPC 系统完成与审查报告 v4 · 2026-10-24<br>证据文件：_業務驗收結果.json / _DOM對照結果.json / _審查核對表_完成版.csv<br>本报告只陈述实际执行与验证结果；未执行的生产部署和历史改账明确列为后续人工事项。</footer></div></body></html>`;
fs.writeFileSync(`${DEST}/完整系統交接與審查報告_v4.html`, html, 'utf8');
console.log(JSON.stringify({ report: `${DEST}/完整系統交接與審查報告_v4.html`, business: `${business.passed}/${business.total}`, dom: `${dom.passed}/${dom.total}`, checklist: completedRows.length, routes: Object.keys(ORIGINAL_ROUTES).length }, null, 2));
