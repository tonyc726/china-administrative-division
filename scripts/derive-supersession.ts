/**
 * derive-supersession.ts — 从相邻年度 patch 推导 supersession 候选视图（只读实验）
 *
 * 2026-09 优化方案 C2（docs/plans/2026-09-optimization-plan.md 阶段 3）：
 * 从 patches/ 的 remove/add 操作推导「谁被谁接替」的候选边，供时光机变迁链调研。
 * 调研动机见 docs/DATA-ASSETS.md 疑点 #5 与方案"明确不做"清单——本脚本是对
 * 「WOF 生命周期字段进协议」的 90% 效果 10% 成本替代，不进 data-protocol。
 *
 * 明确边界：只读实验产物，输出到 .cache/（gitignored），不进 cold master schema。
 *
 * 启发式（按证据强度降序）：
 *   1. reason-mention     add.name 出现在 remove.reason（如「撤销凤翔县，设立宝鸡市凤翔区」）
 *   2. same-reason-group  同 reason 的 N 个 remove 共同指向 reason 提及的 add（撤二设一，如两江新区）
 *   3. stem-match         剥行政后缀后名称词干相等（沙湾县→沙湾市）
 *   4. cross-year-stem    当年未匹配的 remove 与次年 add 词干匹配（延迟设立的撤设）
 *   5. reason-baseline-mention  接替者沿用既有码（无 add op，如杭州新上城区沿 330102）：
 *                              reason 提及且同地级前缀的基线实体唯一时指向它
 *
 * 名称回查（remove op 不带 name）：patch 历年 add → source-2023 → source-history（≤ 该年最新）。
 * 依赖本地物化基线（与 CI fetch-data-csvs 同源，见 .github/actions/fetch-data-csvs）：
 *   packages/source-2023/data/divisions.csv
 *   packages/source-history/data/divisions.csv
 *
 * 用法：bun scripts/derive-supersession.ts [--out=<path>]（默认 .cache/supersession-candidates.json）
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PATCHES_DIR = 'patches';
const CSV_2023 = 'packages/source-2023/data/divisions.csv';
const CSV_HISTORY = 'packages/source-history/data/divisions.csv';
const OUT_DEFAULT = '.cache/supersession-candidates.json';

// ---------- 极简 CSV 行解析（本仓库 CSV 仅名称列可能含引号包裹的逗号） ----------
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function loadCsvNames(path: string, maxYear?: number): Map<string, string> {
  const rows = new Map<string, { name: string; year: number }>();
  if (!existsSync(path)) {
    console.warn(`⚠️  基线缺失（名称回查将不完整）: ${path} — 可参照 .github/actions/fetch-data-csvs 物化`);
    return new Map();
  }
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const iCode = header.indexOf('code'), iName = header.indexOf('name'), iYear = header.indexOf('year');
  // 同码多行（跨年）取最新年份 ≤ maxYear 的行。
  // 已知数据缺陷防御（DATA-ASSETS 疑点 #6）：source-history 2021 年行系上游
  // GB2260/2021.json.gz 变更表误灌，name 为「撤销\n 设立 凤翔区」类碎片——
  // 含换行/nbsp/空格或恰为 撤销/设立 的行跳过，回退到更早年份的干净行。
  const isGarbage = (n: string) =>
    n.includes('\n') || n.includes('\xa0') || n.includes(' ') || n === '撤销' || n === '设立';
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const year = Number(f[iYear]);
    if (maxYear !== undefined && year > maxYear) continue;
    if (isGarbage(f[iName])) continue;
    const code = f[iCode];
    const prev = rows.get(code);
    if (prev === undefined || year >= prev.year) rows.set(code, { name: f[iName], year });
  }
  const map = new Map<string, string>();
  for (const [code, { name }] of rows) map.set(code, name);
  return map;
}

// ---------- 名称词干：剥行政后缀（长后缀优先，最多剥两层） ----------
const SUFFIXES = [
  '自治县', '自治旗', '自治州', '自治区', '县级市',
  '新区', '矿区', '林区', '特区', '地区', '街道', '管委会', '管理区',
  '县', '市', '区', '盟', '旗', '镇', '乡', '苏木',
];
function stem(name: string): string {
  let s = name;
  for (let round = 0; round < 2; round++) {
    for (const suf of SUFFIXES) {
      if (s.length > suf.length && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
    }
  }
  return s;
}

// ---------- 载入 patches ----------
interface Op {
  op: string; code: string; name?: string; level?: number;
  parent_code?: string; reason?: string;
}
interface Patch { year: number; file: string; applyAfter: string; operations: Op[]; }

const patches: Patch[] = [];
for (const yearDir of readdirSync(PATCHES_DIR).filter((d) => /^\d{4}$/.test(d)).sort()) {
  const year = Number(yearDir);
  for (const f of readdirSync(join(PATCHES_DIR, yearDir)).sort()) {
    if (!f.endsWith('.json') || f.endsWith('.conflicts.json')) continue;
    const data = JSON.parse(readFileSync(join(PATCHES_DIR, yearDir, f), 'utf-8'));
    patches.push({
      year,
      file: `${yearDir}/${f}`,
      applyAfter: data.meta?.apply_after ?? '?',
      operations: data.operations ?? [],
    });
  }
}
const years = [...new Set(patches.map((p) => p.year))].sort();

// ---------- 名称回查表 ----------
// 历年 patch add（按年升序，晚者覆盖——同码重设时取最新名）
const patchAddNames = new Map<string, string>();
for (const p of patches) {
  for (const op of p.operations) {
    if (op.op === 'add' && op.name) patchAddNames.set(op.code, op.name);
  }
}
const names2023 = loadCsvNames(CSV_2023);

function resolveName(code: string, beforeYear: number): string | null {
  // patch add 名称需早于 remove 年才可信（同年 add+remove 视为撤设，回查应用 reason 而非名称表）
  if (patchAddNames.has(code)) return patchAddNames.get(code)!;
  if (names2023.has(code)) return names2023.get(code)!;
  return null; // source-history 兜底在主流程按年懒加载（仅老码需要）
}

// ---------- 推导主流程 ----------
interface Edge {
  fromCode: string; fromName: string | null; toCode: string; toName: string;
  year: number; evidence: string; reason: string;
}

const historyCache = new Map<number, Map<string, string>>();
function historyNames(year: number): Map<string, string> {
  if (!historyCache.has(year)) historyCache.set(year, loadCsvNames(CSV_HISTORY, year));
  return historyCache.get(year)!;
}

const edges: Edge[] = [];
const unmatched: { year: number; code: string; name: string | null; reason: string }[] = [];

for (const y of years) {
  const yearPatches = patches.filter((p) => p.year === y);
  const removes = yearPatches.flatMap((p) => p.operations.filter((o) => o.op === 'remove'));
  if (removes.length === 0) continue;
  const adds = yearPatches.flatMap((p) => p.operations.filter((o) => o.op === 'add' && o.name));
  const nextYearAdds = years.includes(y + 1)
    ? patches.filter((p) => p.year === y + 1).flatMap((p) => p.operations.filter((o) => o.op === 'add' && o.name))
    : [];

  const matched = new Set<string>();
  // Pass 1：reason-mention
  const reasonMatch = new Map<string, string>(); // removeCode -> addCode
  for (const r of removes) {
    const hit = adds.find((a) => a.name! && r.reason?.includes(a.name!));
    if (hit) reasonMatch.set(r.code, hit.code);
  }
  // Pass 2：same-reason-group（同 reason 的 remove 若有一个命中，全组指向同一 add）
  for (const r of removes) {
    if (reasonMatch.has(r.code)) continue;
    const sibling = removes.find((o) => o !== r && o.reason === r.reason && reasonMatch.has(o.code));
    if (sibling) reasonMatch.set(r.code, reasonMatch.get(sibling.code)!);
  }
  for (const r of removes) {
    const name = resolveName(r.code, y) ?? historyNames(y).get(r.code) ?? null;
    const reasonHit = reasonMatch.get(r.code);
    if (reasonHit) {
      const a = adds.find((x) => x.code === reasonHit)!;
      edges.push({ fromCode: r.code, fromName: name, toCode: a.code, toName: a.name!, year: y,
        evidence: reasonMatch.has(r.code) && adds.find((x) => x.code === reasonHit && r.reason?.includes(x.name!)) ? 'reason-mention' : 'same-reason-group',
        reason: r.reason ?? '' });
      matched.add(r.code);
      continue;
    }
    // Pass 3：stem-match（同年）
    const stemHit = adds.find((a) => name && a.name && stem(name) === stem(a.name));
    if (stemHit) {
      edges.push({ fromCode: r.code, fromName: name, toCode: stemHit.code, toName: stemHit.name!, year: y,
        evidence: 'stem-match', reason: r.reason ?? '' });
      matched.add(r.code);
      continue;
    }
    // Pass 4：cross-year-stem（次年）
    const crossHit = nextYearAdds.find((a) => name && a.name && stem(name) === stem(a.name));
    if (crossHit) {
      edges.push({ fromCode: r.code, fromName: name, toCode: crossHit.code, toName: crossHit.name!, year: y,
        evidence: 'cross-year-stem', reason: r.reason ?? '' });
      matched.add(r.code);
      continue;
    }
    // Pass 5：reason-baseline-mention —— 接替者沿用既有码（无 add op，如杭州撤设
    // 新上城区沿 330102）：reason 提及的名称若在同地级前缀的基线实体中存在，指向它
    if (name !== null) {
      const historyMap = historyNames(y);
      const candidates = [...historyMap.entries()].filter(
        // 同地级前缀 + reason 提及；排除自身（撤销方常在 reason 里被点名）与
        // 祖先级（母市名如「杭州市」必在 reason 中——判据是第 5-6 位码段为 00，
        // 即地级及以上；注意所有 12 位县级码都以 000000 结尾，勿用 endsWith）
        ([code, n]) =>
          code !== r.code &&
          code.slice(4, 6) !== '00' &&
          code.slice(0, 4) === r.code.slice(0, 4) &&
          r.reason?.includes(n)
      );
      if (candidates.length === 1) {
        edges.push({ fromCode: r.code, fromName: name, toCode: candidates[0][0], toName: candidates[0][1],
          year: y, evidence: 'reason-baseline-mention', reason: r.reason ?? '' });
        matched.add(r.code);
        continue;
      }
    }
    unmatched.push({ year: y, code: r.code, name, reason: r.reason ?? '' });
  }
}

// ---------- 输出 ----------
const outIdx = process.argv.indexOf('--out');
const out = outIdx > -1 ? process.argv[outIdx + 1] : OUT_DEFAULT;
mkdirSync(join(out, '..'), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  note: '只读推导实验（2026-09 优化方案 C2）：不进 data-protocol / cold master schema。启发式证据强度 reason-mention > same-reason-group > stem-match > cross-year-stem。',
  totalRemoves: edges.length + unmatched.length,
  matched: edges.length,
  unmatchedCount: unmatched.length,
  edges,
  unmatched,
};
writeFileSync(out, JSON.stringify(report, null, 2));

const byEvidence: Record<string, number> = {};
for (const e of edges) byEvidence[e.evidence] = (byEvidence[e.evidence] ?? 0) + 1;
console.log(`remove 总数 ${report.totalRemoves}，推导出 supersession 边 ${edges.length}，未匹配 ${unmatched.length}`);
console.log('按证据强度:', byEvidence);
for (const e of edges) {
  console.log(`  ${e.year} ${e.fromCode} ${e.fromName ?? '(名称未回查到)'} → ${e.toCode} ${e.toName} [${e.evidence}]`);
}
if (unmatched.length) {
  console.log('未匹配 remove（如实记录，不臆造）:');
  for (const u of unmatched) console.log(`  ${u.year} ${u.code} ${u.name ?? '(名称未回查到)'} — ${u.reason}`);
}
console.log(`\n产出: ${out}`);
