import type { OpenRouterMessage, ToolCall, ToolDefinition } from './types.ts';

export type OpenRouterResult =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[] };

type OpenRouterToolCallResponse = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: OpenRouterToolCallResponse[];
    };
  }>;
};

export function buildOpenRouterBody(input: {
  model: string;
  messages: OpenRouterMessage[];
  stream: boolean;
  maxTokens: number;
  reasoningEffort: string;
  tools?: ToolDefinition[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    stream: input.stream,
    messages: serializeMessagesForOpenRouter(input.messages),
    temperature: 0.4,
    max_tokens: input.maxTokens,
    reasoning: {
      effort: input.reasoningEffort,
      exclude: true,
    },
  };

  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
  }

  return body;
}

function serializeMessagesForOpenRouter(messages: OpenRouterMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role !== 'assistant' || !message.tool_calls) {
      return message;
    }

    return {
      ...message,
      tool_calls: message.tool_calls.map((toolCall) => ({
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(toolCall.function.arguments),
        },
      })),
    };
  });
}

export function parseOpenRouterMessage(data: unknown): OpenRouterResult {
  const root = data as OpenRouterResponse;
  const message = root.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenRouter 응답 형식이 올바르지 않습니다.');
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      toolCalls: message.tool_calls.map((toolCall, index) => {
        const name = toolCall.function?.name;
        if (!name) {
          throw new Error('OpenRouter 도구 호출 형식이 올바르지 않습니다.');
        }

        return {
          id: toolCall.id ?? `call_${index}_${name}`,
          type: 'function',
          function: {
            name,
            arguments: normalizeToolArguments(toolCall.function?.arguments),
          },
        };
      }),
    };
  }

  return { type: 'text', content: message.content ?? '' };
}

export function parseOpenRouterStreamLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return '';

  const payload = trimmed.replace(/^data:\s*/, '');
  if (payload === '[DONE]') return '';

  try {
    const chunk = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return chunk.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}

export async function callOpenRouter(input: {
  fetchImpl: typeof fetch;
  apiKey: string;
  referer: string;
  title: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const response = await input.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
      'HTTP-Referer': input.referer,
      'X-Title': input.title,
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter 오류 (${response.status}): ${errorText}`);
  }

  return response;
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
