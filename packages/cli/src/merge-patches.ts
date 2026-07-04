/**
 * Merge Patches Command (2.3)
 *
 * 把多份 patch（dmfw 全量差分 / xzqh 事件流 / 社区提交）合并去重成单一成品：
 *   cndiv merge-patches --dir=raw/2026 --out=patches/2026/2026.merged.json
 *
 * 管线来源按文件名/author 启发式判定（source_pipeline 未入 schema，避免改两个 producer）：
 *   含 'xzqh' → xzqh；含 'dmfw' / author 'dmfw-crawler' → dmfw；否则 community。
 * 冲突（同 code 被多管线触碰、add-remove 抵消）写 sidecar 报告 <out>.conflicts.json，绝不静默丢弃。
 */
import fs from 'fs';
import path from 'path';
import {
  mergePatches,
  validateMerged,
  validatePatch,
  type MergeInput,
  type Pipeline,
} from '@cndiv/data-protocol';

export interface MergePatchesOptions {
  dir?: string;
  files?: string[];
  out?: string;
  priority?: Pipeline[];
  /** 纯函数不取系统时间，合并 patch 的 created_at 由此透传（可选） */
  createdAt?: string;
}

/** 按文件名/author 启发式判定管线来源（source_pipeline 未入 schema 时的回退）。 */
export function classifyPipeline(filename: string, author?: string): Pipeline {
  const hay = `${filename} ${author ?? ''}`.toLowerCase();
  if (hay.includes('xzqh')) return 'xzqh';
  if (hay.includes('dmfw')) return 'dmfw';
  return 'community';
}

export async function mergePatchesCommand(
  opts: MergePatchesOptions
): Promise<void> {
  let files: string[] = [];
  if (opts.files?.length) files = opts.files;
  else if (opts.dir) {
    files = fs
      .readdirSync(opts.dir)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.conflicts.json'))
      .map((f) => path.join(opts.dir as string, f))
      .sort();
  }
  if (files.length === 0) {
    console.error('Error: 无输入 patch（--dir=<目录> 或 --files=a.json,b.json）');
    process.exitCode = 1;
    return;
  }

  const inputs: MergeInput[] = [];
  for (const file of files) {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const check = validatePatch(raw);
    if (!check.success) {
      console.error(`✗ 跳过非法 patch ${file}：${check.error}`);
      process.exitCode = 1;
      return;
    }
    const pipeline = classifyPipeline(
      path.basename(file),
      check.data.meta.author
    );
    inputs.push({ patch: check.data, pipeline, origin: path.basename(file) });
    console.log(
      `  载入 ${path.basename(file)} → 管线 ${pipeline}（${check.data.operations.length} ops）`
    );
  }

  const result = mergePatches(inputs, {
    priority: opts.priority,
    createdAt: opts.createdAt,
  });

  console.log(
    `\n合并：${result.stats.inputs} 份 / ${result.stats.totalOps} ops → 保留 ${result.stats.keptOps}，去重 ${result.deduped}，冲突舍弃 ${result.conflicts.length}`
  );

  if (result.empty) {
    console.log('合并后无任何 op（全部去重/抵消），不写盘。');
    return;
  }

  const merged = validateMerged(result); // 兜底：非空成品必过 schema（不过则抛错）
  const out = opts.out ?? 'merged.json';
  const outAbs = path.resolve(out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`✓ 成品 → ${out}`);

  if (result.conflicts.length > 0) {
    const sidecar = `${out.replace(/\.json$/, '')}.conflicts.json`;
    fs.writeFileSync(
      path.resolve(sidecar),
      `${JSON.stringify(result.conflicts, null, 2)}\n`
    );
    console.log(
      `⚠ 冲突报告 → ${sidecar}（${result.conflicts.length} 条被舍弃 op，需人工复核）`
    );
  }
}
