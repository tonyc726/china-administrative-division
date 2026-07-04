/**
 * @cndiv/crawler 示例：层级归一化(canonicalizeParent/isPlaceholder) + patch 结构性校验(verifyStructural)。
 *
 * 演示 dmfw(扁平) ↔ NBS(占位层) 建模差异如何被自动消解，以及 schema 之上的语义门禁如何拦截不自洽 patch。
 * 运行：npx tsx packages/crawler/examples/verify-patch.ts
 */
import { canonicalizeParent, isPlaceholder, verifyStructural } from '@cndiv/crawler';
import type { Division } from '@cndiv/core';
import type { Patch } from '@cndiv/data-protocol';

const div = (code: string, name: string, level: number, parent: string | null): Division => ({
  code,
  name,
  level: level as Division['level'],
  parent_code: parent,
  year: 2023,
});

// ① canonicalizeParent：dmfw 对直辖市跳过 level2，东城区扁平直挂北京(110000)；
//    归一化以码结构派生真实父码(110100 市辖区占位)覆盖，与 NBS 基线对齐 → 差分不再产假 move。
const dmfwFlat = div('110101000000', '东城区', 3, '110000000000');
console.log('① 归一化父码：', dmfwFlat.parent_code, '→', canonicalizeParent(dmfwFlat).parent_code); // 110000 → 110100

// ② isPlaceholder：识别 NBS 结构性占位层（dmfw 永不返回，差分时须豁免以免误判 remove）
console.log('② 是否占位层：市辖区 =', isPlaceholder(div('110100000000', '市辖区', 2, '110000000000')));
console.log('             石家庄市 =', isPlaceholder(div('130100000000', '石家庄市', 2, '130000000000')));

// ③ verifyStructural：baseline 已有东城区/市辖区占位层；校验一个含真错误的 patch
const baselineCodes = new Set(['110000000000', '110100000000', '110101000000']);
const badPatch: Patch = {
  meta: { author: 'demo', evidence_confidence: 'high', apply_after: '2023-baseline' },
  operations: [
    // 扁平父码 bug：110101 结构父应为 110100，却声明 110000 → ADD_PARENT_MISMATCH
    { op: 'add', code: '110101000000', name: '东城区', level: 3, parent_code: '110000000000' },
    // 更新一个 baseline 不存在的码 → TARGET_MISSING
    { op: 'update', code: '110999000000', name: '幽灵区' },
  ],
};
const report = verifyStructural(badPatch, { baselineCodes });
console.log('③ 门禁 error 规则：', report.errors.map((e) => e.rule)); // [ADD_PARENT_MISMATCH, ADD_DUPLICATE?, TARGET_MISSING]
console.log('   error 数 =', report.errors.length, '→ 门禁', report.errors.length > 0 ? '不通过(退出码1)' : '通过');

// ④ 正确 patch：新增一个码结构自洽、父码真实存在的节点 → 无 error
const goodPatch: Patch = {
  meta: { author: 'demo', evidence_confidence: 'high', apply_after: '2023-baseline' },
  operations: [{ op: 'add', code: '110102000000', name: '西城区', level: 3, parent_code: '110100000000' }],
};
console.log('④ 正确 patch error 数 =', verifyStructural(goodPatch, { baselineCodes }).errors.length); // 0
