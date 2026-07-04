/**
 * 从注水 cache.db 构建 xzqh 变更抽取用的「名称→码」解析器（2.2）。
 *
 * 生产级 resolver：基于 @cndiv/reader 读某基线年快照，排除市辖区/县等占位中间层。
 * 铁律「绝不臆造码」：同名歧义（多候选）一律记入 ambiguous 并返回 null 落 unresolved，
 * 由人工按 parent 上下文指定，不自动猜码。
 *
 * 用一次性 getByLevel(1..5, year) 预载建内存索引，避免 reader.findByName 逐意图全表扫描。
 */
import {
  openCache,
  defaultCachePath,
  PLACEHOLDER_NAMES,
  type CnDivReader,
} from '@cndiv/reader';
import type { DivisionLevel } from '@cndiv/core';
import type { CodeResolver } from '@cndiv/extractor';

export interface CacheResolver {
  /** 注入 extractPatch 的解析器 */
  resolve: CodeResolver;
  /** 唯一名索引数 */
  size: number;
  /** 命中 >1 候选的名 → 全候选码（落人工，绝不臆造） */
  ambiguous: ReadonlyMap<string, string[]>;
  /** 实际使用的基线快照年 */
  snapshotYear: number;
  /** 关闭底层 cache.db 连接（避免 better-sqlite3 句柄泄漏） */
  close(): void;
}

const ALL_LEVELS: DivisionLevel[] = [1, 2, 3, 4, 5];

/**
 * 从 cache.db 某年快照构建 name→code 解析器。
 * @throws 库不存在 / 无年份 / 指定年不在库 —— 由调用方决定是否降级到 CSV/占位。
 */
export function buildCacheResolver(opts?: {
  dbPath?: string;
  snapshotYear?: number;
}): CacheResolver {
  const db: CnDivReader = openCache(opts?.dbPath ?? defaultCachePath());
  try {
    const years = db.listYears();
    if (years.length === 0) throw new Error('cache.db 无任何年份快照');
    const year = opts?.snapshotYear ?? Math.max(...years);
    if (!years.includes(year)) {
      throw new Error(`快照年 ${year} 不在 cache.db（可用: ${years.join(',')}）`);
    }

    const index = new Map<string, Set<string>>();
    for (const level of ALL_LEVELS) {
      for (const d of db.getByLevel(level, year)) {
        if (PLACEHOLDER_NAMES.has(d.name)) continue; // 排除市辖区/县占位层
        if (d.status === 'deprecated') continue; // 只索引现役
        const key = d.name.trim();
        let set = index.get(key);
        if (!set) {
          set = new Set();
          index.set(key, set);
        }
        set.add(d.code);
      }
    }

    const ambiguous = new Map<string, string[]>();
    const resolve: CodeResolver = (name) => {
      const codes = index.get(name.trim());
      if (!codes || codes.size === 0) return null; // not-found → unresolved
      if (codes.size === 1) return [...codes][0];
      ambiguous.set(name.trim(), [...codes]); // 多候选：记录 + 落 unresolved，绝不臆造
      return null;
    };

    return {
      resolve,
      size: index.size,
      ambiguous,
      snapshotYear: year,
      close: () => db.close(),
    };
  } catch (e) {
    db.close(); // 构建失败先释放句柄再抛
    throw e;
  }
}
