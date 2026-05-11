import { buildSystemPrompt } from './prompt.ts';
import { executeTool, getToolDefinitions } from './tools.ts';
import {
  buildOpenRouterBody,
  callOpenRouter,
  parseOpenRouterMessage,
  parseOpenRouterStreamLine,
} from './openrouter.ts';
import type {
  AgentContext,
  AgentStreamEvent,
  ChatMessage,
  ChildContext,
  OpenRouterMessage,
  ToolCall,
} from './types.ts';

const MAX_TOOL_ITERATIONS = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type HandlerDeps = {
  createSupabaseClient: (authHeader: string) => AgentContext['supabase'];
  env: AgentContext['env'];
  fetchImpl: typeof fetch;
};

type AgentRequestBody = {
  childId?: string;
  messages?: ChatMessage[];
  stream?: boolean;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function eventLine(event: AgentStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function normalizeMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    )
    .map((message) => ({ role: message.role, content: message.content }));
}

function normalizeToolCall(toolCall: ToolCall): ToolCall {
  const rawArguments = toolCall.function.arguments as unknown;
  if (typeof rawArguments !== 'string') {
    return toolCall;
  }

  try {
    const parsed = JSON.parse(rawArguments) as Record<string, unknown>;
    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: parsed,
      },
    };
  } catch {
    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: {},
      },
    };
  }
}

async function loadAuthorizedChild(
  supabase: AgentContext['supabase'],
  childId: string,
  userId: string,
): Promise<ChildContext | Response> {
  const { data, error } = await supabase
    .from('children')
    .select('id, user_id, name, birthdate')
    .eq('id', childId)
    .single();

  if (error || !data) {
    return jsonResponse({ error: '아이 정보를 확인할 수 없어요.' }, 403);
  }

  const child = data as ChildContext & { user_id: string };
  if (child.user_id !== userId) {
    return jsonResponse({ error: '아이 정보를 확인할 수 없어요.' }, 403);
  }

  return { id: child.id, name: child.name, birthdate: child.birthdate };
}

async function requestOpenRouterText(input: {
  messages: OpenRouterMessage[];
  context: AgentContext;
  includeTools: boolean;
}): Promise<ReturnType<typeof parseOpenRouterMessage>> {
  const response = await callOpenRouter({
    fetchImpl: input.context.fetch,
    apiKey: input.context.env.OPENROUTER_API_KEY,
    referer: input.context.env.OPENROUTER_REFERER,
    title: input.context.env.OPENROUTER_TITLE,
    body: buildOpenRouterBody({
      model: input.context.env.OPENROUTER_MODEL,
      messages: input.messages,
      stream: false,
      maxTokens: input.context.env.OPENROUTER_MAX_TOKENS,
      reasoningEffort: input.context.env.OPENROUTER_REASONING_EFFORT,
      tools: input.includeTools ? getToolDefinitions() : undefined,
    }),
  });

  return parseOpenRouterMessage(await response.json());
}

async function runToolLoop(input: {
  messages: ChatMessage[];
  child: ChildContext;
  context: AgentContext;
  streamFinal: boolean;
}): Promise<{ messages: OpenRouterMessage[]; finalContent?: string }> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: buildSystemPrompt(input.child) },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    input.context.emitStatus?.('질문을 살펴보고 있어요...');
    const result = await requestOpenRouterText({ messages, context: input.context, includeTools: true });

    if (result.type === 'text') {
      if (input.streamFinal) {
        messages.push({ role: 'assistant', content: result.content });
        messages.push({ role: 'user', content: '위 답변을 자연스럽게 최종 답변으로 다시 작성해주세요.' });
        return { messages };
      }
      return { messages, finalContent: result.content };
    }

    const toolCalls = result.toolCalls.map(normalizeToolCall);
    messages.push({ role: 'assistant', content: '', tool_calls: toolCalls });

    for (const toolCall of toolCalls) {
      let toolResult: string;
      try {
        toolResult = await executeTool(toolCall, input.context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toolResult = `도구 실행 오류: ${message}`;
      }
      messages.push({ role: 'tool', content: toolResult, tool_call_id: toolCall.id });
    }
  }

  messages.push({ role: 'user', content: '지금까지 수집한 정보를 바탕으로 도구 호출 없이 최종 답변을 해주세요.' });
  if (input.streamFinal) {
    return { messages };
  }

  const result = await requestOpenRouterText({ messages, context: input.context, includeTools: false });
  return {
    messages,
    finalContent: result.type === 'text' ? result.content : undefined,
  };
}

async function streamFinalAnswer(input: {
  messages: OpenRouterMessage[];
  context: AgentContext;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}): Promise<void> {
  input.context.emitStatus?.('답변을 작성하고 있어요...');
  const response = await callOpenRouter({
    fetchImpl: input.context.fetch,
    apiKey: input.context.env.OPENROUTER_API_KEY,
    referer: input.context.env.OPENROUTER_REFERER,
    title: input.context.env.OPENROUTER_TITLE,
    body: buildOpenRouterBody({
      model: input.context.env.OPENROUTER_MODEL,
      messages: input.messages,
      stream: true,
      maxTokens: input.context.env.OPENROUTER_MAX_TOKENS,
      reasoningEffort: input.context.env.OPENROUTER_REASONING_EFFORT,
    }),
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('OpenRouter 스트림을 읽을 수 없습니다.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let finalContent = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const token = parseOpenRouterStreamLine(line);
      if (!token) continue;
      finalContent += token;
      input.controller.enqueue(input.encoder.encode(eventLine({ type: 'token', token })));
    }
  }

  const rest = parseOpenRouterStreamLine(buffer);
  if (rest) {
    finalContent += rest;
    input.controller.enqueue(input.encoder.encode(eventLine({ type: 'token', token: rest })));
  }

  input.controller.enqueue(input.encoder.encode(eventLine({ type: 'final', content: finalContent })));
}

export function createAgentChatHandler(deps: HandlerDeps) {
  return async function handleAgentChat(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!deps.env.OPENROUTER_API_KEY || !deps.env.TAVILY_API_KEY) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = deps.createSupabaseClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    let body: AgentRequestBody;
    try {
      body = await req.json() as AgentRequestBody;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const messages = normalizeMessages(body.messages);
    if (!body.childId || !Array.isArray(body.messages) || messages.length !== body.messages.length) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const childOrResponse = await loadAuthorizedChild(supabase, body.childId, user.id);
    if (childOrResponse instanceof Response) {
      return childOrResponse;
    }

    const child = childOrResponse;
    if (!body.stream) {
      const context: AgentContext = {
        child,
        supabase,
        env: deps.env,
        fetch: deps.fetchImpl,
      };
      const result = await runToolLoop({ messages, child, context, streamFinal: false });
      return jsonResponse({ content: result.finalContent ?? '답변을 생성하지 못했습니다. 잠시 후 다시 질문해주세요.' });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const context: AgentContext = {
          child,
          supabase,
          env: deps.env,
          fetch: deps.fetchImpl,
          emitStatus: (status) => controller.enqueue(encoder.encode(eventLine({ type: 'status', status }))),
        };

        try {
          const result = await runToolLoop({ messages, child, context, streamFinal: true });
          await streamFinalAnswer({ messages: result.messages, context, controller, encoder });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(eventLine({ type: 'error', message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  };
}
