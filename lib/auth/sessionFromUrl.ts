import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

type AuthUrlParams = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  error?: string;
  error_description?: string;
};

const inflight = new Map<string, Promise<Session | null>>();

function parseAuthParams(url: string): AuthUrlParams {
  const parsed = new URL(url);
  const params: AuthUrlParams = {};

  parsed.searchParams.forEach((value, key) => {
    (params as Record<string, string>)[key] = value;
  });

  if (parsed.hash.length > 1) {
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    new URLSearchParams(hash).forEach((value, key) => {
      (params as Record<string, string>)[key] = value;
    });
  }

  return params;
}

function inflightKey(url: string): string {
  const { code, access_token } = parseAuthParams(url);
  return code ?? access_token ?? url;
}

async function establishSessionFromUrl(url: string): Promise<Session | null> {
  const params = parseAuthParams(url);

  if (params.error) {
    throw new Error(params.error_description ?? params.error);
  }

  if (params.access_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token ?? '',
    });
    if (error) throw error;
    return data.session;
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (!error) return data.session;

    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) return existing.session;

    throw error;
  }

  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** OAuth / magic-link redirect URL → Supabase session (idempotent, safe for duplicate deep links). */
export async function createSessionFromUrl(url: string): Promise<Session | null> {
  const key = inflightKey(url);
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = establishSessionFromUrl(url).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}


