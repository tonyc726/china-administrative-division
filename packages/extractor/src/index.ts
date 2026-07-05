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

import type { ChangeIntent, CodeResolver, ResolveResult } from './types.js';
import { extractIntents } from './rules.js';
import { extractIntentsWithLlm, type LlmComplete } from './llm.js';
import { intentsToPatch } from './resolve.js';

export interface ExtractOptions {
  /** 名称→码解析器（基于基线） */
  resolve: CodeResolver;
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

  return { ...intentsToPatch(intents, options.resolve), intents, via };
}
