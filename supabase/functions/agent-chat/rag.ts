import type { AgentContext } from './types.ts';

declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (
        input: string,
        options: { mean_pool: boolean; normalize: boolean },
      ) => Promise<number[] | Float32Array>;
    };
  };
};

export type KnowledgeMatch = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string | null;
  similarity: number;
};

export type EmbedText = (text: string) => Promise<number[]>;

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MATCH_THRESHOLD = 0.48;

let embeddingModel:
  | { run: (input: string, options: { mean_pool: boolean; normalize: boolean }) => Promise<number[] | Float32Array> }
  | null = null;

function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = new Supabase.ai.Session('gte-small');
  }
  return embeddingModel;
}

export async function embedTextWithGteSmall(text: string): Promise<number[]> {
  const output = await getEmbeddingModel().run(text, {
    mean_pool: true,
    normalize: true,
  });
  return Array.from(output);
}

export function formatKnowledgeMatches(matches: KnowledgeMatch[]): string {
  if (matches.length === 0) {
    return '관련 육아 지식 문서를 찾지 못했습니다. 일반 원칙으로 답변하되, 불확실한 내용은 명확히 안내하세요.';
  }

  return matches
    .map((match, index) => {
      const source = match.source ? `, source: ${match.source}` : '';
      return [
        `문서 ${index + 1}: [${match.category}] ${match.title} (similarity: ${match.similarity.toFixed(2)}${source})`,
        match.content,
      ].join('\n');
    })
    .join('\n\n');
}

export async function searchParentingKnowledge(input: {
  query: string;
  context: AgentContext;
  embedText?: EmbedText;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<string> {
  const query = input.query.trim();
  if (!query) {
    return formatKnowledgeMatches([]);
  }

  const embedding = await (input.embedText ?? embedTextWithGteSmall)(query);
  const { data, error } = await input.context.supabase
    .rpc('match_parenting_knowledge', {
      query_embedding: embedding,
      match_count: input.matchCount ?? DEFAULT_MATCH_COUNT,
      match_threshold: input.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    })
    .select('id, category, title, content, source, similarity');

  if (error) {
    throw new Error(`육아 지식 검색 오류: ${error.message}`);
  }

  return formatKnowledgeMatches((data ?? []) as KnowledgeMatch[]);
}
