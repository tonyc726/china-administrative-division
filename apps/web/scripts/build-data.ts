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
 * 谱系词根：撤县设区/设市时区划码常变，但名字的词根几乎总是保留
 * （余姚县→余姚市、丰南县→丰南市→丰南区）。按「地级前缀(code4)+词根」
 * 把 2023 的县对齐到 1980–2020 历史，即可还原每个县自己的变迁史。
 * 词根 <2 字（如「吉县」→「吉」）放弃匹配——重名误配的代价大于收益。
 */
const ROOT_SUFFIXES = ['自治县', '自治旗', '林区', '矿区', '特区', '新区', '县', '市', '区', '旗'];
function rootOf(name: string): string | null {
  for (const s of ROOT_SUFFIXES) {
    if (name.endsWith(s)) {
      const r = name.slice(0, -s.length);
      return r.length >= 2 ? r : null;
    }
  }
  return name.length >= 2 ? name : null;
}

/**
 * 里程碑：只标注数据能自证的事实。
 * ⚠️ 2013 年省级 31→34 是 GB/T 2260 纳入港澳台的**口径变化**，非行政变更——
 *    必须如实标注，否则是编故事。
 */
const MILESTONES = [
  {
    year: 1988,
    label: '海南建省',
    labelEn: 'Hainan becomes a province',
    note: '省级 29 → 30',
    kind: 'real' as const,
  },
  {
    year: 1997,
    label: '重庆设直辖市',
    labelEn: 'Chongqing made a municipality',
    note: '省级 30 → 31',
    kind: 'real' as const,
  },
  {
    year: 2013,
    label: '港澳台纳入编码表',
    labelEn: 'HK/MO/TW added to code table',
    note: '省级 31 → 34：编码口径变化，非行政区划变更',
    kind: 'caveat' as const,
  },
  {
    year: 2013,
    label: '撤县设区提速',
    labelEn: 'County-to-district wave accelerates',
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

  // ---------- 1.5 县级谱系索引：code4|词根 → year→name ----------
  // 同键同年出现两个不同名（如「井陉县」与「井陉矿区」并存）即词根歧义，
  // 整键放弃——宁可不显示谱系，不显示拼错的历史。
  const lineageIdx = new Map<string, Map<number, string>>();
  const ambiguous = new Set<string>();
  for (const r of hist) {
    if (r.level !== 3 || r.year > YEAR_MAX) continue;
    const root = rootOf(r.name);
    if (!root) continue;
    const key = `${r.code.slice(0, 4)}|${root}`;
    if (!lineageIdx.has(key)) lineageIdx.set(key, new Map());
    const ym = lineageIdx.get(key)!;
    const existing = ym.get(r.year);
    if (existing !== undefined && existing !== r.name) ambiguous.add(key);
    else ym.set(r.year, r.name);
  }

  /** 某县的变迁事件序列：[[year, name], ...] 仅保留变化点；歧义/无匹配返回 [] */
  function lineageOf(county: Row): [number, string][] {
    const root = rootOf(county.name);
    if (!root) return [];
    const key = `${county.code.slice(0, 4)}|${root}`;
    if (ambiguous.has(key)) return [];
    const ym = lineageIdx.get(key);
    if (!ym) return [];
    const events: [number, string][] = [];
    for (const y of [...ym.keys()].sort((a, b) => a - b)) {
      const n = ym.get(y)!;
      if (events.length === 0 || events[events.length - 1]![1] !== n) events.push([y, n]);
    }
    return events;
  }

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

  const countyByCode = new Map<string, Row>();
  for (const r of snap) if (r.level === 3) countyByCode.set(r.code, r);

  let shardCount = 0;
  let shardBytes = 0;
  let maxShard = 0;
  let lineageHit = 0;
  for (const [county, towns] of townsByCounty) {
    // 分片 = { h: 该县 1980–2020 变迁事件, t: [乡镇码, 乡镇名, [[村码, 村名], ...]] }
    const countyRow = countyByCode.get(county);
    const h = countyRow ? lineageOf(countyRow) : [];
    if (h.length > 0) lineageHit++;
    const t = towns.map((tw) => [
      tw.code,
      tw.name,
      (villagesByTown.get(tw.code) ?? []).map((v) => [v.code, v.name]),
    ]);
    const json = JSON.stringify({ h, t });
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
  console.log(`  谱系: ${lineageHit}/${shardCount} 个县接上 1980–2020 历史（歧义键 ${ambiguous.size} 个已放弃）`);
  console.log(`  头条: 县 -${timeline.headline.countyLost} / 区 +${timeline.headline.districtGained} / 市 +${timeline.headline.cityGained}`);
  console.log(`  五级: ${Object.entries(levels).map(([l, n]) => `L${l}=${n.toLocaleString()}`).join(' ')}`);
}

await main();
