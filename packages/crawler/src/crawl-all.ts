/**
 * 全量并发抓取：逐层 BFS + 每层并发池限流 + 文件缓存断点续爬。
 *
 * 相比 dmfw.ts 里串行的 crawl()，本模块面向全国全量场景：
 * - 每层用 mapPool 限制并发请求数（默认 6），避免触发反爬
 * - cacheDir 提供时启用断点续爬（重跑跳过已抓节点）
 */
import { fetchChildren, type DmfwNode } from './dmfw.js';
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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 固定并发数地 map 一组任务（无外部依赖） */
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
export async function crawlAll(rootCode: string, options: CrawlAllOptions): Promise<CrawlAllResult> {
  const { year, maxLevel = 4, concurrency = 6, delayMs = 60, cacheDir } = options;
  const cache = cacheDir ? new FsCache(cacheDir) : null;

  const divisions: Division[] = [];
  const failures: string[] = [];
  let fetched = 0;
  let cached = 0;

  const fetchWithCache = async (code: string): Promise<DmfwNode[]> => {
    if (cache) {
      const hit = await cache.get(code);
      if (hit) {
        cached++;
        return hit;
      }
    }
    const children = await fetchChildren(code);
    fetched++;
    if (cache) await cache.set(code, children);
    if (delayMs > 0) await delay(delayMs);
    return children;
  };

  let frontier: string[] = [rootCode];
  for (let depth = 0; depth < maxLevel; depth++) {
    const wave = await mapPool(frontier, concurrency, async (code) => {
      try {
        return { code, children: await fetchWithCache(code) };
      } catch {
        failures.push(code);
        return { code, children: [] as DmfwNode[] };
      }
    });

    const nextFrontier: string[] = [];
    for (const { code, children } of wave) {
      const parentCode = code === '' ? null : code;
      for (const node of children) {
        divisions.push({
          code: node.code,
          name: node.name ?? '',
          level: node.level as DivisionLevel,
          parent_code: parentCode,
          year,
          source_type: SOURCE_TYPE.MCA_DECREE,
          confidence_score: 90,
        });
        if (node.level < maxLevel) nextFrontier.push(node.code);
      }
    }

    options.onWave?.(depth + 1, frontier.length, divisions.length);
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return { divisions, failures, fetched, cached };
}
