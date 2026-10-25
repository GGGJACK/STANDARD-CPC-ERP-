import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = 'F:/04 STANDARD CPC SYSTEM';
const SRC = `${ROOT}/03. 三期`;
const CODE = `${SRC}/系统代码`;
const DEST = `${ROOT}/04. 四期`;
const OUT = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/out';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const copied = [];

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function copy(src, dest) {
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`缺少來源文件：${src}`);
  ensure(path.dirname(dest));
  if (fs.existsSync(dest)) {
    if (hash(src) === hash(dest)) return;
    const backup = `${DEST}/_歷史版本/${stamp}/${path.relative(DEST, dest)}`;
    ensure(path.dirname(backup));
    fs.copyFileSync(dest, backup);
  }
  fs.copyFileSync(src, dest);
  copied.push(dest);
}
function copyTree(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (['data.db-wal', 'data.db-shm', '.DS_Store'].includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to, filter);
    else if (entry.isFile() && filter(from)) copy(from, to);
  }
}
function csv(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCSV(file, headers, rows) {
  ensure(path.dirname(file));
  fs.writeFileSync(file, '﻿' + [headers, ...rows].map((r) => r.map(csv).join(',')).join('\r\n'), 'utf8');
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

ensure(DEST);
const db = new DatabaseSync(`${CODE}/data.db`);
db.exec('PRAGMA busy_timeout=10000; PRAGMA wal_checkpoint(TRUNCATE);');
const integrity = db.prepare('PRAGMA integrity_check').get();
const totalRecords = db.prepare('SELECT COUNT(*) c FROM records').get().c;
const testRecords = db.prepare("SELECT COUNT(*) c FROM records WHERE id LIKE 't_%'").get().c;
const entityCounts = db.prepare('SELECT entity, SUM(CASE WHEN deleted=0 THEN 1 ELSE 0 END) active, SUM(CASE WHEN deleted=1 THEN 1 ELSE 0 END) deleted, COUNT(*) total FROM records GROUP BY entity ORDER BY entity').all();
const negativeStock = db.prepare("SELECT data FROM records WHERE entity='Product' AND deleted=0").all().map((r) => JSON.parse(r.data)).filter((r) => Number(r.stock_quantity) < 0).sort((a, b) => Number(a.stock_quantity) - Number(b.stock_quantity));
const unsyncedDN = db.prepare("SELECT data,deleted FROM records WHERE entity='DeliveryNote'").all().map((r) => ({ ...JSON.parse(r.data), __deleted: !!r.deleted })).filter((r) => r.status === '已送達' && !r.stock_synced).sort((a, b) => String(a.dn_date).localeCompare(String(b.dn_date)));
const unsyncedActive = unsyncedDN.filter((r) => !r.__deleted).length;
const unsyncedDeleted = unsyncedDN.filter((r) => r.__deleted).length;
db.close();
if (integrity.integrity_check !== 'ok') throw new Error(`源数据库 integrity_check 失败：${integrity.integrity_check}`);
if (totalRecords !== 34046 || testRecords !== 0) throw new Error(`源数据库记录数异常：${totalRecords}/${testRecords}`);

for (const file of ['server.mjs', 'seed.mjs', 'schema.json', '启动系统.bat', 'test.mjs', 'data.db']) copy(`${CODE}/${file}`, `${DEST}/系统代码/${file}`);
copyTree(`${CODE}/lib`, `${DEST}/系统代码/lib`, (file) => file.endsWith('.mjs'));
copyTree(`${CODE}/uploads`, `${DEST}/系统代码/uploads`);
copyTree(`${CODE}/backup-20261024-193250`, `${DEST}/系统代码/backup-20261024-193250`);
for (const file of ['完整系統交接與審查報告_v4.html', '_審查核對表_完成版.csv', '_業務驗收結果.json', '_DOM對照結果.json', '_本地報價管理.png', '_本地客戶管理.png', '_本地信件式報價單.png']) copy(`${SRC}/${file}`, `${DEST}/${file}`);
for (const file of ['_交互审计.json', '_弹窗表单审计.json', '_原始报价单样例.pdf', '_原始报价单_参考图.png', '_报价单详情.png', '_審查核對表.csv']) copy(`${SRC}/${file}`, `${DEST}/原系統參考/${file}`);
copy(`${ROOT}/05. 源码分析/源码分析说明.html`, `${DEST}/原系統參考/源码分析说明.html`);
copy(`${ROOT}/05. 源码分析/backend/_schema.json`, `${DEST}/原系統參考/_schema.json`);
copy(`${OUT}/ui-comparison.json`, `${DEST}/驗收歷程/DOM對照結果.json`);
copy(`${OUT}/local-quotation-print.png`, `${DEST}/驗收歷程/正式庫信件式報價單.png`);
copy('C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/tools/compare-ui.mjs', `${DEST}/工具/compare-ui.mjs`);
copy('C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/tools/finalize-cpc.mjs', `${DEST}/工具/finalize-cpc.mjs`);
copy('C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/tools/package-phase4.mjs', `${DEST}/工具/package-phase4.mjs`);

const history = [];
for (const [name, file] of [['第一輪', 'cpc-test-results-r1.json'], ['第二輪', 'cpc-test-results-r2.json'], ['第三輪', 'cpc-test-results-r3.json'], ['最終輪', 'cpc-test-results-r4.json']]) {
  const full = `${OUT}/${file}`;
  if (!fs.existsSync(full)) continue;
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  history.push({ name, file, passed: data.passed, failed: data.failed, total: data.total, runId: data.runId });
  copy(full, `${DEST}/驗收歷程/${file}`);
}
const packagedRetestFile = `${DEST}/驗收歷程/四期包復測結果.json`;
if (fs.existsSync(packagedRetestFile)) {
  const data = JSON.parse(fs.readFileSync(packagedRetestFile, 'utf8'));
  history.push({ name: '四期包復測', file: '四期包復測結果.json', passed: data.passed, failed: data.failed, total: data.total, runId: data.runId });
}
writeCSV(`${DEST}/驗收歷程/數據完整性核對.csv`, ['實體', '有效記錄', '回收記錄', '總記錄'], [...entityCounts.map((r) => [r.entity, r.active, r.deleted, r.total]), ['合計', entityCounts.reduce((s, r) => s + r.active, 0), entityCounts.reduce((s, r) => s + r.deleted, 0), totalRecords]]);
writeCSV(`${DEST}/驗收歷程/歷史數據質量_負庫存.csv`, ['產品編號', '產品名稱', '庫存數量', '來貨價', '供應商', '產品ID'], negativeStock.map((r) => [r.product_code, r.product_name, r.stock_quantity, r.cost_price, r.supplier_name, r.id]));
writeCSV(`${DEST}/驗收歷程/歷史數據質量_未同步送貨單.csv`, ['送貨單編號', '日期', '客戶', '狀態', '回收記錄', '已同步', '明細行數', '總數量', '記錄ID'], unsyncedDN.map((r) => [r.dn_number, r.dn_date, r.customer_name, r.status, r.__deleted ? '是' : '否', r.stock_synced, Array.isArray(r.items) ? r.items.length : 0, Array.isArray(r.items) ? r.items.reduce((s, i) => s + Number(i.qty || 0), 0) : 0, r.id]));
writeCSV(`${DEST}/驗收歷程/歷次業務驗收匯總.csv`, ['輪次', '通過', '失敗', '總數', '測試批次', '結果文件'], history.map((h) => [h.name, h.passed, h.failed, h.total, h.runId, h.file]));
const packagedDb = new DatabaseSync(`${DEST}/系统代码/data.db`);
const packagedIntegrity = packagedDb.prepare('PRAGMA integrity_check').get();
const packagedCount = packagedDb.prepare('SELECT COUNT(*) c FROM records').get().c;
packagedDb.close();
if (packagedIntegrity.integrity_check !== 'ok' || packagedCount !== 34046) throw new Error('四期数据库校验失败');

const overview = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>四期交接总览 · Standard CPC</title><style>
:root{--brand:#0f6e56;--ink:#172027;--muted:#687680;--line:#e1e7ea;--soft:#f5f7f8;--warn:#946000;--warn-soft:#fff4df}*{box-sizing:border-box}body{margin:0;background:#eef1f3;color:var(--ink);font:14px/1.75 "Microsoft YaHei","PingFang SC",sans-serif}.page{max-width:1180px;margin:0 auto;background:#fff;padding:42px 46px 70px;min-height:100vh}h1{font-size:28px;line-height:1.3;margin:0 0 8px}h2{font-size:20px;margin:36px 0 12px;border-left:4px solid var(--brand);padding-left:11px}h3{font-size:15px;margin:20px 0 8px}p{margin:8px 0}.muted{color:var(--muted)}code{background:var(--soft);padding:1px 5px;border-radius:4px;font:12px Consolas,monospace;word-break:break-all}pre{white-space:pre-wrap;background:#182127;color:#e5edf1;border-radius:8px;padding:15px;font:12px/1.65 Consolas,monospace;overflow:auto}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px}th,td{border:1px solid var(--line);padding:8px 9px;text-align:left;vertical-align:top}th{background:var(--soft)}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:20px 0}.kpi{border:1px solid var(--line);border-radius:9px;padding:13px}.kpi b{display:block;color:var(--brand);font-size:23px}.kpi span{font-size:11px;color:var(--muted)}.notice{padding:13px 16px;border-left:3px solid var(--brand);background:#e9f5ef;margin:14px 0;border-radius:0 7px 7px 0}.notice.warn{border-color:var(--warn);background:var(--warn-soft)}.notice b{display:block}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid var(--line);border-radius:9px;padding:15px;margin:12px 0}.links{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 18px}.links a{color:var(--brand);text-decoration:none}.links a:hover{text-decoration:underline}li{margin:5px 0}@media(max-width:800px){.page{padding:24px 16px}.kpis{grid-template-columns:repeat(2,1fr)}.grid,.links{grid-template-columns:1fr}}@media print{body{background:#fff}.page{padding:0}.kpis{grid-template-columns:repeat(3,1fr)}}
</style></head><body><div class="page"><header><div class="muted">Standard CPC · Phase 4 Handover · 2026-10-24</div><h1>四期交接总览</h1><div class="muted">给下一个 Agent：先读本页，再看完整审查报告；代码、数据、证据与复测入口均已整理。</div></header><div class="kpis"><div class="kpi"><b>411/411</b><span>最终业务验收</span></div><div class="kpi"><b>34/34</b><span>原系统 DOM 对照</span></div><div class="kpi"><b>72/72</b><span>交接清单闭环</span></div><div class="kpi"><b>34,046</b><span>原始记录</span></div><div class="kpi"><b>0</b><span>正式库测试记录</span></div></div><div class="notice"><b>打包方式</b>本目录由三期最终交付物复制整理，未移动、删除或改写三期及原始资料。数据库已执行 WAL checkpoint 和 integrity_check；四期副本记录数为 34,046。<br><code>_歷史版本\\</code> 仅保留打包过程中的自动备份，不是运行必需内容，也不纳入 SHA256 清单；日常使用请以 <code>系统代码\\data.db</code> 为准。</div>
<h2>1. 下一个 Agent 先做什么</h2><ol><li>阅读 <a href="完整系統交接與審查報告_v4.html">完整系統交接與審查報告_v4.html</a>，了解实现、差异、数据质量和部署边界。</li><li>双击 <code>系统代码\\启动系统.bat</code>，打开 <code>http://127.0.0.1:3000/login</code> 验证系统。</li><li>查看本页“验收证据”和“数据质量”文件，不要先批量改历史库存或送货单。</li><li>需要修改时，先复制四期数据库到隔离环境，再运行 <code>系统代码\\test.mjs</code>；不要直接对正式 3000 端口做写测试。</li></ol><div class="notice warn"><b>账号</b>管理层 enjinggao36@gmail.com；办公室 office@demo.hk；会计 acc@demo.hk；前线 front@demo.hk。演示密码均为 demo1234。公网使用前必须关闭快捷演示登录、建立真实账号并配置 HTTPS。</div>
<h2>2. 目录与证据入口</h2><div class="grid"><div class="card"><h3>主交付</h3><div class="links"><a href="完整系統交接與審查報告_v4.html">完整审查报告</a><a href="_審查核對表_完成版.csv">72 项完成版核对表</a><a href="_業務驗收結果.json">最终 411 项业务结果</a><a href="_DOM對照結果.json">34 页 DOM 对照结果</a><a href="_本地報價管理.png">报价管理截图</a><a href="_本地客戶管理.png">客户管理截图</a><a href="_本地信件式報價單.png">信件式报价版式</a><a href="檔案清單_SHA256.csv">全部文件 SHA256 清单</a></div></div><div class="card"><h3>运行代码</h3><ul><li><code>系统代码\\server.mjs</code>：主服务器与路由</li><li><code>系统代码\\lib\\</code>：实体配置、存储、业务动作、页面、打印、图片编辑</li><li><code>系统代码\\data.db</code>：可立即运行的完整数据库</li><li><code>系统代码\\seed.mjs</code>：先备份、只补齐，不再删库</li><li><code>系统代码\\test.mjs</code>：最终业务验收脚本</li><li><code>系统代码\\backup-20261024-193250\\</code>：三期修改前备份</li></ul></div></div>
<h2>3. 验收历程与原始参考</h2><table><thead><tr><th>轮次</th><th>通过</th><th>失败</th><th>总数</th><th>证据文件</th></tr></thead><tbody>${history.map((h) => `<tr><td>${h.name}</td><td>${h.passed}</td><td>${h.failed}</td><td>${h.total}</td><td><a href="驗收歷程/${h.file}">${h.file}</a></td></tr>`).join('')}</tbody></table><div class="links"><a href="驗收歷程/DOM對照結果.json">最终 DOM 对照明细</a><a href="驗收歷程/正式庫信件式報價單.png">正式库报价目视证据</a><a href="驗收歷程/歷次業務驗收匯總.csv">历次验收汇总 CSV</a><a href="原系統參考/_交互审计.json">原系统 34 页交互审计</a><a href="原系統參考/_弹窗表单审计.json">原系统弹窗字段审计</a><a href="原系統參考/_審查核對表.csv">三期原始 72 项清单</a><a href="原系統參考/源码分析说明.html">原系统源码分析说明</a><a href="原系統參考/_schema.json">原 40 表字段结构</a><a href="原系統參考/_原始报价单样例.pdf">原始报价 PDF</a><a href="原系統參考/_原始报价单_参考图.png">原始报价参考图</a></div>
<h2>4. 数据质量：先审查再处理</h2><table><thead><tr><th>事项</th><th>数量</th><th>文件</th><th>建议</th></tr></thead><tbody><tr><td>历史负库存产品</td><td>${negativeStock.length}</td><td><a href="驗收歷程/歷史數據質量_負庫存.csv">负库存 CSV</a></td><td>先实物盘点，再用盘点调整；不要直接覆盖成 0。</td></tr><tr><td>已送达但未同步送货单</td><td>${unsyncedDN.length}（有效 ${unsyncedActive} + 回收 ${unsyncedDeleted}）</td><td><a href="驗收歷程/歷史數據質量_未同步送貨單.csv">未同步送货单 CSV</a></td><td>逐笔核对产品、数量和当前库存，先在隔离库运行补录并复核错误。</td></tr><tr><td>原 User 403 / Employee 0</td><td>功能已补</td><td>完整报告第 7 节</td><td>按真实业务需要建号；不要声称恢复了不可得账号。</td></tr><tr><td>数据完整性</td><td>34,046</td><td><a href="驗收歷程/數據完整性核對.csv">实体记录数 CSV</a></td><td>含通知 5,103；报价回收 30、送货回收 15 保留。</td></tr></tbody></table>
<h2>5. 隔离复测方法</h2><p>以下命令仅示例，路径请换成四期实际位置。第一个窗口启动测试服务，第二个窗口运行验收；测试会写数据，所以必须使用副本。</p><pre>REM 准备：在 系统代码 目录复制 data.db 为 cpc-test.db，并新建 cpc-test-uploads
set PORT=3100
set DB_PATH=四期目录\\系统代码\\cpc-test.db
set CPC_UPLOAD_DIR=四期目录\\系统代码\\cpc-test-uploads
set CPC_DEMO=1
node server.mjs

REM 另一个窗口
set CPC_TEST=1
set TEST_BASE=http://127.0.0.1:3100
set DB_PATH=四期目录\\系统代码\\cpc-test.db
set TEST_OUTPUT=四期目录\\系统代码\\cpc-test-results.json
node test.mjs</pre><p class="muted"><code>工具\\compare-ui.mjs</code> 与 <code>工具\\finalize-cpc.mjs</code> 保留作审查历程参考，内含当时工作路径；复用前先检查并改为当前四期路径，避免写回三期。主验收脚本 <code>test.mjs</code> 已通过 DB_PATH / TEST_BASE 参数化。另可运行 <code>node 工具\\verify-phase4.mjs</code> 复查清单、文档链接、数据库与复测结果。</p>
<h2>6. 后续工作建议</h2><ol><li>先处理数据质量：负库存盘点、98 张未同步送货单逐笔复核，任何批量补录都必须可回滚、可审计。</li><li>按真实名单配置用户、员工与 accessible_pages；不要恢复或编造原 User 数据。</li><li>生产部署另立任务：PostgreSQL、对象存储、HTTPS、每日异地备份、监控与 50 并发压测。</li><li>外部 SMTP / WhatsApp 自动发送需正式凭据；当前邮件入口为 mailto，不冒充后台已接通。</li><li>修改后必须重跑 <code>test.mjs</code> 与 34 页 DOM 对照，并更新完成版清单和 SHA256 清单。</li></ol><footer class="muted">四期交接总览 · 生成于 ${new Date().toISOString()}<br>原始数据目录仍保留：F:\\03 Standard CPC DataBase\\；原系统参考目录仍保留：F:\\04 STANDARD CPC SYSTEM\\05. 源码分析\\。</footer></div></body></html>`;
fs.writeFileSync(`${DEST}/四期交接總覽.html`, overview, 'utf8');

const files = walk(DEST).filter((file) => !file.endsWith('檔案清單_SHA256.csv') && !file.includes(`${path.sep}_歷史版本${path.sep}`));
writeCSV(`${DEST}/檔案清單_SHA256.csv`, ['相對路徑', '位元組', 'SHA256'], files.sort().map((file) => [path.relative(DEST, file).replace(/\\/g, '/'), fs.statSync(file).size, hash(file)]));
console.log(JSON.stringify({ dest: DEST, copied: copied.length, packageFiles: files.length + 1, records: totalRecords, integrity: integrity.integrity_check, negativeStock: negativeStock.length, unsyncedDN: unsyncedDN.length, unsyncedActive, unsyncedDeleted, history }, null, 2));
