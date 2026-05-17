jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { createSessionFromUrl } from '../lib/auth/sessionFromUrl';

const mockAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;

function mockUser(id: string): User {
  return { id } as User;
}

function mockSession(userId: string): Session {
  const user = mockUser(userId);
  return { user } as Session;
}

describe('createSessionFromUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets session from hash access_token params', async () => {
    const session = mockSession('u1');
    mockAuth.setSession.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    });

    const result = await createSessionFromUrl(
      'baby-ai://auth/callback#access_token=at&refresh_token=rt'
    );

    expect(mockAuth.setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    });
    expect(result).toEqual(session);
  });

  it('exchanges PKCE code from query params', async () => {
    const session = mockSession('u2');
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    });

    const result = await createSessionFromUrl(
      'baby-ai://auth/callback?code=pkce-code'
    );

    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(result).toEqual(session);
  });

  it('returns existing session when code was already exchanged', async () => {
    const session = mockSession('u3');
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'invalid grant', name: 'AuthApiError', status: 400 } as never,
    });
    mockAuth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    const result = await createSessionFromUrl(
      'baby-ai://auth/callback?code=used-code'
    );

    expect(result).toEqual(session);
  });
});
