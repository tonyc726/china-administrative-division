/**
 * 全量并发抓取：BFS（步长=2）+ 每波并发池限流 + 文件缓存断点续爬。
 *
 * 相比 dmfw.ts 里串行的 crawl()，本模块面向全国全量场景：
 * - 每波用 mapPool 限制并发请求数（默认 6），避免触发反爬
 * - 单次 getList 用 maxLevel=2 抓两层（子+孙），BFS 步长从 1 提到 2，
 *   全国全量请求从 ~3200 降到 ~342；产出与旧 maxLevel=1 逐条一致
 * - cacheDir 提供时启用断点续爬（重跑跳过已抓节点）
 */
import { fetchChildren, DMFW_MAX_LEVEL, type DmfwNode } from './dmfw.js';
import { FsCache } from './cache.js';
import { SOURCE_TYPE, type Division, type DivisionLevel } from '@cndiv/core';

export interface CrawlAllOptions {
  /** 数据年份 */
  year: number;
  /** 最深层级（1省…4乡镇街道），默认 4 */
  maxLevel?: number;
  /** 并发请求数，默认 6 */
  concurrency?: number;
  /** 每次"真实网络请求"后等待毫秒（限速），默认 60 */
  delayMs?: number;
  /** 缓存目录；提供则启用断点续爬 */
  cacheDir?: string;
  /** 每层完成回调 */
  onWave?: (level: number, frontierSize: number, total: number) => void;
}

export interface CrawlAllResult {
  divisions: Division[];
  /** 抓取失败的节点 code（部分容错） */
  failures: string[];
  /** 实际网络请求数 */
  fetched: number;
  /** 命中缓存数 */
  cached: number;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 固定并发数地 map 一组任务（无外部依赖） */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/**
 * 从 rootCode（''=全国）逐层并发抓取整棵区划树，展开为扁平 Division[]。
 */
export async function crawlAll(
  rootCode: string,
  options: CrawlAllOptions
): Promise<CrawlAllResult> {
  const {
    year,
    maxLevel = 4,
    concurrency = 6,
    delayMs = 60,
    cacheDir,
  } = options;
  const cache = cacheDir ? new FsCache(cacheDir) : null;

  const divisions: Division[] = [];
  const failures: string[] = [];
  let fetched = 0;
  let cached = 0;

  // 单次请求跨度：步长=2。用 maxLevel=2 一次抓取根的「子+孙」两层。
  const span = DMFW_MAX_LEVEL;

  const fetchWithCache = async (code: string): Promise<DmfwNode[]> => {
    if (cache) {
      const hit = await cache.get(code, span);
      if (hit) {
        cached++;
        return hit;
      }
    }
    const children = await fetchChildren(code, span);
    fetched++;
    if (cache) await cache.set(code, span, children);
    if (delayMs > 0) await delay(delayMs);
    return children;
  };

  // 展平一个 DmfwNode 为 Division 并 push（parent_code 由抓取树的真实父给出）。
  const push = (node: DmfwNode, parentCode: string | null): void => {
    divisions.push({
      code: node.code,
      name: node.name ?? '',
      level: node.level as DivisionLevel,
      parent_code: parentCode,
      year,
      source_type: SOURCE_TYPE.MCA_DECREE,
      confidence_score: 90,
    });
  };

  // 已作为「抓取根」请求过的 code，杜绝重复抓取（去重）。
  const requested = new Set<string>();
  let frontier: string[] = [rootCode];
  let wave = 0;

  while (frontier.length > 0) {
    // 过滤本波中已请求过的 code（去重后再发请求）。
    const batch = frontier.filter((code) => !requested.has(code));
    for (const code of batch) requested.add(code);
    if (batch.length === 0) break;

    const results = await mapPool(batch, concurrency, async (code) => {
      try {
        return { code, children: await fetchWithCache(code) };
      } catch {
        failures.push(code);
        return { code, children: [] as DmfwNode[] };
      }
    });

    const nextFrontier: string[] = [];
    // 递归展平一次 maxLevel=2 抓取返回的子树。
    //
    // 关键：dmfw 的 maxLevel 以「绝对 level 值」截断（返回 level ≤ 根level+2 的后代），
    // 而非树深度。遇到跳级（直辖市 L1 直挂 L3 区、省直管县）时，返回的直接子已触顶、
    // 其子被截断为空。故入队判据不能靠「树深度=孙」，而应看「本次返回的 children 是否为空」：
    // - children 非空 → 其子已随本次抓取取回，无需再抓（不入队）；
    // - children 为空 且 level<maxLevel → 截断前沿或真实叶子，入下一波再抓
    //   （若是真实叶子，重抓返回空、无害，与旧 maxLevel=1 逐层抓的语义一致）。
    const walk = (node: DmfwNode, parentCode: string | null): void => {
      push(node, parentCode);
      if (node.children.length > 0) {
        for (const child of node.children) walk(child, node.code);
      } else if (node.level < maxLevel) {
        nextFrontier.push(node.code);
      }
    };
    for (const { code, children } of results) {
      const rootParent = code === '' ? null : code;
      for (const child of children) walk(child, rootParent);
    }

    wave += 1;
    options.onWave?.(wave, batch.length, divisions.length);
    frontier = nextFrontier;
  }

  return { divisions, failures, fetched, cached };
}
