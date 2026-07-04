import { describe, it, expect } from 'vitest';
import { validatePatch } from '../dist/index.js';

const meta = { author: 't' };
const patch = (op: unknown) => ({ meta, operations: [op] });

describe('validatePatch — 复用 core 枚举的 nativeEnum 约束 (M2)', () => {
  it('接受合法 add（枚举 source_type）', () => {
    expect(
      validatePatch(
        patch({
          op: 'add',
          code: '110000000000',
          name: '北京市',
          level: 1,
          parent_code: null,
          source_type: 'mca_decree',
          confidence_score: 90,
        }),
      ).success,
    ).toBe(true);
  });

  it('拒绝非法 source_type（旧 z.string() 会误放行）', () => {
    expect(
      validatePatch(
        patch({ op: 'add', code: '110000000000', name: 'x', level: 1, parent_code: null, source_type: 'garbage' }),
      ).success,
    ).toBe(false);
  });

  it('拒绝越界 level', () => {
    expect(
      validatePatch(patch({ op: 'add', code: '110000000000', name: 'x', level: 9, parent_code: null })).success,
    ).toBe(false);
  });

  it('拒绝非法 update status', () => {
    expect(validatePatch(patch({ op: 'update', code: '110000000000', status: 'zombie' })).success).toBe(false);
  });

  it('接受合法 source_pipeline 戳（xzqh/community/dmfw）', () => {
    for (const p of ['xzqh', 'community', 'dmfw']) {
      const res = validatePatch({
        meta: { author: 't', source_pipeline: p },
        operations: [{ op: 'remove', code: '110000000000' }],
      });
      expect(res.success).toBe(true);
    }
  });

  it('拒绝非法 source_pipeline 值', () => {
    expect(
      validatePatch({
        meta: { author: 't', source_pipeline: 'wikipedia' },
        operations: [{ op: 'remove', code: '110000000000' }],
      }).success,
    ).toBe(false);
  });
});
