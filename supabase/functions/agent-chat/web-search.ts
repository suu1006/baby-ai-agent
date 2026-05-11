type TavilyResult = {
  title?: string;
  content?: string;
  url?: string;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilyResult[];
};

export async function searchWeb(
  query: string,
  tavilyApiKey: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (!tavilyApiKey) {
    throw new Error('TAVILY_API_KEY가 설정되지 않았습니다.');
  }

  const response = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyApiKey,
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily 검색 오류 (${response.status})`);
  }

  const data = await response.json() as TavilyResponse;
  const answer = data.answer ? `요약: ${data.answer}\n\n` : '';
  const results = (data.results ?? [])
    .slice(0, 3)
    .map((result) => `- ${result.title ?? '제목 없음'}: ${result.content ?? ''}`)
    .join('\n');

  return answer + results;
}
