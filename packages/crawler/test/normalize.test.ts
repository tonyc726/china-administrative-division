/**
 * 归一化不变量：dmfw(扁平) ↔ NBS(占位层) 建模差异必须在差分前被 canonicalizeParent 抹平，
 * 结构性占位层必须被 isPlaceholder 识别以豁免假 remove。锁定 crawler 全国首跑暴露的根本障碍已闭合。
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeParent, isPlaceholder, PLACEHOLDER_NAMES } from '../dist/normalize.js';
import { PLACEHOLDER_NAMES as READER_PLACEHOLDER_NAMES } from '@cndiv/reader';
import type { Division } from '@cndiv/core';

const d = (code: string, name: string, level: number, parent: string | null): Division => ({
  code,
  name,
  level: level as Division['level'],
  parent_code: parent,
  year: 2023,
});

describe('canonicalizeParent', () => {
  it('直辖市：dmfw 扁平上报父(北京) 被改写为码结构父(市辖区占位)', () => {
    // dmfw 对直辖市跳过 level2，东城区扁平直挂北京 110000
    const flat = d('110101000000', '东城区', 3, '110000000000');
    expect(canonicalizeParent(flat).parent_code).toBe('110100000000');
  });

  it('省直管县级市：dmfw 上报父(河南) 被改写为码结构父(省直辖占位)', () => {
    const flat = d('419001000000', '济源市', 3, '410000000000');
    expect(canonicalizeParent(flat).parent_code).toBe('419000000000');
  });

  it('对 NBS baseline 幂等：占位模型父码本就是码结构父，不被改动', () => {
    const nbs = d('110101000000', '东城区', 3, '110100000000');
    expect(canonicalizeParent(nbs).parent_code).toBe('110100000000');
  });

  it('省级(无父)保留 null，不被误写', () => {
    const prov = d('110000000000', '北京市', 1, null);
    expect(canonicalizeParent(prov).parent_code).toBeNull();
  });

  it('普通地级市：父码=省级，与 dmfw 上报一致（无差异可制造）', () => {
    const city = d('130100000000', '石家庄市', 2, '130000000000');
    expect(canonicalizeParent(city).parent_code).toBe('130000000000');
  });

  it('FMEA：省码白名单外(港澳)/非法码 getParentCode 返回 null → 保留原上报父码', () => {
    const hk = d('810001000000', '中西区', 3, '810000000000');
    // 不因归一化失败而抛错或丢父码；保留原值交由后续人工/口径处理
    expect(canonicalizeParent(hk).parent_code).toBe('810000000000');
  });
});

describe('isPlaceholder', () => {
  it('识别「市辖区」level2 占位层', () => {
    expect(isPlaceholder(d('110100000000', '市辖区', 2, '110000000000'))).toBe(true);
  });

  it('识别「省直辖县级行政区划」level2 占位层', () => {
    expect(isPlaceholder(d('419000000000', '省直辖县级行政区划', 2, '410000000000'))).toBe(true);
  });

  it('普通地级市(石家庄)非占位层', () => {
    expect(isPlaceholder(d('130100000000', '石家庄市', 2, '130000000000'))).toBe(false);
  });

  it('同名但非 level2 不误判（防守码结构+名称双条件）', () => {
    expect(isPlaceholder(d('110101000000', '市辖区', 3, '110100000000'))).toBe(false);
  });

  /**
   * 名单锁定，防静默漂移。曾经 crawler 与 reader 各存一份且已分叉，双方都漏了新疆的
   * 「自治区直辖县级行政区划」(659000) —— 于是它被当成真政区，在 dmfw 差分里产出假 remove。
   * 现已收敛到 @cndiv/reader 单一真相源；此断言同时钉住「内容」与「唯一来源」。
   */
  it('占位层名单锁定，且与 @cndiv/reader 单一真相源一致', () => {
    expect([...PLACEHOLDER_NAMES].sort()).toEqual(
      [
        '市辖区',
        '县',
        '省直辖县级行政区划',
        '省直辖县级行政单位',
        '自治区直辖县级行政区划',
      ].sort()
    );
    // crawler 侧必须是 reader 的再导出，不得另存一份
    expect(PLACEHOLDER_NAMES).toBe(READER_PLACEHOLDER_NAMES);
  });

  it('新疆「自治区直辖县级行政区划」是占位层（曾漏判 → 假 remove）', () => {
    expect(
      isPlaceholder(d('659000000000', '自治区直辖县级行政区划', 2, '650000000000'))
    ).toBe(true);
  });
});
