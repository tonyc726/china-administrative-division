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

  it('村级(level5)默认超出比对范围：基线村缺失不误判为 remove', () => {
    const baseWithVillage: Division[] = [
      ...baseline,
      d('110101001001', '某社区居委会', 5, '110101000000'),
    ];
    const current: Division[] = [...baseline]; // 当前快照无村级（dmfw 不覆盖）
    const { patch } = diffToPatch(baseWithVillage, current, { author: 'test' });

    expect(patch.operations.find((o) => o.code === '110101001001')).toBeUndefined();
  });
});
