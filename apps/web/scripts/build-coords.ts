/**
 * 坐标分片构建：把 stname 抓取的村级坐标(coords.json)join 进项目 12 位码体系，
 * 分片输出到 apps/web/public/data/coords/，供 InfoPanel 前端按需 fetch。
 *
 * 数据源：
 *   - packages/crawler/.cache/coords.json  stname 抓取的村级坐标(按 6 位县级码聚合)
 *   - packages/crawler/.cache/upper.json   stname --upper 抓取的省/市/县自身坐标
 *   - apps/web/public/data/tree.json      build-data 产物(NBS L1-L3 12 位码树,upper join 用)
 *   - apps/web/public/data/shards/         build-data 产物(12 位码村级树,用于 join)
 *
 * 为什么读 shards/ 而非 cache.db(reader)：apps/web 用 --ignore-workspace 安装,不在 pnpm
 * workspace,无法 import @cndiv/reader。故复用 build-data 已构建的 shards/(纯 JSON,含 2026
 * 村级码+名)。build 顺序：build-data -> build-coords(shards/ 必须先存在)。
 *
 * join 策略(规格 §6 本意是"县级 + name 匹配")：
 *   1. area(9位)+"000" 乡级下精确匹配(首选)
 *   2. 退化县级匹配(area 不对齐法定乡级码时,全县按归一名匹配)
 *   实测地名库 area 仅 ~79% 对齐法定乡级码(110105 样本),故 fallback 必要。
 *
 * 产物(place-info-panel §5.1)：
 *   coords/shards/<县级12位码>.json  该县下辖村/社区坐标(CoordRow 数组)
 *   coords/upper.json                省/市/县自身坐标(21200/21300/21400 join NBS 12 位码)
 *   coords/join-report.json          join 损耗量化报告(村级 + upper 两段)
 *
 * upper join 说明(stname-upper-plan 阶段 2;规格 §7 原把县级自身坐标并入分片,
 * 计划改为统一进 upper.json provinces[]/cities[]/counties[],前端一次 fetch 查三级):
 *   匹配策略:码精确(area 截前 4/6 位补零成 12 位码 + 名称一致)→ 上级范围内名称兜底
 *   未匹配/未覆盖如实记录(开发区/新区/管委会 NBS 有而地名库无,反向亦然),不臆造
 *   输出按 NBS 12 位码去重(地名库缓存曾有重复项残留,如奎文区)
 *
 * 详见 specs/2026-07-18-dmfw-stname-coords-design.md §6/§7 + .claude/plans/build-coords-design.md
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = `${ROOT}apps/web/public/data/coords`;
const COORDS_JSON = `${ROOT}packages/crawler/.cache/coords.json`;
const UPPER_JSON = `${ROOT}packages/crawler/.cache/upper.json`;
const TREE_JSON = `${ROOT}apps/web/public/data/tree.json`;
const SHARDS_DIR = `${ROOT}apps/web/public/data/shards`;

/** 坐标行(place-info-panel §5.2) */
export interface CoordRow {
  /** 项目 12 位村级码 */
  code: string;
  /** standard_name(地名库原名) */
  name: string;
  /** [lon, lat] CGCS2000 存储(不转 GCJ-02,消费侧 getAmapLink 转) */
  coord: [number, number];
  /** 21610(行政村) / 21620(社区) */
  placeTypeCode: string;
  source: 'dmfw-stname';
}

/** stname 单条记录(按 stname-types.ts 实测字段,只取 join 用到的;coords.json 与 upper.json 共用) */
export interface StnameRow {
  standard_name: string;
  place_type_code: string;
  gdm: { type: string; coordinates: number[][] } | null;
  /** 9 位码:coords.json 为乡级码(6 位县级+3 位乡级);upper.json 为省/市/县级自身码(后缀 999) */
  area: string | null;
}

/** coords.json 顶层结构 */
interface CoordsFile {
  meta: { stats: Record<string, number> };
  coords: Record<string, StnameRow[]>; // key = 6 位县级码
}

/** upper.json(.cache) 单条:按省查询产物,记录挂在 provinceCode 下 */
export interface UpperEntry {
  provinceCode: string;
  row: StnameRow;
}

/** upper.json(.cache) 顶层结构(run-stname --upper 产物,meta/completed 略) */
export interface UpperFile {
  provinces: UpperEntry[];
  cities: UpperEntry[];
  counties: UpperEntry[];
}

/** tree.json 行: [12 位码, 名称, 层级, 父 12 位码, 拼音, 缩写] */
export type TreeRow = [string, string, number, string, string, string];

/** shards/<县级码>.json 的树结构(build-data 产物,只取 t 树) */
interface ShardFile {
  h: unknown;
  /** [乡码12位, 乡名, [[村码12位, 村名, 重名数], ...]] */
  t: [string, string, [string, string, number][]][];
}

interface VillageRef {
  code: string;
  name: string;
}

/** upper 单层 join 统计(计划阶段 2:matched / unmatched / duplicate-code) */
export interface UpperLevelStats {
  matched: number;
  unmatched: number;
  /** 同一 NBS 12 位码被多条地名库记录命中(输出按码去重,保留首条) */
  duplicates: number;
  /** 命中码但 gdm 坐标缺失(理论防御,当前数据为 0) */
  coordMissing: number;
}

/** joinUpper 结果:三级 CoordRow + 统计 */
export interface UpperJoinResult {
  provinces: CoordRow[];
  cities: CoordRow[];
  counties: CoordRow[];
  stats: { provinces: UpperLevelStats; cities: UpperLevelStats; counties: UpperLevelStats };
  /** 未匹配样例(前 20 条,「层级 省码 area 名称」) */
  unmatchedSamples: string[];
  /** NBS 有而地名库 21300/21400 无对应记录的条数(开发区/新区/管委会等,如实记录) */
  nbsUncovered: { l2: number; l3: number };
}

interface JoinReport {
  totalRows: number;
  joined: number;
  joinExact: number; // area 乡级精确匹配
  joinFallback: number; // 县级退化匹配
  missNoCoord: number;
  missNoName: number;
  joinRate: string;
  shardCount: number;
  emptyShardCount: number;
  missByCountyTop: Array<[string, number]>;
  /** upper join(省/市/县自身坐标);available=false 为降级(源数据缺失,未执行) */
  upper: {
    available: boolean;
    provinces: UpperLevelStats;
    cities: UpperLevelStats;
    counties: UpperLevelStats;
    unmatchedSamples: string[];
    nbsUncovered: { l2: number; l3: number };
  };
}

/**
 * 名称归一:去行政后缀,使地名库 name 与法定区划 name 对齐。
 *   地名库:"银闸社区" / "牌坊村"
 *   法定:  "银闸社区居委会" / "牌坊村村民委员会"
 *   归一后:"银闸" / "牌坊"(核心名)
 *
 * 循环去后缀(长优先),直到无后缀;保证至少留 1 字(name.length > suffix.length)。
 * 后缀清单按长度降序,避免短后缀(如"村")先吃掉"村民委员会"中的"村"。
 */
const SUFFIXES = [
  '社区居民委员会',
  '村民委员会',
  '社区居委会',
  '居民委员会',
  '村委会',
  '居委会',
  '委员会',
  '社区',
  '村',
];

function normalizeName(name: string): string {
  let prev: string;
  do {
    prev = name;
    for (const s of SUFFIXES) {
      if (name.length > s.length && name.endsWith(s)) {
        name = name.slice(0, -s.length);
        break;
      }
    }
  } while (name !== prev);
  return name;
}

// ── upper join(stname-upper-plan 阶段 2) ─────────────────────────────

/** empty stats 工厂(降级报告用) */
function emptyUpperStats(): UpperLevelStats {
  return { matched: 0, unmatched: 0, duplicates: 0, coordMissing: 0 };
}

/** upper.json 占位(降级用,保持前端 fetch 不 404) */
function upperPlaceholder(): Record<string, unknown> {
  return {
    note: 'upper.json 未找到(run-stname --upper 未跑),省/市/县坐标不可用。本地运行 crawl:stname -- --upper 后重新构建可启用。',
    provinces: [] as CoordRow[],
    cities: [] as CoordRow[],
    counties: [] as CoordRow[],
  };
}

function toUpperRow(code: string, e: UpperEntry, coord: number[]): CoordRow {
  return {
    code,
    name: e.row.standard_name,
    coord: [coord[0], coord[1]],
    placeTypeCode: e.row.place_type_code,
    source: 'dmfw-stname',
  };
}

function pushSample(samples: string[], tag: string, e: UpperEntry): void {
  if (samples.length < 20) {
    samples.push(`${tag} ${e.provinceCode} ${e.row.area ?? '-'} ${e.row.standard_name}`);
  }
}

/**
 * upper join:把 stname 21200/21300/21400 自身坐标匹配到 NBS 12 位码。
 *
 * 匹配策略(计划「关键约束」+ 实测数据形态):
 *   1. 码精确:area 截前 4 位(市级)/6 位(县级)补零成 12 位码,且名称一致
 *      (6 位码可能冲突——廊坊 131003 曾同时挂安次/广阳——故码命中必须验名)
 *   2. 名称兜底:码不存在或验名不符时,在市域范围内按名称匹配
 *      (吸收 area 误标,如武宁县 area=360400999 挂在九江市级码下)
 *   3. 未匹配:如实记录,不臆造(雄安新区 NBS 无节点;和安县/和康县为 2024 新设)
 *
 * 输出按 NBS 12 位码去重(地名库缓存曾残留同码同名重复项,如奎文区),计 duplicates。
 */
export function joinUpper(upper: UpperFile, tree: TreeRow[]): UpperJoinResult {
  // NBS L1-L3 索引
  const l1ByName = new Map<string, string>(); // 名称 -> 码(省级名称全国唯一)
  const l2ByCode = new Map<string, string>(); // 12 位码 -> 名称
  const l2NameInProv = new Map<string, Map<string, string>>(); // 2 位省码 -> 名称 -> 码
  const l3ByCode = new Map<string, string>();
  const l3NameInCity = new Map<string, Map<string, string>>(); // 父 12 位码 -> 名称 -> 码
  let l2Total = 0;
  let l3Total = 0;
  for (const [code, name, level, parent] of tree) {
    if (level === 1) {
      l1ByName.set(name, code);
    } else if (level === 2) {
      l2ByCode.set(code, name);
      l2Total++;
      const prov = code.slice(0, 2);
      if (!l2NameInProv.has(prov)) l2NameInProv.set(prov, new Map());
      l2NameInProv.get(prov)!.set(name, code);
    } else if (level === 3) {
      l3ByCode.set(code, name);
      l3Total++;
      if (!l3NameInCity.has(parent)) l3NameInCity.set(parent, new Map());
      l3NameInCity.get(parent)!.set(name, code);
    }
  }

  const samples: string[] = [];

  // 省级:21200 的 area 是「110000999」形态,码无 12 位对应,直接名称匹配
  const provinces: CoordRow[] = [];
  const pStats = emptyUpperStats();
  const seenL1 = new Set<string>();
  for (const e of upper.provinces) {
    const code = l1ByName.get(e.row.standard_name);
    if (!code) {
      pStats.unmatched++;
      pushSample(samples, 'P', e);
      continue;
    }
    const coord = e.row.gdm?.coordinates?.[0];
    if (!coord || coord.length < 2) {
      pStats.coordMissing++;
      continue;
    }
    if (seenL1.has(code)) {
      pStats.duplicates++;
      continue;
    }
    seenL1.add(code);
    provinces.push(toUpperRow(code, e, coord));
    pStats.matched++;
  }

  // 市级:area 前 4 位补零成 12 位码精确(验名),失败按省内名称兜底
  const cities: CoordRow[] = [];
  const cStats = emptyUpperStats();
  const seenL2 = new Set<string>();
  for (const e of upper.cities) {
    const name = e.row.standard_name;
    const exact = e.row.area && e.row.area.length >= 4
      ? e.row.area.slice(0, 4).padEnd(12, '0')
      : null;
    let code: string | undefined;
    if (exact && l2ByCode.get(exact) === name) code = exact;
    if (!code) code = l2NameInProv.get(e.provinceCode)?.get(name);
    if (!code) {
      cStats.unmatched++;
      pushSample(samples, 'C', e);
      continue;
    }
    const coord = e.row.gdm?.coordinates?.[0];
    if (!coord || coord.length < 2) {
      cStats.coordMissing++;
      continue;
    }
    if (seenL2.has(code)) {
      cStats.duplicates++;
      continue;
    }
    seenL2.add(code);
    cities.push(toUpperRow(code, e, coord));
    cStats.matched++;
  }

  // 县级:area 前 6 位 + '000000' 精确(验名),失败按市域范围内名称兜底
  const counties: CoordRow[] = [];
  const kStats = emptyUpperStats();
  const seenL3 = new Set<string>();
  for (const e of upper.counties) {
    const name = e.row.standard_name;
    const exact = e.row.area && e.row.area.length >= 6
      ? e.row.area.slice(0, 6) + '000000'
      : null;
    let code: string | undefined;
    if (exact && l3ByCode.get(exact) === name) code = exact;
    if (!code) {
      const cityScope = e.row.area && e.row.area.length >= 4
        ? e.row.area.slice(0, 4).padEnd(12, '0')
        : null;
      code = cityScope ? l3NameInCity.get(cityScope)?.get(name) : undefined;
    }
    if (!code) {
      kStats.unmatched++;
      pushSample(samples, 'K', e);
      continue;
    }
    const coord = e.row.gdm?.coordinates?.[0];
    if (!coord || coord.length < 2) {
      kStats.coordMissing++;
      continue;
    }
    if (seenL3.has(code)) {
      kStats.duplicates++;
      continue;
    }
    seenL3.add(code);
    counties.push(toUpperRow(code, e, coord));
    kStats.matched++;
  }

  return {
    provinces,
    cities,
    counties,
    stats: { provinces: pStats, cities: cStats, counties: kStats },
    unmatchedSamples: samples,
    nbsUncovered: { l2: l2Total - seenL2.size, l3: l3Total - seenL3.size },
  };
}

async function main(): Promise<void> {
  await mkdir(`${OUT}/shards`, { recursive: true });

  // 1. 读 coords.json (CI 环境可能不存在，优雅降级输出空坐标)
  let coordsFile: CoordsFile;
  try {
    coordsFile = JSON.parse(await readFile(COORDS_JSON, 'utf-8')) as CoordsFile;
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      console.log(
        '⚠️  coords.json 不存在，输出空坐标分片（CI 环境或未运行 crawler:stname 时正常）'
      );
      // 输出占位产物，让前端 fetch 不 404
      await writeFile(`${OUT}/upper.json`, JSON.stringify(upperPlaceholder()));
      const report: JoinReport = {
        totalRows: 0,
        joined: 0,
        joinExact: 0,
        joinFallback: 0,
        missNoCoord: 0,
        missNoName: 0,
        joinRate: '0%',
        shardCount: 0,
        emptyShardCount: 0,
        missByCountyTop: [],
        upper: {
          available: false,
          provinces: emptyUpperStats(),
          cities: emptyUpperStats(),
          counties: emptyUpperStats(),
          unmatchedSamples: [],
          nbsUncovered: { l2: 0, l3: 0 },
        },
      };
      await writeFile(`${OUT}/join-report.json`, JSON.stringify(report, null, 2));
      console.log('✅ build-coords 完成（降级模式，无坐标数据）');
      return;
    }
    throw err;
  }

  const countyCodes = Object.keys(coordsFile.coords); // 6 位县级码
  const totalInput = countyCodes.reduce(
    (s, c) => s + coordsFile.coords[c].length,
    0
  );
  console.log(
    `coords.json: ${countyCodes.length} 县, ${totalInput} 条村级记录`
  );

  // 2. 逐县 join(按县级处理,每县读对应 shard)
  let totalRows = 0;
  let joined = 0;
  let joinExact = 0; // area 乡级精确匹配
  let joinFallback = 0; // 县级退化匹配
  let missNoCoord = 0; // gdm 缺失
  let missNoName = 0; // 县级也无匹配(含无 shard 整县)
  let shardCount = 0;
  let emptyShardCount = 0;
  const missByCounty = new Map<string, number>();

  for (const county6 of countyCodes) {
    const county12 = county6 + '000000';
    const shardPath = `${SHARDS_DIR}/${county12}.json`;

    // 读该县 shard,建乡级索引 + 县级村级索引
    let shard: ShardFile | null = null;
    try {
      shard = JSON.parse(await readFile(shardPath, 'utf-8')) as ShardFile;
    } catch {
      // 该县无 shard(NBS 额外县级等,coords 覆盖不到),整县无法 join
      const n = coordsFile.coords[county6].length;
      missNoName += n;
      missByCounty.set(county6, n);
      continue;
    }
    const townIndex = new Map<string, VillageRef[]>();
    const countyByName = new Map<string, string>(); // 归一名 -> 村码(同县同名取首)
    for (const [townCode, _townName, villages] of shard.t) {
      const refs = villages.map(([code, name]) => ({ code, name }));
      townIndex.set(townCode, refs);
      for (const v of refs) {
        const norm = normalizeName(v.name);
        if (!countyByName.has(norm)) countyByName.set(norm, v.code);
      }
    }

    // join 该县 coords 记录
    const rows: CoordRow[] = [];
    for (const rec of coordsFile.coords[county6]) {
      totalRows++;
      const coord = rec.gdm?.coordinates?.[0];
      if (!coord || coord.length < 2) {
        missNoCoord++;
        continue;
      }

      const normRec = normalizeName(rec.standard_name);

      // 1. area(9位)+"000" 乡级下精确匹配(首选;area 不对齐则跳过走 fallback)
      const townCode =
        rec.area && rec.area.length === 9 ? rec.area + '000' : null;
      const villages = townCode ? townIndex.get(townCode) : undefined;
      let hitCode: string | undefined;
      if (villages) {
        const hit = villages.find((v) => normalizeName(v.name) === normRec);
        if (hit) hitCode = hit.code;
      }

      // 2. 退化县级匹配(area 不对齐或乡级下无该名时,全县按归一名匹配)
      let viaFallback = false;
      if (!hitCode) {
        hitCode = countyByName.get(normRec);
        viaFallback = hitCode !== undefined;
      }

      if (!hitCode) {
        missNoName++;
        missByCounty.set(county6, (missByCounty.get(county6) ?? 0) + 1);
        continue;
      }

      if (viaFallback) joinFallback++;
      else joinExact++;

      rows.push({
        code: hitCode,
        name: rec.standard_name,
        coord: [coord[0], coord[1]],
        placeTypeCode: rec.place_type_code,
        source: 'dmfw-stname',
      });
      joined++;
    }

    // 输出该县分片(空县也输出空数组,保持与 shards/ 同构,前端 fetch 不 404)
    await writeFile(`${OUT}/shards/${county12}.json`, JSON.stringify(rows));
    if (rows.length > 0) shardCount++;
    else emptyShardCount++;
  }

  // 3. upper join:省/市/县自身坐标(stname 21200/21300/21400 → NBS 12 位码)
  //    .cache/upper.json 或 tree.json 缺失(CI 未跑 crawler)时保持占位降级,不阻断
  let upperJoin: UpperJoinResult | null = null;
  try {
    const upperFile = JSON.parse(await readFile(UPPER_JSON, 'utf-8')) as UpperFile;
    const tree = JSON.parse(await readFile(TREE_JSON, 'utf-8')) as TreeRow[];
    upperJoin = joinUpper(upperFile, tree);
    await writeFile(
      `${OUT}/upper.json`,
      JSON.stringify({
        provinces: upperJoin.provinces,
        cities: upperJoin.cities,
        counties: upperJoin.counties,
      })
    );
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') throw err;
    await writeFile(`${OUT}/upper.json`, JSON.stringify(upperPlaceholder()));
    console.log('⚠️  upper.json 或 tree.json 未找到，upper 保持占位（降级模式）');
  }

  // 4. join 损耗报告(规格 §12 最大不确定性;upper 段为计划阶段 2 口径)
  const u = upperJoin?.stats;
  const report: JoinReport = {
    totalRows,
    joined,
    joinExact,
    joinFallback,
    missNoCoord,
    missNoName,
    joinRate: totalRows > 0 ? `${((joined / totalRows) * 100).toFixed(2)}%` : '0%',
    shardCount,
    emptyShardCount,
    missByCountyTop: [...missByCounty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    upper: {
      available: upperJoin !== null,
      provinces: u?.provinces ?? emptyUpperStats(),
      cities: u?.cities ?? emptyUpperStats(),
      counties: u?.counties ?? emptyUpperStats(),
      unmatchedSamples: upperJoin?.unmatchedSamples ?? [],
      nbsUncovered: upperJoin?.nbsUncovered ?? { l2: 0, l3: 0 },
    },
  };
  await writeFile(`${OUT}/join-report.json`, JSON.stringify(report, null, 2));

  console.log(`\n=== build-coords 完成 ===`);
  console.log(`总记录: ${totalRows} | join 成功: ${joined} (${report.joinRate})`);
  console.log(
    `  精确匹配(area乡级): ${joinExact} | 县级退化: ${joinFallback}`
  );
  console.log(`  失败: 坐标缺失 ${missNoCoord} | 未匹配 ${missNoName}`);
  console.log(
    `分片输出: ${shardCount} 个(非空) + ${emptyShardCount} 个(空)`
  );
  if (upperJoin) {
    const { provinces: ps, cities: cs, counties: ks } = upperJoin.stats;
    console.log(
      `upper.json: ${upperJoin.provinces.length} 省 + ${upperJoin.cities.length} 市 + ${upperJoin.counties.length} 县坐标`
    );
    console.log(
      `  upper join: 未匹配 P:${ps.unmatched} C:${cs.unmatched} K:${ks.unmatched} | 重复码 K:${ks.duplicates} | 坐标缺失 P:${ps.coordMissing} C:${cs.coordMissing} K:${ks.coordMissing}`
    );
    console.log(
      `  NBS 未被覆盖: L2 ${upperJoin.nbsUncovered.l2} | L3 ${upperJoin.nbsUncovered.l3}(开发区/新区/管委会等)`
    );
  } else {
    console.log(`upper.json: 占位(降级模式,源数据未就绪)`);
  }
  console.log(`join 损耗报告: ${OUT}/join-report.json`);
}

// 入口守卫:bun/node 直跑时执行;被测试 import 时不执行(run-stname.ts 同模式)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack : String(e));
    process.exit(1);
  });
}
