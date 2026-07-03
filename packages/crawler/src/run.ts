#!/usr/bin/env node
/**
 * 全量爬取 → 差分 → 产出 patches/<year>/*.json 的运行器。
 *
 * 用法：
 *   tsx src/run.ts --year=2026 --baseline=packages/source-2023/data/divisions.csv
 *   # 仅某省（验证/分批）：--root=640000000000
 *   # 断点续爬：相同 --cache 目录重跑即续跑
 *
 * 选项：--year --baseline(必填) --root --out --concurrency --maxLevel --cache --author --removes
 *
 * 安全默认（FMEA）：dmfw 覆盖范围小于 NBS（无村级、无开发区/管委会等乡级特殊单位），
 * "基线有、dmfw 无" 多为口径差异而非真实撤销。故默认只产出 add/update/move 安全增量集，
 * remove 需 --removes=on 显式开启供人工复核；被抑制的 remove 数量会打印（不静默丢弃）。
 */
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { crawlAll } from './crawl-all.js';
import { diffToPatch } from './diff.js';
import { loadBaselineCsv } from './baseline.js';
import type { Division } from '@cndiv/core';
import { validatePatch, type Operation } from '@cndiv/data-protocol';

const args = process.argv.slice(2);
const get = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

async function main(): Promise<void> {
  const year = Number(get('year') ?? new Date().getFullYear());
  const root = get('root') ?? '';
  const baselinePath = get('baseline');
  const outDir = get('out') ?? `patches/${year}`;
  const concurrency = Number(get('concurrency') ?? 6);
  const maxLevel = Number(get('maxLevel') ?? 4);
  const cacheDir = get('cache') ?? `.cache/crawler-${year}`;
  const author = get('author') ?? 'dmfw-crawler';
  const emitRemoves = (get('removes') ?? 'off') === 'on';

  if (!baselinePath) {
    console.error(
      'Usage: run --year=<YYYY> --baseline=<divisions.csv> [--root=<code>] [--out=<dir>] [--concurrency=6] [--maxLevel=4] [--cache=<dir>] [--removes=on]'
    );
    process.exit(1);
  }

  console.log(
    `抓取 dmfw（root="${root || '全国'}", maxLevel=${maxLevel}, concurrency=${concurrency}, cache=${cacheDir}）...`
  );
  const { divisions, failures, fetched, cached } = await crawlAll(root, {
    year,
    maxLevel,
    concurrency,
    cacheDir,
    onWave: (wave, fr, total) =>
      console.log(`  波次 ${wave}（每波抓 2 层）: 展开 ${fr} 节点 → 累计 ${total} 条`),
  });
  console.log(
    `抓取完成：${divisions.length} 条（网络 ${fetched} / 缓存 ${cached}），失败 ${failures.length}`
  );
  if (failures.length > 0) {
    console.warn(
      `  失败节点(可重跑续爬): ${failures.slice(0, 10).join(', ')}${failures.length > 10 ? ' …' : ''}`
    );
  }

  console.log(`加载基线: ${baselinePath}`);
  const allBaseline = await loadBaselineCsv(baselinePath);

  // 自动对齐差分范围：按抓取根的省前缀 + 实际抓到的层级，避免误判（如 dmfw 无村级 → 不删基线村级）
  const prefix = root ? root.slice(0, 2) : '';
  const levels = [...new Set(divisions.map((d) => d.level))].sort(
    (a, b) => a - b
  );
  const baseline = allBaseline.filter(
    (d) => d.code.startsWith(prefix) && levels.includes(d.level)
  );

  const provincesOf = (list: Division[]): Set<string> =>
    new Set(list.map((d) => d.code.slice(0, 2)));
  const provinces = [
    ...new Set([...provincesOf(divisions), ...provincesOf(baseline)]),
  ].sort();

  await mkdir(outDir, { recursive: true });
  let written = 0;
  let totalOps = 0;
  let suppressedRemoves = 0;
  let skippedEmptyNames = 0;
  let revokedBySuffixTotal = 0;
  let rejected = 0;
  for (const pp of provinces) {
    const cur = divisions.filter((d) => d.code.startsWith(pp));
    const base = baseline.filter((d) => d.code.startsWith(pp));
    const { patch, skippedEmptyName, revokedBySuffix } = diffToPatch(base, cur, {
      author,
      source_url: 'https://dmfw.mca.gov.cn/',
      apply_after: '2023-baseline',
      levels,
    });
    skippedEmptyNames += skippedEmptyName;
    revokedBySuffixTotal += revokedBySuffix;

    let ops: Operation[] = patch.operations;
    if (!emitRemoves) {
      const safe = ops.filter((o) => o.op !== 'remove');
      suppressedRemoves += ops.length - safe.length;
      ops = safe;
    }
    if (ops.length === 0) continue;

    patch.operations = ops;

    // 写盘前守门：用 data-protocol schema 校验，拒绝任何非法 patch（防脏数据落进 patches/）
    const check = validatePatch(patch);
    if (!check.success) {
      rejected++;
      console.error(
        `  ⛔ 跳过非法 patch ${pp}（未过 schema 校验）：${check.error}`
      );
      continue;
    }

    const file = path.join(outDir, `${pp}0000000000-dmfw-${year}.json`);
    await writeFile(file, `${JSON.stringify(patch, null, 2)}\n`);
    written++;
    totalOps += ops.length;
    console.log(`  ✏️  ${path.basename(file)}: ${ops.length} ops`);
  }

  console.log(
    `\n完成：写出 ${written} 个 patch 文件，共 ${totalOps} 个变更操作 → ${outDir}/`
  );
  if (skippedEmptyNames > 0) {
    console.log(
      `ℹ️  跳过 ${skippedEmptyNames} 个空名节点（dmfw name=null，无法产出合法 add/update）`
    );
  }
  if (revokedBySuffixTotal > 0) {
    console.log(
      `ℹ️  dmfw 标注「（撤销）」节点 ${revokedBySuffixTotal} 个 → 已产 remove 候选` +
        `（受 --removes 控制，默认抑制供人工复核；该后缀全国一致性未验证）`
    );
  }
  if (rejected > 0) {
    console.log(
      `⛔ ${rejected} 个省级 patch 因未过 schema 校验被拒写（详见上方日志，不静默丢弃）`
    );
  }
  if (suppressedRemoves > 0) {
    console.log(
      `⚠️  抑制 ${suppressedRemoves} 个 remove（dmfw 覆盖<NBS：无村级/开发区管委会，absence≠撤销）。` +
        `如需产出供人工复核，加 --removes=on`
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
