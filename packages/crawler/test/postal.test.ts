/**
 * 锁定 ip138 省页解析契约：用真实北京页夹具断言解析结果，且全部通过 PostalRecord schema。
 * ip138 改版会让此测试变红（夹具/解析器需同步更新），即"现网结构变更"的早期信号。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseProvincePostal } from '../dist/postal.js';
import { validatePostalRecord } from '@cndiv/data-protocol';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, 'fixtures/ip138-beijing.html'), 'utf-8');
const records = parseProvincePostal(html, '北京市');

describe('parseProvincePostal (ip138 现网结构)', () => {
  it('解析出北京多条区县邮编/区号记录', () => {
    expect(records.length).toBeGreaterThan(10);
    expect(records.find((r) => r.name === '东城区')).toMatchObject({
      province: '北京市',
      zip_code: '100000',
      area_code: '010',
    });
  });

  it('所有记录通过 PostalRecord schema 校验', () => {
    expect(records.every((r) => validatePostalRecord(r).success)).toBe(true);
  });

  it('无噪声行（6 位邮编 + 0 开头区号）', () => {
    expect(records.every((r) => /^\d{6}$/.test(r.zip_code) && /^0\d{2,3}$/.test(r.area_code))).toBe(true);
  });
});
