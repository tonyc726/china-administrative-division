/**
 * 全量并发抓取：BFS（步长=2）+ 每波并发池限流 + 文件缓存断点续爬 + 抖动稳定化。
 *
 * 相比 dmfw.ts 里串行的 crawl()，本模块面向全国全量场景：
 * - 每波用 mapPool 限制并发请求数（默认 6），避免触发反爬
 * - 单次 getList 用 maxLevel=2 抓两层（子+孙），BFS 步长从 1 提到 2，
 *   全国全量请求从 ~3200 降到 ~342；产出与旧 maxLevel=1 逐条一致
 * - cacheDir 提供时启用断点续爬（重跑跳过已抓节点）
 * - 可选抖动稳定化（stabilize/baseline）：对抗 dmfw「HTTP 200 但 children 被截断」
 *   的非确定性丢子树。浅层（全国根）无条件多抓取 UNION；内部节点仅在「相对基线收缩」
 *   时才重抓。不传 stabilize/baseline 时行为与单抓完全一致（向后兼容）。
 */
import {
  fetchChildren,
  unionChildren,
  DMFW_MAX_LEVEL,
  type DmfwNode,
} from './dmfw.js';
import { FsCache } from './cache.js';
import { SOURCE_TYPE, type Division, type DivisionLevel } from '@cndiv/core';

/** 抖动稳定化配置（全部 opt-in；不传则不启用浅层多抓） */
export interface StabilizeConfig {
  /** level≤此值的抓取根强制多抓取 UNION，默认 0（仅全国根 level=0） */
  criticalMaxLevel?: number;
  /** 关键节点最大抓取次数，默认 3 */
  criticalAttempts?: number;
  /** 基线异常节点最大额外抓取次数，默认 2 */
  anomalyAttempts?: number;
  /** 根省级数量下限 sanity，默认 31（root union 少于此值记入 jitter 告警） */
  minRootChildren?: number;
}

/** 一次抖动事件：某节点多抓过程中子数量的变化与恢复量 */
export interface JitterEvent {
  code: string;
  level: number;
  /** 逐次抓取的直接子数量 */
  counts: number[];
  /** UNION 相对首抓恢复的子节点数 */
  recovered: number;
  reason: 'critical' | 'baseline-shrink';
  /** 仅 root 且 union 少于 minRootChildren 时为 true（省级数量异常） */
  rootUndersized?: boolean;
}

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
  /** 每波完成回调（wave 为波次号，每波抓 2 层） */
  onWave?: (wave: number, frontierSize: number, total: number) => void;
  /** 抖动稳定化配置；提供则对浅层/关键节点多抓 UNION */
  stabilize?: StabilizeConfig;
  /**
   * 上次成功产出的基线：code→期望直接子 code 集（用 buildBaseline 构建）。
   * 仅用于「检测收缩、触发重抓」，绝不把基线节点注入输出（防幽灵复活）。
   */
  baseline?: Map<string, Set<string>>;
}

export interface CrawlAllResult {
  divisions: Division[];
  /** 抓取失败的节点 code（部分容错） */
  failures: string[];
  /** 实际网络请求数 */
  fetched: number;
  /** 命中缓存数 */
  cached: number;
  /** 抖动事件（多抓恢复了子树、或 root 省级数量异常） */
  jitter: JitterEvent[];
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
 * 从一次成功产出的 Division[] 构建基线索引：parent_code → 直接子 code 集。
 * key='' 表示全国根的省集（天然护住根层）。供下次 crawlAll 的 baseline 参数使用。
 */
export function buildBaseline(divisions: Division[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const d of divisions) {
    const p = d.parent_code ?? '';
    let set = m.get(p);
    if (!set) {
      set = new Set();
      m.set(p, set);
    }
    set.add(d.code);
  }
  return m;
}

/**
 * 判断本次抓取的 union 相对基线是否「收缩」（基线有、本次缺）。
 * 同时查直接子与孙层：span=2 一次请求带回县+乡镇，故乡镇缺失也复用同一次市级重抓。
 */
function shrunkVsBaseline(
  code: string,
  union: DmfwNode[],
  baseline?: Map<string, Set<string>>
): boolean {
  if (!baseline) return false;
  const direct = baseline.get(code);
  if (direct) {
    const have = new Set(union.map((n) => n.code));
    for (const c of direct) if (!have.has(c)) return true;
  }
  for (const ch of union) {
    const grand = baseline.get(ch.code);
    if (grand) {
      const have = new Set(ch.children.map((x) => x.code));
      for (const c of grand) if (!have.has(c)) return true;
    }
  }
  return false;
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
    stabilize,
    baseline,
  } = options;
  const cache = cacheDir ? new FsCache(cacheDir) : null;

  const divisions: Division[] = [];
  const failures: string[] = [];
  const jitter: JitterEvent[] = [];
  let fetched = 0;
  let cached = 0;

  // 单次请求跨度：步长=2。用 maxLevel=2 一次抓取根的「子+孙」两层。
  const span = DMFW_MAX_LEVEL;
  const anomalyAttempts = stabilize?.anomalyAttempts ?? 2;
  const minRootChildren = stabilize?.minRootChildren ?? 31;

  /**
   * 稳定化抓取：视节点关键性多抓取并取 UNION，补齐 dmfw 抖动被截断的子树。
   * - critical（浅层，需 stabilize）：无条件多抓，连续无新增即收敛。
   * - 内部节点（有 baseline）：仅当相对基线收缩才重抓，稳态零额外成本。
   * - 二者皆无：单抓（与旧行为一致）。
   * 缓存写入「稳定化后的 UNION」，杜绝毒缓存被断点续爬复现。
   */
  const fetchStable = async (
    code: string,
    level: number
  ): Promise<DmfwNode[]> => {
    if (cache) {
      const hit = await cache.get(code, span);
      if (hit) {
        cached++;
        return hit;
      }
    }
    const critical = !!stabilize && level <= (stabilize.criticalMaxLevel ?? 0);
    const maxAttempts = critical
      ? (stabilize?.criticalAttempts ?? 3)
      : baseline
        ? 1 + anomalyAttempts
        : 1;
    const minAttempts = critical ? 2 : 1;

    const counts: number[] = [];
    let union: DmfwNode[] = [];
    let attempt = 0;
    let prev = -1;
    while (attempt < maxAttempts) {
      let round: DmfwNode[];
      try {
        round = await fetchChildren(code, span);
      } catch (err) {
        if (attempt === 0) throw err; // 首抓失败 → 交上层记 failure
        break; // 后续抓取失败 → 用已有 union（部分容错）
      }
      fetched++;
      if (delayMs > 0) await delay(delayMs);
      counts.push(round.length);
      union = attempt === 0 ? round : unionChildren(union, round);
      const grew = union.length !== prev;
      prev = union.length;
      attempt++;
      if (attempt < minAttempts) continue;
      if (critical) {
        if (!grew) break; // 连续无新增 → 收敛
      } else {
        if (!shrunkVsBaseline(code, union, baseline)) break; // 基线已覆盖 → 停
        if (!grew) break; // 收敛但仍缺 → 判真实撤销，停
      }
    }

    const rootUndersized =
      code === rootCode && critical && union.length < minRootChildren;
    if (counts.length > 1) {
      const recovered = union.length - counts[0];
      if (recovered > 0 || critical) {
        jitter.push({
          code,
          level,
          counts,
          recovered,
          reason: critical ? 'critical' : 'baseline-shrink',
          ...(rootUndersized ? { rootUndersized: true } : {}),
        });
      }
    }
    if (cache) await cache.set(code, span, union);
    return union;
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
  // frontier 携带 level，供稳定化按层判定关键性；root level=0。
  let frontier: Array<{ code: string; level: number }> = [
    { code: rootCode, level: 0 },
  ];
  let wave = 0;

  while (frontier.length > 0) {
    // 过滤本波中已请求过的 code（去重后再发请求）。
    const batch = frontier.filter((it) => !requested.has(it.code));
    for (const it of batch) requested.add(it.code);
    if (batch.length === 0) break;

    const results = await mapPool(batch, concurrency, async (it) => {
      try {
        return {
          code: it.code,
          children: await fetchStable(it.code, it.level),
        };
      } catch {
        failures.push(it.code);
        return { code: it.code, children: [] as DmfwNode[] };
      }
    });

    const nextFrontier: Array<{ code: string; level: number }> = [];
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
        nextFrontier.push({ code: node.code, level: node.level });
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

  return { divisions, failures, fetched, cached, jitter };
}
