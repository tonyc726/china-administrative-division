/**
 * Apply Patch Command
 *
 * 把社区/爬虫 Patch 应用到本地 cache.db。
 *
 * 年份语义（M3 修复）：一个 patch 声明 meta.apply_after（基线年，如 "2023-baseline"），
 * 其 targetYear 取自 patches/<YYYY>/ 目录约定。应用时：
 *   1. 若 targetYear 分区为空，则从 baselineYear **克隆**一份（materialize 新年份）；
 *   2. 所有 op（add/update/remove/move）都**只作用于 targetYear**（带 AND year=?），
 *      杜绝旧实现里 add 落 target、update/remove/move 落基线的"同 patch 年份分裂"。
 *
 * Usage:
 *   cndiv apply-patch --patch=patches/2025/310115-pudong-update.json
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { validatePatch, DATABASE_SCHEMA } from '@cndiv/data-protocol';

interface ApplyPatchOptions {
  patch: string;
  cacheDir?: string;
  dryRun?: boolean;
}

/**
 * 应用单个操作到 targetYear 分区；若是携带 note 的 update，返回该 note 供审计聚合。
 */
function applyOperation(
  db: Database.Database,
  op: Record<string, unknown>,
  year: number
): string | null {
  const operation = op.op as string;

  switch (operation) {
    case 'add': {
      const { code, name, level, parent_code, source_type, confidence_score } =
        op as {
          code: string;
          name: string;
          level: number;
          parent_code: string;
          source_type?: string;
          confidence_score?: number;
        };

      db.prepare(
        `INSERT OR REPLACE INTO divisions (code, name, level, parent_code, year, status, source_type, confidence_score)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(
        code,
        name,
        level,
        parent_code,
        year,
        source_type || 'community',
        confidence_score || 50
      );
      console.log(`  ADD: ${code} - ${name} @${year}`);
      return null;
    }

    case 'remove': {
      const { code } = op as { code: string };
      db.prepare(
        'UPDATE divisions SET status = ? WHERE code = ? AND year = ?'
      ).run('deprecated', code, year);
      console.log(`  REMOVE: ${code} @${year}`);
      return null;
    }

    case 'update': {
      const { code, name, status, new_parent, note } = op as {
        code: string;
        name?: string;
        status?: string;
        new_parent?: string;
        note?: string;
      };

      if (status) {
        db.prepare(
          'UPDATE divisions SET status = ? WHERE code = ? AND year = ?'
        ).run(status, code, year);
        console.log(`  UPDATE STATUS: ${code} -> ${status} @${year}`);
      }
      if (new_parent) {
        db.prepare(
          'UPDATE divisions SET parent_code = ? WHERE code = ? AND year = ?'
        ).run(new_parent, code, year);
        console.log(`  UPDATE PARENT: ${code} -> ${new_parent} @${year}`);
      }
      if (name) {
        db.prepare(
          'UPDATE divisions SET name = ? WHERE code = ? AND year = ?'
        ).run(name, code, year);
        console.log(`  UPDATE NAME: ${code} -> ${name} @${year}`);
      }
      return note ?? null;
    }

    case 'move': {
      const { code, new_parent } = op as { code: string; new_parent: string };
      db.prepare(
        'UPDATE divisions SET parent_code = ? WHERE code = ? AND year = ?'
      ).run(new_parent, code, year);
      console.log(`  MOVE: ${code} -> parent ${new_parent} @${year}`);
      return null;
    }

    default:
      console.warn(`  Unknown operation: ${operation}`);
      return null;
  }
}

/**
 * 解析 patch 的目标年份：优先 patches/<YYYY>/ 目录约定，其次 meta.created_at。
 */
function resolvePatchYear(patchPath: string, createdAt?: string): number {
  const dirMatch = patchPath.match(/(?:^|[\\/])(\d{4})(?=[\\/])/);
  if (dirMatch) {
    return parseInt(dirMatch[1], 10);
  }
  if (createdAt) {
    const y = new Date(createdAt).getFullYear();
    if (!Number.isNaN(y)) return y;
  }
  return new Date().getFullYear();
}

/**
 * 从 meta.apply_after 解析基线年份，如 "2023-baseline" / "2023" → 2023。
 * 无法解析时回退到 targetYear（即原地修改、不克隆）。
 */
function parseBaselineYear(
  applyAfter: string | undefined,
  fallback: number
): number {
  const m = applyAfter?.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : fallback;
}

/**
 * Main apply-patch function
 */
export async function applyPatch(options: ApplyPatchOptions): Promise<void> {
  const { patch: patchPath, cacheDir = '~/.cndiv', dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('Patch Application Tool');
  console.log('='.repeat(60));
  console.log(`Patch file: ${patchPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  if (!fs.existsSync(patchPath)) {
    console.error(`Error: Patch file not found: ${patchPath}`);
    return;
  }

  const patchContent = fs.readFileSync(patchPath, 'utf-8');

  // 用 data-protocol 的 zod schema 严格校验（op 形状 / 12 位码 / level 范围 / 枚举等）
  const validation = validatePatch(JSON.parse(patchContent));
  if (!validation.success) {
    console.error('Error: Invalid patch — 未通过 schema 校验');
    console.error(validation.error);
    return;
  }
  const patch = validation.data;

  const targetYear = resolvePatchYear(patchPath, patch.meta.created_at);
  const baselineYear = parseBaselineYear(patch.meta.apply_after, targetYear);

  console.log(`Author: ${patch.meta.author}`);
  console.log(`Source: ${patch.meta.source_url || 'unknown'}`);
  console.log(`Baseline year: ${baselineYear}  →  Target year: ${targetYear}`);
  console.log(`Operations: ${patch.operations.length}`);
  console.log('');

  if (dryRun) {
    console.log('--- Dry Run ---');
    for (const op of patch.operations) {
      console.log(`  ${op.op}: ${JSON.stringify(op)}`);
    }
    return;
  }

  const resolvedCacheDir = cacheDir.replace('~', process.env.HOME || '');
  const dbPath = path.join(resolvedCacheDir, 'cache.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Cache database not found: ${dbPath}`);
    console.error('Please run "cndiv hydrate --year=2023" first');
    return;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // 确保 patch_history/metadata 等表存在（兼容早期 hydrate 生成的库）
  db.exec(DATABASE_SCHEMA);
  // 防御性迁移：早期 patch_history 无 notes 列（DATABASE_SCHEMA 的 IF NOT EXISTS 不会补列）
  try {
    db.exec('ALTER TABLE patch_history ADD COLUMN notes TEXT');
  } catch {
    /* 列已存在，忽略 */
  }

  const countByYear = db.prepare(
    'SELECT COUNT(*) AS c FROM divisions WHERE year = ?'
  );

  // 操作 + 克隆 + 审计写入同一事务：杜绝"数据已改、审计失败"的不一致中间态
  const applyTransaction = db.transaction(() => {
    // 1) 必要时把基线年克隆到目标年，使所有 op 有一致的落点
    if (targetYear !== baselineYear) {
      const targetCount = (countByYear.get(targetYear) as { c: number }).c;
      if (targetCount === 0) {
        const baseCount = (countByYear.get(baselineYear) as { c: number }).c;
        if (baseCount === 0) {
          console.warn(
            `  ⚠️ 基线年 ${baselineYear} 无数据，无法克隆；ops 将作用于空的 ${targetYear} 分区`
          );
        } else {
          db.prepare(
            `INSERT INTO divisions (code, name, level, parent_code, year, status, source_type, confidence_score, urban_rural_code)
             SELECT code, name, level, parent_code, ?, status, source_type, confidence_score, urban_rural_code
             FROM divisions WHERE year = ?`
          ).run(targetYear, baselineYear);
          console.log(
            `  克隆基线 ${baselineYear} → ${targetYear} (${baseCount} 行)`
          );
        }
      }
    }

    // 2) 应用所有操作到 targetYear，聚合 update 的 note 供审计
    const notes: string[] = [];
    for (const op of patch.operations) {
      const note = applyOperation(
        db,
        op as unknown as Record<string, unknown>,
        targetYear
      );
      if (note) notes.push(note);
    }

    // 3) 审计落库（含聚合的 notes）
    db.prepare(
      `INSERT INTO patch_history (patch_file, author, operations_count, notes) VALUES (?, ?, ?, ?)`
    ).run(
      path.basename(patchPath),
      patch.meta.author,
      patch.operations.length,
      notes.length ? notes.join('; ') : null
    );
  });

  applyTransaction();

  console.log('');
  console.log('='.repeat(60));
  console.log(`Patch applied successfully → year ${targetYear}`);
  console.log('='.repeat(60));

  db.close();
}
