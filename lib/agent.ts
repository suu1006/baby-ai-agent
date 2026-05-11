import { supabase } from './supabase';

export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentRunOptions = {
  onToken?: (token: string) => void;
  onStatus?: (status: string) => void;
};

type ChildContext = {
  id: string;
  name: string;
  birthdate: string;
};

type AgentStreamEvent =
  | { type: 'status'; status: string }
  | { type: 'token'; token: string }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string };

function getAgentChatUrl(): string {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  if (!supabaseUrl) {
    throw new Error('Supabase URL이 설정되지 않았습니다.');
  }
  return `${supabaseUrl}/functions/v1/agent-chat`;
}

function parseEventLine(line: string): AgentStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as AgentStreamEvent;
  } catch {
    return null;
  }
}

function handleStreamEvent(
  event: AgentStreamEvent,
  options: AgentRunOptions | undefined,
  state: { finalContent: string; tokenContent: string },
): void {
  if (event.type === 'status') {
    options?.onStatus?.(event.status);
    return;
  }

  if (event.type === 'token') {
    state.tokenContent += event.token;
    options?.onToken?.(event.token);
    return;
  }

  if (event.type === 'final') {
    state.finalContent = event.content;
    return;
  }

  throw new Error(event.message);
}

function consumeEventText(
  text: string,
  options: AgentRunOptions | undefined,
  state: { finalContent: string; tokenContent: string },
): void {
  for (const line of text.split('\n')) {
    const event = parseEventLine(line);
    if (event) handleStreamEvent(event, options, state);
  }
}

async function readStreamEvents(
  response: Response,
  options?: AgentRunOptions,
): Promise<string> {
  const state = { finalContent: '', tokenContent: '' };

  if (!response.body) {
    const text = await response.text();
    consumeEventText(text, options, state);
    return state.finalContent || state.tokenContent || text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseEventLine(line);
      if (event) handleStreamEvent(event, options, state);
    }
  }

  const trailingEvent = parseEventLine(buffer);
  if (trailingEvent) handleStreamEvent(trailingEvent, options, state);

  return state.finalContent || state.tokenContent;
}

function shouldUseXHRStreaming(): boolean {
  return (
    typeof XMLHttpRequest !== 'undefined' &&
    (typeof navigator === 'undefined' || navigator.product === 'ReactNative')
  );
}

function streamAgentWithXHR(input: {
  url: string;
  accessToken: string;
  body: string;
  options?: AgentRunOptions;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const state = { finalContent: '', tokenContent: '' };
    let seenLength = 0;
    let buffer = '';
    let settled = false;

    const consumeText = (text: string) => {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = parseEventLine(line);
        if (event) handleStreamEvent(event, input.options, state);
      }
    };

    xhr.open('POST', input.url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${input.accessToken}`);
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && xhr.status >= 400 && !settled) {
        settled = true;
        reject(new Error(xhr.responseText || `AI 서버 오류 (${xhr.status})`));
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
      consumeEventText(buffer, input.options, state);

      if (xhr.status >= 400) {
        reject(new Error(xhr.responseText || `AI 서버 오류 (${xhr.status})`));
        return;
      }

      resolve(state.finalContent || state.tokenContent || xhr.responseText);
    };
    xhr.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error('AI 서버 스트리밍 연결에 실패했습니다.'));
    };
    xhr.send(input.body);
  });
}

async function getErrorMessage(response: Response): Promise<string> {
  let message = `AI 서버 오류 (${response.status})`;

  try {
    const data = await response.json() as { error?: string; message?: string };
    return data.error || data.message || message;
  } catch {
    try {
      const text = await response.text();
      if (text) message = text;
    } catch {
      // Keep the status-based message when the body cannot be read.
    }
  }

  return message;
}

export async function runAgent(
  userMessages: AgentMessage[],
  child: ChildContext,
  options?: AgentRunOptions,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  const url = getAgentChatUrl();
  const body = JSON.stringify({
    childId: child.id,
    messages: userMessages,
    stream: Boolean(options?.onToken),
  });

  if (options?.onToken && shouldUseXHRStreaming()) {
    return streamAgentWithXHR({
      url,
      accessToken: session.access_token,
      body,
      options,
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  if (options?.onToken) {
    return readStreamEvents(response, options);
  }

  const data = await response.json() as { content?: string };
  return data.content ?? '';
}
