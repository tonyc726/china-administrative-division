/**
 * @cndiv/extractor
 *
 * 从行政区划变更公告抽取结构化 Patch 操作。
 * LLM 优先（可插拔后端）+ 规则法兜底；产出 operations 仍需经 data-protocol validatePatch 守门。
 */
export * from './types.js';
export * from './rules.js';
export * from './resolve.js';
export * from './llm.js';
export * from './providers.js';

import type {
  ChangeIntent,
  CodeResolver,
  NewCodeResolver,
  ResolveResult,
} from './types.js';
import { extractIntents } from './rules.js';
import { extractIntentsWithLlm, type LlmComplete } from './llm.js';
import { intentsToPatch } from './resolve.js';

export interface ExtractOptions {
  /** 后向：名称→码解析器（基于**基线年**快照），解析被撤销/更名/划转的既有实体 */
  resolve: CodeResolver;
  /**
   * 前向：新设实体解析器（基于**更晚的权威快照**，如 NBS 2023 / dmfw 实时）。
   * 缺省时 establish 一律落人工——新设实体在旧基线里必然查不到。
   */
  resolveNew?: NewCodeResolver;
  /** 可选 LLM 后端；提供则优先，空结果回退规则法（Tool Use 失败兜底） */
  llm?: LlmComplete;
}

export interface ExtractPatchResult extends ResolveResult {
  intents: ChangeIntent[];
  /** 本次抽取实际走的路径 */
  via: 'llm' | 'rules';
}

/**
 * 端到端：公告文本 → 意图(LLM 优先/规则兜底) → Patch 操作 + 待人工项。
 *
 * 注意：返回的 operations 是**草稿**，必须再经 `validatePatch` 守门后方可写入 patches/。
 */
export async function extractPatch(
  text: string,
  options: ExtractOptions
): Promise<ExtractPatchResult> {
  let intents: ChangeIntent[] = [];
  let via: 'llm' | 'rules' = 'rules';

  if (options.llm) {
    intents = await extractIntentsWithLlm(text, options.llm);
    if (intents.length > 0) via = 'llm';
  }
  if (intents.length === 0) {
    intents = extractIntents(text);
    via = 'rules';
  }

  const resolved = intentsToPatch(intents, {
    resolve: options.resolve,
    resolveNew: options.resolveNew,
  });
  return { ...resolved, intents, via };
}
