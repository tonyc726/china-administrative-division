/**
 * LlmComplete 适配器单测：mock 全局 fetch，验证请求构造与响应解析，不连真服务。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOllamaComplete, createBailianComplete } from '../dist/providers.js';

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

afterEach(() => vi.unstubAllGlobals());

describe('createOllamaComplete', () => {
  it('POST /api/chat（stream=false）并解析 message.content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ message: { content: '[]' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await createOllamaComplete({ model: 'qwen2.5', baseUrl: 'http://x:11434' })('hello');

    expect(out).toBe('[]');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x:11434/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen2.5');
    expect(body.stream).toBe(false);
    expect(body.messages[0].content).toBe('hello');
  });

  it('非 2xx 抛错（含状态码）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    );
    await expect(createOllamaComplete()('x')).rejects.toThrow(/HTTP 500/);
  });
});

describe('createBailianComplete', () => {
  it('无 apiKey 时立即抛错（不读环境变量）', () => {
    expect(() => createBailianComplete()).toThrow(/apiKey/);
  });

  it('带 Authorization 调 OpenAI 兼容端点并解析 choices[0].message.content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await createBailianComplete({ apiKey: 'sk-test', model: 'qwen-plus' })('hi');

    expect(out).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });
});
