/**
 * NLP 变更提取器的领域类型。
 *
 * 两阶段管线：公告文本 →(规则/LLM)→ ChangeIntent[](用名称表达) →(CodeResolver)→ Patch Operation[]。
 * 名称→码这一步必须靠基线解析；新设实体无既有码、未命中名称 → 落入 unresolved 供人工。
 */
import type { Operation } from '@cndiv/data-protocol';

/** 从公告抽取的"变更意图"，以区划**名称**表达（尚未解析为 12 位码） */
export type ChangeIntent =
  | { kind: 'rename'; from: string; to: string; evidence: string }
  | { kind: 'abolish'; target: string; evidence: string }
  | { kind: 'establish'; name: string; evidence: string }
  | { kind: 'transfer'; target: string; newParent: string; evidence: string };

/** 名称 → 12 位区划码解析器（通常基于基线 cache.db 的 divisions 名称索引；未命中返回 null） */
export type CodeResolver = (name: string) => string | null;

/** intents → Patch 的结果 */
export interface ResolveResult {
  /** 已完整解析、可进 validatePatch 的操作 */
  operations: Operation[];
  /** 无法自动成操作的意图（新设实体无码 / 名称未命中基线），需人工补码 */
  unresolved: Array<{ intent: ChangeIntent; reason: string }>;
}
