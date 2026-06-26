import { describe, it, expect } from 'vitest';
// 从已构建 dist 导入（规避 vitest 对 NodeNext `.js` 后缀的解析摩擦；CI 顺序 build→test 已保证 dist 存在）
import { getLevelFromCode, getParentCode, DIVISION_LEVEL } from '../dist/index.js';

describe('getLevelFromCode — GB/T 2260 的 2+2+2+3+3 切分', () => {
  it('按尾零正确判定五级', () => {
    expect(getLevelFromCode('110000000000')).toBe(DIVISION_LEVEL.PROVINCE);
    expect(getLevelFromCode('110100000000')).toBe(DIVISION_LEVEL.CITY);
    expect(getLevelFromCode('110101000000')).toBe(DIVISION_LEVEL.COUNTY);
    expect(getLevelFromCode('110101001000')).toBe(DIVISION_LEVEL.TOWNSHIP);
    expect(getLevelFromCode('110101001001')).toBe(DIVISION_LEVEL.VILLAGE);
  });

  it('回归：6 位县级码 110101 应为 level 3，而非旧 migrate 的 2', () => {
    expect(getLevelFromCode('110101000000')).toBe(3);
  });

  it('非法省码返回 null', () => {
    expect(getLevelFromCode('990000000000')).toBeNull();
  });
});

describe('getParentCode — 逐级上溯父码', () => {
  it('县→市→省→null', () => {
    expect(getParentCode('110101000000', DIVISION_LEVEL.COUNTY)).toBe('110100000000');
    expect(getParentCode('110100000000', DIVISION_LEVEL.CITY)).toBe('110000000000');
    expect(getParentCode('110000000000', DIVISION_LEVEL.PROVINCE)).toBeNull();
  });
});
