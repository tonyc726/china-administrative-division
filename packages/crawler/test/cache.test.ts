/**
 * FsCache 断点续爬的两个不变量：① 写后可无损读回（round-trip）；② maxLevel 后缀隔离——
 * 不同步长抓取的子树结构不同，缓存绝不可串味。miss 返回 null 让上层回退网络。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { FsCache } from '../dist/cache.js';
import type { DmfwNode } from '../dist/dmfw.js';

const node = (code: string, children: DmfwNode[] = []): DmfwNode => ({
  code,
  name: `n-${code}`,
  level: 2,
  type: 'x',
  children,
});

describe('FsCache', () => {
  let dir: string;
  let cache: FsCache;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cndiv-cache-'));
    cache = new FsCache(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('未命中 → null（触发上层回退网络）', async () => {
    expect(await cache.get('110000000000', 1)).toBeNull();
  });

  it('写后读回完全一致（round-trip，含嵌套 children）', async () => {
    const children = [node('110100000000', [node('110101000000')])];
    await cache.set('110000000000', 2, children);
    expect(await cache.get('110000000000', 2)).toEqual(children);
  });

  it('maxLevel 后缀隔离：同 code 不同步长缓存互不串味', async () => {
    await cache.set('110000000000', 1, [node('a')]);
    await cache.set('110000000000', 2, [node('b')]);
    expect(await cache.get('110000000000', 1)).toEqual([node('a')]);
    expect(await cache.get('110000000000', 2)).toEqual([node('b')]);
  });

  it('空 code 归一为 root 文件、可正常读写', async () => {
    await cache.set('', 2, [node('root-child')]);
    expect(await cache.get('', 2)).toEqual([node('root-child')]);
  });

  it('set 自动建目录（首写即成，无需预先 mkdir）', async () => {
    const nested = new FsCache(path.join(dir, 'a', 'b'));
    await nested.set('x', 1, [node('y')]);
    expect(await nested.get('x', 1)).toEqual([node('y')]);
  });

  it('空 children 数组也能读回（区别于 miss 的 null）', async () => {
    await cache.set('leaf', 2, []);
    expect(await cache.get('leaf', 2)).toEqual([]);
  });
});
