/**
 * 端到端：公告 → intents → Patch 操作 + 待人工项；验证产物过 validatePatch，
 * 且 LLM 路径遵循 Tool Use 失败兜底（空/抛错 → 回退规则法）。
 */
import { describe, it, expect } from 'vitest';
import { extractPatch } from '../dist/index.js';
import { validatePatch } from '@cndiv/data-protocol';

// 基线名称→码 stub（仅含已存在实体；新设实体不可解析）
const CODES: Record<string, string> = {
  三河县: '131082000000',
  朝阳镇: '110105100000',
  和平乡: '130636200000',
  通州区: '110112000000',
  北京市: '110000000000',
};
const resolve = (name: string): string | null => CODES[name] ?? null;

const TEXT = '撤销三河县，设立三河市；将朝阳镇更名为朝阳街道；撤销和平乡；将通州区划归北京市管辖。';

describe('extractPatch（端到端）', () => {
  it('规则路径产出 4 个可解析操作，新设实体落 unresolved', async () => {
    const r = await extractPatch(TEXT, { resolve });
    expect(r.via).toBe('rules');
    // update(朝阳镇) + remove(三河县) + remove(和平乡) + move(通州区)
    expect(r.operations).toHaveLength(4);
    expect(r.operations.find((o) => o.op === 'update')).toMatchObject({ code: '110105100000', name: '朝阳街道' });
    expect(r.operations.find((o) => o.op === 'move')).toMatchObject({ code: '110112000000', new_parent: '110000000000' });
    // 新设三河市无既有码 → unresolved
    expect(r.unresolved.some((u) => u.intent.kind === 'establish')).toBe(true);
  });

  it('产出的 operations 通过 validatePatch 守门', async () => {
    const r = await extractPatch(TEXT, { resolve });
    const patch = { meta: { author: 'extractor', apply_after: '2023-baseline' }, operations: r.operations };
    expect(validatePatch(patch).success).toBe(true);
  });

  it('未命中名称落 unresolved，不臆造码', async () => {
    const r = await extractPatch('撤销某不存在县。', { resolve });
    expect(r.operations).toHaveLength(0);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0].reason).toContain('未在基线找到');
  });

  it('LLM 路径优先：返回合法 JSON 时 via=llm', async () => {
    const llm = async (): Promise<string> =>
      JSON.stringify([{ kind: 'abolish', target: '三河县', evidence: 'x' }]);
    const r = await extractPatch(TEXT, { resolve, llm });
    expect(r.via).toBe('llm');
    expect(r.operations).toEqual([{ op: 'remove', code: '131082000000', reason: 'x' }]);
  });

  it('Tool Use 失败兜底：LLM 抛错 → 回退规则法', async () => {
    const llm = async (): Promise<string> => {
      throw new Error('ollama down');
    };
    const r = await extractPatch(TEXT, { resolve, llm });
    expect(r.via).toBe('rules'); // 未崩，回退规则
    expect(r.operations).toHaveLength(4);
  });
});
