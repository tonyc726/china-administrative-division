/**
 * mergePatches（2.3）单测。覆盖验收 ①：
 * - 同 code update：xzqh 胜、dmfw 落 conflicts.dropped（优先级裁决）
 * - add vs remove 同 code → 保留 add，remove 落 conflicts
 * - 完全重复去重 deduped 计数
 * - apply_after 不一致 → 抛错
 * - 输出 op 恒序 add→move→update→remove 再按 code
 * - 幂等：合并产物再次单独喂入，输出不变
 * - 空结果 empty=true（PatchSchema 要求 ≥1 op，调用方跳过写盘）
 * - 非空成品过 validatePatch
 */
import { describe, it, expect } from 'vitest';
import {
  mergePatches,
  validateMerged,
  validatePatch,
  type Patch,
  type Operation,
  type MergeInput,
} from '../dist/index.js';

const mkPatch = (ops: Operation[], applyAfter = '2023-baseline'): Patch => ({
  meta: { author: 't', evidence_confidence: 'medium', apply_after: applyAfter },
  operations: ops,
});
const inp = (
  pipeline: MergeInput['pipeline'],
  ops: Operation[],
  applyAfter?: string
): MergeInput => ({ pipeline, patch: mkPatch(ops, applyAfter) });

const C1 = '110105000000';
const C2 = '211321000000';
const P = '110100000000';

const updName = (code: string, name: string): Operation => ({
  op: 'update',
  code,
  name,
});
const addNode = (code: string): Operation => ({
  op: 'add',
  code,
  name: '新县',
  level: 3,
  parent_code: P,
});
const removeNode = (code: string): Operation => ({ op: 'remove', code });
const moveNode = (code: string, np: string): Operation => ({
  op: 'move',
  code,
  new_parent: np,
});

describe('mergePatches', () => {
  it('同 code update：xzqh 胜、dmfw 落 conflicts', () => {
    const r = mergePatches([
      inp('dmfw', [updName(C1, 'dmfw名')]),
      inp('xzqh', [updName(C1, 'xzqh名')]),
    ]);
    expect(r.patch.operations).toHaveLength(1);
    expect(r.patch.operations[0]).toMatchObject({ code: C1, name: 'xzqh名' });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      code: C1,
      losingPipeline: 'dmfw',
      winningPipeline: 'xzqh',
      reason: 'lower-priority',
    });
    expect((r.conflicts[0].dropped as { name: string }).name).toBe('dmfw名');
  });

  it('add vs remove 同 code → 保留 add，remove 落 conflicts', () => {
    const r = mergePatches([
      inp('xzqh', [addNode(C1)]),
      inp('xzqh', [removeNode(C1)]),
    ]);
    expect(r.patch.operations).toHaveLength(1);
    expect(r.patch.operations[0].op).toBe('add');
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].reason).toBe('add-remove-cancel');
    expect(r.conflicts[0].dropped.op).toBe('remove');
  });

  it('完全重复的 op 去重，deduped 计数', () => {
    const r = mergePatches([
      inp('xzqh', [updName(C1, '同')]),
      inp('xzqh', [updName(C1, '同')]),
    ]);
    expect(r.patch.operations).toHaveLength(1);
    expect(r.deduped).toBe(1);
    expect(r.conflicts).toHaveLength(0);
  });

  it('apply_after 不一致 → 抛错', () => {
    expect(() =>
      mergePatches([
        inp('xzqh', [updName(C1, 'a')], '2023-baseline'),
        inp('dmfw', [updName(C2, 'b')], '2024-baseline'),
      ])
    ).toThrow(/apply_after 不一致/);
  });

  it('输出 op 恒序 add→move→update→remove 再按 code', () => {
    const r = mergePatches([
      inp('xzqh', [
        removeNode('650000000000'),
        updName(C2, 'u'),
        moveNode(C1, P),
        addNode('440000000000'),
      ]),
    ]);
    expect(r.patch.operations.map((o) => o.op)).toEqual([
      'add',
      'move',
      'update',
      'remove',
    ]);
  });

  it('幂等：合并产物再次单独喂入，operations 不变', () => {
    const first = mergePatches([
      inp('dmfw', [updName(C1, 'dmfw')]),
      inp('xzqh', [updName(C1, 'xzqh'), addNode(C2)]),
    ]);
    const second = mergePatches([
      { pipeline: 'xzqh', patch: first.patch },
    ]);
    expect(second.patch.operations).toEqual(first.patch.operations);
    expect(second.conflicts).toHaveLength(0);
    expect(second.deduped).toBe(0);
  });

  it('空结果 empty=true，validateMerged 返回 null', () => {
    // add 与 remove 抵消后该 code 只剩 add；构造纯 remove 被更高优先级 add 顶掉 → 仍有 add。
    // 真正空：单管线仅一个 remove 被 add-remove-cancel？需同 code add。这里用「全部被去重成 0」不可能，
    // 改用跨管线：低优先级唯一 op 被高优先级同 code 顶掉，且高优先级为空——不成立。
    // 简化：空输入 operations 不允许（schema），故用「两份完全相同单 op」→ 去重剩 1（非空）。
    // 用 add+remove 抵消得到「只剩 add」也非空。故 empty 仅在无任何 op 输入时——用空 inputs 数组。
    const r = mergePatches([]);
    expect(r.empty).toBe(true);
    expect(validateMerged(r)).toBeNull();
    expect(r.stats.keptOps).toBe(0);
  });

  it('非空合并成品过 validatePatch', () => {
    const r = mergePatches([
      inp('xzqh', [addNode(C1)]),
      inp('dmfw', [updName(C2, 'x')]),
    ]);
    expect(r.empty).toBe(false);
    expect(validatePatch(r.patch).success).toBe(true);
    expect(validateMerged(r)).not.toBeNull();
  });

  it('evidence_confidence 取输入最高', () => {
    const high: Patch = {
      meta: { author: 't', evidence_confidence: 'high', apply_after: '2023-baseline' },
      operations: [updName(C1, 'a')],
    };
    const low: Patch = {
      meta: { author: 't', evidence_confidence: 'low', apply_after: '2023-baseline' },
      operations: [updName(C2, 'b')],
    };
    const r = mergePatches([
      { pipeline: 'dmfw', patch: low },
      { pipeline: 'xzqh', patch: high },
    ]);
    expect(r.patch.meta.evidence_confidence).toBe('high');
  });
});
