/**
 * parseDivisionsCsv 的引号状态机是"基线加载"的承重假设：name 可能含逗号/转义引号，
 * 解析错位会让整张差分表错乱。这里用 fixture 锁定其边界行为（无需联网/原生依赖）。
 */
import { describe, it, expect } from 'vitest';
import { parseDivisionsCsv } from '../dist/baseline.js';

const HEADER = 'code,name,level,parent_code,year,status,source_type,confidence_score';

describe('parseDivisionsCsv', () => {
  it('解析普通行：类型转换 + 空 parent_code → null', () => {
    const csv = `${HEADER}\n110000000000,"北京市",1,,2023,active,official_nbs,100\n`;
    const [d] = parseDivisionsCsv(csv);
    expect(d.code).toBe('110000000000');
    expect(d.name).toBe('北京市');
    expect(d.level).toBe(1);
    expect(d.parent_code).toBeNull();
    expect(d.year).toBe(2023);
  });

  it('name 含逗号（被引号包裹）不被误切分', () => {
    const csv = `${HEADER}\n532800000000,"西双版纳,傣族自治州",2,530000000000,2023,active,official_nbs,100\n`;
    const [d] = parseDivisionsCsv(csv);
    expect(d.name).toBe('西双版纳,傣族自治州');
    expect(d.level).toBe(2);
    expect(d.parent_code).toBe('530000000000');
  });

  it('name 含转义双引号（""→"）正确还原', () => {
    const csv = `${HEADER}\n110101000000,"某""特殊""区",3,110000000000,2023,active,official_nbs,100\n`;
    const [d] = parseDivisionsCsv(csv);
    expect(d.name).toBe('某"特殊"区');
  });

  it('跳过表头与空行，行数正确', () => {
    const csv = `${HEADER}\n110000000000,"北京市",1,,2023,active,official_nbs,100\n\n110101000000,"东城区",3,110000000000,2023,active,official_nbs,100\n`;
    expect(parseDivisionsCsv(csv)).toHaveLength(2);
  });
});
