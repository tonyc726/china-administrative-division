/**
 * 预构建：把 @cndiv 数据源编译成静态资产（零后端）
 *
 * 产物（apps/web/public/data/）：
 *   timeline.json      42 年县级构成曲线 —— 首屏叙事，几 KB
 *   tree.json          省/市/县三级树 —— 下钻与搜索索引
 *   stats.json         2023 五级全景数字
 *   shards/<c>.json    每个县下的乡镇+村，按需 fetch
 *
 * 数据来源为 workspace 内的 source 包（已发布至 npm，构建期读 CSV）。
 * 产物不入 git（见 .gitignore），CI 构建时重新生成。
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = `${ROOT}apps/web/public/data`;

interface Row {
  code: string;
  name: string;
  level: number;
  parent: string;
  year: number;
}

/** CSV 解析：字段可被引号包裹（name 含逗号时不会炸） */
function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f: string[] = [];
    let cur = '';
    let quoted = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        f.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    f.push(cur);
    if (f.length < 5) continue;
    rows.push({
      code: f[0],
      name: f[1],
      level: Number(f[2]),
      parent: f[3],
      year: Number(f[4]),
    });
  }
  return rows;
}

/** 县级单位的"类型"——撤县设区叙事的核心维度 */
type Kind = '县' | '区' | '市' | '旗' | '其他';
function kindOf(name: string): Kind {
  if (name.endsWith('区')) return '区';
  if (name.endsWith('县')) return '县';
  if (name.endsWith('市')) return '市';
  if (name.endsWith('旗')) return '旗';
  return '其他';
}

/**
 * 里程碑：只标注数据能自证的事实。
 * ⚠️ 2013 年省级 31→34 是 GB/T 2260 纳入港澳台的**口径变化**，非行政变更——
 *    必须如实标注，否则是编故事。
 */
const MILESTONES = [
  { year: 1988, label: '海南建省', note: '省级 29 → 30', kind: 'real' as const },
  { year: 1997, label: '重庆设直辖市', note: '省级 30 → 31', kind: 'real' as const },
  {
    year: 2013,
    label: '港澳台纳入编码表',
    note: '省级 31 → 34：编码口径变化，非行政区划变更',
    kind: 'caveat' as const,
  },
  {
    year: 2013,
    label: '撤县设区提速',
    note: '此后「县」加速转为「区」',
    kind: 'real' as const,
  },
];

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(`${OUT}/shards`, { recursive: true });

  // ---------- 1. 42 年时间线 ----------
  const hist = parseCsv(
    await Bun.file(`${ROOT}packages/source-history/data/divisions.csv`).text()
  );
  // 2021 仅 21 行，数据残缺 → 有效区间截至 2020
  const YEAR_MAX = 2020;
  const byYear = new Map<number, Row[]>();
  for (const r of hist) {
    if (r.year > YEAR_MAX) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const series: Record<Kind, number[]> = { 县: [], 区: [], 市: [], 旗: [], 其他: [] };
  const provinces: number[] = [];
  for (const y of years) {
    const rows = byYear.get(y)!;
    const c: Record<Kind, number> = { 县: 0, 区: 0, 市: 0, 旗: 0, 其他: 0 };
    for (const r of rows) if (r.level === 3) c[kindOf(r.name)]++;
    for (const k of Object.keys(series) as Kind[]) series[k].push(c[k]);
    provinces.push(rows.filter((r) => r.level === 1).length);
  }
  const timeline = {
    yearMin: years[0],
    yearMax: YEAR_MAX,
    years,
    series,
    provinces,
    milestones: MILESTONES,
    headline: {
      countyLost: series['县'][0] - series['县'].at(-1)!,
      districtGained: series['区'].at(-1)! - series['区'][0],
      cityGained: series['市'].at(-1)! - series['市'][0],
    },
    source: 'GB/T 2260 (@cndiv/source-history)',
  };
  await writeFile(`${OUT}/timeline.json`, JSON.stringify(timeline));

  // ---------- 2. 2023 快照：三级树 + 按县分片 ----------
  const snap = parseCsv(
    await Bun.file(`${ROOT}packages/source-2023/data/divisions.csv`).text()
  );
  const tree = snap
    .filter((r) => r.level <= 3)
    .map((r) => [r.code, r.name, r.level, r.parent]);

  // 乡镇(L4) 按其父县分组；村(L5) 按其父乡镇分组
  const townsByCounty = new Map<string, Row[]>();
  const villagesByTown = new Map<string, Row[]>();
  for (const r of snap) {
    if (r.level === 4) {
      if (!townsByCounty.has(r.parent)) townsByCounty.set(r.parent, []);
      townsByCounty.get(r.parent)!.push(r);
    } else if (r.level === 5) {
      if (!villagesByTown.has(r.parent)) villagesByTown.set(r.parent, []);
      villagesByTown.get(r.parent)!.push(r);
    }
  }

  let shardCount = 0;
  let shardBytes = 0;
  let maxShard = 0;
  for (const [county, towns] of townsByCounty) {
    // 紧凑结构：[乡镇码, 乡镇名, [[村码, 村名], ...]]
    const payload = towns.map((t) => [
      t.code,
      t.name,
      (villagesByTown.get(t.code) ?? []).map((v) => [v.code, v.name]),
    ]);
    const json = JSON.stringify(payload);
    await writeFile(`${OUT}/shards/${county}.json`, json);
    shardCount++;
    shardBytes += json.length;
    maxShard = Math.max(maxShard, json.length);
  }
  await writeFile(`${OUT}/tree.json`, JSON.stringify(tree));

  const levels: Record<number, number> = {};
  for (const r of snap) levels[r.level] = (levels[r.level] ?? 0) + 1;
  await writeFile(
    `${OUT}/stats.json`,
    JSON.stringify({ year: 2023, levels, total: snap.length, source: 'NBS (@cndiv/source-2023)' })
  );

  // ---------- 报告 ----------
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log('✅ 构建完成');
  console.log(`  timeline.json  ${kb(JSON.stringify(timeline).length)}  (${years[0]}–${YEAR_MAX})`);
  console.log(`  tree.json      ${kb(JSON.stringify(tree).length)}  (${tree.length} 节点, L1–L3)`);
  console.log(`  shards/        ${shardCount} 片, 合计 ${kb(shardBytes)}, 均 ${kb(shardBytes / shardCount)}, 最大 ${kb(maxShard)}`);
  console.log(`  头条: 县 -${timeline.headline.countyLost} / 区 +${timeline.headline.districtGained} / 市 +${timeline.headline.cityGained}`);
  console.log(`  五级: ${Object.entries(levels).map(([l, n]) => `L${l}=${n.toLocaleString()}`).join(' ')}`);
}

await main();
