# @cndiv/extractor

> 从行政区划变更公告(自然语言)抽取结构化 Patch 操作：规则法兜底 + 可插拔 LLM

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 管线

```
公告文本 ─(LLM 优先 / 规则兜底)→ ChangeIntent[](名称表达) ─(CodeResolver 名称→码)→ Patch Operation[]
```

产出的 `operations` 是**草稿**，必须再经 `@cndiv/data-protocol` 的 `validatePatch` 守门后才能写入 `patches/`。

## 用法

### 规则法（零依赖、离线、确定性）

```ts
import { extractPatch } from '@cndiv/extractor';
const result = await extractPatch(公告文本, { resolve });
```

### 接入 LLM（更高召回；失败自动回退规则法 = Tool Use 兜底）

```ts
import { extractPatch, createOllamaComplete, createBailianComplete } from '@cndiv/extractor';

// 本地 Ollama（ollama serve + ollama pull qwen2.5）
const llm = createOllamaComplete({ model: 'qwen2.5' });

// 或阿里云百炼 DashScope（apiKey 由调用方注入；本库不读环境变量）
// const llm = createBailianComplete({ apiKey: process.env.DASHSCOPE_API_KEY, model: 'qwen-plus' });

const result = await extractPatch(公告文本, { resolve, llm });
// result.via: 'llm' | 'rules'——LLM 异常或空结果时自动回退
```

适配器零 SDK 依赖（仅用 Node 内置 `fetch`）、带超时、`temperature=0`（抽取要确定性）。

`CodeResolver = (name) => string | null`：名称→12 位码，生产中基于注水后 `cache.db` 的 `divisions` 名称索引；未命中落 `unresolved` 供人工补码（**不臆造码**）。

## 示例

```bash
npx tsx packages/extractor/examples/extract-announcement.ts
# 走本地 Ollama：
USE_OLLAMA=1 npx tsx packages/extractor/examples/extract-announcement.ts
```

## License

MIT © [tonyc726](https://github.com/tonyc726)
