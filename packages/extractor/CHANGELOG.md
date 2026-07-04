# @cndiv/extractor

## 0.2.0

### Minor Changes

- 5f23a71: extractor 新增可插拔 LLM 适配器：`createOllamaComplete`（本地 Ollama）与 `createBailianComplete`（阿里云百炼 DashScope OpenAI 兼容模式）。

  - 零 SDK 依赖（仅用 Web 标准 `fetch`，跨运行时纯净）、带超时、`temperature=0`（抽取要确定性）。
  - LLM 异常或空结果时由 `extractPatch` 自动回退规则法（Tool Use 失败兜底）。
  - `createBailianComplete` 的 `apiKey` 必填（本库不读环境变量，由调用方注入）。
  - 附端到端示例 `examples/extract-announcement.ts`。
