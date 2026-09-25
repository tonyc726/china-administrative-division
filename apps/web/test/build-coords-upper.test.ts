/**
 * build-coords upper join 纯函数单元测试(计划 docs/plans/stname-upper-plan.md 阶段 2)。
 *
 * 覆盖码精确(验名)、6 位码冲突名称兜底、area 误标市域兜底、重复码去重、
 * 坐标缺失、未匹配如实记录、NBS 未覆盖统计等可独立验证的逻辑;
 * 不涉及文件 I/O 与 main()。
 */
import { describe, it, expect } from 'vitest';
import { joinUpper } from '../scripts/build-coords';
import type { UpperEntry, UpperFile, TreeRow } from '../scripts/build-coords';

/** 构造 stname 行(gdm 默认给一个合法点坐标) */
function entry(
  provinceCode: string,
  area: string | null,
  name: string,
  placeTypeCode: string,
  gdm: { type: string; coordinates: number[][] } | null = {
    type: 'MultiPoint',
    coordinates: [[116.4074, 39.9042]],
  }
): UpperEntry {
  return { provinceCode, row: { standard_name: name, place_type_code: placeTypeCode, gdm, area } };
}

/** 两省三市六县的最小合成树(码形与 NBS 2023 一致,面积无关) */
const TREE: TreeRow[] = [
  ['110000000000', '北京市', 1, '', 'beijingshi', 'bjs'],
  ['330000000000', '浙江省', 1, '', 'zhejiangsheng', 'zjs'],
  ['110100000000', '市辖区', 2, '110000000000', 'shixiaqu', 'sxq'],
  ['330300000000', '温州市', 2, '330000000000', 'wenzhoushi', 'wzs'],
  ['330400000000', '嘉兴市', 2, '330000000000', 'jiaxingshi', 'jxs'],
  ['110101000000', '东城区', 3, '110100000000', 'dongchengqu', 'dcq'],
  ['330327000000', '苍南县', 3, '330300000000', 'cangnanxian', 'cnx'],
  ['330381000000', '龙港市', 3, '330300000000', 'longgangshi', 'lgs'],
  ['330481000000', '海宁市', 3, '330400000000', 'hainingshi', 'hns'],
  ['330399000000', '某某开发区', 3, '330300000000', 'moumoukaifaqu', 'mmkfq'],
];

function makeUpper(overrides: Partial<UpperFile> = {}): UpperFile {
  return { provinces: [], cities: [], counties: [], ...overrides };
}

describe('joinUpper 省级(21200)', () => {
  it('按名称匹配 31 省形态的码(area 为 110000999 形,码无 12 位对应)', () => {
    const r = joinUpper(
      makeUpper({ provinces: [entry('11', '110000999', '北京市', '21200')] }),
      TREE
    );
    expect(r.provinces).toEqual([
      {
        code: '110000000000',
        name: '北京市',
        coord: [116.4074, 39.9042],
        placeTypeCode: '21200',
        source: 'dmfw-stname',
      },
    ]);
    expect(r.stats.provinces.matched).toBe(1);
  });

  it('NBS 无同名省级时如实记 unmatched,样例带 P 标签', () => {
    const r = joinUpper(
      makeUpper({ provinces: [entry('11', '110000999', '银河省', '21200')] }),
      TREE
    );
    expect(r.provinces).toEqual([]);
    expect(r.stats.provinces.unmatched).toBe(1);
    expect(r.unmatchedSamples).toEqual(['P 11 110000999 银河省']);
  });

  it('名称命中但 gdm 缺失计 coordMissing,不输出', () => {
    const r = joinUpper(
      makeUpper({ provinces: [entry('11', '110000999', '北京市', '21200', null)] }),
      TREE
    );
    expect(r.provinces).toEqual([]);
    expect(r.stats.provinces.coordMissing).toBe(1);
    expect(r.stats.provinces.matched).toBe(0);
  });
});

describe('joinUpper 市级(21300)', () => {
  it('area 前 4 位补零成 12 位码精确命中(验名)', () => {
    const r = joinUpper(
      makeUpper({ cities: [entry('33', '330300999', '温州市', '21300')] }),
      TREE
    );
    expect(r.cities[0]?.code).toBe('330300000000');
    expect(r.stats.cities.matched).toBe(1);
  });

  it('码存在但名称不符(如雄安新区 area=省码形态)时省内名称兜底', () => {
    // area 前 4 位 3300 补零 = 330000000000 是省级码,不在 L2;名称在省内 L2 也无
    const r = joinUpper(
      makeUpper({ cities: [entry('33', '330000999', '雄安新区', '21300')] }),
      TREE
    );
    expect(r.cities).toEqual([]);
    expect(r.stats.cities.unmatched).toBe(1);
    expect(r.unmatchedSamples[0]).toContain('雄安新区');
  });

  it('area 误标时省内名称兜底仍可命中', () => {
    const r = joinUpper(
      makeUpper({ cities: [entry('33', '339900999', '嘉兴市', '21300')] }),
      TREE
    );
    expect(r.cities[0]?.code).toBe('330400000000');
    expect(r.stats.cities.matched).toBe(1);
  });

  it('同一 NBS 码被多条命中时去重(保留首条),计 duplicates', () => {
    const r = joinUpper(
      makeUpper({
        cities: [
          entry('33', '330300999', '温州市', '21300'),
          entry('33', '330300999', '温州市', '21300'),
        ],
      }),
      TREE
    );
    expect(r.cities).toHaveLength(1);
    expect(r.stats.cities.matched).toBe(1);
    expect(r.stats.cities.duplicates).toBe(1);
  });
});

describe('joinUpper 县级(21400)', () => {
  it('area 前 6 位 + 000000 精确命中(验名)', () => {
    const r = joinUpper(
      makeUpper({ counties: [entry('33', '330327999', '苍南县', '21400')] }),
      TREE
    );
    expect(r.counties[0]).toMatchObject({ code: '330327000000', name: '苍南县' });
  });

  it('6 位码冲突(码命中但名不符)不得错配,走市域名称兜底', () => {
    // 龙港市挂苍南县 6 位码 330327 下(地名库旧口径 330327123):
    // 码 330327 在 NBS 是「苍南县」,验名失败 → 温州市域内按名兜底 → 330381
    const r = joinUpper(
      makeUpper({ counties: [entry('33', '330327123', '龙港市', '21400')] }),
      TREE
    );
    expect(r.counties).toEqual([
      { code: '330381000000', name: '龙港市', coord: [116.4074, 39.9042], placeTypeCode: '21400', source: 'dmfw-stname' },
    ]);
  });

  it('area 误标为市自身码(武宁县 360400999 形态)时,名称在市域内可兜底', () => {
    const r = joinUpper(
      makeUpper({ counties: [entry('33', '330300999', '苍南县', '21400')] }),
      TREE
    );
    expect(r.counties[0]?.code).toBe('330327000000');
  });

  it('area 误标且名称不在该市域内(跨市误标)时如实 miss,不臆造', () => {
    const r = joinUpper(
      makeUpper({ counties: [entry('33', '330300999', '海宁市', '21400')] }),
      TREE
    );
    // 330300000000 非 L3 码 → 温州市域内按名查 → 海宁市在嘉兴,不在温州 → miss
    expect(r.counties).toEqual([]);
    expect(r.stats.counties.unmatched).toBe(1);
  });

  it('同码同名重复项(奎文区形态)去重并计 duplicates', () => {
    const r = joinUpper(
      makeUpper({
        counties: [
          entry('33', '330327999', '苍南县', '21400'),
          entry('33', '330327999', '苍南县', '21400'),
        ],
      }),
      TREE
    );
    expect(r.counties).toHaveLength(1);
    expect(r.stats.counties.duplicates).toBe(1);
  });

  it('同码不同名(共享 6 位码的噪声行,如「某某检测中心」)如实 miss', () => {
    const r = joinUpper(
      makeUpper({ counties: [entry('33', '330327999', '某某检测中心', '21400')] }),
      TREE
    );
    expect(r.counties).toEqual([]);
    expect(r.stats.counties.unmatched).toBe(1);
    expect(r.unmatchedSamples).toEqual(['K 33 330327999 某某检测中心']);
  });

  it('area 为 null 时(理论防御)不抛错,按未匹配记录', () => {
    const r = joinUpper(
      makeUpper({ counties: [entry('33', null, '苍南县', '21400')] }),
      TREE
    );
    expect(r.counties).toEqual([]);
    expect(r.stats.counties.unmatched).toBe(1);
  });
});

describe('joinUpper 全局统计', () => {
  it('nbsUncovered 统计 NBS 有而地名库无记录的层级条数', () => {
    // 覆盖:L2 温州;未覆盖:市辖区/嘉兴;L3 覆盖苍南,未覆盖:东城/龙港/海宁/某某开发区
    const r = joinUpper(
      makeUpper({
        cities: [entry('33', '330300999', '温州市', '21300')],
        counties: [entry('33', '330327999', '苍南县', '21400')],
      }),
      TREE
    );
    expect(r.nbsUncovered).toEqual({ l2: 2, l3: 4 });
  });

  it('空输入产出全零统计与空数组', () => {
    const r = joinUpper(makeUpper(), TREE);
    expect(r.provinces).toEqual([]);
    expect(r.cities).toEqual([]);
    expect(r.counties).toEqual([]);
    expect(r.stats.provinces).toEqual({ matched: 0, unmatched: 0, duplicates: 0, coordMissing: 0 });
    expect(r.stats.cities).toEqual({ matched: 0, unmatched: 0, duplicates: 0, coordMissing: 0 });
    expect(r.stats.counties).toEqual({ matched: 0, unmatched: 0, duplicates: 0, coordMissing: 0 });
    expect(r.unmatchedSamples).toEqual([]);
  });

  it('三级混合输入各自独立统计,样本上限 20 条', () => {
    const counties = Array.from({ length: 25 }, (_, i) =>
      entry('33', `3309${String(i).padStart(2, '0')}999`, `不存在县${i}`, '21400')
    );
    const r = joinUpper(
      makeUpper({
        provinces: [entry('11', '110000999', '北京市', '21200')],
        counties,
      }),
      TREE
    );
    expect(r.stats.provinces.matched).toBe(1);
    expect(r.stats.counties.unmatched).toBe(25);
    expect(r.unmatchedSamples).toHaveLength(20);
  });
});
