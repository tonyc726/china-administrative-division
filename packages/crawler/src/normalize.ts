/**
 * 层级建模归一化：消解 dmfw(扁平) ↔ NBS(占位层) 的结构差异，避免差分产出假 move / 假 remove。
 *
 * 背景（crawler 全国首跑 2026-06-27 暴露）：NBS 基线为直辖市插入「市辖区」占位层
 * （东城区 110101 parent=110100(市辖区,level2)→北京）、为省直管县级市插入「省直辖县级行政区划」
 * 占位层（济源 419001 parent=419000）；而 dmfw 对直辖市跳过 level2、区/省直管市直接扁平直挂。
 * 直接差分会把 48 个直辖市区 + 5 个省直管市误判为 move、把占位层误判为 remove——全是建模差异非真实变更。
 *
 * First Principles：12 位码本身即真实层级，分歧只在 dmfw *上报* 的 parent_code 字段。故不用破坏式
 * 折叠基线（会污染真·新增节点的父码），而是以码结构派生父码统一两侧口径。
 */
import { getParentCode, DIVISION_LEVEL } from '@cndiv/core';
import type { Division } from '@cndiv/core';
import { PLACEHOLDER_NAMES } from '@cndiv/reader';

/**
 * NBS 基线中的结构性占位层名称；dmfw 扁平模型永不返回这些节点。
 *
 * 单一真相源在 `@cndiv/reader`——此处仅**再导出**，绝不另存一份。
 * 曾经两边各定义一份并漂移，结果 `自治区直辖县级行政区划`（新疆 659000）两边都漏，
 * 被当成真政区产出假 remove。要增删占位层，改 reader 那一处。
 */
export { PLACEHOLDER_NAMES };

/**
 * 判定是否为 NBS 结构性占位层（直辖市「市辖区」/ 省直管「省直辖县级行政区划」，均为 level2）。
 * dmfw 从不返回它们，故只会作为「基线有 / 当前无」落入 remove 分支——属建模差异而非真实撤销，
 * 差分须豁免，绝不产 remove（独立于 run.ts 的 --removes 总开关，后者也会抑制真实 remove）。
 */
export function isPlaceholder(d: Division): boolean {
  return d.level === DIVISION_LEVEL.CITY && PLACEHOLDER_NAMES.has(d.name);
}

/**
 * 以 12 位码结构派生的父码覆盖上报父码，统一 dmfw / NBS 两侧口径。
 * 东城区 110101 的结构父恒为 110100(市辖区占位)，与 dmfw 上报的 110000(北京) 无关；
 * 归一化后 baseline/current 父码一致，48+5 个假 move 消失，真·新增节点则自动落到 NBS 占位模型下。
 *
 * 幂等性：对 NBS baseline 无副作用（其父码本就是码结构父）；仅改写 dmfw current 的扁平父码。
 * FMEA：getParentCode 对省级(无父)、非法码、或省码白名单外(港澳台等)返回 null，此时保留原上报值不动。
 */
export function canonicalizeParent(d: Division): Division {
  const parent = getParentCode(d.code, d.level);
  return parent === null ? d : { ...d, parent_code: parent };
}
