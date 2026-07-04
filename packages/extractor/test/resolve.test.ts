/**
 * intents → Patch 的名称解析边界：注入式 CodeResolver 命中即成 Operation，未命中/新设一律落
 * unresolved（绝不臆造码）。锁定「解析不到就降级、不产非法操作」这一安全不变量。
 */
import { describe, it, expect } from 'vitest';
import { intentsToPatch } from '../dist/resolve.js';
import type { ChangeIntent, CodeResolver } from '../dist/types.js';

/** 固定基线：仅这些名称有码，其余一律 null（模拟未命中） */
const BASELINE: Record<string, string> = {
  三河县: '131082000000',
  三河市: '131082000000',
  朝阳镇: '110105001000',
  通州区: '110112000000',
  北京市: '110000000000',
};
const resolve: CodeResolver = (name) => BASELINE[name] ?? null;
const miss: CodeResolver = () => null;

describe('intentsToPatch', () => {
  it('rename 命中 → update 操作', () => {
    const intents: ChangeIntent[] = [
      { kind: 'rename', from: '朝阳镇', to: '朝阳街道', evidence: 'e' },
    ];
    const { operations, unresolved } = intentsToPatch(intents, resolve);
    expect(operations).toEqual([
      { op: 'update', code: '110105001000', name: '朝阳街道' },
    ]);
    expect(unresolved).toHaveLength(0);
  });

  it('abolish 命中 → remove 操作，evidence 落 reason', () => {
    const intents: ChangeIntent[] = [
      { kind: 'abolish', target: '三河县', evidence: '国务院批复撤销' },
    ];
    const { operations } = intentsToPatch(intents, resolve);
    expect(operations).toEqual([
      { op: 'remove', code: '131082000000', reason: '国务院批复撤销' },
    ]);
  });

  it('transfer 双端命中 → move 操作', () => {
    const intents: ChangeIntent[] = [
      { kind: 'transfer', target: '通州区', newParent: '北京市', evidence: 'e' },
    ];
    const { operations } = intentsToPatch(intents, resolve);
    expect(operations).toEqual([
      { op: 'move', code: '110112000000', new_parent: '110000000000' },
    ]);
  });

  it('establish 恒落 unresolved（新设无既有码，绝不臆造 add）', () => {
    const intents: ChangeIntent[] = [
      { kind: 'establish', name: '雄安新区', evidence: 'e' },
    ];
    const { operations, unresolved } = intentsToPatch(intents, resolve);
    expect(operations).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toContain('雄安新区');
  });

  it('rename/abolish 未命中基线 → 落 unresolved 且不产操作', () => {
    const intents: ChangeIntent[] = [
      { kind: 'rename', from: '不存在县', to: 'X', evidence: 'e' },
      { kind: 'abolish', target: '不存在乡', evidence: 'e' },
    ];
    const { operations, unresolved } = intentsToPatch(intents, miss);
    expect(operations).toHaveLength(0);
    expect(unresolved).toHaveLength(2);
    expect(unresolved[0].reason).toContain('不存在县');
    expect(unresolved[1].reason).toContain('不存在乡');
  });

  it('transfer 仅缺 newParent → unresolved 指名缺失的那一端', () => {
    const halfResolve: CodeResolver = (n) =>
      n === '通州区' ? '110112000000' : null;
    const intents: ChangeIntent[] = [
      { kind: 'transfer', target: '通州区', newParent: '未知市', evidence: 'e' },
    ];
    const { operations, unresolved } = intentsToPatch(intents, halfResolve);
    expect(operations).toHaveLength(0);
    expect(unresolved[0].reason).toContain('未知市');
  });

  it('混合意图：命中的成操作、未命中的降级，二者互不影响', () => {
    const intents: ChangeIntent[] = [
      { kind: 'rename', from: '朝阳镇', to: '朝阳街道', evidence: 'e' },
      { kind: 'establish', name: '新市', evidence: 'e' },
      { kind: 'abolish', target: '三河县', evidence: 'e' },
    ];
    const { operations, unresolved } = intentsToPatch(intents, resolve);
    expect(operations.map((o) => o.op)).toEqual(['update', 'remove']);
    expect(unresolved).toHaveLength(1);
  });

  it('空意图数组 → 空结果', () => {
    expect(intentsToPatch([], resolve)).toEqual({
      operations: [],
      unresolved: [],
    });
  });
});
