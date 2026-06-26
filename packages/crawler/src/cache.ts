/**
 * 文件系统缓存：每个 code 的子节点存一份 JSON。
 * 实现断点续爬——重跑时已抓取的节点直接读缓存、跳过网络，崩溃/中断后可无损续跑。
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { DmfwNode } from './dmfw.js';

export class FsCache {
  constructor(private readonly dir: string) {}

  private file(code: string): string {
    return path.join(this.dir, `${code || 'root'}.json`);
  }

  async get(code: string): Promise<DmfwNode[] | null> {
    try {
      return JSON.parse(await readFile(this.file(code), 'utf-8')) as DmfwNode[];
    } catch {
      return null;
    }
  }

  async set(code: string, children: DmfwNode[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(code), JSON.stringify(children));
  }
}
