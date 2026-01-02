/**
 * Apply Patch Command
 *
 * Applies community patches to the SQLite database.
 *
 * Usage:
 *   cn-div apply-patch --patch patches/2025/310115-pudong-update.json
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface ApplyPatchOptions {
  patch: string;
  cacheDir?: string;
  dryRun?: boolean;
}

/**
 * Apply a single patch operation to the database
 */
function applyOperation(db: Database.Database, op: Record<string, unknown>): void {
  const operation = op.op as string;

  switch (operation) {
    case 'add': {
      const { code, name, level, parent_code, source_type, confidence_score } = op as {
        code: string;
        name: string;
        level: number;
        parent_code: string;
        source_type?: string;
        confidence_score?: number;
      };

      // Extract year from patch file path (simplified)
      const insert = db.prepare(`
        INSERT OR REPLACE INTO divisions (
          code, name, level, parent_code, year,
          status, source_type, confidence_score
        ) VALUES (?, ?, ?, ?, 2025, 'active', ?, ?)
      `);

      insert.run(code, name, level, parent_code, source_type || 'community', confidence_score || 50);
      console.log(`  ADD: ${code} - ${name}`);
      break;
    }

    case 'remove': {
      const { code } = op as { code: string };
      const update = db.prepare('UPDATE divisions SET status = ? WHERE code = ?');
      update.run('deprecated', code);
      console.log(`  REMOVE: ${code}`);
      break;
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
        const update = db.prepare('UPDATE divisions SET status = ? WHERE code = ?');
        update.run(status, code);
        console.log(`  UPDATE STATUS: ${code} -> ${status}`);
      }

      if (new_parent) {
        const update = db.prepare('UPDATE divisions SET parent_code = ? WHERE code = ?');
        update.run(new_parent, code);
        console.log(`  UPDATE PARENT: ${code} -> ${new_parent}`);
      }

      if (name) {
        const update = db.prepare('UPDATE divisions SET name = ? WHERE code = ?');
        update.run(name, code);
        console.log(`  UPDATE NAME: ${code} -> ${name}`);
      }
      break;
    }

    case 'move': {
      const { code, new_parent } = op as { code: string; new_parent: string };
      const update = db.prepare('UPDATE divisions SET parent_code = ? WHERE code = ?');
      update.run(new_parent, code);
      console.log(`  MOVE: ${code} -> parent ${new_parent}`);
      break;
    }

    default:
      console.warn(`  Unknown operation: ${operation}`);
  }
}

/**
 * Main apply-patch function
 */
export async function applyPatch(options: ApplyPatchOptions): Promise<void> {
  const { patch: patchPath, cacheDir = '~/.cn-division', dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('Patch Application Tool');
  console.log('='.repeat(60));
  console.log(`Patch file: ${patchPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  // Read patch file
  if (!fs.existsSync(patchPath)) {
    console.error(`Error: Patch file not found: ${patchPath}`);
    return;
  }

  const patchContent = fs.readFileSync(patchPath, 'utf-8');
  const patch = JSON.parse(patchContent);

  // Validate patch structure (basic validation)
  if (!patch.meta || !patch.operations) {
    console.error('Error: Invalid patch structure - missing meta or operations');
    return;
  }

  console.log(`Author: ${patch.meta.author}`);
  console.log(`Source: ${patch.meta.source_url || 'unknown'}`);
  console.log(`Operations: ${patch.operations.length}`);
  console.log('');

  if (dryRun) {
    console.log('--- Dry Run ---');
    for (const op of patch.operations) {
      console.log(`  ${op.op}: ${JSON.stringify(op)}`);
    }
    return;
  }

  // Initialize database
  const resolvedCacheDir = cacheDir.replace('~', process.env.HOME || '');
  const dbPath = path.join(resolvedCacheDir, 'cache.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Cache database not found: ${dbPath}`);
    console.error('Please run "cn-div hydrate --year 2023" first');
    return;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Apply operations in transaction
  const applyTransaction = db.transaction((operations) => {
    for (const op of operations) {
      applyOperation(db, op);
    }
  });

  applyTransaction(patch.operations);

  // Log patch history
  db.prepare(`
    INSERT INTO patch_history (patch_file, author, operations_count)
    VALUES (?, ?, ?)
  `).run(path.basename(patchPath), patch.meta.author, patch.operations.length);

  console.log('');
  console.log('='.repeat(60));
  console.log('Patch applied successfully');
  console.log('='.repeat(60));

  db.close();
}
