/**
 * NLP 变更提取器的领域类型。
 *
 * 两阶段管线：公告文本 →(规则/LLM)→ ChangeIntent[](用名称表达) →(CodeResolver)→ Patch Operation[]。
 * 名称→码这一步必须靠基线解析；新设实体无既有码、未命中名称 → 落入 unresolved 供人工。
 */
import type { Operation } from '@cndiv/data-protocol';

/**
 * 文档级行政上下文（公告标题开头的省/直辖市名，如「重庆市」）。
 * 正文里的裸名（「江北区」全国有两个）靠它二次消歧——上下文不用来拼码，只用来**排除**候选。
 */
interface IntentContext {
  context?: string;
}

/** 从公告抽取的"变更意图"，以区划**名称**表达（尚未解析为 12 位码） */
export type ChangeIntent = IntentContext &
  (
    | { kind: 'rename'; from: string; to: string; evidence: string }
    | { kind: 'abolish'; target: string; evidence: string }
    | { kind: 'establish'; name: string; evidence: string }
    | { kind: 'transfer'; target: string; newParent: string; evidence: string }
  );

/** 名称 → 12 位区划码解析器（通常基于基线 cache.db 的 divisions 名称索引；未命中返回 null） */
export type CodeResolver = (name: string) => string | null;

/** 前向解析命中的既有区划记录（码/层级/父码均取自权威快照，非推导） */
export interface DivisionRef {
  code: string;
  name: string;
  level: number;
  parent_code: string;
}

/**
 * 新设实体解析器（**前向**解析）。
 *
 * 铁律「绝不臆造码」约束的是**编造**，不是**查证**。新设的临平区/横州市在旧基线里当然查不到，
 * 但它们的官方码就写在更晚的权威快照里（NBS 2023 / dmfw 实时）。故 establish 意图不该一律
 * 落人工——先去前向快照查，查到即用官方码产 add；查不到才落人工。每个码仍然来自官方发布。
 */
export type NewCodeResolver = (name: string) => DivisionRef | null;

/** intents → Patch 的结果 */
export interface ResolveResult {
  /** 已完整解析、可进 validatePatch 的操作 */
  operations: Operation[];
  /** 无法自动成操作的意图（新设实体前向快照也查不到 / 名称未命中基线），需人工补码 */
  unresolved: Array<{ intent: ChangeIntent; reason: string }>;
}
