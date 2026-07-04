/**
 * divisions CSV 的列契约与字段转义——CSV **写入侧**的单一真相源。
 *
 * migrate / build-source / hydrate 三处写出同一格式的 divisions CSV，列顺序与转义规则
 * 原本各写一遍（易漂移）。统一在此，与 DATABASE_SCHEMA 的 divisions 列定义对齐。
 *
 * 读取侧刻意不收口：crawler 差分只需 5 字段、用零依赖手写解析；cli 注水需全 8 列、用
 * csv-parse 完整解析——用途与依赖取向不同，强行合并反而耦合，故各自保留。
 */

/** divisions 数据包 CSV 表头（列顺序即写入顺序，与 DATABASE_SCHEMA divisions 列一致；不含换行） */
export const DIVISIONS_CSV_HEADER =
  'code,name,level,parent_code,year,status,source_type,confidence_score';

/** CSV 字段转义：用双引号包裹并把 `"` 转义为 `""`（RFC4180）；实际仅 name 字段需要 */
export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
