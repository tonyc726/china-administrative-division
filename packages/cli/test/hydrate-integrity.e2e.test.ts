/**
 * 锁死离线注水的 fail-closed 完整性门（对抗验证抓出的 M4 critical 回归守卫）：
 * 篡改 tarball（CSV 改动但 manifest 不变）注水时，必须 ① 抛"完整性校验失败"，
 * ② **一行都不入库**（旧实现是"先写后校验"，会先 COMMIT 篡改数据再抛错）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import tar from 'tar-stream';
import { gzipSync } from 'zlib';
import crypto from 'crypto';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { hydrate } from '../dist/hydrate.js';

const CSV =
  'code,name,level,parent_code,year,status,source_type,confidence_score\n' +
  '110000000000,"北京市",1,,2023,active,official_nbs,100\n';

const sha512 = (s: string): string => crypto.createHash('sha512').update(Buffer.from(s)).digest('hex');

async function gzTar(files: Record<string, string>): Promise<Buffer> {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(files)) pack.entry({ name }, content);
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const c of pack) chunks.push(c as Buffer);
  return gzipSync(Buffer.concat(chunks));
}

let tmp: string;
let cacheDir: string;
let tgz: string;

function countRows(): number {
  const dbPath = path.join(cacheDir, 'cache.db');
  if (!existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true });
  const n = (db.prepare('SELECT COUNT(*) AS c FROM divisions').get() as { c: number }).c;
  db.close();
  return n;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cndiv-integ-'));
  cacheDir = path.join(tmp, 'cache');
  tgz = path.join(tmp, 'pkg.tgz');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('hydrate 离线注水 fail-closed 完整性门', () => {
  it('合法包：manifest 匹配 → 正常注水', async () => {
    const manifest = JSON.stringify({ file: 'divisions.csv', sha512: sha512(CSV), rows: 1 });
    writeFileSync(
      tgz,
      await gzTar({ 'package/data/divisions.csv': CSV, 'package/data/manifest.json': manifest }),
    );
    await hydrate({ year: '2023', cacheDir, tarball: tgz });
    expect(countRows()).toBe(1);

    // WAL 自包含：better-sqlite3 在最后一个连接 close() 时自动 checkpoint 并删除 -wal/-shm，
    // 故注水后的 cache.db 是自包含单文件——删掉边车后仍可读全部数据（消费者拷贝单文件 /
    // @cndiv/reader 只读打开场景）。本断言锁住该契约：未来改动若破坏自包含，countRows() ≠ 1 → 红。
    const dbPath = path.join(cacheDir, 'cache.db');
    for (const sc of ['-wal', '-shm'])
      if (existsSync(dbPath + sc)) rmSync(dbPath + sc);
    expect(countRows()).toBe(1);
  });

  it('篡改包：CSV 被改但 manifest 不变 → 抛错且一行都不入库', async () => {
    const tampered = `${CSV}999999999999,"篡改注入",1,,2099,active,community,1\n`;
    // manifest 仍写原始 CSV 的 sha512，与篡改后的 CSV 不符
    const manifest = JSON.stringify({ file: 'divisions.csv', sha512: sha512(CSV), rows: 1 });
    writeFileSync(
      tgz,
      await gzTar({ 'package/data/divisions.csv': tampered, 'package/data/manifest.json': manifest }),
    );
    await expect(hydrate({ year: '2023', cacheDir, tarball: tgz })).rejects.toThrow(/完整性校验失败/);
    expect(countRows()).toBe(0); // 关键：fail-closed，篡改数据未落库
  });
});
