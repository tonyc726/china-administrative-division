/**
 * fetchChildren 解析层 + DmfwError 封装（mock 底层 got，不联网）。
 *
 * 现有 crawl-all* 测试都把整个 fetchChildren mock 掉，故这层「HTTP 响应 → DmfwNode[]」的
 * 拆包与错误归一从未被直接验证。此处 mock `got` 只让 fetchChildren 真跑，钉死：
 *   - data.children 正常拆包；data/children 缺失时降级空数组（不抛）；
 *   - searchParams(code/maxLevel) 与请求头如实下传；
 *   - 任何底层失败一律裹成携带 code 的 DmfwError（供上层部分容错）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { gotFn } = vi.hoisted(() => ({ gotFn: vi.fn() }));
vi.mock('got', () => ({ default: gotFn }));

import { fetchChildren, DmfwError } from '../dist/dmfw.js';

/** 让 got(...).json<T>() 解析为给定响应体 */
function resolveWith(body: unknown) {
  gotFn.mockReturnValue({ json: () => Promise.resolve(body) });
}
/** 让 got(...).json<T>() 抛错（模拟超时/网络/JSON 解析失败） */
function rejectWith(err: unknown) {
  gotFn.mockReturnValue({ json: () => Promise.reject(err) });
}

const child = (code: string) => ({
  code,
  name: `n-${code}`,
  level: 1,
  type: 'x',
  children: [],
});

describe('fetchChildren — 解析层', () => {
  beforeEach(() => gotFn.mockReset());

  it('正常响应 → 拆出 data.children', async () => {
    resolveWith({ data: { code: '', children: [child('110000000000')] } });
    expect(await fetchChildren('', 1)).toEqual([child('110000000000')]);
  });

  it('data 为 null → 空数组（不抛）', async () => {
    resolveWith({ data: null });
    expect(await fetchChildren('110000000000', 1)).toEqual([]);
  });

  it('data 存在但 children 缺失 → 空数组（?? 兜底）', async () => {
    resolveWith({ data: { code: '110000000000' } });
    expect(await fetchChildren('110000000000', 1)).toEqual([]);
  });

  it('code 与 maxLevel 如实下传到 searchParams', async () => {
    resolveWith({ data: { children: [] } });
    await fetchChildren('110000000000', 2);
    const [url, opts] = gotFn.mock.calls[0];
    expect(url).toContain('/xzqh/getList');
    expect(opts.searchParams).toEqual({ code: '110000000000', maxLevel: 2 });
    expect(opts.headers).toMatchObject({ Referer: 'https://dmfw.mca.gov.cn/' });
  });

  it('maxLevel 默认 1（向后兼容）', async () => {
    resolveWith({ data: { children: [] } });
    await fetchChildren('110000000000');
    expect(gotFn.mock.calls[0][1].searchParams.maxLevel).toBe(1);
  });
});

describe('fetchChildren — 错误封装为 DmfwError', () => {
  beforeEach(() => gotFn.mockReset());

  it('底层抛 Error → DmfwError 携带 code 与原始 message', async () => {
    rejectWith(new Error('ETIMEDOUT'));
    await expect(fetchChildren('440000000000', 2)).rejects.toBeInstanceOf(
      DmfwError
    );
    try {
      await fetchChildren('440000000000', 2);
    } catch (e) {
      const err = e as DmfwError;
      expect(err.code).toBe('440000000000');
      expect(err.message).toContain('440000000000');
      expect(err.message).toContain('ETIMEDOUT');
      expect(err.name).toBe('DmfwError');
    }
  });

  it('底层抛非 Error（如字符串） → String() 归一后仍成 DmfwError', async () => {
    rejectWith('socket hang up');
    await expect(fetchChildren('', 1)).rejects.toMatchObject({
      code: '',
      name: 'DmfwError',
    });
    await expect(fetchChildren('', 1)).rejects.toThrow('socket hang up');
  });
});
