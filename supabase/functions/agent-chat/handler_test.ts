import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createAgentChatHandler } from './handler.ts';

function createSupabaseStub(input: {
  user?: { id: string } | null;
  child?: { id: string; user_id: string; name: string; birthdate: string } | null;
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: input.user ?? null },
        error: input.user === undefined ? { message: 'no user' } : null,
      }),
    },
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => ({
          single: async () => {
            if (table !== 'children' || !input.child) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: input.child, error: null };
          },
        }),
      }),
    }),
  };
}

function createEnv() {
  return {
    OPENROUTER_API_KEY: 'key',
    TAVILY_API_KEY: 'tavily-key',
    OPENROUTER_MODEL: 'openai/gpt-oss-120b',
    OPENROUTER_REFERER: 'https://example.com',
    OPENROUTER_TITLE: 'Bebimom',
    OPENROUTER_MAX_TOKENS: 2048,
    OPENROUTER_REASONING_EFFORT: 'low',
  };
}

Deno.test('handler returns 401 without Authorization header', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({ user: null }) as never,
    env: createEnv(),
    fetchImpl: fetch,
  });

  const response = await handler(new Request('https://example.com/agent-chat', { method: 'POST' }));
  assertEquals(response.status, 401);
});

Deno.test('handler returns 500 when server secrets are missing', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({ user: { id: 'user-1' } }) as never,
    env: { ...createEnv(), TAVILY_API_KEY: undefined },
    fetchImpl: fetch,
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: false }),
  }));

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: 'Server configuration error' });
});

Deno.test('handler returns 403 when child belongs to another user', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-2', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: createEnv(),
    fetchImpl: fetch,
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: false }),
  }));

  assertEquals(response.status, 403);
});

Deno.test('handler returns mocked non-stream final answer', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-1', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: createEnv(),
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '서버 답변입니다.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: false }),
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { content: '서버 답변입니다.' });
});

Deno.test('handler executes a server tool before final answer', async () => {
  let calls = 0;
  let secondRequestBody: {
    messages?: Array<{
      role?: string;
      tool_calls?: Array<{ function: { arguments: unknown } }>;
    }>;
  } | null = null;
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-1', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: createEnv(),
    fetchImpl: async (_input, init) => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'analyze_pattern',
                  arguments: JSON.stringify({
                    data_json: JSON.stringify({ diaper: [{ type: 'wet' }] }),
                    analysis_type: 'diaper_summary',
                  }),
                },
              }],
            },
          }],
        }), { status: 200 });
      }
      secondRequestBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '소변 기록은 1회예요.' } }],
      }), { status: 200 });
    },
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '기저귀 어때?' }], stream: false }),
  }));

  assertEquals(response.status, 200);
  assertEquals(calls, 2);
  const capturedSecondRequest = secondRequestBody as {
    messages?: Array<{
      role?: string;
      tool_calls?: Array<{ function: { arguments: unknown } }>;
    }>;
  } | null;
  const assistantMessage = capturedSecondRequest?.messages?.find((message) => message.role === 'assistant');
  assertEquals(
    typeof assistantMessage?.tool_calls?.[0].function.arguments,
    'string',
  );
  assertEquals(await response.json(), { content: '소변 기록은 1회예요.' });
});

Deno.test('handler streams status, token, and final events', async () => {
  const encoder = new TextEncoder();
  const openRouterStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"안"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"녕"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  let calls = 0;
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-1', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: createEnv(),
    fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ignored' } }] }), { status: 200 });
      }
      return new Response(openRouterStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    },
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: true }),
  }));

  assertEquals(response.status, 200);
  const body = await response.text();
  assertStringIncludes(body, '{"type":"status","status":"질문을 살펴보고 있어요..."}');
  assertStringIncludes(body, '{"type":"token","token":"안"}');
  assertStringIncludes(body, '{"type":"token","token":"녕"}');
  assertStringIncludes(body, '{"type":"final","content":"안녕"}');
});
