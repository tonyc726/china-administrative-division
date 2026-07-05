/**
 * structural 门禁不变量：schema 之上的语义校验必须捕获 schema 漏过的码/层级/父级不自洽与引用完整性问题；
 * cross 桩必须抛错以坐实"未实现、不接入 CI"。锁定这两条，保证 CI 门禁离线确定性且合规红线不被误穿。
 */
import { describe, it, expect } from 'vitest';
import { verifyStructural, verifyCross } from '../dist/verify.js';
import type { Patch, Operation } from '@cndiv/data-protocol';

const patch = (operations: Operation[]): Patch => ({
  meta: { author: 'test', evidence_confidence: 'high', apply_after: '2023-baseline' },
  operations,
});
const rules = (report: { errors: { rule: string }[]; warnings: { rule: string }[] }): string[] => [
  ...report.errors.map((e) => e.rule),
  ...report.warnings.map((w) => w.rule),
];

// baseline 现存码（含直辖市占位层 110100）：东城区/西城区/占位层
const BASE = new Set(['110000000000', '110100000000', '110101000000', '110102000000']);

describe('verifyStructural · 码/层级/父级自洽（离线）', () => {
  it('合法 add（码/层级/父级自洽）：无 error', () => {
    const r = verifyStructural(patch([{ op: 'add', code: '110118000000', name: '密云区', level: 3, parent_code: '110100000000' }]));
    expect(r.errors).toHaveLength(0);
  });

  it('CODE_INVALID：非法码（省码白名单外）被捕获，schema 只查长度查不出', () => {
    const r = verifyStructural(patch([{ op: 'add', code: '990101000000', name: '假区', level: 3, parent_code: '990100000000' }]));
    expect(r.errors.map((e) => e.rule)).toContain('CODE_INVALID');
  });

  it('ADD_LEVEL_MISMATCH：level 与码结构派生 level 不符', () => {
    // 110101 结构 level=3，却声明 level=5
    const r = verifyStructural(patch([{ op: 'add', code: '110101000000', name: '东城区', level: 5, parent_code: '110101000000' }]));
    expect(r.errors.map((e) => e.rule)).toContain('ADD_LEVEL_MISMATCH');
  });

  it('ADD_PARENT_MISMATCH：扁平父码 bug 的门禁点（110101 声明父=110000 而非 110100）', () => {
    const r = verifyStructural(patch([{ op: 'add', code: '110101000000', name: '东城区', level: 3, parent_code: '110000000000' }]));
    expect(r.errors.map((e) => e.rule)).toContain('ADD_PARENT_MISMATCH');
  });

  it('省级 add：parent_code=null 与码结构一致，不误报', () => {
    const r = verifyStructural(patch([{ op: 'add', code: '120000000000', name: '天津市', level: 1, parent_code: null }]));
    expect(r.errors).toHaveLength(0);
  });
});

describe('verifyStructural · 引用完整性（带 baseline）', () => {
  it('ADD_DUPLICATE：add 已存在于 baseline 的码', () => {
    const r = verifyStructural(patch([{ op: 'add', code: '110101000000', name: '东城区', level: 3, parent_code: '110100000000' }]), { baselineCodes: BASE });
    expect(r.errors.map((e) => e.rule)).toContain('ADD_DUPLICATE');
  });

  it('ADD_PARENT_MISSING：父码既不在 baseline 也未在本 patch 新增 → warning（非阻断）', () => {
    // 130102 长安区，父 130100 石家庄不在 BASE 也未新增
    const r = verifyStructural(patch([{ op: 'add', code: '130102000000', name: '长安区', level: 3, parent_code: '130100000000' }]), { baselineCodes: BASE });
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.map((w) => w.rule)).toContain('ADD_PARENT_MISSING');
  });

  it('TARGET_MISSING：update 一个 baseline 不存在的码 → error', () => {
    const r = verifyStructural(patch([{ op: 'update', code: '110118000000', name: '密云区' }]), { baselineCodes: BASE });
    expect(r.errors.map((e) => e.rule)).toContain('TARGET_MISSING');
  });

  it('本 patch 内先 add 再 move：move 目标由本 patch 新增码满足，不报 TARGET_MISSING', () => {
    const r = verifyStructural(
      patch([
        { op: 'add', code: '110118000000', name: '密云区', level: 3, parent_code: '110100000000' },
        { op: 'move', code: '110118000000', new_parent: '110100000000' },
      ]),
      { baselineCodes: BASE }
    );
    expect(r.errors.map((e) => e.rule)).not.toContain('TARGET_MISSING');
  });

  it('offline（无 baseline）：跳过引用完整性，仅查码结构自洽', () => {
    const r = verifyStructural(patch([{ op: 'update', code: '110118000000', name: '密云区' }]));
    // 无 baseline 时 update 不存在码不报 TARGET_MISSING（引用完整性被跳过）
    expect(rules(r)).not.toContain('TARGET_MISSING');
    expect(r.errors).toHaveLength(0);
  });
});

describe('verifyStructural · move/new_parent 与重复 op', () => {
  it('NEWPARENT_SELF：new_parent 指向自身', () => {
    const r = verifyStructural(patch([{ op: 'move', code: '110101000000', new_parent: '110101000000' }]), { baselineCodes: BASE });
    expect(r.errors.map((e) => e.rule)).toContain('NEWPARENT_SELF');
  });

  it('NEWPARENT_INVALID：new_parent 非合法码（schema 只查 12 位长度）', () => {
    const r = verifyStructural(patch([{ op: 'move', code: '110101000000', new_parent: '990000000000' }]), { baselineCodes: BASE });
    expect(r.errors.map((e) => e.rule)).toContain('NEWPARENT_INVALID');
  });

  it('DUP_OP_CONFLICT：同码既 add 又 remove → error', () => {
    const r = verifyStructural(
      patch([
        { op: 'add', code: '110118000000', name: '密云区', level: 3, parent_code: '110100000000' },
        { op: 'remove', code: '110118000000' },
      ]),
      { baselineCodes: BASE }
    );
    expect(r.errors.map((e) => e.rule)).toContain('DUP_OP_CONFLICT');
  });

  it('DUP_OP：同码多次非冲突 → warning', () => {
    const r = verifyStructural(patch([
      { op: 'update', code: '110101000000', name: '东城区A' },
      { op: 'update', code: '110101000000', name: '东城区B' },
    ]), { baselineCodes: BASE });
    expect(r.warnings.map((w) => w.rule)).toContain('DUP_OP');
  });
});

describe('verifyCross · 合规桩', () => {
  it('调用即抛错，坐实"未实现、不接入 CI"，错误信息含合规红线与文档指引', () => {
    expect(() => verifyCross()).toThrow(/未实现|合规|docs/);
  });
});
