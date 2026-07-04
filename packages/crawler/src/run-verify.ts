#!/usr/bin/env node
/**
 * cndiv-verify —— patch 校验运行器（CI 门禁 + 本地交叉校验入口）。
 *
 * structural（默认，CI 门禁）：完全离线、确定性。对 patch 做码/层级/父级自洽 + 对 baseline 的
 * 引用完整性校验（schema 之上的语义层）。任一 error → 退出码 1（门禁不通过）；warning 只打印。
 *   tsx src/run-verify.ts --patch=patches/ --baseline=packages/source-2023/data/divisions.csv
 *   # 无 baseline 时仅做纯码结构自洽（跳过引用完整性）：--patch=patches/xxx.json --baseline=off
 *
 * cross（本地手动、桩）：商业地图源交叉校验。合规红线——不实现网络抓取、不接入 CI、产物不落库。
 * 见 verify.ts::verifyCross 与 docs/patch-校验与交叉校验.md。
 *
 * 选项：--mode(structural|cross) --patch(文件或目录) --baseline(csv 路径 | off)
 */
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';
import { loadBaselineCsv } from './baseline.js';
import { verifyStructural, verifyCross, type Issue } from './verify.js';
import { validatePatch } from '@cndiv/data-protocol';

const args = process.argv.slice(2);
const get = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

const DEFAULT_BASELINE = 'packages/source-2023/data/divisions.csv';

async function collectPatchFiles(target: string): Promise<string[]> {
  const st = await stat(target).catch(() => null);
  if (!st) return [];
  if (st.isFile()) return target.endsWith('.json') ? [target] : [];
  // 目录：递归收集 *.json
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir)) {
      const full = path.join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full);
      else if (entry.endsWith('.json')) out.push(full);
    }
  };
  await walk(target);
  return out.sort();
}

function printIssues(file: string, issues: Issue[]): void {
  for (const i of issues) {
    const icon = i.severity === 'error' ? '⛔' : '⚠️';
    console.error(`  ${icon} [${i.rule}] ${i.code}: ${i.message}`);
  }
}

async function runStructural(): Promise<number> {
  const patchTarget = get('patch') ?? 'patches';
  const baselineArg = get('baseline') ?? DEFAULT_BASELINE;

  // baseline 码集：供引用完整性判定；--baseline=off 或文件缺失时降级为纯离线码结构自洽
  let baselineCodes: Set<string> | undefined;
  if (baselineArg !== 'off') {
    const exists = await stat(baselineArg).then(
      () => true,
      () => false
    );
    if (exists) {
      const divisions = await loadBaselineCsv(baselineArg);
      baselineCodes = new Set(divisions.map((d) => d.code));
      console.log(`加载 baseline: ${baselineArg}（${baselineCodes.size} 码）`);
    } else {
      console.warn(
        `⚠️ baseline 不存在: ${baselineArg} → 降级为纯码结构自洽（跳过引用完整性）。如无需 baseline 传 --baseline=off 静默此告警`
      );
    }
  } else {
    console.log('baseline=off → 仅做纯码结构自洽（不查引用完整性）');
  }

  const files = await collectPatchFiles(patchTarget);
  if (files.length === 0) {
    console.log(`未发现 patch 文件（target=${patchTarget}），无可校验项`);
    return 0;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithError = 0;

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(await readFile(file, 'utf-8'));
    } catch {
      console.error(`⛔ 非法 JSON: ${file}`);
      totalErrors++;
      filesWithError++;
      continue;
    }
    // 先过 schema（形状），再过 structural（语义）；schema 不过则 structural 无意义
    const schema = validatePatch(data);
    if (!schema.success) {
      console.error(`⛔ schema 校验失败: ${file}`);
      console.error(`  ${schema.error}`);
      totalErrors++;
      filesWithError++;
      continue;
    }

    const report = verifyStructural(schema.data, { baselineCodes });
    if (report.errors.length > 0 || report.warnings.length > 0) {
      const tag = report.errors.length > 0 ? '⛔' : '⚠️';
      console.error(`${tag} ${file}（${report.checked} ops）`);
      printIssues(file, report.errors);
      printIssues(file, report.warnings);
    } else {
      console.log(`✓ ${file}（${report.checked} ops）`);
    }
    totalErrors += report.errors.length;
    totalWarnings += report.warnings.length;
    if (report.errors.length > 0) filesWithError++;
  }

  console.log(
    `\n结构校验完成：${files.length} 文件，${totalErrors} error / ${totalWarnings} warning`
  );
  if (totalErrors > 0) {
    console.error(`⛔ ${filesWithError} 个文件存在结构性 error → 门禁不通过`);
    return 1;
  }
  console.log('✅ 门禁通过（无 error；warning 不阻断）');
  return 0;
}

function runCross(): number {
  // 合规桩：绝不发起网络/接入 CI，仅打印红线说明。调用 verifyCross 触发其抛错以坐实"未实现"。
  console.log('—— cross 交叉校验（商业地图源）——');
  console.log(
    '该模式为本地维护者手动、只读、产物不落库的一致性校验，未实现且不接入 CI。'
  );
  try {
    verifyCross();
  } catch (e) {
    console.log(`原因：${(e as Error).message}`);
  }
  console.log(
    '如需实现，见 docs/patch-校验与交叉校验.md 的合规边界与落地形态。'
  );
  return 0; // 非门禁：不阻断，但明确未执行任何实质校验
}

async function main(): Promise<void> {
  const mode = get('mode') ?? 'structural';
  let exitCode: number;
  switch (mode) {
    case 'structural':
      exitCode = await runStructural();
      break;
    case 'cross':
      exitCode = runCross();
      break;
    default:
      console.error(`未知 --mode=${mode}（可选 structural | cross）`);
      exitCode = 1;
  }
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
