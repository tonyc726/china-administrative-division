/**
 * 规则法抽取的句式覆盖与去重。规则只负责高精度命中标准句式（简单名称），
 * 复合层级名/口语化表述交由 LLM 路径——故此处夹具用规范单元名。
 */
import { describe, it, expect } from 'vitest';
import { extractIntents } from '../dist/rules.js';

describe('extractIntents', () => {
  it('撤A设B → abolish + establish 两条意图', () => {
    const intents = extractIntents('国务院批复：撤销三河县，设立三河市。');
    expect(intents).toEqual([
      { kind: 'abolish', target: '三河县', evidence: expect.stringContaining('撤销三河县') },
      { kind: 'establish', name: '三河市', evidence: expect.stringContaining('设立三河市') },
    ]);
  });

  it('更名 / 纯撤销 / 划归 多句混合，且撤设片段不被重复计', () => {
    const text = '撤销三河县，设立三河市；将朝阳镇更名为朝阳街道；撤销和平乡；将通州区划归北京市管辖。';
    const intents = extractIntents(text);
    const kinds = intents.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'abolish')).toHaveLength(2); // 三河县 + 和平乡（撤设的三河县不重复）
    expect(intents.find((i) => i.kind === 'rename')).toMatchObject({ from: '朝阳镇', to: '朝阳街道' });
    expect(intents.find((i) => i.kind === 'transfer')).toMatchObject({ target: '通州区', newParent: '北京市' });
    // 撤设产生的 establish 三河市 只此一条，不被"纯设立"重复
    expect(intents.filter((i) => i.kind === 'establish')).toHaveLength(1);
  });

  it('无变更句式 → 空数组', () => {
    expect(extractIntents('本通知自发布之日起施行。')).toEqual([]);
  });
});
