/**
 * 省级乡级代码解析 PoC（2.4）单测。
 *
 * 用四川表形态的 HTML fixture 验证：
 *   - parseTownshipHtmlTable 从两列表抽取 9 位码+名称，忽略表头/合计/非 9 位行
 *   - townshipRowToDivision 归一 9→12（尾补 000）、parent=前6位+000000、level=4、source=mca_decree
 *   - 端到端 parse→归一→diffToPatch(levels=[4]) 对小基线产出 add/update、不含 level5、过 validatePatch
 * 不联网、不依赖 cache.db（基线用内联 Division[]）。
 */
import { describe, it, expect } from 'vitest';
import {
  parseTownshipHtmlTable,
  townshipRowToDivision,
  townshipRowsToDivisions,
  townshipSourceOf,
} from '../dist/prov-township.js';
import { diffToPatch } from '../dist/diff.js';
import { validatePatch } from '@cndiv/data-protocol';
import type { Division } from '@cndiv/core';

// 四川表形态：表头 + 数据行（9 位码 + 名称）+ 合计行（无 9 位码）。
const SC_HTML = `
<table>
  <tr><th>行政区划代码</th><th>名称</th></tr>
  <tr><td>510104017</td><td>锦官驿街道</td></tr>
  <tr><td>510104018</td><td>东湖街道</td></tr>
  <tr><td>510104019</td><td>锦华路街道（更名）</td></tr>
  <tr><td>510107099</td><td>新增街道</td></tr>
  <tr><td>合计</td><td>3101</td></tr>
</table>`;

describe('parseTownshipHtmlTable', () => {
  it('抽取 9 位码+名称，忽略表头/合计行', () => {
    const rows = parseTownshipHtmlTable(SC_HTML);
    expect(rows).toEqual([
      { code9: '510104017', name: '锦官驿街道' },
      { code9: '510104018', name: '东湖街道' },
      { code9: '510104019', name: '锦华路街道（更名）' },
      { code9: '510107099', name: '新增街道' },
    ]);
  });

  it('空表/无 9 位码 → 空数组', () => {
    expect(parseTownshipHtmlTable('<table><tr><td>合计</td><td>x</td></tr></table>')).toEqual(
      []
    );
  });
});

describe('townshipRowToDivision 归一 9→12', () => {
  it('尾补 000、parent=前6位+000000、level4、mca_decree', () => {
    const d = townshipRowToDivision({ code9: '510104017', name: '锦官驿街道' }, 2026);
    expect(d).toMatchObject({
      code: '510104017000',
      name: '锦官驿街道',
      level: 4,
      parent_code: '510104000000',
      source_type: 'mca_decree',
    });
  });

  it('非 9 位码抛错', () => {
    expect(() => townshipRowToDivision({ code9: '5101040', name: 'x' }, 2026)).toThrow(
      /9 位/
    );
  });
});

describe('端到端 parse→归一→diff→validate', () => {
  it('对小基线产出 update+add，不含 level5，过 validatePatch', () => {
    const baseline: Division[] = [
      { code: '510104017000', name: '锦官驿街道', level: 4, parent_code: '510104000000', year: 2023 },
      { code: '510104018000', name: '东湖街道', level: 4, parent_code: '510104000000', year: 2023 },
      { code: '510104019000', name: '锦华路街道', level: 4, parent_code: '510104000000', year: 2023 },
      // 基线含一个村级(level5)，用于确认 diff(levels=[4]) 不触碰它
      { code: '510104017001', name: '某社区', level: 5, parent_code: '510104017000', year: 2023 },
    ];
    const current = townshipRowsToDivisions(parseTownshipHtmlTable(SC_HTML), 2026, '51');

    const { patch } = diffToPatch(baseline, current, {
      author: 'mzt-51-township',
      apply_after: '2023-baseline',
      levels: [4],
    });
    const safe = patch.operations.filter((o) => o.op !== 'remove');
    patch.operations = safe;

    const ops = safe.map((o) => ({ op: o.op, code: o.code }));
    // 510104019 更名 → update；510107099 新增 → add
    expect(ops).toContainEqual({ op: 'update', code: '510104019000' });
    expect(ops).toContainEqual({ op: 'add', code: '510107099000' });
    // 不含任何 level5 码（尾 3 位非 000 的 12 位村级）
    expect(safe.some((o) => o.code === '510104017001')).toBe(false);
    expect(validatePatch(patch).success).toBe(true);
  });
});

describe('注册表', () => {
  it('四川已确认收录，含最新期 URL', () => {
    const sc = townshipSourceOf('51');
    expect(sc?.status).toBe('confirmed');
    expect(sc?.latestUrl).toContain('mzt.sc.gov.cn');
  });
});
