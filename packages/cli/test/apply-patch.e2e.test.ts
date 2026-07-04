/**
 * M3 端到端夹具：patch → apply → export 闭环 + 年份语义正确性。
 *
 * FMEA 防线（防静默数据腐败）：本测试编码"正确语义"——一个声明 apply_after=2023-baseline
 * 的 2025 patch，其 add/update/remove 必须**全部落在 2025 分区**（从 2023 克隆而来），
 * 且 **2023 基线保持原封不动**。对修复前的实现会失败（update/remove 无 year 过滤会污染 2023）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { DATABASE_SCHEMA } from '@cndiv/data-protocol';
import { applyPatch } from '../dist/apply-patch.js';
import { exportFromCache } from '../dist/hydrate.js';

let tmp: string;
let cacheDir: string;
let patchPath: string;

function seedBaseline2023() {
  const db = new Database(path.join(cacheDir, 'cache.db'));
  db.exec(DATABASE_SCHEMA);
  const ins = db.prepare(
    `INSERT INTO divisions (code,name,level,parent_code,year,status,source_type,confidence_score)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  ins.run('110000000000', '北京市', 1, null, 2023, 'active', 'official_nbs', 100);
  ins.run('110101000000', '东城区', 3, '110000000000', 2023, 'active', 'official_nbs', 100);
  ins.run('110102000000', '西城区', 3, '110000000000', 2023, 'active', 'official_nbs', 100);
  db.close();
}

function openCache() {
  return new Database(path.join(cacheDir, 'cache.db'), { readonly: true });
}
function row(db: Database.Database, code: string, year: number) {
  return db
    .prepare('SELECT name,status,level FROM divisions WHERE code=? AND year=?')
    .get(code, year) as { name: string; status: string; level: number } | undefined;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cndiv-m3-'));
  cacheDir = path.join(tmp, 'cache');
  mkdirSync(cacheDir, { recursive: true });
  // 目录约定 patches/2025/ → targetYear=2025
  const patchDir = path.join(tmp, 'patches', '2025');
  mkdirSync(patchDir, { recursive: true });
  patchPath = path.join(patchDir, 'test-patch.json');
  writeFileSync(
    patchPath,
    JSON.stringify({
      meta: { author: 'tester', apply_after: '2023-baseline' },
      operations: [
        { op: 'add', code: '110118000000', name: '密云区', level: 3, parent_code: '110000000000', source_type: 'mca_decree', confidence_score: 90 },
        { op: 'update', code: '110101000000', name: '东城区(改)', note: '测试改名' },
        { op: 'remove', code: '110102000000', reason: '测试撤销' },
      ],
    }),
  );
  seedBaseline2023();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('apply-patch 年份语义 (M3)', () => {
  it('2023 基线在应用 2025 patch 后保持原封不动', async () => {
    await applyPatch({ patch: patchPath, cacheDir });
    const db = openCache();
    expect(row(db, '110101000000', 2023)?.name).toBe('东城区'); // 未被改名
    expect(row(db, '110102000000', 2023)?.status).toBe('active'); // 未被撤销
    expect(row(db, '110118000000', 2023)).toBeUndefined(); // add 不污染 2023
    db.close();
  });

  it('所有 op 一致落在 2025 目标分区（从 2023 克隆）', async () => {
    await applyPatch({ patch: patchPath, cacheDir });
    const db = openCache();
    expect(row(db, '110000000000', 2025)?.name).toBe('北京市'); // 克隆自基线
    expect(row(db, '110118000000', 2025)?.level).toBe(3); // add
    expect(row(db, '110101000000', 2025)?.name).toBe('东城区(改)'); // update
    expect(row(db, '110102000000', 2025)?.status).toBe('deprecated'); // remove
    db.close();
  });

  it('export --year=2025 同时可见 add 与 update（修复前的可见性 bug）', async () => {
    await applyPatch({ patch: patchPath, cacheDir });
    const out = path.join(tmp, '2025.csv');
    await exportFromCache(2025, cacheDir, out);
    const csv = readFileSync(out, 'utf-8');
    expect(csv).toContain('110118000000'); // add 可见
    expect(csv).toContain('东城区(改)'); // update 可见（与 add 同分区）
  });

  it('update 的 note 持久化到 patch_history', async () => {
    await applyPatch({ patch: patchPath, cacheDir });
    const db = openCache();
    const hist = db.prepare('SELECT notes FROM patch_history').get() as { notes: string | null };
    expect(hist.notes ?? '').toContain('测试改名');
    db.close();
  });
});
