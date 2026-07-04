/**
 * Patch 校验（structural 门禁 + cross 桩）。
 *
 * 定位：`validatePatch`(data-protocol) 只校验字段形状（code 12 位、name 非空等 schema 约束）；
 * 本模块做 schema 之上的**语义/一致性**校验——码是否真实合法、level 与码结构是否自洽、
 * parent 是否与码结构一致、以及对 baseline 的引用完整性。产出 CI 门禁的通过/失败信号。
 *
 * 边界（Inversion）：
 * - `verifyStructural` **完全离线、确定性**：只依赖 baseline 码集 + @cndiv/core 纯函数码工具，
 *   无任何网络。CI 门禁必须可复现，绝不能因 dmfw 反爬/无 SLA 而随机变红。
 * - dmfw 在线回查、商业地图(高德/腾讯)交叉校验属**在线、非确定性**，归入 `verifyCross`（见桩说明），
 *   仅供本地维护者手动触发、只读、产物不落库——合规红线：商业源不入 MIT 再分发。
 */
import { validateCode, getLevelFromCode, getParentCode } from '@cndiv/core';
import type { Patch } from '@cndiv/data-protocol';

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  /** 涉及的区划码（问题定位锚点） */
  code: string;
  /** 规则 id（稳定标识，便于日志/豁免/追溯） */
  rule: string;
  message: string;
}

export interface StructuralReport {
  errors: Issue[];
  warnings: Issue[];
  /** 实际检查的 operation 数 */
  checked: number;
}

export interface StructuralOptions {
  /**
   * baseline 现存码集合（O(1) 引用完整性判定）。缺省时跳过所有引用完整性规则（TARGET_MISSING /
   * ADD_DUPLICATE / *_PARENT_MISSING），仅做码/层级/父级自洽的纯离线校验。
   */
  baselineCodes?: ReadonlySet<string>;
}

const err = (code: string, rule: string, message: string): Issue => ({
  severity: 'error',
  code,
  rule,
  message,
});
const warn = (code: string, rule: string, message: string): Issue => ({
  severity: 'warning',
  code,
  rule,
  message,
});

/**
 * 对单个 patch 做结构性校验，返回 errors/warnings 分级报告。
 * errors 非空即视为门禁不通过；warnings 打印但不阻断（多为跨 patch 引用等可容忍情形）。
 *
 * 规则清单：
 * - CODE_INVALID       : op.code 非合法 12 位区划码（省码白名单/结构），schema 只查长度不查合法性
 * - ADD_LEVEL_MISMATCH : add.level 与码结构派生 level 不符
 * - ADD_PARENT_MISMATCH: add.parent_code 与码结构派生父码不符（正是 dmfw 扁平父码 bug 的门禁点）
 * - ADD_DUPLICATE      : add 的码已在 baseline 存在（重复新增）
 * - ADD_PARENT_MISSING : add 的父码既不在 baseline 也不在本 patch 内新增（悬挂父，warning）
 * - TARGET_MISSING     : update/move/remove 的目标码不存在于 baseline 且非本 patch 新增
 * - NEWPARENT_INVALID  : move/update 的 new_parent 非合法码
 * - NEWPARENT_SELF     : new_parent 指向自身
 * - NEWPARENT_MISSING  : new_parent 既不在 baseline 也不在本 patch 内新增（悬挂父，warning）
 * - DUP_OP_CONFLICT    : 同一码在本 patch 内既 add 又 remove（自相矛盾）
 * - DUP_OP             : 同一码在本 patch 内出现多次（warning）
 */
export function verifyStructural(
  patch: Patch,
  opts: StructuralOptions = {}
): StructuralReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const baseline = opts.baselineCodes;
  const refCheck = baseline !== undefined;

  const ops = patch.operations;

  // 预扫描：本 patch 内新增的码 + 各码出现的 op 类型（供引用完整性与重复/冲突判定）
  const addedInPatch = new Set<string>();
  const opsByCode = new Map<string, string[]>();
  for (const op of ops) {
    if (op.op === 'add') addedInPatch.add(op.code);
    const arr = opsByCode.get(op.code);
    if (arr) arr.push(op.op);
    else opsByCode.set(op.code, [op.op]);
  }
  const knownParent = (code: string): boolean =>
    addedInPatch.has(code) || (baseline?.has(code) ?? false);

  for (const op of ops) {
    if (!validateCode(op.code)) {
      errors.push(err(op.code, 'CODE_INVALID', `非法区划码（结构或省码白名单不通过）`));
      // 码非法则后续码结构派生（getLevelFromCode/getParentCode）无意义，跳过该 op 的其余规则
      continue;
    }

    switch (op.op) {
      case 'add': {
        const structLevel = getLevelFromCode(op.code);
        if (structLevel !== op.level) {
          errors.push(
            err(op.code, 'ADD_LEVEL_MISMATCH', `level=${op.level} 与码结构派生 level=${structLevel} 不符`)
          );
        }
        const structParent = getParentCode(op.code, op.level);
        // 省级 structParent=null；其余层级须与声明父码一致（消化 dmfw 扁平父码差异的门禁点）
        if (structParent !== op.parent_code) {
          errors.push(
            err(
              op.code,
              'ADD_PARENT_MISMATCH',
              `parent_code=${op.parent_code ?? 'null'} 与码结构派生父码=${structParent ?? 'null'} 不符`
            )
          );
        }
        if (refCheck && baseline!.has(op.code)) {
          errors.push(err(op.code, 'ADD_DUPLICATE', `add 的码已存在于 baseline（重复新增）`));
        }
        if (refCheck && op.parent_code !== null && !knownParent(op.parent_code)) {
          warnings.push(
            warn(op.code, 'ADD_PARENT_MISSING', `父码 ${op.parent_code} 不在 baseline 也未在本 patch 新增（悬挂父）`)
          );
        }
        break;
      }

      case 'update':
      case 'remove': {
        if (refCheck && !knownParent(op.code)) {
          errors.push(err(op.code, 'TARGET_MISSING', `${op.op} 目标码不存在于 baseline 且非本 patch 新增`));
        }
        if (op.op === 'update' && op.new_parent !== undefined) {
          checkNewParent(op.code, op.new_parent, refCheck, knownParent, errors, warnings);
        }
        break;
      }

      case 'move': {
        if (refCheck && !knownParent(op.code)) {
          errors.push(err(op.code, 'TARGET_MISSING', `move 目标码不存在于 baseline 且非本 patch 新增`));
        }
        checkNewParent(op.code, op.new_parent, refCheck, knownParent, errors, warnings);
        break;
      }
    }
  }

  // 同码多 op：add+remove 自相矛盾 → error；其余重复 → warning
  for (const [code, kinds] of opsByCode) {
    if (kinds.length < 2) continue;
    if (kinds.includes('add') && kinds.includes('remove')) {
      errors.push(err(code, 'DUP_OP_CONFLICT', `同一码在本 patch 内既 add 又 remove（自相矛盾）`));
    } else {
      warnings.push(warn(code, 'DUP_OP', `同一码在本 patch 内出现 ${kinds.length} 次（${kinds.join('/')}）`));
    }
  }

  return { errors, warnings, checked: ops.length };
}

function checkNewParent(
  code: string,
  newParent: string,
  refCheck: boolean,
  knownParent: (c: string) => boolean,
  errors: Issue[],
  warnings: Issue[]
): void {
  if (newParent === code) {
    errors.push(err(code, 'NEWPARENT_SELF', `new_parent 指向自身`));
    return;
  }
  if (!validateCode(newParent)) {
    errors.push(err(code, 'NEWPARENT_INVALID', `new_parent=${newParent} 非合法区划码`));
    return;
  }
  if (refCheck && !knownParent(newParent)) {
    warnings.push(warn(code, 'NEWPARENT_MISSING', `new_parent ${newParent} 不在 baseline 也未在本 patch 新增（悬挂父）`));
  }
}

/**
 * cross 交叉校验（商业地图源）——**故意未实现的桩**。
 *
 * 为什么是桩而非功能：高德/腾讯/百度/天地图四源 ToS 三重禁止（存储/构建数据集/爬取分发，
 * 百度 3.3.4 最严明禁「生成或用于数据库」）。合规红线：商业源**仅可本地内部只读一致性校验、
 * 产物绝不落库/不进 patches/、不入 MIT 再分发**。故：
 * - 绝不在此实现网络抓取，更不接入公开仓 GitHub Actions（避免商业 key 进云端共享 runner）；
 * - 真要做，须在**维护者本机**手动触发，读本地 env 的 key，只打 warning、写 stderr，物理上不落盘。
 *
 * 设计文档见 docs/patch-校验与交叉校验.md。调用即抛错，避免被误接入自动化门禁。
 */
export function verifyCross(): never {
  throw new Error(
    'verifyCross 未实现（合规红线）：商业地图源仅限本地维护者手动、只读、不落库的一致性校验，' +
      '不得接入 CI/自动化，不入 MIT 再分发。详见 docs/patch-校验与交叉校验.md。'
  );
}
