/**
 * crawlAll 步长=2（maxLevel=2）BFS 的等价性 + 跳级正确性单测。
 *
 * 用 mock 的 fetchChildren 忠实复刻 dmfw 语义（getList(code,ml) 返回
 * level<=code.level+ml 的后代，节点被展开⇔node.level<code.level+ml），
 * 在确定性合成树上断言：
 *   ① 新逻辑（真实 crawlAll，步长2）产出 == 旧逻辑（step1 基线）逐条一致；
 *   ② 直辖市跳级（L1→L3）、省直管县（L1 直挂 L3）的 parent_code/level 正确；
 *   ③ 步长2 的真实请求数 < step1，且无重复抓取（去重）。
 * 不联网、不依赖 dist 之外的运行时。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- 合成树（含跳级场景）----
interface FixNode {
  code: string;
  name: string;
  level: number;
}
const { children, levelOf, calls } = vi.hoisted(() => {
  const children: Record<string, { code: string; name: string; level: number }[]> = {
    // 根：三省
    '': [
      { code: 'A', name: '甲省', level: 1 },
      { code: 'M', name: '乙直辖市', level: 1 },
      { code: 'H', name: '丙省', level: 1 },
    ],
    // 甲省：正常 L1→L2→L3→L4
    A: [{ code: 'A1', name: '甲市', level: 2 }],
    A1: [{ code: 'A1a', name: '甲县', level: 3 }],
    A1a: [
      { code: 'A1a1', name: '甲镇', level: 4 },
      { code: 'A1a2', name: '甲乡', level: 4 },
    ],
    // 乙直辖市：跳 L2，L1 直挂 L3 区
    M: [
      { code: 'M1', name: '乙区', level: 3 },
      { code: 'M2', name: '乙叶区', level: 3 }, // L3 叶子（无街道），验证截断前沿的真实叶子
    ],
    M1: [{ code: 'M1a', name: '乙街道', level: 4 }],
    M2: [],
    // 丙省：省直管县（L1 直挂 L3 HZ）+ 一个正常 L2 市
    H: [
      { code: 'H1', name: '丙市', level: 2 },
      { code: 'HZ', name: '丙直管县', level: 3 },
    ],
    H1: [{ code: 'H1a', name: '丙县', level: 3 }],
    H1a: [{ code: 'H1a1', name: '丙镇', level: 4 }],
    HZ: [{ code: 'HZ1', name: '丙镇乙', level: 4 }],
  };
  const levelOf: Record<string, number> = {
    '': 0,
    A: 1,
    M: 1,
    H: 1,
    A1: 2,
    H1: 2,
    A1a: 3,
    M1: 3,
    M2: 3,
    H1a: 3,
    HZ: 3,
    A1a1: 4,
    A1a2: 4,
    M1a: 4,
    H1a1: 4,
    HZ1: 4,
  };
  const calls: { code: string; maxLevel: number }[] = [];
  return { children, levelOf, calls };
});

interface MockDmfwNode {
  code: string;
  name: string;
  level: number;
  type: string;
  children: MockDmfwNode[];
}

// 忠实复刻 dmfw：node 被展开 ⇔ node.level < code.level + maxLevel
function serve(code: string, maxLevel: number): MockDmfwNode[] {
  const cap = (levelOf[code] ?? 0) + maxLevel;
  const expand = (parent: string, parentLevel: number): MockDmfwNode[] => {
    if (parentLevel >= cap) return [];
    return (children[parent] ?? []).map((ch) => ({
      code: ch.code,
      name: ch.name,
      level: ch.level,
      type: '',
      children: expand(ch.code, ch.level),
    }));
  };
  return expand(code, levelOf[code] ?? 0);
}

vi.mock('../dist/dmfw.js', () => ({
  DMFW_MAX_LEVEL: 2,
  DmfwError: class DmfwError extends Error {},
  fetchChildren: vi.fn(async (code: string, maxLevel = 1) => {
    calls.push({ code, maxLevel });
    return serve(code, maxLevel);
  }),
}));

// mock 之后再导入被测代码
const { crawlAll } = await import('../dist/crawl-all.js');

const YEAR = 2026;

// ---- 旧基线：原始 maxLevel=1 步长1 BFS（复刻），直接跑 serve() ----
interface Baseline {
  code: string;
  name: string;
  level: number;
  parent_code: string | null;
}
function crawlOldBaseline(root: string, maxLevel = 4): Baseline[] {
  const divisions: Baseline[] = [];
  let frontier = [root];
  for (let depth = 0; depth < maxLevel; depth++) {
    const wave = frontier.map((code) => ({ code, nodes: serve(code, 1) }));
    const next: string[] = [];
    for (const { code, nodes } of wave) {
      const parentCode = code === '' ? null : code;
      for (const n of nodes) {
        divisions.push({ code: n.code, name: n.name, level: n.level, parent_code: parentCode });
        if (n.level < maxLevel) next.push(n.code);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return divisions;
}

const key = (d: { code: string; name: string; level: number; parent_code: string | null }) =>
  `${d.code}|${d.name}|${d.level}|${d.parent_code}`;
const sortedKeys = (
  arr: { code: string; name: string; level: number; parent_code: string | null }[]
): string[] => arr.map(key).sort();

describe('crawlAll 步长=2', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('产出与旧 step1 基线逐条一致（含直辖市跳级 / 省直管县）', async () => {
    const oldDiv = crawlOldBaseline('', 4);
    const res = await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    expect(sortedKeys(res.divisions)).toEqual(sortedKeys(oldDiv));
  });

  it('每次网络请求都用 maxLevel=2（步长2）', async () => {
    await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.maxLevel === 2)).toBe(true);
  });

  it('直辖市跳级：L3 区 parent=直辖市，L4 街道 parent=区', async () => {
    const res = await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    const m1 = res.divisions.find((d) => d.code === 'M1');
    const m1a = res.divisions.find((d) => d.code === 'M1a');
    expect(m1).toMatchObject({ level: 3, parent_code: 'M' });
    expect(m1a).toMatchObject({ level: 4, parent_code: 'M1' });
    // L3 叶子区（无街道）也被正确收录且不产生额外子节点
    expect(res.divisions.find((d) => d.code === 'M2')).toMatchObject({ level: 3, parent_code: 'M' });
  });

  it('省直管县：L3 直管县 parent=省，其 L4 镇 parent=直管县', async () => {
    const res = await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    expect(res.divisions.find((d) => d.code === 'HZ')).toMatchObject({ level: 3, parent_code: 'H' });
    expect(res.divisions.find((d) => d.code === 'HZ1')).toMatchObject({
      level: 4,
      parent_code: 'HZ',
    });
  });

  it('步长2 请求数 < step1，且无重复抓取（去重）', async () => {
    await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    const newFetches = calls.length;
    // 旧 step1 抓取数 = 根 + 所有 level<4 的内部节点
    const oldFetches =
      1 + Object.keys(levelOf).filter((c) => c !== '' && levelOf[c] < 4).length;
    expect(newFetches).toBeLessThan(oldFetches);
    // 无重复抓取：每个 code 至多被请求一次
    const seen = new Set(calls.map((c) => c.code));
    expect(seen.size).toBe(calls.length);
  });

  it('failures 与计数字段存在且本例无失败', async () => {
    const res = await crawlAll('', { year: YEAR, maxLevel: 4, delayMs: 0 });
    expect(res.failures).toEqual([]);
    expect(res.fetched).toBeGreaterThan(0);
    expect(res.cached).toBe(0);
  });
});
