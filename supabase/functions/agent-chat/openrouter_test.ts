import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildOpenRouterBody,
  callOpenRouter,
  parseOpenRouterMessage,
  parseOpenRouterStreamLine,
} from './openrouter.ts';

Deno.test('buildOpenRouterBody includes tools only when provided', () => {
  const body = buildOpenRouterBody({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: '안녕' }],
    stream: false,
    maxTokens: 2048,
    reasoningEffort: 'low',
    tools: [{
      type: 'function',
      function: {
        name: 'search_web',
        description: '검색',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    }],
  });

  assertEquals(body.model, 'openai/gpt-oss-120b');
  assertEquals(body.stream, false);
  assertEquals(Array.isArray(body.tools), true);
  assertEquals(body.reasoning, { effort: 'low', exclude: true });

  const bodyWithoutTools = buildOpenRouterBody({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: '안녕' }],
    stream: true,
    maxTokens: 1024,
    reasoningEffort: 'medium',
  });
  assertEquals('tools' in bodyWithoutTools, false);
});

Deno.test('buildOpenRouterBody serializes assistant tool call arguments for OpenRouter history', () => {
  const body = buildOpenRouterBody({
    model: 'openai/gpt-oss-120b',
    messages: [{
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'search_web',
          arguments: { query: '이유식' },
        },
      }],
    }],
    stream: false,
    maxTokens: 2048,
    reasoningEffort: 'low',
  });

  const message = (body.messages as Array<{
    tool_calls?: Array<{ function: { arguments: unknown } }>;
  }>)[0];
  assertEquals(message.tool_calls?.[0].function.arguments, '{"query":"이유식"}');
});

Deno.test('parseOpenRouterMessage returns normalized tool calls', () => {
  const parsed = parseOpenRouterMessage({
    choices: [{
      message: {
        content: '',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'search_web', arguments: '{"query":"이유식"}' },
        }],
      },
    }],
  });

  assertEquals(parsed.type, 'tool_calls');
  if (parsed.type === 'tool_calls') {
    assertEquals(parsed.toolCalls[0].function.name, 'search_web');
    assertEquals(parsed.toolCalls[0].function.arguments.query, '이유식');
  }
});

Deno.test('parseOpenRouterMessage returns assistant text when no tools are present', () => {
  const parsed = parseOpenRouterMessage({
    choices: [{ message: { content: '답변입니다.' } }],
  });

  assertEquals(parsed, { type: 'text', content: '답변입니다.' });
});

Deno.test('parseOpenRouterStreamLine extracts content tokens', () => {
  assertEquals(parseOpenRouterStreamLine('data: {"choices":[{"delta":{"content":"안"}}]}'), '안');
  assertEquals(parseOpenRouterStreamLine('data: [DONE]'), '');
  assertEquals(parseOpenRouterStreamLine(''), '');
  assertEquals(parseOpenRouterStreamLine('event: ping'), '');
});

Deno.test('callOpenRouter sends authenticated request headers and body', async () => {
  let receivedInput: RequestInfo | URL | undefined;
  let receivedInit: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    receivedInput = input;
    receivedInit = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await callOpenRouter({
    fetchImpl: fakeFetch,
    apiKey: 'openrouter-key',
    referer: 'https://example.com',
    title: 'Bebimom',
    body: { model: 'openai/gpt-oss-120b', messages: [] },
  });

  assertEquals(response.status, 200);
  assertEquals(receivedInput, 'https://openrouter.ai/api/v1/chat/completions');
  assertEquals(receivedInit?.method, 'POST');
  const headers = receivedInit?.headers as Record<string, string>;
  assertEquals(headers.Authorization, 'Bearer openrouter-key');
  assertEquals(headers['HTTP-Referer'], 'https://example.com');
  assertEquals(headers['X-Title'], 'Bebimom');
});

Deno.test('callOpenRouter rejects non-ok responses with status and body', async () => {
  const fakeFetch: typeof fetch = async () => new Response('bad model', { status: 404 });

  await assertRejects(
    () =>
      callOpenRouter({
        fetchImpl: fakeFetch,
        apiKey: 'openrouter-key',
        referer: 'https://example.com',
        title: 'Bebimom',
        body: { model: 'missing-model' },
      }),
    Error,
    'OpenRouter 오류 (404): bad model',
  );
});
