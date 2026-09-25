/**
 * run-stname --upper 模式纯函数单元测试。
 *
 * 覆盖去重、类型分桶、直辖市空期望、统计计算、缓存加载等可独立验证的逻辑；
 * 不涉及网络请求与 runUpper 并发循环。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  bucketForType,
  isExpectedEmpty,
  dedupUpperRecords,
  computeUpperStats,
  loadUpperData,
} from '../dist/run-stname.js';
import type {
  UpperRecord,
  UpperData,
  UpperStats,
} from '../dist/run-stname.js';
import type { StnameRow } from '../dist/stname-types.js';

const coord: NonNullable<StnameRow['gdm']> = {
  type: 'MultiPoint',
  coordinates: [[116.4074, 39.9042]],
};

function makeRecord(
  area: string,
  standardName: string,
  placeTypeCode: string,
  gdm: StnameRow['gdm'] = null,
  overrides: Partial<StnameRow> = {}
): UpperRecord {
  return {
    provinceCode: area.slice(0, 2),
    row: {
      standard_name: standardName,
      place_type_code: placeTypeCode,
      gdm,
      pdm: null,
      area,
      ...overrides,
    },
  };
}

function emptyData(): UpperData {
  return {
    meta: {
      fetchedAt: '',
      note: '',
      stats: {
        province: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
        city: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
        county: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
        failures: 0,
      },
    },
    completed: [],
    provinces: [],
    cities: [],
    counties: [],
  };
}

describe('bucketForType', () => {
  it('21200 映射到 provinces', () => {
    expect(bucketForType('21200')).toBe('provinces');
  });

  it('21300 映射到 cities', () => {
    expect(bucketForType('21300')).toBe('cities');
  });

  it('21400 映射到 counties', () => {
    expect(bucketForType('21400')).toBe('counties');
  });

  it('未知类型抛错', () => {
    expect(() => bucketForType('99999')).toThrow('unknown upper type 99999');
  });
});

describe('isExpectedEmpty', () => {
  it('直辖市 11/12/31/50 的 21300 合法为空', () => {
    expect(isExpectedEmpty('11', '21300')).toBe(true);
    expect(isExpectedEmpty('12', '21300')).toBe(true);
    expect(isExpectedEmpty('31', '21300')).toBe(true);
    expect(isExpectedEmpty('50', '21300')).toBe(true);
  });

  it('非直辖市省份的 21300 不视为空', () => {
    expect(isExpectedEmpty('33', '21300')).toBe(false);
    expect(isExpectedEmpty('44', '21300')).toBe(false);
    expect(isExpectedEmpty('13', '21300')).toBe(false);
  });

  it('21200 与 21400 对任何省份都不视为空', () => {
    expect(isExpectedEmpty('11', '21200')).toBe(false);
    expect(isExpectedEmpty('11', '21400')).toBe(false);
    expect(isExpectedEmpty('33', '21200')).toBe(false);
    expect(isExpectedEmpty('33', '21400')).toBe(false);
  });
});

describe('dedupUpperRecords', () => {
  it('相同 area + standard_name + place_type_code 的记录去重为一条', () => {
    const records = [
      makeRecord('110000999', '北京市', '21200', coord),
      makeRecord('110000999', '北京市', '21200', coord),
    ];
    expect(dedupUpperRecords(records)).toHaveLength(1);
  });

  it('6 位前缀相同但 9 位 area 不同则保留', () => {
    const records = [
      makeRecord('110105999', '朝阳区', '21400', coord),
      makeRecord('110106999', '朝阳区', '21400', coord),
    ];
    const result = dedupUpperRecords(records);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.row.area).sort()).toEqual([
      '110105999',
      '110106999',
    ]);
  });

  it('相同 area 与名称但 place_type_code 不同则保留', () => {
    const records = [
      makeRecord('330100999', '杭州市', '21300', coord),
      makeRecord('330100999', '杭州市', '21400', coord),
    ];
    const result = dedupUpperRecords(records);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.row.place_type_code).sort()).toEqual([
      '21300',
      '21400',
    ]);
  });

  it('spec 重复：370705999 奎文区 21400 出现两次去重为一条', () => {
    const records = [
      makeRecord('370705999', '奎文区', '21400', coord, {
        place_code: '3707052130000000012345',
      }),
      makeRecord('370705999', '奎文区', '21400', coord, {
        place_code: '3707052140000000098765',
      }),
    ];
    expect(dedupUpperRecords(records)).toHaveLength(1);
  });
});

describe('computeUpperStats', () => {
  it('正确统计去重前后的数量', () => {
    const data = emptyData();
    data.provinces = [
      makeRecord('110000999', '北京市', '21200', coord),
      makeRecord('110000999', '北京市', '21200', coord),
    ];
    data.cities = [
      makeRecord('330100999', '杭州市', '21300', coord),
      makeRecord('330200999', '宁波市', '21300', coord),
    ];
    data.counties = [
      makeRecord('330106999', '西湖区', '21400', coord),
    ];

    const stats = computeUpperStats(data, 0);
    expect(stats.province).toEqual({
      beforeDedup: 2,
      afterDedup: 1,
      coordMissing: 0,
    });
    expect(stats.city).toEqual({
      beforeDedup: 2,
      afterDedup: 2,
      coordMissing: 0,
    });
    expect(stats.county).toEqual({
      beforeDedup: 1,
      afterDedup: 1,
      coordMissing: 0,
    });
    expect(stats.failures).toBe(0);
  });

  it('正确统计坐标缺失数量', () => {
    const data = emptyData();
    data.counties = [
      makeRecord('330106999', '西湖区', '21400', coord),
      makeRecord('330105999', '拱墅区', '21400', null),
      makeRecord('330104999', '余杭区', '21400', null),
    ];

    const stats = computeUpperStats(data, 0);
    expect(stats.county).toEqual({
      beforeDedup: 3,
      afterDedup: 3,
      coordMissing: 2,
    });
  });

  it('正确透传失败数', () => {
    const data = emptyData();
    const stats = computeUpperStats(data, 7);
    expect(stats.failures).toBe(7);
  });
});

describe('loadUpperData', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cndiv-upper-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('读取格式正确的文件并保留结构', async () => {
    const file = path.join(dir, 'upper.json');
    const payload: UpperData = {
      meta: {
        fetchedAt: '2026-08-09T00:00:00.000Z',
        note: 'test',
        stats: {
          province: { beforeDedup: 1, afterDedup: 1, coordMissing: 0 },
          city: { beforeDedup: 2, afterDedup: 2, coordMissing: 0 },
          county: { beforeDedup: 3, afterDedup: 3, coordMissing: 1 },
          failures: 0,
        } as UpperStats,
      },
      completed: ['11@21200'],
      provinces: [makeRecord('110000999', '北京市', '21200', coord)],
      cities: [
        makeRecord('110100999', '北京市', '21300', coord),
        makeRecord('310000999', '上海市', '21200', coord),
      ],
      counties: [
        makeRecord('110101999', '东城区', '21400', coord),
        makeRecord('110102999', '西城区', '21400', null),
        makeRecord('110105999', '朝阳区', '21400', coord),
      ],
    };
    await writeFile(file, JSON.stringify(payload), 'utf-8');

    const loaded = await loadUpperData(file);
    expect(loaded.meta.fetchedAt).toBe('2026-08-09T00:00:00.000Z');
    expect(loaded.completed).toEqual(['11@21200']);
    expect(loaded.provinces).toHaveLength(1);
    expect(loaded.cities).toHaveLength(2);
    expect(loaded.counties).toHaveLength(3);
  });

  it('文件不存在时回退到空状态', async () => {
    const loaded = await loadUpperData(path.join(dir, 'missing.json'));
    expect(loaded.provinces).toEqual([]);
    expect(loaded.cities).toEqual([]);
    expect(loaded.counties).toEqual([]);
    expect(loaded.completed).toEqual([]);
    expect(loaded.meta.stats).toEqual({
      province: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      city: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      county: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      failures: 0,
    });
  });

  it('缺少必要数组时回退到空状态', async () => {
    const file = path.join(dir, 'bad.json');
    await writeFile(
      file,
      JSON.stringify({ meta: { fetchedAt: 'x' }, provinces: [], cities: [] }),
      'utf-8'
    );

    const loaded = await loadUpperData(file);
    expect(loaded.provinces).toEqual([]);
    expect(loaded.cities).toEqual([]);
    expect(loaded.counties).toEqual([]);
    expect(loaded.completed).toEqual([]);
  });

  it('缺少 meta 时回退到空 meta', async () => {
    const file = path.join(dir, 'no-meta.json');
    const payload = {
      completed: [],
      provinces: [],
      cities: [],
      counties: [],
    };
    await writeFile(file, JSON.stringify(payload), 'utf-8');

    const loaded = await loadUpperData(file);
    expect(loaded.meta.fetchedAt).toBe('');
    expect(loaded.meta.note).toBe('');
    expect(loaded.meta.stats).toEqual({
      province: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      city: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      county: { beforeDedup: 0, afterDedup: 0, coordMissing: 0 },
      failures: 0,
    });
  });

  it('加载时对旧缓存中的重复县去重', async () => {
    const file = path.join(dir, 'dup.json');
    const payload: UpperData = {
      meta: {
        fetchedAt: '',
        note: '',
        stats: emptyData().meta.stats,
      },
      completed: [],
      provinces: [],
      cities: [],
      counties: [
        makeRecord('370705999', '奎文区', '21400', coord),
        makeRecord('370705999', '奎文区', '21400', coord),
      ],
    };
    await writeFile(file, JSON.stringify(payload), 'utf-8');

    const loaded = await loadUpperData(file);
    expect(loaded.counties).toHaveLength(1);
  });
});
