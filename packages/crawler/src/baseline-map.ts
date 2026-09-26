/**
 * --baselines 按年选基线：解析与装载（run-verify 的纯逻辑层，独立成模块便于单测）。
 *
 * 背景：2026-09 事故——全年份 patch 共用单一 2023 码集，apply_after=2020-baseline 的
 * patch 被拿 2023 名册校验，必然误报 ADD_DUPLICATE / TARGET_MISSING（40 个存量 error）；
 * 而 CI 又因 baseline CSV 被 gitignore 静默降级，引用完整性从未真跑。按年选集即根治：
 * patch 声明哪年基线就喂哪年码集（实证：全量 8 份 patch 0 error）。
 */
import { stat } from 'fs/promises';
import { loadBaselineCsv } from './baseline.js';

/** --baselines 解析出的「基线年 → CSV 路径」映射 */
export type BaselineMap = Map<number, string>;

/** 解析 --baselines=2020=a.csv,2023=b.csv（不能复用 run-verify 的 get()：值里含 '='） */
export function parseBaselinesArg(raw: string): BaselineMap {
  const map: BaselineMap = new Map();
  for (const part of raw.split(',')) {
    const m = /^(\d{4})=(.+)$/.exec(part.trim());
    if (!m) {
      throw new Error(
        `--baselines 条目「${part}」不合法（应形如 2023=path/to/divisions.csv，逗号分隔多条）`
      );
    }
    const year = Number(m[1]);
    if (map.has(year)) throw new Error(`--baselines 中 ${year} 重复声明`);
    map.set(year, m[2]);
  }
  return map;
}

/**
 * 装载某年的基线码集。每 (year, csv) 只读一次（调用方缓存）；CSV 按 year 列过滤取该年快照。
 * 空（CSV 无该年行）视为基线缺失——单年 CSV 拿来滤别的年必然为空，属配置错误，不臆造降级。
 */
export async function loadYearCodes(
  baselines: BaselineMap,
  year: number
): Promise<{ ok: true; codes: Set<string> } | { ok: false; reason: string }> {
  const csv = baselines.get(year);
  if (csv === undefined) {
    return {
      ok: false,
      reason: `--baselines 未提供 ${year} 基线（值里补一条 ${year}=<csv>）`,
    };
  }
  if (!(await stat(csv).then(
    () => true,
    () => false
  ))) {
    return { ok: false, reason: `baseline CSV 不存在: ${csv}` };
  }
  const divisions = await loadBaselineCsv(csv);
  const codes = new Set(
    divisions.filter((d) => d.year === year).map((d) => d.code)
  );
  if (codes.size === 0) {
    return {
      ok: false,
      reason: `baseline ${csv} 无 ${year} 年行（码集为空，疑为单年 CSV 拿错/多年 CSV 缺该年）`,
    };
  }
  return { ok: true, codes };
}
