#!/usr/bin/env node
// 工作租约：多 agent 同机协作时，用来申报"我要改哪些文件域"。
// 零依赖。租约文件是本地状态，不进版本控制。
//
//   node 租约.mjs status
//   node 租约.mjs claim --agent dev1 --task "PERM-06 菜单死链" --domains CONFIG,VIEW --port 3110
//   node 租约.mjs release --agent dev1
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEASE_DIR = path.join(HERE, '工作租约');
const DEFAULT_TTL = 120;

const DOMAINS = {
  API: ['04. 四期/系统代码/server.mjs', '04. 四期/系统代码/lib/pickers.mjs'],
  VIEW: ['04. 四期/系统代码/lib/ui.mjs', '04. 四期/系统代码/lib/core.mjs'],
  BIZ: ['04. 四期/系统代码/lib/actions.mjs'],
  DATA: ['04. 四期/系统代码/lib/store.mjs', '04. 四期/系统代码/lib/documents.mjs'],
  CONFIG: ['04. 四期/系统代码/lib/config.mjs'],
  TEST: ['04. 四期/測試設計_20261025/plan.mjs', '04. 四期/測試設計_20261025/run-tests.mjs', '00. 仓库管理/defects.csv'],
};

const DOMAIN_CN = {
  API: '接口与权限', VIEW: '展示层', BIZ: '业务动作',
  DATA: '存储与单据', CONFIG: '配置（热点）', TEST: '测试资产',
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

function ensureDir() {
  if (!fs.existsSync(LEASE_DIR)) fs.mkdirSync(LEASE_DIR, { recursive: true });
}

function load() {
  ensureDir();
  return fs.readdirSync(LEASE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return { ...JSON.parse(fs.readFileSync(path.join(LEASE_DIR, f), 'utf8')), _file: f }; } catch { return null; }
    })
    .filter(Boolean);
}

const expired = (l) => Date.now() > new Date(l.startedAt).getTime() + (l.ttlMinutes || DEFAULT_TTL) * 60000;
const active = () => load().filter((l) => !expired(l));

function listening() {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ports = new Set();
    for (const line of out.split('\n')) {
      if (!/LISTENING/i.test(line)) continue;
      const m = line.match(/:(\d{4,5})\s+[\d.:*]+\s+LISTENING/i);
      if (m) ports.add(Number(m[1]));
    }
    return ports;
  } catch { return new Set(); }
}

function gitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const head = execSync('git log -1 --format="%h %s"', { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
    return { branch, head, dirty };
  } catch { return null; }
}

function cmdStatus() {
  const leases = load();
  const g = gitInfo();
  const ports = listening();

  console.log('\n当前仓库');
  if (g) console.log(`  分支 ${g.branch} · ${g.head}${g.dirty ? ` · ${g.dirty} 个未提交改动` : ' · 工作区干净'}`);
  else console.log('  不在 git 仓库内');

  if (!leases.length) {
    console.log('\n没有租约。可以直接开工，但开工前请先 claim。\n');
    return;
  }

  console.log('\n租约');
  const head = ['agent', '状态', '域', '端口', '分支', '任务'];
  const rows = leases.map((l) => [
    l.agent,
    expired(l) ? '过期' : '进行中',
    (l.domains || []).join('+'),
    l.port ? String(l.port) : '-',
    l.branch || '-',
    (l.task || '').slice(0, 28),
  ]);
  const widths = head.map((h, i) => Math.max(...[h, ...rows.map((r) => r[i])].map((s) => s.length)));
  console.log('  ' + head.map((h, i) => h.padEnd(widths[i])).join('  '));
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log('  ' + r.map((c, i) => c.padEnd(widths[i])).join('  '));

  const busy = active();
  if (busy.length) {
    const buses = new Set(busy.flatMap((l) => l.domains || []));
    console.log(`\n被占用的域：${[...buses].join('、')}`);
    console.log(`空闲的域：${Object.keys(DOMAINS).filter((d) => !buses.has(d)).join('、') || '（无）'}`);
    for (const l of busy) if (l.port) console.log(`  端口 ${l.port} 由 ${l.agent} 登记${ports.has(Number(l.port)) ? '（正在监听）' : '（未监听）'}`);
  }
  const stale = leases.filter(expired);
  if (stale.length) console.log(`\n有 ${stale.length} 个过期租约，确认无人使用后可删除对应 json。`);
  console.log('');
}

function cmdClaim(args) {
  const agent = String(args.agent || '').trim();
  if (!agent) return fail('缺少 --agent');
  if (String(agent).includes('/') || String(agent).includes('\\')) return fail('agent 名不能含路径分隔符');

  const domains = String(args.domains || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!domains.length) return fail('缺少 --domains（可用：' + Object.keys(DOMAINS).join('/') + '）');
  const unknown = domains.filter((d) => !DOMAINS[d]);
  if (unknown.length) return fail('未知的域：' + unknown.join('、'));

  const port = args.port ? Number(args.port) : null;
  const branch = args.branch ? String(args.branch) : '';
  const others = active().filter((l) => l.agent !== agent);

  const conflicts = [];
  for (const l of others) {
    const hit = (l.domains || []).filter((d) => domains.includes(d));
    if (hit.length) conflicts.push(`域 ${hit.join('+')} 已被 ${l.agent} 占用（${l.task || '无任务名'}）`);
    if (port && Number(l.port) === port) conflicts.push(`端口 ${port} 已被 ${l.agent} 登记`);
    if (branch && l.branch === branch) conflicts.push(`分支 ${branch} 已被 ${l.agent} 使用`);
  }

  if (conflicts.length && !args.force) {
    console.log('\n拒绝领取：\n');
    for (const c of conflicts) console.log('  - ' + c);
    console.log('\n先 status 看对方在做什么，或换一个域/端口。确实要抢，加 --force。\n');
    process.exitCode = 1;
    return;
  }

  const files = domains.flatMap((d) => DOMAINS[d]);
  const lease = {
    agent,
    task: String(args.task || ''),
    domains,
    files,
    port,
    branch,
    worktree: args.worktree ? String(args.worktree) : '',
    dbCopy: args['db-copy'] ? String(args['db-copy']) : '',
    startedAt: new Date().toISOString(),
    ttlMinutes: args.ttl ? Number(args.ttl) : DEFAULT_TTL,
    note: args.note ? String(args.note) : '',
  };

  ensureDir();
  fs.writeFileSync(path.join(LEASE_DIR, `${agent}.json`), JSON.stringify(lease, null, 2), 'utf8');

  console.log(`\n已领取：${agent} → ${domains.map((d) => `${d}（${DOMAIN_CN[d]}）`).join('、')}`);
  for (const f of files) console.log('  · ' + f);
  if (port) console.log(`  端口 ${port}${listening().has(port) ? ' 已被别的进程监听，换一个' : ''}`);
  console.log(`  租约 ${lease.ttlMinutes} 分钟后过期；收工记得 release。\n`);
}

function cmdRelease(args) {
  const agent = String(args.agent || '').trim();
  if (!agent) return fail('缺少 --agent');
  const file = path.join(LEASE_DIR, `${agent}.json`);
  if (!fs.existsSync(file)) return fail(`没有 ${agent} 的租约`);
  fs.unlinkSync(file);
  console.log(`已释放：${agent}`);
}

function fail(msg) {
  console.error('错误：' + msg);
  process.exitCode = 1;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'status';
if (cmd === 'status') cmdStatus();
else if (cmd === 'claim') cmdClaim(args);
else if (cmd === 'release') cmdRelease(args);
else if (cmd === 'domains') {
  console.log('');
  for (const [d, files] of Object.entries(DOMAINS)) {
    console.log(`${d.padEnd(7)} ${DOMAIN_CN[d]}`);
    for (const f of files) console.log('        ' + f);
  }
  console.log('');
} else {
  console.log('用法：node 租约.mjs <status|claim|release|domains> [选项]');
  process.exitCode = 1;
}
