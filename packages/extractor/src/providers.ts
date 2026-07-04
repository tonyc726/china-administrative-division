/**
 * LlmComplete 适配器：把具体 LLM 后端封装成 `(prompt) => Promise<string>`，注入 extractPatch。
 *
 * 设计约束：
 * - 零 SDK 依赖——只用 Node 内置 fetch（Node 18+），保持 extractor 轻量、可在任意运行时注入。
 * - 失败即抛——上层 extractIntentsWithLlm 已 try/catch 兜底回退规则法（Tool Use 失败兜底）。
 * - temperature 默认 0——结构化抽取要确定性，避免同一公告产出漂移。
 */
import type { LlmComplete } from './llm.js';

/** OpenAI Chat Completions 响应的最小形状（百炼兼容模式） */
interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Ollama /api/chat 响应的最小形状 */
interface OllamaChatResponse {
  message?: { content?: string };
}

/** 带超时的 POST JSON；非 2xx 抛错（含响应体便于排查） */
async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} from ${url}: ${(await res.text()).slice(0, 500)}`
      );
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface OllamaOptions {
  /** 模型名（需已 `ollama pull`），默认 'qwen2.5' */
  model?: string;
  /** Ollama 服务地址，默认 'http://localhost:11434' */
  baseUrl?: string;
  /** 请求超时 ms，默认 60000 */
  timeoutMs?: number;
  /** 采样温度，默认 0（抽取任务要确定性） */
  temperature?: number;
}

/**
 * 本地 Ollama 适配器（CLAUDE.md 默认本地推理）。
 * 前置：`ollama serve` 已起 + `ollama pull <model>`。
 */
export function createOllamaComplete(options: OllamaOptions = {}): LlmComplete {
  const {
    model = 'qwen2.5',
    baseUrl = 'http://localhost:11434',
    timeoutMs = 60000,
    temperature = 0,
  } = options;
  return async (prompt: string): Promise<string> => {
    const data = (await postJson(
      `${baseUrl}/api/chat`,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature },
      },
      {},
      timeoutMs
    )) as OllamaChatResponse;
    return data.message?.content ?? '';
  };
}

export interface BailianOptions {
  /** DashScope API Key（必填；惯例由调用方从 env 注入，保持本库不读环境变量、跨运行时纯净） */
  apiKey?: string;
  /** 模型名，默认 'qwen-plus' */
  model?: string;
  /** OpenAI 兼容端点，默认百炼 compatible-mode */
  baseUrl?: string;
  /** 请求超时 ms，默认 60000 */
  timeoutMs?: number;
  /** 采样温度，默认 0 */
  temperature?: number;
}

/**
 * 阿里云百炼（DashScope OpenAI 兼容模式）适配器（CLAUDE.md 指定 MaaS）。
 * 高性能云端模型；apiKey 必填（调用方惯例从 DASHSCOPE_API_KEY 注入）。
 */
export function createBailianComplete(
  options: BailianOptions = {}
): LlmComplete {
  const { apiKey } = options;
  if (!apiKey) {
    throw new Error(
      'createBailianComplete: 需提供 apiKey（惯例 createBailianComplete({ apiKey: process.env.DASHSCOPE_API_KEY })）'
    );
  }
  const {
    model = 'qwen-plus',
    baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    timeoutMs = 60000,
    temperature = 0,
  } = options;
  return async (prompt: string): Promise<string> => {
    const data = (await postJson(
      `${baseUrl}/chat/completions`,
      { model, messages: [{ role: 'user', content: prompt }], temperature },
      { Authorization: `Bearer ${apiKey}` },
      timeoutMs
    )) as ChatCompletionsResponse;
    return data.choices?.[0]?.message?.content ?? '';
  };
}
