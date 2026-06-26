/**
 * 可插拔 LLM 抽取路径。
 *
 * 不内置任何模型后端：调用方注入 LlmComplete（适配 Ollama / vLLM / 百炼 / SiliconFlow 等）。
 * 遵循 AI 工程铁律——Tool Use 失败必须兜底：LLM 抛错/空/非法输出时返回 []，由上层回退规则法。
 */
import type { ChangeIntent } from './types.js';

/** 调用方注入的 LLM 补全函数：输入 prompt，返回模型文本 */
export type LlmComplete = (prompt: string) => Promise<string>;

/** 构造结构化抽取 prompt：要求模型只输出 ChangeIntent[] 的 JSON */
function buildExtractPrompt(text: string): string {
  return [
    '你是行政区划变更公告的结构化抽取器。从下面公告中抽取所有区划变更意图。',
    '只输出 JSON 数组，不要任何解释或代码块标记。每个元素形如：',
    '  rename:    {"kind":"rename","from":"原名","to":"新名","evidence":"原文片段"}',
    '  abolish:   {"kind":"abolish","target":"被撤名","evidence":"原文片段"}',
    '  establish: {"kind":"establish","name":"新设名","evidence":"原文片段"}',
    '  transfer:  {"kind":"transfer","target":"被划名","newParent":"新上级名","evidence":"原文片段"}',
    '名称需带行政单位后缀（如 X县/X区/X街道）。无变更则输出 []。',
    '',
    `公告：${text}`,
  ].join('\n');
}

const KINDS = new Set<string>(['rename', 'abolish', 'establish', 'transfer']);

/**
 * 解析 LLM 返回为 ChangeIntent[]：容错截取 JSON 数组、丢弃 kind 越界元素。
 * 仅做粗筛——字段形状由下游 intentsToPatch + validatePatch 二次把关。
 */
function parseLlmIntents(raw: string): ChangeIntent[] {
  let data: unknown;
  try {
    const s = raw.indexOf('[');
    const e = raw.lastIndexOf(']');
    data = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is ChangeIntent =>
      !!item && typeof item === 'object' && KINDS.has((item as { kind?: string }).kind ?? ''),
  );
}

/**
 * LLM 路径：调用注入的 complete → 解析 intents；任何失败返回 []（交上层回退规则法）。
 */
export async function extractIntentsWithLlm(text: string, complete: LlmComplete): Promise<ChangeIntent[]> {
  try {
    return parseLlmIntents(await complete(buildExtractPrompt(text)));
  } catch {
    return [];
  }
}
