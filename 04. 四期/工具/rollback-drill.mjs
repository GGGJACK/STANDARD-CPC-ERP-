// 回滚演练：验证「只靠 git tag 就能把代码恢复成可运行状态」。
// 不依赖本地 backup-* 目录 —— 那正是 2026-10-24 那次踩的坑（backup 里没有 lib/）。
//
// 用法：node rollback-drill.mjs [tag] [port]
// 默认 tag=v4.4-20261025，port=3105。跑完自动清理临时目录。
import { execSync, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/04 STANDARD CPC SYSTEM';
const OUT = 'C:/Users/Lenovo/WorkBuddy/2026-10-24-16-04-13/out';
const TAG = process.argv[2] || 'v4.4-20261025';
const PORT = Number(process.argv[3] || 3105);
const BASE = `http://127.0.0.1:${PORT}`;
const RUN = path.join(OUT, `rollback-drill-${Date.now()}`);
const SRC_LIVE = path.join(ROOT, '04. 四期/系统代码');

const t0 = Date.now();
const steps = [];
const mark = (name) => steps.push({ name, ms: Date.now() - t0 });

fs.mkdirSync(RUN, { recursive: true });

// 1. 从 tag 导出代码（模拟"只剩 git"的灾难恢复）
//    tar 会把 "C:\..." 当成 rsh 的 host:path，必须先转成 /c/... 的 MSYS 形式
const posix = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`);
execSync(`git archive ${TAG} "04. 四期/系统代码" | tar -x -C "${posix(RUN)}"`, { cwd: ROOT, shell: 'bash' });
const CODE = path.join(RUN, '04. 四期/系统代码');
mark('git archive 导出代码');

// 2. 用当前生产库生成副本（演练不碰正式库）
fs.mkdirSync(path.join(RUN, 'uploads'), { recursive: true });
{
  const db = new DatabaseSync(path.join(SRC_LIVE, 'data.db'));
  db.exec(`VACUUM INTO '${path.join(RUN, 'data.db').replace(/'/g, "''")}'`);
  db.close();
}
mark('VACUUM INTO 取数据库副本');

const countFiles = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += countFiles(p); else n++;
  }
  return n;
};

// 3. 起服务
let child = null;
const stop = () => { if (child && !child.killed) { try { child.kill(); } catch {} } };
process.on('exit', stop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });

try {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: CODE,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(RUN, 'data.db'), CPC_UPLOAD_DIR: path.join(RUN, 'uploads'), CPC_AUTO_IMPORT: '0', CPC_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {});

  const ready = await waitReady();
  mark('服务启动');
  check('DR-00 启动', ready, ready ? `${PORT} 就绪` : '超时未就绪');

  // 4. 登录 + 12 条冒烟
  const res = await fetch(`${BASE}/demo?as=management`, { redirect: 'manual' });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookie = String(raw[0] || res.headers.get('set-cookie') || '').split(';')[0];
  check('DR-01 登录', res.status === 302 && !!cookie, `HTTP ${res.status}`);

  const routes = [
    ['/mywork', '我的工作'], ['/customers', '客户'], ['/quotations', '报价'],
    ['/purchaseorders', '采购单'], ['/deliverynotes', '送货单'], ['/invoices', '发票'],
    ['/schedules', '排班'], ['/products', '产品'], ['/inventory', '库存'],
    ['/contracts', '合约'], ['/vehicles', '车辆'], ['/stockcounts', '盘点'],
  ];
  let n = 2;
  for (const [route, label] of routes) {
    const r = await fetch(BASE + route, { headers: { cookie }, redirect: 'manual' });
    const text = await r.text();
    const bad = /undefined|NaN|內部錯誤/.test(text.slice(0, 4000));
    check(`DR-${String(n++).padStart(2, '0')} ${label}`, r.status === 200 && !bad, `HTTP ${r.status}${bad ? ' 页面含 undefined/NaN' : ''}`);
  }
  mark('12 条冒烟');
} catch (error) {
  check('DR-99 演练本身', false, error.message);
} finally {
  stop();
  await sleep(400);
}

const passed = checks.filter((c) => c.ok).length;
const report = {
  tag: TAG, port: PORT, at: new Date().toISOString(),
  totalMs: Date.now() - t0, steps,
  codeFiles: fs.existsSync(CODE) ? countFiles(CODE) : 0,
  hasSeed: fs.existsSync(path.join(CODE, 'seed.mjs')),
  hasLib: fs.existsSync(path.join(CODE, 'lib')),
  total: checks.length, passed, failed: checks.length - passed,
  checks,
};
fs.writeFileSync(path.join(OUT, 'rollback-drill.json'), JSON.stringify(report, null, 2));

for (const s of steps) console.log(`  ${String(s.ms).padStart(6)}ms  ${s.name}`);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${c.detail}`);
console.log(`\n回滚演练：${passed}/${checks.length} · 总耗时 ${(report.totalMs / 1000).toFixed(1)}s · 代码 ${report.codeFiles} 个文件 · seed=${report.hasSeed} lib=${report.hasLib}`);

try { fs.rmSync(RUN, { recursive: true, force: true }); } catch {}
process.exit(passed === checks.length ? 0 : 1);
