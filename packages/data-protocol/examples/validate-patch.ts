/**
 * @cndiv/data-protocol 示例：用 validatePatch 守门一个 patch 对象。
 * 产出的 operations 写入 patches/ 前必须经此校验（CI 的 validate-patches 同款）。
 * 运行：npx tsx packages/data-protocol/examples/validate-patch.ts
 */
import { validatePatch, type Patch } from '@cndiv/data-protocol';

// 合法 patch：add + update（meta 缺省字段会被 zod 默认值填充）
const ok: unknown = {
  meta: {
    author: 'tonyc726',
    source_url: 'https://www.mca.gov.cn/n/2025/example',
    evidence_confidence: 'high',
  },
  operations: [
    {
      op: 'add',
      code: '310115001002',
      name: '新设社区居委会',
      level: 5,
      parent_code: '310115001000',
      source_type: 'community',
      confidence_score: 60,
    },
    { op: 'update', code: '310115102000', status: 'deprecated', note: '撤销合并' },
  ],
};
const r1 = validatePatch(ok);
if (r1.success) {
  const patch: Patch = r1.data;
  console.log('✅ 合法，operations =', patch.operations.length);
  console.log('   meta.apply_after 默认填充 =', patch.meta.apply_after); // '2023-baseline'
} else {
  console.error('意外失败：', r1.error);
}

// 非法 patch：code 非 12 位 + level 越界(9) → 被拒
const bad: unknown = {
  meta: { author: 't' },
  operations: [{ op: 'add', code: '310115', name: 'x', level: 9, parent_code: null }],
};
const r2 = validatePatch(bad);
console.log('❌ 非法被拒 =', !r2.success); // true
if (!r2.success) {
  // 注意：error 是 zod 序列化字符串（非人类友好文案）；要逐条展示用 PatchSchema.safeParse 取 issues
  console.log('   error 预览 =', String(r2.error).slice(0, 80), '...');
}
