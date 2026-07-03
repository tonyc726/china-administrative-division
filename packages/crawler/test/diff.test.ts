/**
 * diffToPatch 的产物必须始终通过 data-protocol 的 schema 校验（与 run.ts 写盘守门同一道关），
 * 且空名节点（dmfw 偶发 null name）不得产出非法 add/update。fixture 锁定这两条 FMEA 不变量。
 */
import { describe, it, expect } from 'vitest';
import { diffToPatch } from '../dist/diff.js';
import { validatePatch } from '@cndiv/data-protocol';
import type { Division } from '@cndiv/core';

const d = (code: string, name: string, level: number, parent: string | null): Division => ({
  code,
  name,
  level: level as Division['level'],
  parent_code: parent,
  year: 2023,
});

describe('diffToPatch', () => {
  const baseline: Division[] = [
    d('110000000000', '北京市', 1, null),
    d('110101000000', '东城区', 3, '110000000000'),
    d('110102000000', '西城区', 3, '110000000000'),
  ];

  it('产出 add/update/remove 且整体通过 validatePatch', () => {
    const current: Division[] = [
      d('110000000000', '北京市', 1, null),
      d('110101000000', '东城区(改名)', 3, '110000000000'), // update
      d('110118000000', '密云区', 3, '110000000000'), // add
      // 西城区 110102 缺失 → remove
    ];
    const { patch } = diffToPatch(baseline, current, { author: 'test' });

    const ops = patch.operations;
    expect(ops.find((o) => o.op === 'add' && o.code === '110118000000')).toBeTruthy();
    expect(ops.find((o) => o.op === 'update' && o.code === '110101000000')).toBeTruthy();
    expect(ops.find((o) => o.op === 'remove' && o.code === '110102000000')).toBeTruthy();

    const v = validatePatch(patch);
    expect(v.success).toBe(true);
  });

  it('跳过空名节点：不产出非法 add，skippedEmptyName 计数正确', () => {
    const current: Division[] = [
      d('110000000000', '北京市', 1, null),
      d('110101000000', '东城区', 3, '110000000000'),
      d('110102000000', '西城区', 3, '110000000000'),
      d('110118000000', '密云区', 3, '110000000000'), // 合法新节点 → 正常 add
      d('110119000000', '', 3, '110000000000'), // 空名新节点 → 必须跳过
    ];
    const { patch, skippedEmptyName } = diffToPatch(baseline, current, { author: 'test' });

    expect(skippedEmptyName).toBe(1);
    expect(patch.operations.find((o) => o.code === '110119000000')).toBeUndefined();
    expect(patch.operations.find((o) => o.code === '110118000000')).toBeTruthy();
    expect(validatePatch(patch).success).toBe(true); // 非空且合法（空名节点已被剔除）
  });

  // T2.2：level5 村级已冻结于 NBS 2023，永久不参与增量差分（官方无活源，见 docs/spike-village-level5.md）。
  // 固化不变量：无论 add/update/remove 三个方向，默认 levels 都不得对 level5 产出任何操作。
  it('村级(level5)默认超出比对范围：add/update/remove 三方向均不产出 level5 op', () => {
    const baseWithVillage: Division[] = [
      ...baseline,
      d('110101001001', '多福巷社区居委会', 5, '110101000000'), // 基线有、当前无 → 不得 remove
      d('110101001002', '银闸社区居委会', 5, '110101000000'), // 基线有、当前改名 → 不得 update
    ];
    const current: Division[] = [
      ...baseline,
      d('110118000000', '密云区', 3, '110000000000'), // level3 add：反证 1-4 差分仍工作
      d('110101001002', '银闸社区居委会(改名)', 5, '110101000000'), // update 方向
      d('110101001003', '新设社区居委会', 5, '110101000000'), // 基线无、当前有 → 不得 add
    ];
    const { patch } = diffToPatch(baseWithVillage, current, { author: 'test' });

    // 任何 level5 码都不应出现在 operations 里（add/update/remove 三方向全封）
    const level5Codes = ['110101001001', '110101001002', '110101001003'];
    for (const code of level5Codes) {
      expect(patch.operations.find((o) => o.code === code)).toBeUndefined();
    }
    // 反证：level 1-4 正常差分——仅密云区 level3 add，无任何 level5 噪声
    expect(patch.operations).toHaveLength(1);
    expect(patch.operations[0]).toMatchObject({ op: 'add', code: '110118000000', level: 3 });
    expect(validatePatch(patch).success).toBe(true);
  });

  it('显式传入 levels=[5] 时才比对村级（冻结是默认策略，非硬编码禁止）', () => {
    const baseWithVillage: Division[] = [
      ...baseline,
      d('110101001001', '某社区居委会', 5, '110101000000'),
    ];
    const current: Division[] = [...baseline]; // 村级缺失
    const { patch } = diffToPatch(baseWithVillage, current, { author: 'test', levels: [5] });
    // 显式要求比对 level5 时，缺失村级才会产出 remove（证明排除是「默认 levels」策略而非不可覆盖的硬禁止）
    expect(patch.operations.find((o) => o.op === 'remove' && o.code === '110101001001')).toBeTruthy();
  });

  // T3.1：dmfw 用 name 后缀「（撤销）」标注已撤销单位（保留原码）
  it('识别 name「（撤销）」后缀为 remove 候选，不误判为 update', () => {
    const base: Division[] = [...baseline, d('110101001000', '双河乡', 4, '110101000000')];
    const current: Division[] = [...baseline, d('110101001000', '双河乡（撤销）', 4, '110101000000')];
    const { patch, revokedBySuffix } = diffToPatch(base, current, { author: 'test' });

    expect(revokedBySuffix).toBe(1);
    const op = patch.operations.find((o) => o.code === '110101001000');
    expect(op?.op).toBe('remove');
    if (op && op.op === 'remove') {
      expect(op.reason).toContain('双河乡'); // 剥离后缀后的真名
    }
    // 不得产出「改名成撤销名」的 update
    expect(patch.operations.find((o) => o.op === 'update' && o.code === '110101001000')).toBeUndefined();
    expect(validatePatch(patch).success).toBe(true);
  });

  it('（撤销）节点在基线不存在时：计数但不产 op（不 remove 幽灵码）', () => {
    const base: Division[] = [...baseline];
    const current: Division[] = [...baseline, d('110101002000', '幽灵乡（撤销）', 4, '110101000000')];
    const { patch, revokedBySuffix } = diffToPatch(base, current, { author: 'test' });

    expect(revokedBySuffix).toBe(1);
    expect(patch.operations.find((o) => o.code === '110101002000')).toBeUndefined();
  });
});
