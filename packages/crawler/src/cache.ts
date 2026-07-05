/**
 * 文件系统缓存：每个 code 的子节点存一份 JSON。
 * 实现断点续爬——重跑时已抓取的节点直接读缓存、跳过网络，崩溃/中断后可无损续跑。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DmfwNode } from './dmfw.js';

export class FsCache {
  constructor(private readonly dir: string) {}

  /**
   * 缓存文件名带 maxLevel 后缀：maxLevel=1 与 maxLevel=2 抓取的子树结构不同
   * （前者 children 为空、后者含孙节点），必须隔离以免不同步长的缓存串味。
   */
  private file(code: string, maxLevel: number): string {
    return path.join(this.dir, `${code || 'root'}@${maxLevel}.json`);
  }

  async get(code: string, maxLevel: number): Promise<DmfwNode[] | null> {
    try {
      return JSON.parse(
        await readFile(this.file(code, maxLevel), 'utf-8')
      ) as DmfwNode[];
    } catch {
      return null;
    }
  }

  async set(
    code: string,
    maxLevel: number,
    children: DmfwNode[]
  ): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(code, maxLevel), JSON.stringify(children));
  }
}
