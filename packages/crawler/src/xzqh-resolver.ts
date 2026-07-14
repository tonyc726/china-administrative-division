/**
 * 从注水 cache.db 构建 xzqh 变更抽取用的「名称→码」解析器。
 *
 * 生产级 resolver：基于 @cndiv/reader 读某年快照，排除市辖区/县等占位中间层。
 * 铁律「绝不臆造码」：候选唯一才返回；同名歧义一律记入 ambiguous 并返回 null 落人工。
 *
 * ## 限定名解析（2026-07 新增）
 *
 * 抽取器会产出带地级前缀的限定名（`三明市三元区`、`杭州市江干区`）——这是刻意的：
 * 全国有 3 个「三元区」候选级别的重名单元，裸名 `三元区` 会命中多候选而落人工。
 * 故解析分两步：
 *   1. 精确命中；
 *   2. 未命中则按 <前缀><子名> 试切，用**祖先链**里是否存在名为 `<前缀>` 的节点来消歧。
 * 前缀不是用来拼码的，是用来**排除**候选的——依旧一个码都不编。
 *
 * ## 前向解析（resolveRef）
 *
 * 新设实体（临平区/横州市）在基线年必然查无此名，但它们的官方码就写在更晚的权威快照里。
 * `resolveRef` 返回完整 DivisionRef（码/层级/父码全取自快照），供 establish 直接产出 add。
 */
import {
  openCache,
  defaultCachePath,
  PLACEHOLDER_NAMES,
  type CnDivReader,
} from '@cndiv/reader';
import type { DivisionLevel } from '@cndiv/core';
import type { CodeResolver, NewCodeResolver, DivisionRef } from '@cndiv/extractor';

export interface CacheResolver {
  /** 注入 extractPatch 的后向解析器（名称 → 码） */
  resolve: CodeResolver;
  /** 注入 extractPatch 的前向解析器（名称 → 完整记录，供 establish 产 add） */
  resolveRef: NewCodeResolver;
  /** 唯一名索引数 */
  size: number;
  /** 命中 >1 候选且无法用前缀消歧的名 → 全候选码（落人工，绝不臆造） */
  ambiguous: ReadonlyMap<string, string[]>;
  /** 实际使用的基线快照年 */
  snapshotYear: number;
  /** 关闭底层 cache.db 连接（避免 better-sqlite3 句柄泄漏） */
  close(): void;
}

const ALL_LEVELS: DivisionLevel[] = [1, 2, 3, 4, 5];

/**
 * 从 cache.db 某年快照构建解析器。
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
      throw new Error(
        `快照年 ${year} 不在 cache.db（可用: ${years.join(',')}）`
      );
    }

    /** 名称 → 候选码集合 */
    const byName = new Map<string, Set<string>>();
    /** 码 → 记录（用于祖先链回溯与 DivisionRef 组装） */
    const byCode = new Map<string, DivisionRef>();

    for (const level of ALL_LEVELS) {
      for (const d of db.getByLevel(level, year)) {
        if (d.status === 'deprecated') continue; // 只索引现役
        const name = d.name.trim();
        byCode.set(d.code, {
          code: d.code,
          name,
          level: d.level,
          parent_code: d.parent_code ?? '',
        });
        if (PLACEHOLDER_NAMES.has(name)) continue; // 占位层可作祖先，但不可被检索
        let set = byName.get(name);
        if (!set) {
          set = new Set();
          byName.set(name, set);
        }
        set.add(d.code);
      }
    }

    const ambiguous = new Map<string, string[]>();

    /** 该码的祖先链里是否存在名为 ancestorName 的节点 */
    const hasAncestorNamed = (code: string, ancestorName: string): boolean => {
      let cur = byCode.get(code)?.parent_code;
      // 12 位码最深 5 级，6 步足够兜底，同时防父子环导致死循环
      for (let hop = 0; hop < 6 && cur; hop++) {
        const node = byCode.get(cur);
        if (!node) return false;
        if (node.name === ancestorName) return true;
        cur = node.parent_code;
      }
      return false;
    };

    /**
     * 限定名消歧：把 `杭州市江干区` 试切成 <前缀><子名>，用祖先链筛候选。
     * 返回唯一命中码；零命中或仍多候选 → null。
     */
    const resolveQualified = (name: string): string | null => {
      for (let i = 2; i < name.length - 1; i++) {
        const prefix = name.slice(0, i);
        const child = name.slice(i);
        const candidates = byName.get(child);
        if (!candidates || candidates.size === 0) continue;
        const hit = [...candidates].filter((code) =>
          hasAncestorNamed(code, prefix)
        );
        if (hit.length === 1) return hit[0];
      }
      return null;
    };

    /** 核心解析：精确 → 唯一即返回；多候选或未命中 → 试限定名消歧 */
    const resolveCode = (raw: string): string | null => {
      const name = raw.trim();
      const codes = byName.get(name);

      if (codes && codes.size === 1) return [...codes][0];

      const qualified = resolveQualified(name);
      if (qualified) return qualified;

      if (codes && codes.size > 1) {
        ambiguous.set(name, [...codes]); // 多候选且前缀也救不了 → 落人工
      }
      return null; // 未命中 / 歧义未消 → unresolved，绝不臆造
    };

    const resolve: CodeResolver = (name) => resolveCode(name);
    const resolveRef: NewCodeResolver = (name) => {
      const code = resolveCode(name);
      return code ? (byCode.get(code) ?? null) : null;
    };

    return {
      resolve,
      resolveRef,
      size: byName.size,
      ambiguous,
      snapshotYear: year,
      close: () => db.close(),
    };
  } catch (e) {
    db.close(); // 构建失败先释放句柄再抛
    throw e;
  }
}
