/**
 * 坐标分片构建：把 stname 抓取的村级坐标(coords.json)join 进项目 12 位码体系，
 * 分片输出到 apps/web/public/data/coords/，供 InfoPanel 前端按需 fetch。
 *
 * 数据源：
 *   - packages/crawler/.cache/coords.json  stname 抓取的村级坐标(按 6 位县级码聚合)
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
 *   coords/upper.json                省+市级坐标(gap:run-stname 未抓省/市级自身,占位待补)
 *   coords/join-report.json          join 损耗量化报告
 *
 * 详见 specs/2026-07-18-dmfw-stname-coords-design.md §6/§7 + .claude/plans/build-coords-design.md
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = `${ROOT}apps/web/public/data/coords`;
const COORDS_JSON = `${ROOT}packages/crawler/.cache/coords.json`;
const SHARDS_DIR = `${ROOT}apps/web/public/data/shards`;

/** 坐标行(place-info-panel §5.2) */
interface CoordRow {
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

/** coords.json 单条记录(按 stname-types.ts 实测字段,只取 join 用到的) */
interface StnameRow {
  standard_name: string;
  place_type_code: string;
  gdm: { type: string; coordinates: number[][] } | null;
  /** 9 位乡级码(6 位县级 + 3 位乡级) */
  area: string | null;
}

/** coords.json 顶层结构 */
interface CoordsFile {
  meta: { stats: Record<string, number> };
  coords: Record<string, StnameRow[]>; // key = 6 位县级码
}

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

async function main(): Promise<void> {
  await mkdir(`${OUT}/shards`, { recursive: true });

  // 1. 读 coords.json
  const coordsFile = JSON.parse(await readFile(COORDS_JSON, 'utf-8')) as CoordsFile;
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

  // 3. upper.json 占位(gap:run-stname 未抓省/市级自身坐标)
  const upper = {
    note: 'gap:run-stname 仅抓县级下村级(21610/21620),省/市级自身坐标未采集。待扩展 run-stname 后填充。',
    provinces: [] as CoordRow[],
    cities: [] as CoordRow[],
  };
  await writeFile(`${OUT}/upper.json`, JSON.stringify(upper));

  // 4. join 损耗报告(规格 §12 最大不确定性)
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
  console.log(`upper.json: gap 占位(省/市级坐标待扩展 run-stname)`);
  console.log(`join 损耗报告: ${OUT}/join-report.json`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
