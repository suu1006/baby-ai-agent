const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api/chat`;
const MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'gemma3n:e2b';
const DEFAULT_NUM_PREDICT = 700;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const OLLAMA_OPTIONS = {
  num_predict: parsePositiveInt(
    process.env.EXPO_PUBLIC_OLLAMA_NUM_PREDICT,
    DEFAULT_NUM_PREDICT
  ),
  temperature: DEFAULT_TEMPERATURE,
};
const OLLAMA_REQUEST_TIMEOUT_MS = parsePositiveInt(
  process.env.EXPO_PUBLIC_OLLAMA_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS
);

function formatOllamaError(status: number, errorText: string): string {
  const modelHint =
    status === 404 || errorText.toLowerCase().includes('model')
      ? ` 모델(${MODEL})이 설치되어 있는지 확인하고, 없으면 "ollama pull ${MODEL}"을 실행해주세요.`
      : '';

  return `Ollama 서버 오류 (${status}): ${errorText}${modelHint}`;
}

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

function parseOllamaStreamLine(
  line: string,
  onToken: (token: string) => void
): string {
  const trimmed = line.trim();
  if (!trimmed) return '';

  try {
    const chunk = JSON.parse(trimmed) as {
      message?: { content?: string };
    };
    const token = chunk.message?.content ?? '';
    if (token) onToken(token);
    return token;
  } catch {
    // 아직 완성되지 않았거나 비 JSON인 라인은 다음 chunk에서 다시 처리합니다.
    return '';
  }
}

function shouldUseXHRStreaming() {
  return (
    typeof XMLHttpRequest !== 'undefined' &&
    (typeof navigator === 'undefined' || navigator.product === 'ReactNative')
  );
}

function callLLMStreamWithXHR(
  requestBody: string,
  onToken: (token: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seenLength = 0;
    let buffer = '';
    let fullText = '';
    let settled = false;

    const consumeText = (text: string) => {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        fullText += parseOllamaStreamLine(line, onToken);
      }
    };

    xhr.open('POST', OLLAMA_API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = OLLAMA_REQUEST_TIMEOUT_MS;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && xhr.status >= 400 && !settled) {
        settled = true;
        reject(new Error(formatOllamaError(xhr.status, xhr.responseText)));
      }
    };
    xhr.onprogress = () => {
      const nextText = xhr.responseText.slice(seenLength);
      seenLength = xhr.responseText.length;
      consumeText(nextText);
    };
    xhr.onload = () => {
      if (settled) return;
      settled = true;

      const nextText = xhr.responseText.slice(seenLength);
      if (nextText) consumeText(nextText);

      if (buffer.trim()) {
        fullText += parseOllamaStreamLine(buffer, onToken);
      }

      if (xhr.status >= 400) {
        reject(new Error(formatOllamaError(xhr.status, xhr.responseText)));
        return;
      }

      resolve(fullText);
    };
    xhr.onerror = () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Ollama 스트리밍 연결에 실패했습니다. Ollama가 실행 중인지, EXPO_PUBLIC_OLLAMA_URL(${OLLAMA_BASE_URL})이 현재 기기에서 접근 가능한 주소인지 확인해주세요.`
        )
      );
    };
    xhr.ontimeout = () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Ollama 스트리밍 요청 시간이 초과되었습니다. 현재 제한은 ${Math.round(
            OLLAMA_REQUEST_TIMEOUT_MS / 1000
          )}초입니다. EXPO_PUBLIC_OLLAMA_TIMEOUT_MS 값을 늘리거나, 더 빠른 모델/더 작은 EXPO_PUBLIC_OLLAMA_NUM_PREDICT 값을 사용해주세요.`
        )
      );
    };
    xhr.send(requestBody);
  });
}

export async function callLLMStream(
  messages: LLMMessage[],
  onToken: (token: string) => void
): Promise<string> {
  const requestBody = JSON.stringify({
    model: MODEL,
    stream: true,
    messages,
    options: OLLAMA_OPTIONS,
  });

  if (shouldUseXHRStreaming()) {
    return callLLMStreamWithXHR(requestBody, onToken);
  }

  let response: Response;
  try {
    response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지, EXPO_PUBLIC_OLLAMA_URL(${OLLAMA_BASE_URL})이 현재 기기에서 접근 가능한 주소인지 확인해주세요. 원인: ${msg}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Stream Error]', response.status, errorText);
    throw new Error(formatOllamaError(response.status, errorText));
  }

  if (!response.body) {
    return callLLMStreamWithXHR(requestBody, onToken);
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
      fullText += parseOllamaStreamLine(line, onToken);
    }
  }

  // 마지막 버퍼 처리
  const rest = buffer.trim();
  if (rest) {
    fullText += parseOllamaStreamLine(rest, onToken);
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
    options: OLLAMA_OPTIONS,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  let response: Response;
  try {
    response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지, EXPO_PUBLIC_OLLAMA_URL(${OLLAMA_BASE_URL})이 현재 기기에서 접근 가능한 주소인지 확인해주세요. 원인: ${msg}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Error]', response.status, errorText);
    throw new Error(formatOllamaError(response.status, errorText));
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
