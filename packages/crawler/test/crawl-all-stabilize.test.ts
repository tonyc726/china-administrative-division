/**
 * crawlAll 抖动稳定化（2.1）单测。
 *
 * 用 mock fetchChildren 模拟 dmfw「HTTP 200 但 children 被截断」的非确定性抖动
 * （同一 code 逐次返回不同子集），但保留真实 unionChildren（importActual）。
 * 覆盖:
 *   - unionChildren 纯函数:幂等 / 交换 / 递归并孙层
 *   - critical 浅层多抓 UNION 补齐被截断子树 + jitter 记录
 *   - baseline 收缩触发重抓补齐（无 stabilize 也生效）
 *   - F7 幽灵不复活:baseline 有、live 连抓都无 → 输出不含（基线只触发重抓不注入）
 *   - 向后兼容:不传 stabilize/baseline → 单抓、不补、无 jitter
 *   - root 省级数量 sanity:union < minRootChildren → jitter.rootUndersized
 * 不联网。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockNode {
  code: string;
  name: string;
  level: number;
  type: string;
  children: MockNode[];
}
const node = (code: string, level: number, children: MockNode[] = []): MockNode => ({
  code,
  name: code,
  level,
  type: '',
  children,
});

// 每个 code 的逐次抓取返回序列（模拟抖动）；超出序列长度用最后一项。
const { state } = vi.hoisted(() => ({
  state: {
    responses: {} as Record<string, MockNode[][]>,
    calls: {} as Record<string, number>,
  },
}));

vi.mock('../dist/dmfw.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dist/dmfw.js')>();
  return {
    ...actual, // 保留真实 unionChildren / DMFW_MAX_LEVEL
    fetchChildren: vi.fn(async (code: string, _ml = 1) => {
      const seq = state.responses[code] ?? [[]];
      const i = Math.min(state.calls[code] ?? 0, seq.length - 1);
      state.calls[code] = (state.calls[code] ?? 0) + 1;
      return seq[i];
    }),
  };
});

const { crawlAll } = await import('../dist/crawl-all.js');
const { unionChildren } = await import('../dist/dmfw.js');

const YEAR = 2026;
const codesOf = (res: { divisions: { code: string }[] }): string[] =>
  res.divisions.map((d) => d.code).sort();

describe('unionChildren', () => {
  it('幂等:union(a,a)=a', () => {
    const a = [node('X', 1)];
    expect(unionChildren(a, a).map((n) => n.code)).toEqual(['X']);
  });
  it('可交换 + 并集', () => {
    const a = [node('X', 1)];
    const b = [node('Y', 1)];
    expect(unionChildren(a, b).map((n) => n.code).sort()).toEqual(['X', 'Y']);
    expect(unionChildren(b, a).map((n) => n.code).sort()).toEqual(['X', 'Y']);
  });
  it('递归并孙层:同 code 父节点的子集取并', () => {
    const a = [node('P', 1, [node('c1', 2)])];
    const b = [node('P', 1, [node('c2', 2)])];
    const u = unionChildren(a, b);
    expect(u).toHaveLength(1);
    expect(u[0].children.map((c) => c.code).sort()).toEqual(['c1', 'c2']);
  });
});

describe('crawlAll 抖动稳定化', () => {
  beforeEach(() => {
    state.responses = {};
    state.calls = {};
  });

  it('critical 浅层多抓 UNION 补齐被截断子树 + jitter', async () => {
    // root 首抓丢 H,二抓补齐
    state.responses = {
      '': [
        [node('A', 1), node('M', 1)],
        [node('A', 1), node('M', 1), node('H', 1)],
      ],
    };
    const res = await crawlAll('', {
      year: YEAR,
      maxLevel: 1,
      delayMs: 0,
      stabilize: { criticalMaxLevel: 0, criticalAttempts: 3 },
    });
    expect(codesOf(res)).toEqual(['A', 'H', 'M']); // H 被 UNION 补齐
    const j = res.jitter.find((e) => e.code === '' && e.reason === 'critical');
    expect(j?.recovered).toBe(1);
    // critical 抓到「连续无新增」收敛:2→3(grew)→3(确认收敛,停)
    expect(j?.counts).toEqual([2, 3, 3]);
  });

  it('baseline 收缩触发重抓补齐（无 stabilize 也生效）', async () => {
    state.responses = {
      '': [
        [node('A', 1), node('M', 1)], // 首抓缺 H
        [node('A', 1), node('M', 1), node('H', 1)],
      ],
    };
    const baseline = new Map([['', new Set(['A', 'M', 'H'])]]);
    const res = await crawlAll('', { year: YEAR, maxLevel: 1, delayMs: 0, baseline });
    expect(codesOf(res)).toEqual(['A', 'H', 'M']);
    expect(res.jitter.find((e) => e.reason === 'baseline-shrink')?.recovered).toBe(1);
  });

  it('F7 幽灵不复活:baseline 有、live 连抓都无 → 输出不含', async () => {
    state.responses = { '': [[node('A', 1), node('M', 1), node('H', 1)]] }; // 恒无 GHOST
    const baseline = new Map([['', new Set(['A', 'M', 'H', 'GHOST'])]]);
    const res = await crawlAll('', {
      year: YEAR,
      maxLevel: 1,
      delayMs: 0,
      baseline,
      stabilize: { criticalMaxLevel: 0, criticalAttempts: 3 },
    });
    expect(res.divisions.find((d) => d.code === 'GHOST')).toBeUndefined();
    expect(codesOf(res)).toEqual(['A', 'H', 'M']); // 基线只触发重抓,不注入幽灵
  });

  it('向后兼容:不传 stabilize/baseline → 单抓、不补、无 jitter', async () => {
    state.responses = {
      '': [
        [node('A', 1), node('M', 1)], // 首抓缺 H
        [node('A', 1), node('M', 1), node('H', 1)],
      ],
    };
    const res = await crawlAll('', { year: YEAR, maxLevel: 1, delayMs: 0 });
    expect(codesOf(res)).toEqual(['A', 'M']); // 单抓,H 不补
    expect(state.calls['']).toBe(1);
    expect(res.jitter).toEqual([]);
  });

  it('root 省级数量 sanity:union < minRootChildren → jitter.rootUndersized', async () => {
    state.responses = { '': [[node('A', 1), node('M', 1)]] }; // 恒 2 省 < 31
    const res = await crawlAll('', {
      year: YEAR,
      maxLevel: 1,
      delayMs: 0,
      stabilize: { criticalMaxLevel: 0, criticalAttempts: 2, minRootChildren: 31 },
    });
    expect(res.jitter.find((e) => e.code === '')?.rootUndersized).toBe(true);
  });
});
