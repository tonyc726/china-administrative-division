/**
 * @cndiv/extractor 端到端示例：民政部变更公告 → Patch 操作草稿。
 *
 * 运行（规则法，离线可跑）：
 *   npx tsx packages/extractor/examples/extract-announcement.ts
 * 启用本地 Ollama（需 `ollama serve` + `ollama pull qwen2.5`）：
 *   USE_OLLAMA=1 npx tsx packages/extractor/examples/extract-announcement.ts
 */
import { extractPatch, createOllamaComplete, type CodeResolver } from '../src/index.js';

// 真实公告（2021 国务院批复，陕西宝鸡撤县设区）
const announcement =
  '经国务院批复同意，撤销凤翔县，设立宝鸡市凤翔区，以原凤翔县的行政区域为凤翔区的行政区域。';

// 名称→12 位码解析器：生产中应基于注水后的 cache.db divisions 名称索引；此处用最小 Map 演示。
// 注意：新设的"凤翔区"尚无既有码，会落入 unresolved 供人工补码——这是设计意图（不臆造码）。
const codebook: Record<string, string> = {
  凤翔县: '610327000000',
  宝鸡市: '610300000000',
};
const resolve: CodeResolver = (name) => codebook[name] ?? null;

async function main(): Promise<void> {
  // (1) 规则法：零依赖、离线、确定性
  const byRules = await extractPatch(announcement, { resolve });
  console.log('=== 规则法 ===');
  console.log('via        :', byRules.via);
  console.log('intents    :', JSON.stringify(byRules.intents));
  console.log('operations :', JSON.stringify(byRules.operations));
  console.log('unresolved :', JSON.stringify(byRules.unresolved.map((u) => u.intent)));

  // (2) LLM 优先：召回更高的非规范表述；异常或空结果自动回退规则法（Tool Use 兜底）
  if (process.env.USE_OLLAMA === '1') {
    const llm = createOllamaComplete({ model: 'qwen2.5' });
    const byLlm = await extractPatch(announcement, { resolve, llm });
    console.log('\n=== LLM(Ollama) ===');
    console.log('via        :', byLlm.via, '(llm 空结果会自动回退 rules)');
    console.log('operations :', JSON.stringify(byLlm.operations));
  } else {
    console.log('\n(设 USE_OLLAMA=1 可走本地 Ollama LLM 路径)');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
