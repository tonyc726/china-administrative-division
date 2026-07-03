#!/usr/bin/env node
/**
 * xzqh 变更事件流 → 逐条 extractPatch → 汇总合法 Patch 的运行器。
 *
 * 用法：
 *   tsx src/run-xzqh.ts --year=2026
 *   tsx src/run-xzqh.ts --year=2024 --baseline=packages/source-2023/data/divisions.csv --out=patches/2024/xzqh.json
 *
 * 选项：
 *   --year=<YYYY>     必填。抓取该年《县级以上行政区划变更情况》。
 *   --baseline=<csv>  可选。divisions.csv，用于名称→码解析（rename/abolish/move 才能成 op）。
 *                     缺省或文件不存在 → 注入占位 resolver（恒返回 null），
 *                     所有意图落 unresolved（尤其「设立」新设实体本就无既有码）。
 *   --out=<file>      可选。合法 Patch 写出路径；缺省仅打印。
 *   --author=<name>   可选。Patch 作者，默认 xzqh-crawler。
 *
 * 设计（FMEA）：extractPatch 产出的 operations 是草稿，必须再经 validatePatch 守门；
 * 未解析意图（unresolved）明确计数打印落人工，绝不臆造码。
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fetchChanges } from './xzqh.js';
import { parseDivisionsCsv } from './baseline.js';
import { extractPatch, type CodeResolver } from '@cndiv/extractor';
import {
  validatePatch,
  type Operation,
  type Patch,
} from '@cndiv/data-protocol';

const args = process.argv.slice(2);
const get = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

/** 由 baseline CSV 构建「名称→12 位码」解析器；文件缺失则返回占位解析器 */
async function buildResolver(baselinePath?: string): Promise<{
  resolve: CodeResolver;
  size: number;
}> {
  if (!baselinePath) return { resolve: () => null, size: 0 };
  let content: string;
  try {
    content = await readFile(baselinePath, 'utf-8');
  } catch {
    console.warn(`⚠ 基线不可读（${baselinePath}），退回占位 resolver，全部落 unresolved`);
    return { resolve: () => null, size: 0 };
  }
  const index = new Map<string, string>();
  for (const d of parseDivisionsCsv(content)) {
    if (d.name && !index.has(d.name)) index.set(d.name, d.code);
  }
  return { resolve: (name) => index.get(name) ?? null, size: index.size };
}

async function main(): Promise<void> {
  const year = Number(get('year'));
  if (!Number.isInteger(year)) {
    console.error(
      'Usage: run-xzqh --year=<YYYY> [--baseline=<divisions.csv>] [--out=<file>] [--author=<name>]'
    );
    process.exit(1);
  }
  const author = get('author') ?? 'xzqh-crawler';
  const { resolve, size } = await buildResolver(get('baseline'));
  console.log(
    `基线解析器：${size > 0 ? `${size} 个名称索引` : '占位（无基线，意图将全部落 unresolved）'}`
  );

  console.log(`抓取 xzqh ${year} 年《县级以上行政区划变更情况》...`);
  const changes = await fetchChanges(year);
  if (changes.length === 0) {
    console.log(`该年无发布（${year} 年无变更条目，属正常）。`);
    return;
  }
  console.log(`解析出 ${changes.length} 条变更事件：`);
  for (const c of changes) {
    console.log(`  · [${c.date ?? '日期缺'}] ${c.org ?? '机关缺'} — ${c.text}`);
  }

  const operations: Operation[] = [];
  let unresolvedCount = 0;
  for (const change of changes) {
    const { operations: ops, unresolved, via } = await extractPatch(
      change.text,
      { resolve }
    );
    operations.push(...ops);
    unresolvedCount += unresolved.length;
    for (const u of unresolved) {
      console.log(`  未解析(${via})：${u.reason}`);
    }
  }

  console.log(
    `\n抽取汇总：合法 operations=${operations.length}，unresolved=${unresolvedCount}`
  );

  if (operations.length === 0) {
    console.log('无合法 operation（多为新设实体无码，需人工分配后补 add）。');
    return;
  }

  // validatePatch 守门：只有过关的 Patch 才算合法产物
  const patch: Patch = {
    meta: {
      author,
      source_url: `http://xzqh.mca.gov.cn/description?dcpid=${year}`,
      evidence_confidence: 'high',
      apply_after: '2023-baseline',
      created_at: new Date().toISOString(),
      notes: `xzqh ${year} 县级以上行政区划变更`,
    },
    operations,
  };
  const validated = validatePatch(patch);
  if (!validated.success) {
    console.error(`✗ validatePatch 未通过：${validated.error}`);
    process.exit(1);
  }
  console.log('✓ validatePatch 通过');

  const outPath = get('out');
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(validated.data, null, 2), 'utf-8');
    console.log(`已写出：${outPath}`);
  } else {
    console.log(JSON.stringify(validated.data, null, 2));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
