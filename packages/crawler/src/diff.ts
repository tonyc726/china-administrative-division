/**
 * 差分引擎：把"新抓取的区划快照"与"基线"对比，生成社区 Patch。
 *
 * 关键约束：dmfw 只到乡镇/街道（level 1-4），无村级（level 5）。
 * 因此差分默认只比对 level 1-4，避免把基线里的村全部误判为 remove。
 */
import type { Division } from '@cndiv/core';
import type { Patch, Operation } from '@cndiv/data-protocol';

export interface DiffOptions {
  author: string;
  source_url?: string;
  apply_after?: string;
  /** 参与比对的层级；默认 [1,2,3,4]（dmfw 覆盖范围） */
  levels?: number[];
}

export interface DiffResult {
  patch: Patch;
  /** 因 name 为空被跳过的节点数（dmfw 偶发 null name，无法产出合法 add/update） */
  skippedEmptyName: number;
}

/**
 * 生成从 baseline → current 的 Patch（add / update / move / remove）。
 * 仅比对 options.levels 指定的层级。返回 patch 及被跳过的空名节点数。
 */
export function diffToPatch(
  baseline: Division[],
  current: Division[],
  options: DiffOptions
): DiffResult {
  const levels = options.levels ?? [1, 2, 3, 4];
  const inScope = (d: Division): boolean => levels.includes(d.level);

  const base = new Map<string, Division>(
    baseline.filter(inScope).map((d) => [d.code, d])
  );
  const cur = new Map<string, Division>(
    current.filter(inScope).map((d) => [d.code, d])
  );

  const operations: Operation[] = [];
  let skippedEmptyName = 0;

  // 新增 / 变更
  for (const [code, d] of cur) {
    const prev = base.get(code);
    if (!prev) {
      // FMEA：dmfw 某些节点 name 可能为 null（crawlAll 兜底为 ''），无法产出合法 add
      //（AddOperationSchema.name = z.string().min(1)）→ 跳过空名节点，计入 skippedEmptyName
      if (!d.name) {
        skippedEmptyName++;
        continue;
      }
      operations.push({
        op: 'add',
        code,
        name: d.name,
        level: d.level,
        parent_code: d.parent_code,
      });
      continue;
    }
    // 仅当新名非空时才产出 update（同理避免空名 update 非法）
    if (prev.name !== d.name && d.name) {
      operations.push({ op: 'update', code, name: d.name });
    }
    const prevParent = prev.parent_code ?? null;
    const curParent = d.parent_code ?? null;
    if (prevParent !== curParent && curParent !== null) {
      operations.push({ op: 'move', code, new_parent: curParent });
    }
  }

  // 撤销（基线有、当前无）
  for (const code of base.keys()) {
    if (!cur.has(code)) {
      operations.push({
        op: 'remove',
        code,
        reason: 'not present in current dmfw snapshot',
      });
    }
  }

  return {
    patch: {
      meta: {
        author: options.author,
        source_url: options.source_url,
        evidence_confidence: 'high',
        apply_after: options.apply_after ?? '2023-baseline',
      },
      operations,
    },
    skippedEmptyName,
  };
}
