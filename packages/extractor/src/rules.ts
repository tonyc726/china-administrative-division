/**
 * 规则法意图抽取：高精度命中标准公告句式，作为 LLM 路径不可用时的确定性兜底。
 * 设计取向：宁可漏（交 LLM/人工），不可错——只匹配带行政单位后缀的规范名称。
 */
import type { ChangeIntent } from './types.js';

/** 行政区划单位后缀，用于约束名称边界，避免吞掉无关汉字 */
const UNIT = '(?:省|自治区|市|自治州|地区|盟|区|县|自治县|旗|自治旗|镇|乡|民族乡|街道)';
const NAME = `[\\u4e00-\\u9fa5]{2,15}?${UNIT}`;

/**
 * 从公告文本抽取变更意图（覆盖最常见句式）。
 */
export function extractIntents(text: string): ChangeIntent[] {
  const intents: ChangeIntent[] = [];
  const seen = new Set<string>();
  const push = (it: ChangeIntent, key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    intents.push(it);
  };

  // 1) 撤A设B（撤县设区/撤镇设街道…）：撤销X，设立Y → abolish(X) + establish(Y)
  const cheSheRe = new RegExp(`撤销(${NAME})[，,、]?\\s*设立(${NAME})`, 'g');
  for (const m of text.matchAll(cheSheRe)) {
    push({ kind: 'abolish', target: m[1], evidence: m[0] }, `abolish:${m[1]}`);
    push({ kind: 'establish', name: m[2], evidence: m[0] }, `establish:${m[2]}`);
  }
  // 撤设片段已消费，避免被下方纯撤销/纯设立重复命中
  const rest = text.replace(cheSheRe, ' ');

  // 2) 更名：(将)X更名为Y
  for (const m of rest.matchAll(new RegExp(`(?:将)?(${NAME})更名为(${NAME})`, 'g'))) {
    push({ kind: 'rename', from: m[1], to: m[2], evidence: m[0] }, `rename:${m[1]}->${m[2]}`);
  }
  // 3) 纯撤销
  for (const m of rest.matchAll(new RegExp(`撤销(${NAME})`, 'g'))) {
    push({ kind: 'abolish', target: m[1], evidence: m[0] }, `abolish:${m[1]}`);
  }
  // 4) 纯设立
  for (const m of rest.matchAll(new RegExp(`设立(${NAME})`, 'g'))) {
    push({ kind: 'establish', name: m[1], evidence: m[0] }, `establish:${m[1]}`);
  }
  // 5) 划归/划入：将X划归/划入Y(管辖)
  for (const m of rest.matchAll(new RegExp(`将(${NAME})划[归入](${NAME})`, 'g'))) {
    push({ kind: 'transfer', target: m[1], newParent: m[2], evidence: m[0] }, `transfer:${m[1]}->${m[2]}`);
  }

  return intents;
}
