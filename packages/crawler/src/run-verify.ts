#!/usr/bin/env node
/**
 * cndiv-verify —— patch 校验运行器（CI 门禁 + 本地交叉校验入口）。
 *
 * structural（默认，CI 门禁）：完全离线、确定性。对 patch 做码/层级/父级自洽 + 对 baseline 的
 * 引用完整性校验（schema 之上的语义层）。任一 error → 退出码 1（门禁不通过）；warning 只打印。
 *   # 全量按年选基线（CI 门禁形态）：patch 的 apply_after 声明哪年基线，就喂哪年码集。
 *   # 多年 CSV（如 source-history）按 year 列过滤；缺该年基线 → 报错，绝不静默退回别的年份。
 *   tsx src/run-verify.ts --patch=patches/ \
 *     --baselines=2020=packages/source-history/data/divisions.csv,2023=packages/source-2023/data/divisions.csv
 *   # 单 patch 校验（本地）：全部 patch 共用一个码集
 *   tsx src/run-verify.ts --patch=patches/xxx.json --baseline=packages/source-2023/data/divisions.csv
 *   # 无 baseline 时仅做纯码结构自洽（跳过引用完整性）：--patch=patches/xxx.json --baseline=off
 *
 * cross（本地手动、桩）：商业地图源交叉校验。合规红线——不实现网络抓取、不接入 CI、产物不落库。
 * 见 verify.ts::verifyCross 与 docs/patch-校验与交叉校验.md。
 *
 * 选项：--mode(structural|cross) --patch(文件或目录)
 *       --baseline(csv 路径 | off)        单码集模式（与 --baselines 互斥）
 *       --baselines=YYYY=csv[,...]        按年选集模式（与 --baseline 互斥）
 *
 * 显式传入的 --baseline/--baselines 路径缺失 → 直接退出 1（CI 的门禁路径丢了必须炸，
 * 静默降级会让引用完整性空转——2026-09 事故根因）。未传 --baseline 走 DEFAULT_BASELINE
 * 且默认路径缺失 → 仅告警降级（本地新 clone 的合理体验）。
 */
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';
import { loadBaselineCsv } from './baseline.js';
import { parseBaselinesArg, loadYearCodes, type BaselineMap } from './baseline-map.js';
import { verifyStructural, verifyCross, type Issue } from './verify.js';
import { parseBaselineYear, validatePatch } from '@cndiv/data-protocol';

const args = process.argv.slice(2);
const get = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

const DEFAULT_BASELINE = 'packages/source-2023/data/divisions.csv';

async function collectPatchFiles(target: string): Promise<string[]> {
  const st = await stat(target).catch(() => null);
  if (!st) return [];
  // merge-patches 的冲突 sidecar（*.conflicts.json）是数组格式报告，不是 patch（契约见
  // packages/cli/src/merge-patches.ts 头注），单文件/目录两种入口都排除。
  if (st.isFile())
    return target.endsWith('.json') && !target.endsWith('.conflicts.json')
      ? [target]
      : [];
  // 目录：递归收集 *.json
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir)) {
      if (entry.endsWith('.conflicts.json')) continue;
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
  const baselinesRaw = args.find((a) => a.startsWith('--baselines='))
    ?.slice('--baselines='.length);
  const explicitBaseline = get('baseline');

  if (baselinesRaw && explicitBaseline !== undefined) {
    console.error('⛔ --baseline 与 --baselines 互斥，只能给一个');
    return 1;
  }

  // 按年选集模式：每份 patch 用自己 apply_after 声明年的码集
  let baselines: BaselineMap | undefined;
  if (baselinesRaw) {
    try {
      baselines = parseBaselinesArg(baselinesRaw);
    } catch (e) {
      console.error(`⛔ ${(e as Error).message}`);
      return 1;
    }
  }

  const baselineArg = explicitBaseline ?? DEFAULT_BASELINE;

  // 单码集模式的 baseline 码集：供引用完整性判定。
  // --baseline=off 或（未显式传且）默认路径缺失 → 降级为纯离线码结构自洽；
  // 显式传入的路径缺失 → fail-hard（见文件头注释）。
  let singleCodes: Set<string> | undefined;
  if (baselines) {
    const years = [...baselines.keys()].sort((a, b) => a - b).join(', ');
    console.log(`按年选基线模式：${years}（apply_after 命中即用，缺年报错）`);
  } else if (baselineArg !== 'off') {
    const exists = await stat(baselineArg).then(
      () => true,
      () => false
    );
    if (exists) {
      const divisions = await loadBaselineCsv(baselineArg);
      singleCodes = new Set(divisions.map((d) => d.code));
      console.log(`加载 baseline: ${baselineArg}（${singleCodes.size} 码）`);
    } else if (explicitBaseline !== undefined) {
      console.error(
        `⛔ baseline 不存在: ${baselineArg}（显式传入的路径缺失，fail-hard 不降级）`
      );
      return 1;
    } else {
      console.warn(
        `⚠️ baseline 不存在: ${baselineArg} → 降级为纯码结构自洽（跳过引用完整性）。如无需 baseline 传 --baseline=off 静默此告警`
      );
    }
  } else {
    console.log('baseline=off → 仅做纯码结构自洽（不查引用完整性）');
  }

  // 按年码集缓存：同一年只装一次
  const yearCodesCache = new Map<number, Set<string>>();

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

    // 按年选集：apply_after 声明哪年，就喂哪年码集；缺年 = 门禁不通过（绝不静默退回）
    let baselineCodes = singleCodes;
    if (baselines) {
      const year = parseBaselineYear(schema.data.meta.apply_after);
      if (year === null) {
        console.error(
          `⛔ ${file}: apply_after「${schema.data.meta.apply_after}」无法解析出基线年`
        );
        totalErrors++;
        filesWithError++;
        continue;
      }
      if (!baselines.has(year)) {
        console.error(
          `⛔ ${file}: 需要 ${year} 基线，但 --baselines 未提供（值里补一条 ${year}=<csv>）`
        );
        totalErrors++;
        filesWithError++;
        continue;
      }
      let codes = yearCodesCache.get(year);
      if (!codes) {
        const loaded = await loadYearCodes(baselines, year);
        if (!loaded.ok) {
          console.error(`⛔ ${file}: ${loaded.reason}`);
          totalErrors++;
          filesWithError++;
          continue;
        }
        codes = loaded.codes;
        yearCodesCache.set(year, codes);
        console.log(`加载 ${year} baseline（${codes.size} 码）`);
      }
      baselineCodes = codes;
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
