/**
 * 多管线 patch 合并去重（2.3）。
 *
 * 两条采集管线（dmfw 全量差分、xzqh 事件流）与社区提交都落 `patches/<year>/*.json`，
 * 但 apply-patch 一次只吃一个文件、无跨文件去重/冲突检测。本模块提供**纯函数** `mergePatches`：
 * - 冲突键 = `code`：同一 code 被多管线触碰时，按优先级 `xzqh > community > dmfw` 取胜者，
 *   败者该 code 上的**所有** op 整组落 `conflicts`（sidecar 报告，绝不静默丢弃）。
 * - `add` vs `remove` 同 code：保留 `add`（新设优先于缺失撤销），`remove` 落 conflicts。
 * - 完全相同的 op（跨文件重复）去重，计入 `deduped`。
 * - 输出 op 恒定排序 `add→move→update→remove`，再按 code 升序 → 可复现、可 diff。
 * - 幂等：`mergePatches` 的产物再次单独喂入，输出不变。
 *
 * 设计（Occam）：冲突按 code 整组取舍，不做字段级合并（正交 op 连带丢弃的风险由报告显式列出）；
 * 管线来源不写进 schema（避免改两个 producer），由调用方（CLI）按文件名/author 启发式判定后显式传入。
 */
import {
  PATCH_OPERATION,
  validatePatch,
  type Operation,
  type Patch,
} from './schemas/patch.js';
import { CONFIDENCE_LEVELS, type SourcePipeline } from './schemas/patch.js';

/** 采集管线来源（与 patch meta.source_pipeline 同一真相源）。优先级默认 xzqh > community > dmfw。 */
export type Pipeline = SourcePipeline;

/** 一个待合并输入：一份 patch + 其管线来源标签（由调用方判定）。 */
export interface MergeInput {
  patch: Patch;
  pipeline: Pipeline;
  /** 可选来源标识（文件名等），仅用于冲突报告可读性 */
  origin?: string;
}

/** 一条被舍弃的 op（冲突 sidecar，供人工复核）。 */
export interface MergeConflict {
  code: string;
  /** 被舍弃的操作 */
  dropped: Operation;
  /** 败者管线 */
  losingPipeline: Pipeline;
  /** 胜者管线（add-remove 抵消时为 undefined） */
  winningPipeline?: Pipeline;
  reason: 'lower-priority' | 'add-remove-cancel';
  origin?: string;
}

export interface MergeResult {
  /** 合并成品（保证过 validatePatch，除非零 op —— 见 empty 标志） */
  patch: Patch;
  /** 被舍弃的 op 清单（无静默丢弃） */
  conflicts: MergeConflict[];
  /** 去重掉的完全相同 op 数 */
  deduped: number;
  /** 合并后无任何 op（PatchSchema 要求 ≥1，此时 patch.operations 为空、需调用方跳过写盘） */
  empty: boolean;
  stats: { inputs: number; totalOps: number; keptOps: number };
}

export interface MergeOptions {
  /** 管线优先级，高→低；默认 ['xzqh','community','dmfw'] */
  priority?: Pipeline[];
  /** 合并 patch 的 author，默认 'cndiv-merge' */
  author?: string;
  /** 合并 patch 的 created_at（可选，纯函数不取系统时间，须调用方传入） */
  createdAt?: string;
}

const DEFAULT_PRIORITY: Pipeline[] = ['xzqh', 'community', 'dmfw'];

/** op 输出顺序：add→move→update→remove。 */
const OP_ORDER: Record<Operation['op'], number> = {
  [PATCH_OPERATION.ADD]: 0,
  [PATCH_OPERATION.MOVE]: 1,
  [PATCH_OPERATION.UPDATE]: 2,
  [PATCH_OPERATION.REMOVE]: 3,
};

const CONFIDENCE_RANK: Record<string, number> = {
  [CONFIDENCE_LEVELS.LOW]: 0,
  [CONFIDENCE_LEVELS.MEDIUM]: 1,
  [CONFIDENCE_LEVELS.HIGH]: 2,
};

/** 稳定序列化一个 op 作为去重键（键按字典序，值原样）。 */
function opKey(op: Operation): string {
  const keys = Object.keys(op).sort();
  return JSON.stringify(
    keys.map((k) => [k, (op as Record<string, unknown>)[k]])
  );
}

interface Tagged {
  op: Operation;
  pipeline: Pipeline;
  rank: number;
  origin?: string;
}

/**
 * 合并多份 patch。纯函数：相同输入恒定输出，不触碰系统时间/随机。
 * @throws 输入的 `apply_after` 不一致（基线错配，禁止跨基线合并）。
 */
export function mergePatches(
  inputs: MergeInput[],
  opts: MergeOptions = {}
): MergeResult {
  const priority = opts.priority ?? DEFAULT_PRIORITY;
  const rankOf = (p: Pipeline): number => {
    const i = priority.indexOf(p);
    return i === -1 ? -1 : priority.length - i; // 越靠前 rank 越大
  };

  // 基线一致性校验：apply_after 全体必须相同。
  const bases = [...new Set(inputs.map((i) => i.patch.meta.apply_after))];
  if (bases.length > 1) {
    throw new Error(
      `拒绝跨基线合并：apply_after 不一致（${bases.join(' vs ')}）`
    );
  }

  // 展平所有 op，打上管线与 rank。
  const tagged: Tagged[] = [];
  for (const input of inputs) {
    for (const op of input.patch.operations) {
      tagged.push({
        op,
        pipeline: input.pipeline,
        rank: rankOf(input.pipeline),
        origin: input.origin,
      });
    }
  }

  // 按 code 分组。
  const byCode = new Map<string, Tagged[]>();
  for (const t of tagged) {
    const list = byCode.get(t.op.code);
    if (list) list.push(t);
    else byCode.set(t.op.code, [t]);
  }

  const kept: Operation[] = [];
  const conflicts: MergeConflict[] = [];
  let deduped = 0;

  for (const [code, group] of byCode) {
    // 1) 优先级裁决：仅保留最高 rank 管线的 op，低优先级整组落冲突。
    const maxRank = Math.max(...group.map((t) => t.rank));
    const winners = group.filter((t) => t.rank === maxRank);
    const winnerPipeline = winners[0]?.pipeline;
    for (const loser of group) {
      if (loser.rank < maxRank) {
        conflicts.push({
          code,
          dropped: loser.op,
          losingPipeline: loser.pipeline,
          winningPipeline: winnerPipeline,
          reason: 'lower-priority',
          origin: loser.origin,
        });
      }
    }

    // 2) 胜者组内去重（完全相同的 op）。
    const seen = new Set<string>();
    const unique: Tagged[] = [];
    for (const w of winners) {
      const key = opKey(w.op);
      if (seen.has(key)) {
        deduped++;
        continue;
      }
      seen.add(key);
      unique.push(w);
    }

    // 3) add vs remove 同 code：保留 add，remove 落冲突（新设优先于缺失撤销）。
    const hasAdd = unique.some((t) => t.op.op === PATCH_OPERATION.ADD);
    for (const t of unique) {
      if (hasAdd && t.op.op === PATCH_OPERATION.REMOVE) {
        conflicts.push({
          code,
          dropped: t.op,
          losingPipeline: t.pipeline,
          reason: 'add-remove-cancel',
          origin: t.origin,
        });
        continue;
      }
      kept.push(t.op);
    }
  }

  // 恒定排序：op 类型序 → code 升序。
  kept.sort(
    (a, b) => OP_ORDER[a.op] - OP_ORDER[b.op] || a.code.localeCompare(b.code)
  );

  // 合并 meta：author 可配；evidence_confidence 取输入最高；apply_after 用共同基线。
  const applyAfter = bases[0] ?? '2023-baseline';
  const confidence = inputs.reduce<string>((best, i) => {
    const c = i.patch.meta.evidence_confidence ?? CONFIDENCE_LEVELS.MEDIUM;
    return CONFIDENCE_RANK[c] > CONFIDENCE_RANK[best] ? c : best;
  }, CONFIDENCE_LEVELS.LOW);

  const patch: Patch = {
    meta: {
      author: opts.author ?? 'cndiv-merge',
      evidence_confidence: confidence as Patch['meta']['evidence_confidence'],
      apply_after: applyAfter,
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
      notes: `合并自 ${inputs.length} 份 patch（管线 ${[...new Set(inputs.map((i) => i.pipeline))].join('/')}）`,
    },
    operations: kept,
  };

  return {
    patch,
    conflicts,
    deduped,
    empty: kept.length === 0,
    stats: {
      inputs: inputs.length,
      totalOps: tagged.length,
      keptOps: kept.length,
    },
  };
}

/**
 * 便捷守门：非空合并成品必须过 validatePatch。空 op 集（empty=true）返回 null（调用方跳过写盘）。
 * @throws 合并成品未过 schema 校验（理论不应发生，作为 FMEA 兜底）。
 */
export function validateMerged(result: MergeResult): Patch | null {
  if (result.empty) return null;
  const check = validatePatch(result.patch);
  if (!check.success) {
    throw new Error(`合并成品未过 schema 校验：${check.error}`);
  }
  return check.data;
}
