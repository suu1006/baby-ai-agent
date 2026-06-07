import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  formatKnowledgeMatches,
  searchParentingKnowledge,
} from './rag.ts';
import type { AgentContext } from './types.ts';

function createContext(rpcResult: unknown[]): AgentContext {
  return {
    child: { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
    supabase: {
      rpc: (name: string, args: Record<string, unknown>) => {
        assertEquals(name, 'match_parenting_knowledge');
        assertEquals(args.query_embedding, [0.1, 0.2, 0.3]);
        assertEquals(args.match_count, 4);
        assertEquals(args.match_threshold, 0.55);
        return {
          select: async () => ({ data: rpcResult, error: null }),
        };
      },
    } as unknown as AgentContext['supabase'],
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

Deno.test('searchParentingKnowledge embeds the query and formats matched documents', async () => {
  const result = await searchParentingKnowledge({
    query: '6개월 아기 이유식 시작은 언제가 좋아?',
    context: createContext([
      {
        id: 'chunk-1',
        category: 'feeding',
        title: '이유식 시작',
        content: '생후 6개월 전후로 철분이 포함된 음식을 시작합니다.',
        source: 'local-parenting-guide',
        similarity: 0.82,
      },
    ]),
    embedText: async (text) => {
      assertStringIncludes(text, '이유식');
      return [0.1, 0.2, 0.3];
    },
    matchCount: 4,
    matchThreshold: 0.55,
  });

  assertStringIncludes(result, '[feeding] 이유식 시작');
  assertStringIncludes(result, '생후 6개월 전후');
  assertStringIncludes(result, 'similarity: 0.82');
}

Deno.test('formatKnowledgeMatches returns a clear fallback when there are no matches', () => {
  assertEquals(
    formatKnowledgeMatches([]),
    '관련 육아 지식 문서를 찾지 못했습니다. 일반 원칙으로 답변하되, 불확실한 내용은 명확히 안내하세요.',
  );
});
