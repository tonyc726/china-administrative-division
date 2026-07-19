#!/usr/bin/env node
/**
 * stname/listPub 坐标采集运行器（本地首跑用）。
 *
 * 用法：
 *   # 1. 探针：验证接口端点 + 响应结构（首跑第一步，必跑）
 *   pnpm --filter @cndiv/crawler crawl:stname -- --probe --code=330282
 *
 *   # 2. 样本：跑前 50 个县，试探 WAF/并发/抖动/时长
 *   pnpm --filter @cndiv/crawler crawl:stname -- --limit=50 --concurrency=2 --cache-dir=.cache/stname --out=coords-sample.json
 *
 *   # 3. 全量
 *   pnpm --filter @cndiv/crawler crawl:stname -- --concurrency=2 --cache-dir=.cache/stname --out=coords.json
 *
 * 选项：
 *   --probe                 探针模式：只请求一个县一页，打印原始响应，不聚合不缓存
 *   --code=<6位码>          探针用的县级码（默认 330282 慈溪市）
 *   --limit=<N>             只跑前 N 个县（样本试探）
 *   --concurrency=<N>       并发请求数（对 dmfw 的实际并发），默认 2
 *   --delay=<ms>            每请求间隔（礼貌限速），默认 800
 *   --cache-dir=<dir>       断点续爬缓存目录（按 code@type 存原始响应）
 *   --out=<file>            产物输出路径（按县级码聚合的原始坐标 JSON）
 *   --counties-file=<file>  县级码列表文件（每行一个 6 位码）；缺省用 dmfw 实时拉取
 *   --batch-size=<N>       分批写产物的批次大小，默认 100（每 N 任务原子写一次，中断可续跑）
 *
 * 首跑量化目标：
 *   1. WAF 行为：能否拿到数据、封禁率（探针 + 样本）
 *   2. 并发上限：多少并发稳定（样本，逐步加并发）
 *   3. 抖动率：total=0 比例（onJitter 计数）
 *   4. 实际时长（样本外推全量）
 *   5. 坐标覆盖率：gdm 缺失率（采样口径，对 NBS level5）
 *
 * 本运行器只产出「按县级码聚合的原始坐标（已口径过滤）」；join 进项目 12 位码
 * 体系与分片输出留给 build-coords.ts（见规格 §6/§7）。
 */
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import path from 'path';
import { crawlAll } from './crawl-all.js';
import {
  mapPool,
  StnameCache,
  probeStname,
  fetchStnameStable,
  filterByKeptTypes,
} from './stname.js';
import { KEEP_TYPES, type StnameRow } from './stname-types.js';

const args = process.argv.slice(2);
const get = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];
const has = (key: string): boolean => args.includes(`--${key}`);

/** 县级 level=3（用字面量避免引入 core 枚举依赖；与 DIVISION_LEVEL.COUNTY 等价） */
const COUNTY_LEVEL = 3;

interface RunStats {
  counties: number;
  tasks: number;
  fetched: number;
  cached: number;
  jitter: number;
  failures: number;
  rows: number;
  coordMissing: number;
  /** 27xxx 被过滤掉的条数（含双登去重） */
  filtered27: number;
}

/** 探针：请求一个县一页，打印原始响应（状态码 + body 片段），验证接口契约 */
async function probe(code: string): Promise<void> {
  console.log(`[probe] POST stname/listPub  code=${code} type=21610 page=1 size=100`);
  try {
    const { status, body } = await probeStname(code, '21610');
    console.log(`[probe] HTTP ${status}  (body ${body.length} 字)`);
    console.log('[probe] body 前 2000 字:');
    console.log(body.slice(0, 2000));
    try {
      const parsed = JSON.parse(body);
      console.log('\n[probe] JSON 顶层字段:', Object.keys(parsed));
      if ('total' in parsed) console.log('[probe] total =', parsed.total);
      const arr = Array.isArray(parsed.records)
        ? parsed.records
        : Array.isArray(parsed.rows)
          ? parsed.rows
          : null;
      if (arr) {
        const key = Array.isArray(parsed.records) ? 'records' : 'rows';
        console.log(`[probe] ${key}[0] 字段:`, arr[0] ? Object.keys(arr[0]) : '空数组');
      }
    } catch {
      console.log('\n[probe] 非 JSON（可能是 HTML 错误页 / WAF 挑战页）');
    }
    if (status === 403)
      console.log('[probe] 403 -> WAF 拒（检查 UA/Referer/是否境外 IP）');
    if (status === 404)
      console.log('[probe] 404 -> 端点路径错，修正 stname.ts 的 STNAME_ENDPOINT');
  } catch (err) {
    console.log(`[probe] ✗ 网络错误: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

/** 获取县级码列表（6 位）。优先 --counties-file，缺省用 dmfw crawlAll 实时拉取。 */
async function fetchCountyCodes(options: {
  countiesFile?: string;
  cacheDir?: string;
}): Promise<string[]> {
  if (options.countiesFile) {
    const text = await readFile(options.countiesFile, 'utf-8');
    const codes = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`县级码来源：${options.countiesFile}（${codes.length} 条）`);
    return codes;
  }
  console.log('县级码来源：dmfw xzqh/getList 实时拉取（maxLevel=3，过滤 level=3）...');
  const xzqhCache = options.cacheDir
    ? path.join(options.cacheDir, 'xzqh')
    : undefined;
  const { divisions, failures } = await crawlAll('', {
    year: 2026,
    maxLevel: COUNTY_LEVEL,
    concurrency: 6,
    cacheDir: xzqhCache,
    stabilize: { criticalMaxLevel: 1 },
  });
  const codes = divisions
    .filter((d) => d.level === COUNTY_LEVEL)
    .map((d) => d.code.slice(0, 6));
  const unique = [...new Set(codes)];
  console.log(
    `县级码：${unique.length} 条${failures.length ? `（⚠ 区划树抓取失败 ${failures.length} 节点，对应县将缺席）` : ''}`
  );
  return unique;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(2)}%` : 'n/a';
}

/**
 * 分批写产物（原子：tmp + rename，中断不留半文件）。
 * Promise 链串行化避免并发 worker 同时写同一 outPath 冲突。
 * 中断后：outPath 是最近一次完整快照（可能缺末尾 < batchSize 个），缓存 .cache/stname/
 * 已落盘的任务重跑走缓存跳过，续抓补全后最终 outPath 完整。
 */
let saveChain: Promise<void> = Promise.resolve();
function saveOut(
  outPath: string,
  results: Map<string, StnameRow[]>,
  stats: RunStats,
  done: number,
  total: number,
  elapsedSec: number
): void {
  saveChain = saveChain
    .then(async () => {
      const payload = {
        meta: {
          fetchedAt: new Date().toISOString(),
          stats,
          progress: `${done}/${total}`,
          elapsedSec,
          note: '原始坐标（已口径过滤 21610+21620），未 join 12 位码、未分片。分批写出，中断可续跑（缓存 .cache/stname/）。',
        },
        coords: Object.fromEntries(results),
      };
      await mkdir(path.dirname(outPath), { recursive: true });
      const tmp = `${outPath}.tmp`;
      await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8');
      await rename(tmp, outPath);
    })
    .catch((e: unknown) =>
      console.error(`  ⚠ 产物写出失败: ${e instanceof Error ? e.message : e}`)
    );
}

async function main(): Promise<void> {
  if (has('probe')) {
    await probe(get('code') ?? '330282');
    return;
  }

  const concurrency = Number(get('concurrency') ?? 2);
  const delayMs = Number(get('delay') ?? 800);
  const limit = get('limit') ? Number(get('limit')) : undefined;
  const cacheDir = get('cache-dir');
  const outPath = get('out');
  const countiesFile = get('counties-file');
  /** 分批写产物的批次大小（每 N 个任务写一次，中断可续跑） */
  const batchSize = Number(get('batch-size') ?? 100);

  const countyCodes = await fetchCountyCodes({ countiesFile, cacheDir });
  const scoped = limit ? countyCodes.slice(0, limit) : countyCodes;
  console.log(
    `\n抓取 ${scoped.length}/${countyCodes.length} 个县（并发=${concurrency}，间隔=${delayMs}ms）...`
  );

  const cache = cacheDir ? new StnameCache(cacheDir) : null;
  // 任务粒度：(code, type)，直接控制对 dmfw 的实际并发
  const tasks: Array<{ code: string; type: string }> = [];
  for (const code of scoped) {
    for (const type of KEEP_TYPES) tasks.push({ code, type });
  }

  const stats: RunStats = {
    counties: scoped.length,
    tasks: tasks.length,
    fetched: 0,
    cached: 0,
    jitter: 0,
    failures: 0,
    rows: 0,
    coordMissing: 0,
    filtered27: 0,
  };
  const results = new Map<string, StnameRow[]>();
  const failures: Array<{ code: string; type: string; error: string }> = [];
  const startedAt = Date.now();
  let done = 0;

  function accumulate(code: string, raw: StnameRow[]): void {
    const kept = filterByKeptTypes(raw);
    stats.filtered27 += raw.length - kept.length;
    stats.rows += kept.length;
    stats.coordMissing += kept.filter((r) => !r.gdm).length;
    const prev = results.get(code);
    if (prev) prev.push(...kept);
    else results.set(code, [...kept]);
  }

  await mapPool(tasks, concurrency, async ({ code, type }) => {
    if (cache) {
      const hit = await cache.get(code, type);
      if (hit) {
        stats.cached++;
        accumulate(code, hit);
        done++;
        return;
      }
    }
    try {
      const raw = await fetchStnameStable(code, type, {
        delayMs,
        onJitter: () => stats.jitter++,
      });
      stats.fetched++;
      // 毒缓存防线：只缓存非空结果（空可能是抖动，不固化）
      if (cache && raw.length > 0) await cache.set(code, type, raw);
      accumulate(code, raw);
    } catch (err) {
      stats.failures++;
      failures.push({
        code,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    done++;
    if (done % 25 === 0 || done === tasks.length) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = elapsedSec > 0 ? (done / elapsedSec).toFixed(1) : '0';
      console.log(
        `  进度 ${done}/${tasks.length} | 抓 ${stats.fetched} 缓存 ${stats.cached} 抖 ${stats.jitter} 失败 ${stats.failures} | ${elapsedSec.toFixed(0)}s @ ${rate} req/s`
      );
    }
    // 分批写产物（每 batchSize 个任务，原子写，中断可续跑）
    if (outPath && (done % batchSize === 0 || done === tasks.length)) {
      saveOut(
        outPath,
        results,
        stats,
        done,
        tasks.length,
        (Date.now() - startedAt) / 1000
      );
    }
  });

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n=== 完成 (${elapsedSec}s) ===`);
  console.log(`县级码: ${stats.counties}`);
  console.log(
    `任务: ${stats.tasks} | 抓取 ${stats.fetched} | 缓存命中 ${stats.cached}`
  );
  console.log(
    `抖动(total=0重试): ${stats.jitter} | 失败: ${stats.failures}`
  );
  console.log(
    `地名记录(已过滤27xxx): ${stats.rows} | 其中27xxx过滤: ${stats.filtered27}`
  );
  console.log(
    `坐标缺失(gdm=null): ${stats.coordMissing} (${pct(stats.coordMissing, stats.rows)})`
  );
  if (stats.rows > 0) {
    console.log(`平均每县: ${(stats.rows / stats.counties).toFixed(1)} 条`);
  }
  if (failures.length > 0) {
    console.log(`\n失败明细 (前 20):`);
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.code}@${f.type}: ${f.error}`);
    }
    if (failures.length > 20) console.log(`  ... 共 ${failures.length} 条`);
  }

  if (outPath) {
    // 等所有分批写完成（最终一次已在 done===tasks.length 触发）
    await saveChain;
    console.log(`\n产物写出: ${outPath}（含 ${stats.rows} 条，分批原子写）`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
