#!/usr/bin/env node
/**
 * xzqh 变更事件流 → 逐条 extractPatch → 汇总合法 Patch 的运行器。
 *
 * 用法：
 *   tsx src/run-xzqh.ts --year=2026                       # 默认用 ~/.cndiv/cache.db 生产解析
 *   tsx src/run-xzqh.ts --year=2024 --snapshot-year=2023 --out=patches/2024/xzqh.json
 *   tsx src/run-xzqh.ts --year=2024 --baseline=packages/source-2023/data/divisions.csv  # 降级 CSV
 *
 * 选项：
 *   --year=<YYYY>          必填。抓取该年《县级以上行政区划变更情况》。
 *   --cache=<cache.db>     可选。cndiv hydrate 产的 cache.db；缺省探测 ~/.cndiv/cache.db。
 *   --snapshot-year=<YYYY> 可选。取 cache.db 哪年快照作基线；缺省取库中最新年。
 *   --baseline=<csv>       可选。cache.db 不可用时的 CSV 降级源；再缺则占位（全落 unresolved）。
 *   --out=<file>           可选。合法 Patch 写出路径；缺省仅打印。
 *   --author=<name>        可选。Patch 作者，默认 xzqh-crawler。
 *
 * 解析器优先级：cache.db（生产，同名歧义落人工不臆造）→ CSV 基线 → 占位。
 * 设计（FMEA）：extractPatch 产出的 operations 是草稿，必须再经 validatePatch 守门；
 * 未解析意图（unresolved）明确计数打印落人工，绝不臆造码。
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fetchChanges } from './xzqh.js';
import { parseDivisionsCsv } from './baseline.js';
import { buildCacheResolver } from './xzqh-resolver.js';
import { defaultCachePath } from '@cndiv/reader';
import { extractPatch, type CodeResolver } from '@cndiv/extractor';
import {
  validatePatch,
  type Operation,
  type Patch,
} from '@cndiv/data-protocol';

/** 统一解析器句柄：cache.db / CSV / 占位三态共用；close 释放底层连接（CSV/占位为 noop）。 */
interface ResolverHandle {
  resolve: CodeResolver;
  /** 日志描述 */
  desc: string;
  /** 仅 cache.db 态有：同名歧义（多候选）→ 全候选码，落人工 */
  ambiguous?: ReadonlyMap<string, string[]>;
  close(): void;
}

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

/**
 * 装配解析器。优先级：cache.db（显式 --cache 或默认库存在）→ CSV 基线 → 占位。
 * cache.db 失败（缺库/缺年）自动降级并告警、不中断（沿用 FMEA 软失败原则）。
 */
async function assembleResolver(opts: {
  cache?: string;
  snapshotYear?: number;
  baseline?: string;
}): Promise<ResolverHandle> {
  const cachePath = opts.cache ?? defaultCachePath();
  if (opts.cache || existsSync(cachePath)) {
    try {
      const r = buildCacheResolver({
        dbPath: cachePath,
        snapshotYear: opts.snapshotYear,
      });
      return {
        resolve: r.resolve,
        desc: `cache.db 快照 ${r.snapshotYear}（${r.size} 名索引）`,
        ambiguous: r.ambiguous,
        close: r.close,
      };
    } catch (e) {
      console.warn(
        `⚠ cache.db 不可用（${(e as Error).message}），降级到 CSV/占位`
      );
    }
  }
  const csv = await buildResolver(opts.baseline);
  return {
    resolve: csv.resolve,
    desc:
      csv.size > 0
        ? `CSV 基线（${csv.size} 名索引；重名保留首现，歧义不额外标注）`
        : '占位（无 cache/baseline，意图全部落 unresolved）',
    close: () => {},
  };
}

async function main(): Promise<void> {
  const year = Number(get('year'));
  if (!Number.isInteger(year)) {
    console.error(
      'Usage: run-xzqh --year=<YYYY> [--cache=<cache.db>] [--snapshot-year=<YYYY>] [--baseline=<divisions.csv>] [--out=<file>] [--author=<name>]'
    );
    process.exit(1);
  }
  const author = get('author') ?? 'xzqh-crawler';
  const snapshotYearArg = get('snapshot-year');
  const handle = await assembleResolver({
    cache: get('cache'),
    snapshotYear: snapshotYearArg ? Number(snapshotYearArg) : undefined,
    baseline: get('baseline'),
  });
  console.log(`解析器：${handle.desc}`);

  try {
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
        { resolve: handle.resolve }
      );
      operations.push(...ops);
      unresolvedCount += unresolved.length;
      for (const u of unresolved) {
        console.log(`  未解析(${via})：${u.reason}`);
      }
    }

    // 同名歧义清单：cache.db 态下 resolve 命中多候选 → 已落 unresolved，
    // 此处补打全候选供人工按 parent 上下文指定，绝不臆造码。
    if (handle.ambiguous && handle.ambiguous.size > 0) {
      console.log(
        `\n⚠ 同名歧义 ${handle.ambiguous.size} 例（已落 unresolved，需人工按上下文指定）：`
      );
      for (const [name, codes] of handle.ambiguous) {
        console.log(`  「${name}」→ 候选 [${codes.join(', ')}]`);
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
      process.exitCode = 1;
      return;
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
  } finally {
    handle.close(); // 释放 cache.db 连接（CSV/占位为 noop）
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
