/**
 * 按年选基线（--baselines）的门禁不变量。
 * 锁死 2026-09 事故的两条根因：
 *   ① 全年份 patch 共用单一 2023 码集 → apply_after=2020-baseline 的 patch 被拿
 *      2023 名册校验，必然误报 ADD_DUPLICATE / TARGET_MISSING（当年 40 个存量 error）；
 *   ② 基线缺失静默降级 → CI 引用完整性空转（门禁形同虚设）。
 * 修复后契约：按 apply_after 年过滤码集；缺年/缺文件/空年一律 fail-hard 不降级。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseBaselinesArg, loadYearCodes } from '../dist/baseline-map.js';
import { verifyStructural } from '../dist/verify.js';
import type { Patch, Operation } from '@cndiv/data-protocol';

const HEADER = 'code,name,level,parent_code,year,status,source_type,confidence_score';

// 多年 CSV fixture（模拟 source-history）：甲县(110101) 只在 2020 名册；丙县(110102) 只在 2023。
// 这正是「跨年同码名册演化」——2021 patch 新设的码，2023 名册里当然也有。
const MULTI_YEAR_CSV = [
  HEADER,
  '110000000000,"京市",1,,2020,active,official_nbs,100',
  '110100000000,"甲市",2,110000000000,2020,active,official_nbs,100',
  '110101000000,"甲县",3,110100000000,2020,active,official_nbs,100',
  '110000000000,"京市",1,,2023,active,official_nbs,100',
  '110100000000,"甲市",2,110000000000,2023,active,official_nbs,100',
  '110102000000,"丙县",3,110100000000,2023,active,official_nbs,100',
].join('\n');

let tmp = '';

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cndiv-baseline-map-'));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('parseBaselinesArg', () => {
  it('合法多段解析为「年 → 路径」映射', () => {
    const m = parseBaselinesArg('2020=a.csv,2023=b/c.csv');
    expect(m.get(2020)).toBe('a.csv');
    expect(m.get(2023)).toBe('b/c.csv');
    expect(m.size).toBe(2);
  });

  it('路径里的 = 不被切分（不能复用 get() 的 split(\'=\') 语义）', () => {
    expect(parseBaselinesArg('2020=path/eq=x.csv').get(2020)).toBe('path/eq=x.csv');
  });

  it('条目无年份或无路径 → 抛错（fail-hard，不静默跳过）', () => {
    expect(() => parseBaselinesArg('2020')).toThrow();
    expect(() => parseBaselinesArg('a.csv')).toThrow();
    expect(() => parseBaselinesArg('')).toThrow();
  });

  it('同年重复声明 → 抛错', () => {
    expect(() => parseBaselinesArg('2020=a.csv,2020=b.csv')).toThrow(/重复/);
  });
});

describe('loadYearCodes', () => {
  it('多年 CSV 按 year 列过滤取该年快照', async () => {
    const csv = join(tmp, 'multi.csv');
    await writeFile(csv, MULTI_YEAR_CSV, 'utf-8');
    const m = parseBaselinesArg(`2020=${csv},2023=${csv}`);
    const y2020 = await loadYearCodes(m, 2020);
    const y2023 = await loadYearCodes(m, 2023);
    expect(y2020.ok && [...y2020.codes]).toEqual([
      '110000000000',
      '110100000000',
      '110101000000',
    ]);
    expect(y2023.ok && [...y2023.codes]).toEqual([
      '110000000000',
      '110100000000',
      '110102000000',
    ]);
  });

  it('map 缺该年 → fail-hard（绝不静默退回别的年份）', async () => {
    const r = await loadYearCodes(parseBaselinesArg('2023=a.csv'), 2020);
    expect(!r.ok && r.reason).toMatch(/未提供 2020 基线/);
  });

  it('CSV 路径不存在 → fail-hard', async () => {
    const r = await loadYearCodes(parseBaselinesArg('2020=nope/missing.csv'), 2020);
    expect(!r.ok && r.reason).toMatch(/不存在/);
  });

  it('单年 CSV 拿来滤别的年（码集为空）→ fail-hard，不产出空集假基线', async () => {
    const csv = join(tmp, 'single-2023.csv');
    await writeFile(
      csv,
      HEADER + '\n110101000000,"甲县",3,110100000000,2023,active,official_nbs,100\n',
      'utf-8'
    );
    const r = await loadYearCodes(parseBaselinesArg(`2020=${csv}`), 2020);
    expect(!r.ok && r.reason).toMatch(/无 2020 年行/);
  });
});

describe('回归：2026-09 基线错位事故（40 个误报 error 的根因形态）', () => {
  // 2020-baseline patch：新设丙县(110102，2023 名册也有此码) + 撤销甲县(110101，仅 2020 名册有)
  const incidentPatch: Patch = {
    meta: { author: 't', evidence_confidence: 'high', apply_after: '2020-baseline' },
    operations: [
      { op: 'add', code: '110102000000', name: '丙县', level: 3, parent_code: '110100000000' },
      { op: 'remove', code: '110101000000' },
    ] as Operation[],
  };

  it('拿 2023 名册校验 2020-baseline patch → 双重误报（事故现场）', async () => {
    const csv = join(tmp, 'multi.csv');
    await writeFile(csv, MULTI_YEAR_CSV, 'utf-8');
    const m = parseBaselinesArg(`2020=${csv},2023=${csv}`);
    const wrong = await loadYearCodes(m, 2023); // 旧实现：全年份共用这一个码集
    expect(wrong.ok).toBe(true);
    const rules = verifyStructural(incidentPatch, {
      baselineCodes: wrong.ok ? wrong.codes : new Set<string>(),
    }).errors.map((e) => e.rule);
    expect(rules).toContain('ADD_DUPLICATE'); // 丙县在 2023 名册 → 诬「重复新增」
    expect(rules).toContain('TARGET_MISSING'); // 甲县不在 2023 名册 → 诬「目标不存在」
  });

  it('按 apply_after=2020 选码集 → 0 error（修复后的行为）', async () => {
    const csv = join(tmp, 'multi.csv');
    await writeFile(csv, MULTI_YEAR_CSV, 'utf-8');
    const m = parseBaselinesArg(`2020=${csv},2023=${csv}`);
    const right = await loadYearCodes(m, 2020);
    expect(right.ok).toBe(true);
    const r = verifyStructural(incidentPatch, {
      baselineCodes: right.ok ? right.codes : new Set<string>(),
    });
    expect(r.errors).toHaveLength(0);
  });
});
