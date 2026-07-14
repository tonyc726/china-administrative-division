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

/**
 * 真实公告回归集（原文取自 xzqh 2021 年《县级以上行政区划变更情况》）。
 *
 * 旧的非贪婪正则在这些句子上会抓出 `杭州市` / `三明市` / `横县设立县`——
 * 即把**地级市整个撤销**。这不是精度问题，是往库里写假撤销。每条都必须钉死。
 */
describe('extractIntents · 真实公告回归', () => {
  const targets = (text: string): string[] =>
    extractIntents(text)
      .filter((i) => i.kind === 'abolish')
      .map((i) => (i as { target: string }).target);
  const names = (text: string): string[] =>
    extractIntents(text)
      .filter((i) => i.kind === 'establish')
      .map((i) => (i as { name: string }).name);

  it('撤销「杭州市上城区」不得抓成「杭州市」，且顿号枚举要展开+继承前缀', () => {
    const text =
      '撤销杭州市上城区、江干区，设立新的杭州市上城区，以原上城区、江干区的行政区域（不含下沙街道、白杨街道）为新的上城区的行政区域，上城区人民政府驻望江街道望潮路77号。';
    // 「江干区」在原文里是裸项，须继承前缀 → 杭州市江干区
    expect(targets(text)).toEqual(['杭州市上城区', '杭州市江干区']);
    // 「新的」是限定词不是名字
    expect(names(text)).toEqual(['杭州市上城区']);
    expect(targets(text)).not.toContain('杭州市');
  });

  it('单字词根「横县」不得右膨胀成「横县设立县」；「县级」是限定词', () => {
    const text = '撤销横县，设立县级横州市，以原横县的行政区域为横州市的行政区域。';
    expect(targets(text)).toEqual(['横县']);
    expect(names(text)).toEqual(['横州市']);
  });

  it('无逗号的「撤A设B」被动词墙正确切开', () => {
    // 动词墙的关键用例：贪婪匹配若无 VERB_ALT 前瞻，会一路吞成「沙县设立三明市沙县区」
    expect(targets('撤销沙县设立三明市沙县区')).toEqual(['沙县']);
    expect(names('撤销沙县设立三明市沙县区')).toEqual(['三明市沙县区']);
  });

  it('「以原…的行政区域为…」是复述从句，不得产生幽灵意图', () => {
    const text = '撤销凤翔县，设立宝鸡市凤翔区，以原凤翔县的行政区域为凤翔区的行政区域。';
    expect(targets(text)).toEqual(['凤翔县']); // 不含复述里的凤翔区
    expect(names(text)).toEqual(['宝鸡市凤翔区']); // 「宝鸡市」不是新设实体
    expect(names(text)).not.toContain('宝鸡市');
  });

  it('跨层级枚举（县 + 市辖区 合并设新区）', () => {
    const text =
      '撤销孟津县、洛阳市吉利区，设立洛阳市孟津区，以原孟津县、吉利区的行政区域为孟津区的行政区域。';
    expect(targets(text)).toEqual(['孟津县', '洛阳市吉利区']);
    expect(names(text)).toEqual(['洛阳市孟津区']);
  });

  it('「新」开头的地名不得被限定词剥离器吃掉（新星市 ≠ 星市）', () => {
    // 限定词只认「新的」；裸「新」是名字的一部分——新星市/新余市/新乡市 均以此为生
    expect(names('设立县级新星市，由新疆维吾尔自治区直辖。')).toEqual(['新星市']);
    expect(names('设立新的杭州市上城区')).toEqual(['杭州市上城区']);
  });

  it('纯设立（从既有区析出新区）', () => {
    const text =
      '设立杭州市临平区，以原余杭区的临平街道、东湖街道为临平区的行政区域。';
    expect(names(text)).toEqual(['杭州市临平区']);
    expect(targets(text)).toEqual([]); // 析置不撤销母体
  });
});
