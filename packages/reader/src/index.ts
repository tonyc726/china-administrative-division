/**
 * @cndiv/reader
 *
 * `cndiv hydrate` 产生的 cache.db 的最小**只读**查询封装。
 * 屏蔽两个高频踩坑：
 *   1. 复合主键 (code, year) —— 所有查询强制传 year，避免跨年命中多行。
 *   2. 直辖市/省直管占位中间层（level=2 且名 ∈ PLACEHOLDER_NAMES：市辖区 / 县 /
 *      省直辖县级行政区划 / 省直辖县级行政单位）—— getChildren 提供 skipPlaceholder 穿透。
 *
 * 设计：薄封装 better-sqlite3（预编译 prepared statement + 参数绑定，无字符串拼接，杜绝 SQL 注入）；
 * 硬编码只读、文件必须存在（未 hydrate 直接抛友好错误，而非静默返回空）；
 * 递归查询用 UNION（去重，遇脏 parent_code 成环时自然终止，不会无限递归）；
 * 出口把 DB 的 NULL 归一为 undefined，使返回值真正符合 @cndiv/core 的 Division 契约。
 *
 * 注：cndiv hydrate 注水的 cache.db 是自包含单文件（better-sqlite3 close 时自动 checkpoint
 * 并清除 -wal/-shm 边车），可直接拷贝/分发，reader 只读打开零边车依赖。
 */
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  Division,
  DivisionLevel,
  DivisionStatus,
  SourceType,
} from '@cndiv/core';

/** NBS 在直辖市/省直管处插入的 level=2 占位中间层名称（dmfw 扁平结构中不存在）。 */
export const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set([
  '市辖区',
  '县',
  '省直辖县级行政区划',
  '省直辖县级行政单位',
]);

const COLS =
  'code, name, level, parent_code, year, status, source_type, confidence_score, urban_rural_code';
const COLS_PREFIXED = COLS.split(', ')
  .map((c) => `d.${c}`)
  .join(', ');

/** better-sqlite3 行 → Division：把可空列的 SQL NULL 归一为 undefined（兑现 Division 的可选字段契约）。 */
function toDivision(row: Record<string, unknown>): Division {
  return {
    code: row.code as string,
    name: row.name as string,
    level: row.level as DivisionLevel,
    parent_code: (row.parent_code as string | null) ?? null,
    year: row.year as number,
    status: (row.status as DivisionStatus | null) ?? undefined,
    source_type: (row.source_type as SourceType | null) ?? undefined,
    confidence_score: (row.confidence_score as number | null) ?? undefined,
    urban_rural_code: (row.urban_rural_code as string | null) ?? undefined,
  };
}

const mapRows = (rows: unknown[]): Division[] =>
  rows.map((r) => toDivision(r as Record<string, unknown>));

export interface GetChildrenOptions {
  /**
   * 跳过直辖市/省直管的占位中间层（level=2 且名 ∈ PLACEHOLDER_NAMES），直接返回其真实下级。
   * 默认 false（返回原始直接子级）。仅穿透一层。
   */
  skipPlaceholder?: boolean;
}

export interface CnDivReader {
  /** 按码查某年快照（务必带 year——主键是复合 (code, year)）。无命中返回 null。 */
  findByCode(code: string, year: number): Division | null;
  /** 按精确名查某年所有同名节点。⚠️ name 无索引，全表扫描，大表慎用/请自建索引。 */
  findByName(name: string, year: number): Division[];
  /** 查直接子级（按 code 升序）；skipPlaceholder=true 时穿透 level=2 占位中间层。 */
  getChildren(
    parentCode: string,
    year: number,
    opts?: GetChildrenOptions
  ): Division[];
  /** 查某节点全部后代（递归 CTE，含各级、不含自身，按 code 升序）。 */
  getDescendants(code: string, year: number): Division[];
  /** 查直接父节点；省级（parent_code 为空）返回 null。 */
  getParent(code: string, year: number): Division | null;
  /** 查全部祖先链（从省到直接父级，按 level 升序，不含自身）。 */
  getAncestors(code: string, year: number): Division[];
  /** 查某层级全部节点（按 code 升序）。 */
  getByLevel(level: DivisionLevel, year: number): Division[];
  /** 查某年全部省级（level=1，等价 getByLevel(1, year)）。 */
  getProvinces(year: number): Division[];
  /** cache.db 里存在哪些年份快照（升序）。 */
  listYears(): number[];
  /** 关闭底层数据库连接（之后不应再调用查询方法）。 */
  close(): void;
}

/** 默认 cache.db 路径：~/.cndiv/cache.db（与 `cndiv hydrate` 默认缓存一致）。 */
export function defaultCachePath(): string {
  return join(homedir(), '.cndiv', 'cache.db');
}

/** 只读打开 cache.db；文件不存在则抛友好错误。 */
function openDb(dbPath: string): Database.Database {
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    throw new Error(
      `无法打开 cache.db（${dbPath}）：${(err as Error).message}。请先运行 cndiv hydrate 生成缓存库。`,
      { cause: err }
    );
  }
}

/**
 * 打开 cache.db 返回只读查询器。
 * @param dbPath 库路径，默认 ~/.cndiv/cache.db。
 * @throws 文件不存在（未 hydrate）或非有效缓存库（缺 divisions 表）——而非静默返回空。
 */
export function openCache(dbPath: string = defaultCachePath()): CnDivReader {
  const db = openDb(dbPath);
  try {
    const qByCode = db.prepare(
      `SELECT ${COLS} FROM divisions WHERE code = ? AND year = ?`
    );
    const qByName = db.prepare(
      `SELECT ${COLS} FROM divisions WHERE name = ? AND year = ? ORDER BY code`
    );
    const qChildren = db.prepare(
      `SELECT ${COLS} FROM divisions WHERE parent_code = ? AND year = ? ORDER BY code`
    );
    const qByLevel = db.prepare(
      `SELECT ${COLS} FROM divisions WHERE level = ? AND year = ? ORDER BY code`
    );
    // 递归用 UNION（非 UNION ALL）：按 code 去重，脏 parent_code 成环时自然终止。
    const qDescendants = db.prepare(
      `WITH RECURSIVE sub(code) AS (
         SELECT code FROM divisions WHERE code = @root AND year = @y
         UNION
         SELECT d.code FROM divisions d JOIN sub ON d.parent_code = sub.code WHERE d.year = @y
       )
       SELECT ${COLS_PREFIXED} FROM divisions d JOIN sub ON d.code = sub.code
       WHERE d.year = @y AND d.code != @root
       ORDER BY d.code`
    );
    const qAncestors = db.prepare(
      `WITH RECURSIVE up(code, parent_code) AS (
         SELECT code, parent_code FROM divisions WHERE code = @start AND year = @y
         UNION
         SELECT d.code, d.parent_code FROM divisions d JOIN up ON d.code = up.parent_code WHERE d.year = @y
       )
       SELECT ${COLS_PREFIXED} FROM divisions d JOIN up ON d.code = up.code
       WHERE d.year = @y AND d.code != @start
       ORDER BY d.level`
    );
    const qYears = db.prepare(
      'SELECT DISTINCT year FROM divisions ORDER BY year'
    );

    return {
      findByCode(code, year) {
        const row = qByCode.get(code, year);
        return row ? toDivision(row as Record<string, unknown>) : null;
      },
      findByName(name, year) {
        return mapRows(qByName.all(name, year));
      },
      getChildren(parentCode, year, o = {}) {
        const direct = mapRows(qChildren.all(parentCode, year));
        if (!o.skipPlaceholder) return direct;
        const out: Division[] = [];
        for (const child of direct) {
          if (child.level === 2 && PLACEHOLDER_NAMES.has(child.name)) {
            out.push(...mapRows(qChildren.all(child.code, year)));
          } else {
            out.push(child);
          }
        }
        return out;
      },
      getDescendants(code, year) {
        return mapRows(qDescendants.all({ root: code, y: year }));
      },
      getParent(code, year) {
        const self = qByCode.get(code, year) as
          | Record<string, unknown>
          | undefined;
        const parentCode =
          (self?.parent_code as string | null | undefined) ?? null;
        if (!parentCode) return null;
        const p = qByCode.get(parentCode, year);
        return p ? toDivision(p as Record<string, unknown>) : null;
      },
      getAncestors(code, year) {
        return mapRows(qAncestors.all({ start: code, y: year }));
      },
      getByLevel(level, year) {
        return mapRows(qByLevel.all(level, year));
      },
      getProvinces(year) {
        return mapRows(qByLevel.all(1, year));
      },
      listYears() {
        return (qYears.all() as Array<{ year: number }>).map((r) => r.year);
      },
      close() {
        db.close();
      },
    };
  } catch (err) {
    db.close(); // prepare 阶段失败：先释放句柄再抛，避免泄漏
    throw new Error(
      `cache.db 结构异常（${dbPath}）：${(err as Error).message}。请确认这是 cndiv hydrate 产生的有效缓存库（含 divisions 表）。`,
      { cause: err }
    );
  }
}
