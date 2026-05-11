import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAgentChatHandler } from './handler.ts';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const handler = createAgentChatHandler({
  createSupabaseClient: (authHeader) =>
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ),
  env: {
    OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY') ?? '',
    TAVILY_API_KEY: Deno.env.get('TAVILY_API_KEY') ?? undefined,
    OPENROUTER_MODEL: Deno.env.get('OPENROUTER_MODEL') ?? 'openai/gpt-oss-120b',
    OPENROUTER_REFERER: Deno.env.get('OPENROUTER_REFERER') ?? 'https://baby-ai-agent-suu1006s-projects.vercel.app',
    OPENROUTER_TITLE: Deno.env.get('OPENROUTER_TITLE') ?? 'Bebimom',
    OPENROUTER_MAX_TOKENS: parsePositiveInt(Deno.env.get('OPENROUTER_MAX_TOKENS'), 2048),
    OPENROUTER_REASONING_EFFORT: Deno.env.get('OPENROUTER_REASONING_EFFORT') ?? 'low',
  },
  fetchImpl: fetch,
});

Deno.serve(handler);
