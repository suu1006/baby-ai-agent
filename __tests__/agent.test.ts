import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import { runAgent } from '../lib/agent';
import { supabase } from '../lib/supabase';

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

function createStreamResponse(lines: string[]) {
  const encoded = new TextEncoder().encode(lines.join('\n'));
  return {
    ok: true,
    body: {
      getReader: () => {
        let used = false;
        return {
          read: jest.fn(async () => {
            if (used) return { done: true, value: undefined };
            used = true;
            return { done: false, value: encoded };
          }),
        };
      },
    },
  } as unknown as Response;
}

describe('runAgent server wrapper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token' } },
      error: null,
    } as never);
  });

  it('posts messages and childId to agent-chat and returns streamed final content', async () => {
    const fetchMock = jest.fn(async () => createStreamResponse([
      JSON.stringify({ type: 'status', status: '질문을 살펴보고 있어요...' }),
      JSON.stringify({ type: 'token', token: '안' }),
      JSON.stringify({ type: 'token', token: '녕' }),
      JSON.stringify({ type: 'final', content: '안녕' }),
    ]));
    global.fetch = fetchMock as never;
    const onStatus = jest.fn();
    const onToken = jest.fn();

    const result = await runAgent(
      [{ role: 'user', content: '오늘 기저귀 몇 번?' }],
      { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
      { onStatus, onToken },
    );

    expect(result).toBe('안녕');
    expect(onStatus).toHaveBeenCalledWith('질문을 살펴보고 있어요...');
    expect(onToken).toHaveBeenNthCalledWith(1, '안');
    expect(onToken).toHaveBeenNthCalledWith(2, '녕');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/agent-chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          childId: 'child-1',
          messages: [{ role: 'user', content: '오늘 기저귀 몇 번?' }],
          stream: true,
        }),
      }),
    );
  });

  it('uses XHR streaming fallback in React Native environments', async () => {
    const originalXMLHttpRequest = global.XMLHttpRequest;
    const originalNavigatorProduct = global.navigator?.product;
    const onStatus = jest.fn();
    const onToken = jest.fn();

    Object.defineProperty(global.navigator, 'product', {
      value: 'ReactNative',
      configurable: true,
    });

    class FakeXMLHttpRequest {
      static HEADERS_RECEIVED = 2;

      readyState = 0;
      status = 0;
      responseText = '';
      onreadystatechange: (() => void) | null = null;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open = jest.fn();
      setRequestHeader = jest.fn();

      send = jest.fn(() => {
        this.readyState = FakeXMLHttpRequest.HEADERS_RECEIVED;
        this.status = 200;
        this.onreadystatechange?.();
        this.responseText += `${JSON.stringify({ type: 'status', status: '답변을 작성하고 있어요...' })}\n`;
        this.onprogress?.();
        this.responseText += `${JSON.stringify({ type: 'token', token: '하' })}\n`;
        this.onprogress?.();
        this.responseText += `${JSON.stringify({ type: 'token', token: '이' })}\n`;
        this.responseText += `${JSON.stringify({ type: 'final', content: '하이' })}\n`;
        this.onload?.();
      });
    }

    global.XMLHttpRequest = FakeXMLHttpRequest as never;

    try {
      const result = await runAgent(
        [{ role: 'user', content: '안녕' }],
        { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
        { onStatus, onToken },
      );

      expect(result).toBe('하이');
      expect(onStatus).toHaveBeenCalledWith('답변을 작성하고 있어요...');
      expect(onToken).toHaveBeenNthCalledWith(1, '하');
      expect(onToken).toHaveBeenNthCalledWith(2, '이');
    } finally {
      global.XMLHttpRequest = originalXMLHttpRequest;
      Object.defineProperty(global.navigator, 'product', {
        value: originalNavigatorProduct,
        configurable: true,
      });
    }
  });

  it('throws a useful error when session is missing', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    await expect(runAgent(
      [{ role: 'user', content: '안녕' }],
      { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
    )).rejects.toThrow('로그인이 필요합니다. 다시 로그인해주세요.');
  });
});
