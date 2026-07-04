/**
 * @cndiv/reader 单测：用真实 DATABASE_SCHEMA 建样本库（北京「市辖区」+ 重庆「市辖区/县」双占位 + 跨年版本），
 * 覆盖查询方法、两个坑处理（复合主键 / 占位层穿透含 else 分支与多占位）、null→undefined 归一化、向上查询、防御。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { DATABASE_SCHEMA, INSERT_DIVISIONS_BATCH } from '@cndiv/data-protocol';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { openCache, defaultCachePath, type CnDivReader } from '../dist/index.js';

const DB_PATH = join(tmpdir(), `cndiv-reader-test-${process.pid}.db`);

// [code, name, level, parent]
const ROWS_2023: Array<[string, string, number, string | null]> = [
  // 北京：市辖区占位层
  ['110000000000', '北京市', 1, null],
  ['110100000000', '市辖区', 2, '110000000000'],
  ['110101000000', '东城区', 3, '110100000000'],
  ['110102000000', '西城区', 3, '110100000000'],
  ['110101001000', '东华门街道', 4, '110101000000'],
  // 重庆：市辖区 + 县 两种 level=2 占位层
  ['500000000000', '重庆市', 1, null],
  ['500100000000', '市辖区', 2, '500000000000'],
  ['500200000000', '县', 2, '500000000000'],
  ['500101000000', '万州区', 3, '500100000000'],
  ['500236000000', '奉节县', 3, '500200000000'],
];

let reader: CnDivReader;

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  const seed = new Database(DB_PATH);
  seed.exec(DATABASE_SCHEMA);
  const ins = seed.prepare(INSERT_DIVISIONS_BATCH);
  for (const [code, name, level, parent] of ROWS_2023) {
    ins.run(code, name, level, parent, 2023, 'active', 'official_nbs', 100, null);
  }
  // 同码不同年：北京市 2020 版本（测复合主键隔离 + listYears）
  ins.run('110000000000', '北京市', 1, null, 2020, 'active', 'official_nbs', 100, null);
  seed.close();
  reader = openCache(DB_PATH);
});

afterAll(() => {
  reader?.close();
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
});

describe('findByCode', () => {
  it('按码 + year 查到唯一节点', () => {
    expect(reader.findByCode('110101000000', 2023)?.name).toBe('东城区');
  });
  it('复合主键：同码不同年互不串', () => {
    expect(reader.findByCode('110000000000', 2023)?.year).toBe(2023);
    expect(reader.findByCode('110000000000', 2020)?.year).toBe(2020);
  });
  it('无命中返回 null', () => {
    expect(reader.findByCode('990000000000', 2023)).toBeNull();
    expect(reader.findByCode('110101000000', 1999)).toBeNull();
  });
  it('可空列 NULL 归一为 undefined（不是 null，兑现 Division 契约）', () => {
    const d = reader.findByCode('110101000000', 2023)!;
    expect(d.urban_rural_code).toBeUndefined();
    expect(d.urban_rural_code).not.toBeNull();
    expect(d.parent_code).toBe('110100000000'); // parent_code 非空保留
  });
});

describe('getChildren', () => {
  it('默认返回原始直接子级（含占位层）', () => {
    expect(reader.getChildren('110000000000', 2023).map((d) => d.name)).toEqual(['市辖区']);
  });
  it('skipPlaceholder 穿透单占位层（市辖区）到真实区县', () => {
    const c = reader.getChildren('110000000000', 2023, { skipPlaceholder: true });
    expect(c.map((d) => d.name)).toEqual(['东城区', '西城区']);
  });
  it('skipPlaceholder 穿透多种占位层（市辖区 + 县）', () => {
    const c = reader.getChildren('500000000000', 2023, { skipPlaceholder: true });
    expect(c.map((d) => d.name)).toEqual(['万州区', '奉节县']);
  });
  it('skipPlaceholder 下非占位子级走 else 分支（原样保留）', () => {
    const c = reader.getChildren('500100000000', 2023, { skipPlaceholder: true });
    expect(c.map((d) => d.name)).toEqual(['万州区']); // 万州区 level=3 非占位
  });
  it('空结果返回 []', () => {
    expect(reader.getChildren('999999999999', 2023)).toEqual([]);
  });
});

describe('getDescendants', () => {
  it('递归全部后代，不含自身，按 code 升序', () => {
    const d = reader.getDescendants('110000000000', 2023);
    expect(d.map((x) => x.name)).toEqual(['市辖区', '东城区', '东华门街道', '西城区']);
    expect(d.some((x) => x.code === '110000000000')).toBe(false);
  });
});

describe('getParent / getAncestors（向上查询）', () => {
  it('getParent 查直接父节点', () => {
    expect(reader.getParent('110101000000', 2023)?.name).toBe('市辖区');
  });
  it('getParent 对省级返回 null', () => {
    expect(reader.getParent('110000000000', 2023)).toBeNull();
  });
  it('getAncestors 返回省→市→县祖先链（level 升序，不含自身）', () => {
    const a = reader.getAncestors('110101001000', 2023);
    expect(a.map((x) => x.name)).toEqual(['北京市', '市辖区', '东城区']);
  });
  it('getAncestors 对省级返回 []', () => {
    expect(reader.getAncestors('110000000000', 2023)).toEqual([]);
  });
});

describe('getByLevel / getProvinces', () => {
  it('getByLevel(3) 返回县级（跨省按 code 升序）', () => {
    expect(reader.getByLevel(3, 2023).map((d) => d.name)).toEqual([
      '东城区',
      '西城区',
      '万州区',
      '奉节县',
    ]);
  });
  it('getProvinces 返回省级', () => {
    expect(reader.getProvinces(2023).map((d) => d.name)).toEqual(['北京市', '重庆市']);
  });
});

describe('findByName', () => {
  it('按精确名 + year 查码', () => {
    expect(reader.findByName('东城区', 2023).map((d) => d.code)).toEqual(['110101000000']);
  });
  it('多命中：同名「市辖区」返回北京+重庆两条', () => {
    expect(reader.findByName('市辖区', 2023).map((d) => d.code)).toEqual([
      '110100000000',
      '500100000000',
    ]);
  });
  it('无命中返回 []', () => {
    expect(reader.findByName('不存在的区', 2023)).toEqual([]);
  });
});

describe('listYears', () => {
  it('返回所有年份快照（升序）', () => {
    expect(reader.listYears()).toEqual([2020, 2023]);
  });
});

describe('openCache 防御', () => {
  it('文件不存在抛友好错误（含 hydrate 提示）', () => {
    expect(() => openCache(join(tmpdir(), 'cndiv-nonexistent-xyz-zzz.db'))).toThrow(/hydrate/);
  });
  it('defaultCachePath 指向 ~/.cndiv/cache.db', () => {
    expect(defaultCachePath()).toMatch(/\.cndiv[/\\]cache\.db$/);
  });
});
