#!/usr/bin/env node
/**
 * 省级乡级代码半年校验点 · PoC 运行器（2.4）。
 *
 * 管线：本地 HTML 表 → 解析 9 位乡级码 → 归一 12 位 Division → 对 cache.db 基线 diff(levels=[4])
 *       → validatePatch → 产出该省乡级增量 patch。
 *
 * 为何要 --file（而非直接抓）：各省官网异构且反爬（四川 shtml 对非搜索引擎 UA 返 403/404）。
 * 活体抓取须逐省适配（浏览器形态/OSS xlsx 直链），本 PoC 只验证「拿到字节后」的解析→diff→校验闭环；
 * 抓取形态见 PROVINCE_TOWNSHIP_REGISTRY 的 note，逐省适配另立工程项。
 *
 * 用法：
 *   tsx src/run-prov-township.ts --province=51 --file=四川.html [--snapshot-year=2023] [--out=patches/2026/51-township.json]
 *   tsx src/run-prov-township.ts --registry            # 仅打印监控注册表
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { openCache, defaultCachePath } from '@cndiv/reader';
import { diffToPatch } from './diff.js';
import {
  parseTownshipHtmlTable,
  townshipRowsToDivisions,
  townshipSourceOf,
  PROVINCE_TOWNSHIP_REGISTRY,
} from './prov-township.js';
import { validatePatch } from '@cndiv/data-protocol';
import type { Division } from '@cndiv/core';

const args = process.argv.slice(2);
const get = (k: string): string | undefined =>
  args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];

function printRegistry(): void {
  console.log(
    '省级民政厅乡级代码 · 半年度监控注册表（79 号令第十六条第二款）：\n'
  );
  for (const s of PROVINCE_TOWNSHIP_REGISTRY) {
    const flag =
      s.status === 'confirmed' ? '✅' : s.status === 'candidate' ? '🟡' : '⛔';
    console.log(`${flag} ${s.provinceCode} ${s.name}  [${s.format}]`);
    console.log(`   栏目: ${s.columnUrl}`);
    if (s.latestUrl) console.log(`   最新: ${s.latestUrl}`);
    console.log(`   备注: ${s.note}\n`);
  }
  console.log(
    '轮询节律：每年 2 月/8 月对各省 columnUrl 内容差分（各留 1 月缓冲）。'
  );
}

async function main(): Promise<void> {
  if (args.includes('--registry')) {
    printRegistry();
    return;
  }

  const provinceCode = get('province');
  const file = get('file');
  const year = Number(get('year') ?? new Date().getFullYear());
  const snapshotArg = get('snapshot-year');
  const out = get('out');

  if (!provinceCode || !file) {
    console.error(
      'Usage: run-prov-township --province=<2位省码> --file=<本地HTML> [--snapshot-year=<YYYY>] [--out=<patch.json>]\n' +
        '       run-prov-township --registry   # 打印监控注册表'
    );
    process.exit(1);
  }

  const src = townshipSourceOf(provinceCode);
  console.log(
    `省份 ${provinceCode}${src ? `（${src.name}，注册表状态=${src.status}）` : '（注册表未收录）'}`
  );

  // 1) 解析本地 HTML 表 → 归一 12 位乡级 Division
  const html = readFileSync(file, 'utf-8');
  const rows = parseTownshipHtmlTable(html);
  const current = townshipRowsToDivisions(rows, year, provinceCode);
  console.log(
    `解析乡级：${rows.length} 行 → 归一 ${current.length} 条（省内 level4）`
  );
  if (current.length === 0) {
    console.error('✗ 未解析到任何乡级码（检查 HTML 表格式 / 省码前缀）');
    process.exit(1);
  }

  // 2) cache.db 基线（仅该省 level4）
  const db = openCache(get('cache') ?? defaultCachePath());
  let baseline: Division[];
  try {
    const years = db.listYears();
    const snap = snapshotArg ? Number(snapshotArg) : Math.max(...years);
    if (!years.includes(snap)) {
      throw new Error(`快照年 ${snap} 不在 cache.db（${years.join(',')}）`);
    }
    baseline = db
      .getByLevel(4, snap)
      .filter((d) => d.code.startsWith(provinceCode));
    console.log(
      `基线：cache.db 快照 ${snap} 的 ${provinceCode} 省 level4 共 ${baseline.length} 条`
    );
  } finally {
    db.close();
  }

  // 3) diff（仅 level4）→ validatePatch
  const { patch, skippedEmptyName } = diffToPatch(baseline, current, {
    author: `mzt-${provinceCode}-township`,
    source_url: src?.latestUrl ?? src?.columnUrl,
    apply_after: '2023-baseline',
    levels: [4],
  });
  // 安全默认：remove 多为口径差异（省表 vs NBS 基线覆盖不同），抑制供人工复核。
  const safe = patch.operations.filter((o) => o.op !== 'remove');
  const suppressedRemoves = patch.operations.length - safe.length;
  patch.operations = safe;

  console.log(
    `\ndiff：${safe.length} 个安全 op（add/update/move）` +
      (suppressedRemoves
        ? `，抑制 ${suppressedRemoves} 个 remove（口径差异，供人工复核）`
        : '') +
      (skippedEmptyName ? `，跳过 ${skippedEmptyName} 空名` : '')
  );

  if (safe.length === 0) {
    console.log('无安全增量（省表与基线一致或仅有待复核 remove）。');
    return;
  }

  const validated = validatePatch(patch);
  if (!validated.success) {
    console.error(`✗ validatePatch 未通过：${validated.error}`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ validatePatch 通过');

  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, `${JSON.stringify(validated.data, null, 2)}\n`);
    console.log(`已写出：${out}`);
  } else {
    console.log(JSON.stringify(validated.data, null, 2));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
