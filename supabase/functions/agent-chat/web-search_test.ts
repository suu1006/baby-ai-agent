import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { searchWeb } from './web-search.ts';

Deno.test('searchWeb formats Tavily answer and top three results', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const requestInit = init as { body?: BodyInit | null } | undefined;
    requestBody = JSON.parse(requestInit?.body as string) as Record<string, unknown>;

    return new Response(JSON.stringify({
      answer: '요약 답변입니다.',
      results: [
        { title: '첫 번째', content: '첫 내용', url: 'https://a.example' },
        { title: '두 번째', content: '둘 내용', url: 'https://b.example' },
        { title: '세 번째', content: '셋 내용', url: 'https://c.example' },
        { title: '네 번째', content: '넷 내용', url: 'https://d.example' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await searchWeb('이유식 최신 기준', 'test-key', fakeFetch);

  assertEquals(requestBody?.max_results, 3);
  assertEquals(requestBody?.include_answer, true);
  assertStringIncludes(result, '요약: 요약 답변입니다.');
  assertStringIncludes(result, '- 첫 번째: 첫 내용');
  assertStringIncludes(result, '- 세 번째: 셋 내용');
  assertEquals(result.includes('네 번째'), false);
});

Deno.test('searchWeb rejects missing Tavily key', async () => {
  await assertRejects(
    () => searchWeb('검색어', undefined, fetch),
    Error,
    'TAVILY_API_KEY가 설정되지 않았습니다.',
  );
});

Deno.test('searchWeb rejects non-ok Tavily response', async () => {
  const fakeFetch: typeof fetch = async () => new Response('bad', { status: 502 });
  await assertRejects(
    () => searchWeb('검색어', 'test-key', fakeFetch),
    Error,
    'Tavily 검색 오류 (502)',
  );
});
