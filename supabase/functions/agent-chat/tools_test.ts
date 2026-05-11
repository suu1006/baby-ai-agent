import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { executeTool, getToolDefinitions, SERVER_TOOLS } from './tools.ts';
import type { AgentContext } from './types.ts';

function createContext(): AgentContext {
  return {
    child: { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
    supabase: {} as AgentContext['supabase'],
    env: {
      OPENROUTER_API_KEY: 'openrouter-key',
      OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'Bebimom',
      OPENROUTER_MAX_TOKENS: 2048,
      OPENROUTER_REASONING_EFFORT: 'low',
    },
    fetch,
  };
}

Deno.test('SERVER_TOOLS exposes server-executed tool definitions', () => {
  assertEquals(SERVER_TOOLS.map((tool) => tool.definition.function.name), [
    'search_baby_data',
    'analyze_pattern',
    'search_web',
  ]);
  assertEquals(SERVER_TOOLS.every((tool) => tool.execution === 'server'), true);
  assertEquals(getToolDefinitions().length, 3);
});

Deno.test('executeTool dispatches analyze_pattern without Supabase', async () => {
  const result = await executeTool({
    id: 'call-1',
    type: 'function',
    function: {
      name: 'analyze_pattern',
      arguments: {
        data_json: JSON.stringify({ diaper: [{ type: 'wet' }] }),
        analysis_type: 'diaper_summary',
      },
    },
  }, createContext());

  assertEquals(JSON.parse(result).diaper.urineCount, 1);
});

Deno.test('executeTool rejects unknown tools', async () => {
  await assertRejects(
    () => executeTool({
      id: 'call-unknown',
      type: 'function',
      function: { name: 'unknown_tool', arguments: {} },
    }, createContext()),
    Error,
    '알 수 없는 도구: unknown_tool',
  );
});
