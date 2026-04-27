const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api/chat`;
const MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'llama3.1';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type LLMMessage = {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
};

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type LLMResponse =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[] };

export async function callLLMStream(
  messages: LLMMessage[],
  onToken: (token: string) => void
): Promise<string> {
  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Stream Error]', response.status, errorText);
    throw new Error(`Ollama 서버 오류 (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    // 스트림이 없는 런타임 fallback
    const fallback = await callLLM(messages);
    if (fallback.type !== 'text') {
      throw new Error('스트리밍 fallback에서 예상치 못한 tool_calls 응답이 왔습니다.');
    }
    onToken(fallback.content);
    return fallback.content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const chunk = JSON.parse(trimmed) as {
          done?: boolean;
          message?: { content?: string };
        };
        const token = chunk.message?.content ?? '';
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // 파싱 실패 라인은 무시하고 다음 라인 처리
      }
    }
  }

  // 마지막 버퍼 처리
  const rest = buffer.trim();
  if (rest) {
    try {
      const chunk = JSON.parse(rest) as { message?: { content?: string } };
      const token = chunk.message?.content ?? '';
      if (token) {
        fullText += token;
        onToken(token);
      }
    } catch {
      // ignore
    }
  }

  return fullText;
}

export async function callLLM(
  messages: LLMMessage[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
    stream: false,
    messages,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Error]', response.status, errorText);
    throw new Error(`Ollama 서버 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log('[LLM] done:', data.done, '| stop_reason:', data.done_reason);

  const message = data.message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCalls: ToolCall[] = message.tool_calls.map(
      (tc: { function: { name: string; arguments: unknown } }, idx: number) => ({
        id: `call_${idx}_${tc.function.name}`,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
        },
      })
    );
    return { type: 'tool_calls', toolCalls };
  }

  return { type: 'text', content: message.content as string };
}

export function calculateAgeInMonths(birthdate: string): number {
  const birth = new Date(birthdate);
  const now = new Date();
  return (
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  );
}
