/**
 * CSV 写入契约 + Postal 数据契约的边界。这两处是「多处写出同一格式」与「近静态参考数据」
 * 的单一真相源，字段转义/正则一旦漂移会静默污染数据包，故用最小夹具钉死规则。
 */
import { describe, it, expect } from 'vitest';
import {
  csvCell,
  DIVISIONS_CSV_HEADER,
  validatePostalRecord,
} from '../dist/index.js';

describe('csvCell — RFC4180 转义', () => {
  it('普通值仅加双引号包裹', () => {
    expect(csvCell('东城区')).toBe('"东城区"');
  });

  it('内嵌双引号翻倍转义', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('""')).toBe('""""""');
  });

  it('含逗号/换行的值靠外层引号保护（内容原样保留）', () => {
    expect(csvCell('市辖区,县')).toBe('"市辖区,县"');
    expect(csvCell('行\n列')).toBe('"行\n列"');
  });

  it('空串 → 一对空引号', () => {
    expect(csvCell('')).toBe('""');
  });
});

describe('DIVISIONS_CSV_HEADER — 列契约', () => {
  it('8 列且顺序与 DATABASE_SCHEMA 对齐、不含换行', () => {
    expect(DIVISIONS_CSV_HEADER.split(',')).toEqual([
      'code',
      'name',
      'level',
      'parent_code',
      'year',
      'status',
      'source_type',
      'confidence_score',
    ]);
    expect(DIVISIONS_CSV_HEADER).not.toContain('\n');
  });
});

describe('validatePostalRecord — 邮编/区号契约', () => {
  const ok = {
    province: '北京市',
    name: '东城区',
    zip_code: '100010',
    area_code: '010',
  };

  it('合法记录通过', () => {
    expect(validatePostalRecord(ok).success).toBe(true);
  });

  it('4 位区号（如 0755）通过', () => {
    expect(validatePostalRecord({ ...ok, area_code: '0755' }).success).toBe(
      true
    );
  });

  it('邮编非 6 位数字 → 拒绝', () => {
    expect(validatePostalRecord({ ...ok, zip_code: '10001' }).success).toBe(
      false
    );
    expect(validatePostalRecord({ ...ok, zip_code: '10001a' }).success).toBe(
      false
    );
  });

  it('区号不以 0 开头 / 位数越界 → 拒绝', () => {
    expect(validatePostalRecord({ ...ok, area_code: '10' }).success).toBe(
      false
    );
    expect(validatePostalRecord({ ...ok, area_code: '01' }).success).toBe(
      false
    );
    expect(validatePostalRecord({ ...ok, area_code: '01234' }).success).toBe(
      false
    );
  });

  it('必填名称为空 → 拒绝', () => {
    expect(validatePostalRecord({ ...ok, province: '' }).success).toBe(false);
    expect(validatePostalRecord({ ...ok, name: '' }).success).toBe(false);
  });
});
