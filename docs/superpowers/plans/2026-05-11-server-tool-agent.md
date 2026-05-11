# Server Tool Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move chat agent orchestration to a Supabase Edge Function that uses OpenRouter tool calling, removes keyword/rule routing from the client, and preserves streamed final answers.

**Architecture:** Add `supabase/functions/agent-chat` as the single chat endpoint. The server validates auth and child ownership, builds the system prompt, runs an OpenRouter tool loop with server tools, and streams final answer tokens as newline-delimited JSON. The React Native client keeps the existing `runAgent` API but becomes a thin wrapper around `agent-chat`.

**Tech Stack:** React Native + Expo, TypeScript, Supabase JS v2, Supabase Edge Functions on Deno, OpenRouter chat completions, Tavily search, Jest for client tests, Deno tests for server modules.

---

## Scope Check

This plan implements one cohesive subsystem: server-centered chat agent orchestration. It does not redesign the chat UI, add client-executed tools, change database schema, or remove unrelated `llm-proxy` and `tavily-search` functions.

## File Structure

Create:

- `supabase/functions/agent-chat/types.ts`: Shared server-side message, tool, event, and dependency types.
- `supabase/functions/agent-chat/prompt.ts`: Child age calculation and system prompt construction.
- `supabase/functions/agent-chat/prompt_test.ts`: Deno tests for prompt content and age formatting.
- `supabase/functions/agent-chat/baby-data.ts`: Server-side baby record lookup helpers and pattern analysis.
- `supabase/functions/agent-chat/baby-data_test.ts`: Deno tests for analysis semantics, especially diaper and temperature behavior.
- `supabase/functions/agent-chat/web-search.ts`: Tavily request wrapper and compact result formatting.
- `supabase/functions/agent-chat/web-search_test.ts`: Deno tests for Tavily formatting and HTTP error behavior.
- `supabase/functions/agent-chat/tools.ts`: Tool registry with `execution: "server"` and dispatch.
- `supabase/functions/agent-chat/tools_test.ts`: Deno tests for tool definitions and dispatch.
- `supabase/functions/agent-chat/openrouter.ts`: OpenRouter request building, tool-call parsing, and stream parsing.
- `supabase/functions/agent-chat/openrouter_test.ts`: Deno tests for OpenRouter message parsing and stream chunk parsing.
- `supabase/functions/agent-chat/handler.ts`: Testable HTTP handler factory for auth, child ownership, tool loop, and streaming response.
- `supabase/functions/agent-chat/handler_test.ts`: Deno tests for auth errors, ownership errors, status events, and simple mocked agent flow.
- `supabase/functions/agent-chat/index.ts`: Small Deno entrypoint wiring real dependencies into `createAgentChatHandler`.
- `__tests__/agent.test.ts`: Jest tests for the client `runAgent` wrapper.

Modify:

- `lib/agent.ts`: Replace client-side keyword routing, direct DB tools, direct Tavily call, and client OpenRouter loop with a thin `agent-chat` caller.
- `README.md`: Add environment and deployment notes for `agent-chat`.

Do not modify:

- `app/(tabs)/chat.tsx`: The existing `runAgent`, `onStatus`, and `onToken` contract already matches the desired client behavior.
- Database migrations: No schema change is needed.

---

### Task 1: Server Types And Prompt

**Files:**

- Create: `supabase/functions/agent-chat/types.ts`
- Create: `supabase/functions/agent-chat/prompt.ts`
- Create: `supabase/functions/agent-chat/prompt_test.ts`

- [ ] **Step 1: Write the failing prompt tests**

Create `supabase/functions/agent-chat/prompt_test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSystemPrompt, calculateAgeInMonths } from './prompt.ts';

Deno.test('calculateAgeInMonths returns completed month difference', () => {
  const age = calculateAgeInMonths('2025-01-15', new Date('2026-05-11T00:00:00.000Z'));
  assertEquals(age, 16);
});

Deno.test('buildSystemPrompt includes child identity and exact-record rules', () => {
  const prompt = buildSystemPrompt(
    { id: 'child-1', name: '하린', birthdate: '2025-01-15' },
    new Date('2026-05-11T00:00:00.000Z'),
  );

  assertStringIncludes(prompt, '당신은 하린의 전담 육아 AI 어시스턴트입니다.');
  assertStringIncludes(prompt, '- 이름: 하린');
  assertStringIncludes(prompt, '- 나이: 1세 4개월');
  assertStringIncludes(prompt, '대화에 아이 기록 데이터가 제공된 경우 반드시 그 숫자를 그대로 사용하여 답변');
  assertStringIncludes(prompt, '체온/열 질문은 건강 기록의 value 값을 반올림하거나 추정하지 말고 기록된 문자열 그대로 답변');
});
```

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/prompt_test.ts
```

Expected: FAIL because `supabase/functions/agent-chat/prompt.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `supabase/functions/agent-chat/types.ts`:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChildContext = {
  id: string;
  name: string;
  birthdate: string;
};

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type AgentContext = {
  child: ChildContext;
  supabase: SupabaseClient;
  env: {
    OPENROUTER_API_KEY: string;
    TAVILY_API_KEY?: string;
    OPENROUTER_MODEL: string;
    OPENROUTER_REFERER: string;
    OPENROUTER_TITLE: string;
    OPENROUTER_MAX_TOKENS: number;
    OPENROUTER_REASONING_EFFORT: string;
  };
  fetch: typeof fetch;
  emitStatus?: (status: string) => void;
};

export type AgentTool = {
  definition: ToolDefinition;
  execution: 'server' | 'client';
  execute?: (args: Record<string, unknown>, context: AgentContext) => Promise<string>;
};

export type OpenRouterMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export type AgentStreamEvent =
  | { type: 'status'; status: string }
  | { type: 'token'; token: string }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string };
```

- [ ] **Step 4: Add prompt implementation**

Create `supabase/functions/agent-chat/prompt.ts`:

```ts
import type { ChildContext } from './types.ts';

export function calculateAgeInMonths(birthdate: string, now = new Date()): number {
  const birth = new Date(birthdate);
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

export function buildSystemPrompt(child: ChildContext, now = new Date()): string {
  const ageInMonths = calculateAgeInMonths(child.birthdate, now);
  const ageText =
    ageInMonths < 12
      ? `${ageInMonths}개월`
      : `${Math.floor(ageInMonths / 12)}세 ${ageInMonths % 12}개월`;

  return `당신은 ${child.name}의 전담 육아 AI 어시스턴트입니다.

아이 정보:
- 이름: ${child.name}
- 나이: ${ageText}

응답 원칙:
- 항상 한국어로 친근하고 따뜻하게 답변
- ${child.name}의 나이에 맞는 발달 단계를 고려하여 조언
- 불안해하는 부모를 안심시키되, 위험 신호는 명확히 안내
- 대화에 아이 기록 데이터가 제공된 경우 반드시 그 숫자를 그대로 사용하여 답변
- 소변 횟수 = wet 기록 수 + both 기록 수 (both는 소변+대변 동시 포함)
- 대변 횟수 = dirty 기록 수 + both 기록 수
- 체온/열 질문은 건강 기록의 value 값을 반올림하거나 추정하지 말고 기록된 문자열 그대로 답변
- 기록이 0건이면 "오늘은 아직 기록이 없어요"라고 안내
- 응답은 간결하고 실용적으로
- 마크다운 문법(##, **, 코드블록) 없이 일반 텍스트로만 답변
- 이모지/특수기호(❓, ✅, 🔹 등) 없이 문장과 숫자 중심으로 답변`;
}
```

- [ ] **Step 5: Run prompt tests to verify they pass**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/prompt_test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit prompt module**

Run:

```bash
git add supabase/functions/agent-chat/types.ts supabase/functions/agent-chat/prompt.ts supabase/functions/agent-chat/prompt_test.ts
git commit -m "feat: add server agent prompt"
```

Expected: commit succeeds.

---

### Task 2: Baby Data Tool Logic

**Files:**

- Create: `supabase/functions/agent-chat/baby-data.ts`
- Create: `supabase/functions/agent-chat/baby-data_test.ts`

- [ ] **Step 1: Write failing analysis tests**

Create `supabase/functions/agent-chat/baby-data_test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzePattern, parseTemperatureValue } from './baby-data.ts';

Deno.test('analyzePattern counts diaper wet, dirty, both, and dry correctly', () => {
  const result = analyzePattern(JSON.stringify({
    diaper: [
      { type: 'wet', changed_at: '2026-05-11T09:00:00.000Z' },
      { type: 'both', changed_at: '2026-05-11T08:00:00.000Z' },
      { type: 'dirty', changed_at: '2026-05-11T07:00:00.000Z' },
      { type: 'dry', changed_at: '2026-05-11T06:00:00.000Z' },
    ],
  }), 'diaper_summary');

  const parsed = JSON.parse(result);
  assertEquals(parsed.diaper.totalChanges, 4);
  assertEquals(parsed.diaper.urineCount, 2);
  assertEquals(parsed.diaper.stoolCount, 2);
  assertEquals(parsed.diaper.dryChangeCount, 1);
  assertEquals(parsed.diaper.latestChangedAt, '2026-05-11T09:00:00.000Z');
});

Deno.test('analyzePattern preserves health value strings and computes max parsed temperature', () => {
  const result = analyzePattern(JSON.stringify({
    health: [
      {
        type: 'temperature',
        title: '체온',
        value: '38.2℃',
        memo: '미열',
        recorded_at: '2026-05-11T09:00:00.000Z',
      },
      {
        type: 'temperature',
        title: '체온',
        value: '37,6도',
        memo: null,
        recorded_at: '2026-05-11T08:00:00.000Z',
      },
    ],
  }), 'health_summary');

  const parsed = JSON.parse(result);
  assertEquals(parsed.health.latestTemperatureRecord.value, '38.2℃');
  assertEquals(parsed.health.maxTemperatureCelsius, 38.2);
});

Deno.test('parseTemperatureValue accepts comma decimal values', () => {
  assertEquals(parseTemperatureValue('37,6도'), 37.6);
  assertEquals(parseTemperatureValue('값 없음'), null);
});
```

- [ ] **Step 2: Run baby-data tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/baby-data_test.ts
```

Expected: FAIL because `baby-data.ts` does not exist.

- [ ] **Step 3: Add baby data implementation**

Create `supabase/functions/agent-chat/baby-data.ts`:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type BabyDataType = 'feeding' | 'sleep' | 'diaper' | 'health' | 'all';

export function parseTemperatureValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(',', '.');
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function searchBabyData(
  supabase: SupabaseClient,
  childId: string,
  dataType: string,
  days: number,
): Promise<string> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 60) : 7;
  const since = new Date();
  since.setDate(since.getDate() - safeDays);
  const sinceISO = since.toISOString();
  const result: Record<string, unknown> = {};

  if (dataType === 'feeding' || dataType === 'all') {
    const { data, error } = await supabase
      .from('feeding_logs')
      .select('fed_at, amount_ml, type, memo')
      .eq('child_id', childId)
      .gte('fed_at', sinceISO)
      .order('fed_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`수유 기록 조회 실패: ${error.message}`);
    result.feeding = data ?? [];
  }

  if (dataType === 'sleep' || dataType === 'all') {
    const { data, error } = await supabase
      .from('sleep_logs')
      .select('started_at, ended_at, duration_minutes, memo')
      .eq('child_id', childId)
      .gte('started_at', sinceISO)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`수면 기록 조회 실패: ${error.message}`);
    result.sleep = data ?? [];
  }

  if (dataType === 'diaper' || dataType === 'all') {
    const { data, error } = await supabase
      .from('diaper_logs')
      .select('changed_at, type, memo')
      .eq('child_id', childId)
      .gte('changed_at', sinceISO)
      .order('changed_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`기저귀 기록 조회 실패: ${error.message}`);
    result.diaper = data ?? [];
  }

  if (dataType === 'health' || dataType === 'all') {
    const { data, error } = await supabase
      .from('health_logs')
      .select('recorded_at, type, title, value, memo')
      .eq('child_id', childId)
      .gte('recorded_at', sinceISO)
      .order('recorded_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`건강 기록 조회 실패: ${error.message}`);
    result.health = data ?? [];
  }

  return JSON.stringify(result);
}

export function analyzePattern(dataJson: string, analysisType: string): string {
  let data: Record<string, unknown[]>;
  try {
    data = JSON.parse(dataJson);
  } catch {
    return '데이터 파싱 오류';
  }

  const summary: Record<string, unknown> = {};

  if ((analysisType === 'feeding_summary' || analysisType === 'overall') && data.feeding) {
    const feedings = data.feeding as { amount_ml?: number; type?: string }[];
    const withAmount = feedings.filter((f) => f.amount_ml != null);
    const avgAmountMl =
      withAmount.length > 0
        ? Math.round(withAmount.reduce((sum, f) => sum + (f.amount_ml ?? 0), 0) / withAmount.length)
        : null;
    const typeBreakdown = feedings.reduce<Record<string, number>>((acc, f) => {
      const type = f.type ?? 'unknown';
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    summary.feeding = { totalCount: feedings.length, avgAmountMl, typeBreakdown };
  }

  if ((analysisType === 'sleep_summary' || analysisType === 'overall') && data.sleep) {
    const sleeps = data.sleep as { duration_minutes?: number }[];
    const withDuration = sleeps.filter((s) => s.duration_minutes != null);
    const avgDurationMinutes =
      withDuration.length > 0
        ? Math.round(withDuration.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / withDuration.length)
        : null;
    const totalMinutes = withDuration.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    summary.sleep = { totalSessions: sleeps.length, avgDurationMinutes, totalMinutes };
  }

  if ((analysisType === 'diaper_summary' || analysisType === 'overall') && data.diaper) {
    const diapers = data.diaper as { type?: string; changed_at?: string }[];
    const typeCount = diapers.reduce<Record<string, number>>((acc, diaper) => {
      const type = diaper.type ?? 'unknown';
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    const wetCount = (typeCount.wet ?? 0) + (typeCount.urine ?? 0) + (typeCount.pee ?? 0) + (typeCount['소변'] ?? 0);
    const dirtyCount = (typeCount.dirty ?? 0) + (typeCount.stool ?? 0) + (typeCount.poop ?? 0) + (typeCount['대변'] ?? 0);
    const bothCount = (typeCount.both ?? 0) + (typeCount.mixed ?? 0) + (typeCount['소변+대변'] ?? 0);
    const dryCount = (typeCount.dry ?? 0) + (typeCount.change ?? 0) + (typeCount['교체'] ?? 0);
    summary.diaper = {
      totalChanges: diapers.length,
      urineCount: wetCount + bothCount,
      stoolCount: dirtyCount + bothCount,
      dryChangeCount: dryCount,
      typeBreakdown: { wet: wetCount, dirty: dirtyCount, both: bothCount, dry: dryCount },
      latestChangedAt: diapers[0]?.changed_at ?? null,
    };
  }

  if ((analysisType === 'health_summary' || analysisType === 'overall') && data.health) {
    const healthLogs = data.health as {
      recorded_at?: string;
      type?: string;
      title?: string;
      value?: string | null;
      memo?: string | null;
    }[];
    const temperatureLogs = healthLogs.filter((log) => log.type === 'temperature');
    const feverRelatedLogs = healthLogs.filter((log) => {
      const text = `${log.title ?? ''} ${log.value ?? ''} ${log.memo ?? ''}`;
      return log.type === 'temperature' || text.includes('열') || text.includes('발열') || text.includes('체온');
    });
    const parsedTemperatures = temperatureLogs
      .map((log) => parseTemperatureValue(log.value))
      .filter((value): value is number => value !== null);

    summary.health = {
      totalHealthRecords: healthLogs.length,
      totalTemperatureRecords: temperatureLogs.length,
      latestHealthRecord: healthLogs[0] ?? null,
      latestTemperatureRecord: temperatureLogs[0] ?? null,
      latestFeverRelatedRecord: feverRelatedLogs[0] ?? null,
      maxTemperatureCelsius: parsedTemperatures.length > 0 ? Math.max(...parsedTemperatures) : null,
      records: healthLogs.slice(0, 10),
    };
  }

  return JSON.stringify(summary);
}
```

- [ ] **Step 4: Run baby-data tests to verify they pass**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/baby-data_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit baby data module**

Run:

```bash
git add supabase/functions/agent-chat/baby-data.ts supabase/functions/agent-chat/baby-data_test.ts
git commit -m "feat: add server baby data tools"
```

Expected: commit succeeds.

---

### Task 3: Web Search Tool Logic

**Files:**

- Create: `supabase/functions/agent-chat/web-search.ts`
- Create: `supabase/functions/agent-chat/web-search_test.ts`

- [ ] **Step 1: Write failing web search tests**

Create `supabase/functions/agent-chat/web-search_test.ts`:

```ts
import { assertEquals, assertRejects, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { searchWeb } from './web-search.ts';

Deno.test('searchWeb formats Tavily answer and top three results', async () => {
  const fakeFetch: typeof fetch = async (_input, _init) =>
    new Response(JSON.stringify({
      answer: '요약 답변입니다.',
      results: [
        { title: '첫 번째', content: '첫 내용', url: 'https://a.example' },
        { title: '두 번째', content: '둘 내용', url: 'https://b.example' },
        { title: '세 번째', content: '셋 내용', url: 'https://c.example' },
        { title: '네 번째', content: '넷 내용', url: 'https://d.example' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await searchWeb('이유식 최신 기준', 'test-key', fakeFetch);

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
```

- [ ] **Step 2: Run web search tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/web-search_test.ts
```

Expected: FAIL because `web-search.ts` does not exist.

- [ ] **Step 3: Add web search implementation**

Create `supabase/functions/agent-chat/web-search.ts`:

```ts
type TavilyResult = {
  title?: string;
  content?: string;
  url?: string;
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

  const data = await response.json() as { answer?: string; results?: TavilyResult[] };
  const answer = data.answer ? `요약: ${data.answer}\n\n` : '';
  const results = (data.results ?? [])
    .slice(0, 3)
    .map((result) => `- ${result.title ?? '제목 없음'}: ${result.content ?? ''}`)
    .join('\n');

  return answer + results;
}
```

- [ ] **Step 4: Run web search tests to verify they pass**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/web-search_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit web search module**

Run:

```bash
git add supabase/functions/agent-chat/web-search.ts supabase/functions/agent-chat/web-search_test.ts
git commit -m "feat: add server web search tool"
```

Expected: commit succeeds.

---

### Task 4: Tool Registry And Dispatch

**Files:**

- Create: `supabase/functions/agent-chat/tools.ts`
- Create: `supabase/functions/agent-chat/tools_test.ts`

- [ ] **Step 1: Write failing tool registry tests**

Create `supabase/functions/agent-chat/tools_test.ts`:

```ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { executeTool, getToolDefinitions, SERVER_TOOLS } from './tools.ts';
import type { AgentContext } from './types.ts';

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
  const context = {
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
  } satisfies AgentContext;

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
  }, context);

  assertEquals(JSON.parse(result).diaper.urineCount, 1);
});

Deno.test('executeTool rejects client tools and unknown tools', async () => {
  const context = {
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
  } satisfies AgentContext;

  await assertRejects(
    () => executeTool({
      id: 'call-unknown',
      type: 'function',
      function: { name: 'unknown_tool', arguments: {} },
    }, context),
    Error,
    '알 수 없는 도구: unknown_tool',
  );
});
```

- [ ] **Step 2: Run tool registry tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/tools_test.ts
```

Expected: FAIL because `tools.ts` does not exist.

- [ ] **Step 3: Add tool registry implementation**

Create `supabase/functions/agent-chat/tools.ts`:

```ts
import { analyzePattern, searchBabyData } from './baby-data.ts';
import { searchWeb } from './web-search.ts';
import type { AgentContext, AgentTool, ToolCall, ToolDefinition } from './types.ts';

export const SERVER_TOOLS: AgentTool[] = [
  {
    execution: 'server',
    definition: {
      type: 'function',
      function: {
        name: 'search_baby_data',
        description:
          '아이의 수유, 수면, 기저귀, 건강/체온 기록 데이터를 Supabase DB에서 조회합니다. 아이의 최근 생활 패턴과 건강 상태를 파악할 때 사용하세요.',
        parameters: {
          type: 'object',
          properties: {
            data_type: {
              type: 'string',
              description: '조회할 데이터 유형',
              enum: ['feeding', 'sleep', 'diaper', 'health', 'all'],
            },
            days: {
              type: 'string',
              description: '최근 며칠간의 데이터를 조회할지 (예: "7")',
            },
          },
          required: ['data_type', 'days'],
        },
      },
    },
    execute: async (args, context) => {
      context.emitStatus?.('아이 기록을 확인하고 있어요...');
      return await searchBabyData(
        context.supabase,
        context.child.id,
        String(args.data_type ?? 'all'),
        Number.parseInt(String(args.days ?? '7'), 10),
      );
    },
  },
  {
    execution: 'server',
    definition: {
      type: 'function',
      function: {
        name: 'analyze_pattern',
        description:
          '수유/수면/기저귀/건강 원시 데이터를 받아 통계적 패턴을 분석합니다. 평균, 최대, 최소, 빈도와 최신 건강 기록을 계산합니다.',
        parameters: {
          type: 'object',
          properties: {
            data_json: {
              type: 'string',
              description: 'search_baby_data 도구가 반환한 JSON 문자열',
            },
            analysis_type: {
              type: 'string',
              description: '분석 유형',
              enum: ['feeding_summary', 'sleep_summary', 'diaper_summary', 'health_summary', 'overall'],
            },
          },
          required: ['data_json', 'analysis_type'],
        },
      },
    },
    execute: async (args) => analyzePattern(String(args.data_json ?? '{}'), String(args.analysis_type ?? 'overall')),
  },
  {
    execution: 'server',
    definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description:
          '최신 육아 정보, 발달 지식, 건강 관련 정보를 외부 검색 API(Tavily)를 통해 검색합니다. 아이의 특정 증상이나 일반 육아 질문에 사용하세요.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '검색할 내용 (한국어로 작성)',
            },
          },
          required: ['query'],
        },
      },
    },
    execute: async (args, context) => {
      context.emitStatus?.('최신 정보를 검색하고 있어요...');
      return await searchWeb(String(args.query ?? ''), context.env.TAVILY_API_KEY, context.fetch);
    },
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return SERVER_TOOLS.map((tool) => tool.definition);
}

export async function executeTool(toolCall: ToolCall, context: AgentContext): Promise<string> {
  const tool = SERVER_TOOLS.find((candidate) => candidate.definition.function.name === toolCall.function.name);
  if (!tool) {
    throw new Error(`알 수 없는 도구: ${toolCall.function.name}`);
  }
  if (tool.execution !== 'server' || !tool.execute) {
    throw new Error(`서버에서 실행할 수 없는 도구: ${toolCall.function.name}`);
  }

  context.emitStatus?.(`도구를 실행하고 있어요: ${toolCall.function.name}`);
  return await tool.execute(toolCall.function.arguments, context);
}
```

- [ ] **Step 4: Run tool registry tests to verify they pass**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/tools_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit tool registry**

Run:

```bash
git add supabase/functions/agent-chat/tools.ts supabase/functions/agent-chat/tools_test.ts
git commit -m "feat: add server agent tool registry"
```

Expected: commit succeeds.

---

### Task 5: OpenRouter Helper

**Files:**

- Create: `supabase/functions/agent-chat/openrouter.ts`
- Create: `supabase/functions/agent-chat/openrouter_test.ts`

- [ ] **Step 1: Write failing OpenRouter helper tests**

Create `supabase/functions/agent-chat/openrouter_test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildOpenRouterBody, parseOpenRouterMessage, parseOpenRouterStreamLine } from './openrouter.ts';

Deno.test('buildOpenRouterBody includes tools only when provided', () => {
  const body = buildOpenRouterBody({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: '안녕' }],
    stream: false,
    maxTokens: 2048,
    reasoningEffort: 'low',
    tools: [{ type: 'function', function: { name: 'search_web', description: '검색', parameters: { type: 'object', properties: {}, required: [] } } }],
  });

  assertEquals(body.model, 'openai/gpt-oss-120b');
  assertEquals(body.stream, false);
  assertEquals(Array.isArray(body.tools), true);
  assertEquals(body.reasoning, { effort: 'low', exclude: true });
});

Deno.test('parseOpenRouterMessage returns normalized tool calls', () => {
  const parsed = parseOpenRouterMessage({
    choices: [{
      message: {
        content: '',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'search_web', arguments: '{"query":"이유식"}' },
        }],
      },
    }],
  });

  assertEquals(parsed.type, 'tool_calls');
  if (parsed.type === 'tool_calls') {
    assertEquals(parsed.toolCalls[0].function.name, 'search_web');
    assertEquals(parsed.toolCalls[0].function.arguments.query, '이유식');
  }
});

Deno.test('parseOpenRouterStreamLine extracts content tokens', () => {
  assertEquals(parseOpenRouterStreamLine('data: {"choices":[{"delta":{"content":"안"}}]}'), '안');
  assertEquals(parseOpenRouterStreamLine('data: [DONE]'), '');
  assertEquals(parseOpenRouterStreamLine(''), '');
});
```

- [ ] **Step 2: Run OpenRouter helper tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/openrouter_test.ts
```

Expected: FAIL because `openrouter.ts` does not exist.

- [ ] **Step 3: Add OpenRouter helper implementation**

Create `supabase/functions/agent-chat/openrouter.ts`:

```ts
import type { OpenRouterMessage, ToolCall, ToolDefinition } from './types.ts';

export type OpenRouterResult =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[] };

export function buildOpenRouterBody(input: {
  model: string;
  messages: OpenRouterMessage[];
  stream: boolean;
  maxTokens: number;
  reasoningEffort: string;
  tools?: ToolDefinition[];
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    stream: input.stream,
    messages: input.messages,
    temperature: 0.4,
    max_tokens: input.maxTokens,
    reasoning: {
      effort: input.reasoningEffort,
      exclude: true,
    },
  };

  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
  }

  return body;
}

export function parseOpenRouterMessage(data: unknown): OpenRouterResult {
  const root = data as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function: { name: string; arguments: unknown };
        }>;
      };
    }>;
  };
  const message = root.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenRouter 응답 형식이 올바르지 않습니다.');
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      toolCalls: message.tool_calls.map((toolCall, index) => ({
        id: toolCall.id ?? `call_${index}_${toolCall.function.name}`,
        type: 'function',
        function: {
          name: toolCall.function.name,
          arguments:
            typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : (toolCall.function.arguments as Record<string, unknown>),
        },
      })),
    };
  }

  return { type: 'text', content: message.content ?? '' };
}

export function parseOpenRouterStreamLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return '';

  const payload = trimmed.replace(/^data:\s*/, '');
  if (payload === '[DONE]') return '';

  try {
    const chunk = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return chunk.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}

export async function callOpenRouter(input: {
  fetchImpl: typeof fetch;
  apiKey: string;
  referer: string;
  title: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const response = await input.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
      'HTTP-Referer': input.referer,
      'X-Title': input.title,
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter 오류 (${response.status}): ${errorText}`);
  }

  return response;
}
```

- [ ] **Step 4: Run OpenRouter helper tests to verify they pass**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/openrouter_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit OpenRouter helper**

Run:

```bash
git add supabase/functions/agent-chat/openrouter.ts supabase/functions/agent-chat/openrouter_test.ts
git commit -m "feat: add openrouter agent helper"
```

Expected: commit succeeds.

---

### Task 6: Agent Chat Handler

**Files:**

- Create: `supabase/functions/agent-chat/handler.ts`
- Create: `supabase/functions/agent-chat/handler_test.ts`
- Create: `supabase/functions/agent-chat/index.ts`

- [ ] **Step 1: Write failing handler tests**

Create `supabase/functions/agent-chat/handler_test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createAgentChatHandler } from './handler.ts';

function createSupabaseStub(input: {
  user?: { id: string } | null;
  child?: { id: string; user_id: string; name: string; birthdate: string } | null;
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: input.user ?? null },
        error: input.user === undefined ? { message: 'no user' } : null,
      }),
    },
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => ({
          single: async () => {
            if (table !== 'children' || !input.child) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: input.child, error: null };
          },
        }),
      }),
    }),
  };
}

Deno.test('handler returns 401 without Authorization header', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({ user: null }) as never,
    env: {
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'Bebimom',
      OPENROUTER_MAX_TOKENS: 2048,
      OPENROUTER_REASONING_EFFORT: 'low',
    },
    fetchImpl: fetch,
  });

  const response = await handler(new Request('https://example.com/agent-chat', { method: 'POST' }));
  assertEquals(response.status, 401);
});

Deno.test('handler returns 403 when child belongs to another user', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-2', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: {
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'Bebimom',
      OPENROUTER_MAX_TOKENS: 2048,
      OPENROUTER_REASONING_EFFORT: 'low',
    },
    fetchImpl: fetch,
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: false }),
  }));

  assertEquals(response.status, 403);
});

Deno.test('handler returns mocked non-stream final answer', async () => {
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-1', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: {
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'Bebimom',
      OPENROUTER_MAX_TOKENS: 2048,
      OPENROUTER_REASONING_EFFORT: 'low',
    },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '서버 답변입니다.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: false }),
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { content: '서버 답변입니다.' });
});

Deno.test('handler streams status, token, and final events', async () => {
  const encoder = new TextEncoder();
  const openRouterStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"안"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"녕"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  let calls = 0;
  const handler = createAgentChatHandler({
    createSupabaseClient: () => createSupabaseStub({
      user: { id: 'user-1' },
      child: { id: 'child-1', user_id: 'user-1', name: '하린', birthdate: '2025-01-15' },
    }) as never,
    env: {
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'Bebimom',
      OPENROUTER_MAX_TOKENS: 2048,
      OPENROUTER_REASONING_EFFORT: 'low',
    },
    fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ignored' } }] }), { status: 200 });
      }
      return new Response(openRouterStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    },
  });

  const response = await handler(new Request('https://example.com/agent-chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ childId: 'child-1', messages: [{ role: 'user', content: '안녕' }], stream: true }),
  }));

  assertEquals(response.status, 200);
  const body = await response.text();
  assertStringIncludes(body, '{"type":"status","status":"질문을 살펴보고 있어요..."}');
  assertStringIncludes(body, '{"type":"token","token":"안"}');
  assertStringIncludes(body, '{"type":"token","token":"녕"}');
  assertStringIncludes(body, '{"type":"final","content":"안녕"}');
});
```

- [ ] **Step 2: Run handler tests to verify they fail**

Run:

```bash
deno test --allow-env supabase/functions/agent-chat/handler_test.ts
```

Expected: FAIL because `handler.ts` does not exist.

- [ ] **Step 3: Add testable handler implementation**

Create `supabase/functions/agent-chat/handler.ts`:

```ts
import { buildSystemPrompt } from './prompt.ts';
import { getToolDefinitions, executeTool } from './tools.ts';
import {
  buildOpenRouterBody,
  callOpenRouter,
  parseOpenRouterMessage,
  parseOpenRouterStreamLine,
} from './openrouter.ts';
import type { AgentContext, ChatMessage, ChildContext, AgentStreamEvent, OpenRouterMessage } from './types.ts';

const MAX_TOOL_ITERATIONS = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HandlerDeps = {
  createSupabaseClient: (authHeader: string) => AgentContext['supabase'];
  env: AgentContext['env'];
  fetchImpl: typeof fetch;
};

type AgentRequestBody = {
  childId?: string;
  messages?: ChatMessage[];
  stream?: boolean;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function eventLine(event: AgentStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

async function loadAuthorizedChild(
  supabase: AgentContext['supabase'],
  childId: string,
  userId: string,
): Promise<ChildContext | Response> {
  const { data, error } = await supabase
    .from('children')
    .select('id, user_id, name, birthdate')
    .eq('id', childId)
    .single();

  if (error || !data) {
    return jsonResponse({ error: '아이 정보를 확인할 수 없어요.' }, 403);
  }

  const child = data as ChildContext & { user_id: string };
  if (child.user_id !== userId) {
    return jsonResponse({ error: '아이 정보를 확인할 수 없어요.' }, 403);
  }

  return { id: child.id, name: child.name, birthdate: child.birthdate };
}

async function runToolLoop(
  input: {
    messages: ChatMessage[];
    child: ChildContext;
    context: AgentContext;
    streamFinal: boolean;
  },
): Promise<{ messages: OpenRouterMessage[]; finalContent?: string }> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: buildSystemPrompt(input.child) },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    input.context.emitStatus?.('질문을 살펴보고 있어요...');
    const response = await callOpenRouter({
      fetchImpl: input.context.fetch,
      apiKey: input.context.env.OPENROUTER_API_KEY,
      referer: input.context.env.OPENROUTER_REFERER,
      title: input.context.env.OPENROUTER_TITLE,
      body: buildOpenRouterBody({
        model: input.context.env.OPENROUTER_MODEL,
        messages,
        stream: false,
        maxTokens: input.context.env.OPENROUTER_MAX_TOKENS,
        reasoningEffort: input.context.env.OPENROUTER_REASONING_EFFORT,
        tools: getToolDefinitions(),
      }),
    });

    const result = parseOpenRouterMessage(await response.json());
    if (result.type === 'text') {
      if (input.streamFinal) {
        messages.push({ role: 'assistant', content: '최종 답변을 작성합니다.' });
        return { messages };
      }
      return { messages, finalContent: result.content };
    }

    messages.push({ role: 'assistant', content: '', tool_calls: result.toolCalls });

    for (const toolCall of result.toolCalls) {
      let toolResult: string;
      try {
        toolResult = await executeTool(toolCall, input.context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toolResult = `도구 실행 오류: ${message}`;
      }
      messages.push({ role: 'tool', content: toolResult, tool_call_id: toolCall.id });
    }
  }

  messages.push({ role: 'user', content: '지금까지 수집한 정보를 바탕으로 최종 답변을 해주세요.' });
  return { messages };
}

async function streamFinalAnswer(input: {
  messages: OpenRouterMessage[];
  context: AgentContext;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}): Promise<void> {
  input.context.emitStatus?.('답변을 작성하고 있어요...');
  const response = await callOpenRouter({
    fetchImpl: input.context.fetch,
    apiKey: input.context.env.OPENROUTER_API_KEY,
    referer: input.context.env.OPENROUTER_REFERER,
    title: input.context.env.OPENROUTER_TITLE,
    body: buildOpenRouterBody({
      model: input.context.env.OPENROUTER_MODEL,
      messages: input.messages,
      stream: true,
      maxTokens: input.context.env.OPENROUTER_MAX_TOKENS,
      reasoningEffort: input.context.env.OPENROUTER_REASONING_EFFORT,
    }),
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('OpenRouter 스트림을 읽을 수 없습니다.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let finalContent = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const token = parseOpenRouterStreamLine(line);
      if (!token) continue;
      finalContent += token;
      input.controller.enqueue(input.encoder.encode(eventLine({ type: 'token', token })));
    }
  }

  const rest = parseOpenRouterStreamLine(buffer);
  if (rest) {
    finalContent += rest;
    input.controller.enqueue(input.encoder.encode(eventLine({ type: 'token', token: rest })));
  }

  input.controller.enqueue(input.encoder.encode(eventLine({ type: 'final', content: finalContent })));
}

export function createAgentChatHandler(deps: HandlerDeps) {
  return async function handleAgentChat(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!deps.env.OPENROUTER_API_KEY) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = deps.createSupabaseClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json() as AgentRequestBody;
    if (!body.childId || !Array.isArray(body.messages)) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const childOrResponse = await loadAuthorizedChild(supabase, body.childId, user.id);
    if (childOrResponse instanceof Response) {
      return childOrResponse;
    }

    const child = childOrResponse;

    if (!body.stream) {
      const context: AgentContext = {
        child,
        supabase,
        env: deps.env,
        fetch: deps.fetchImpl,
      };
      const result = await runToolLoop({ messages: body.messages, child, context, streamFinal: false });
      return jsonResponse({ content: result.finalContent ?? '답변을 생성하지 못했습니다. 잠시 후 다시 질문해주세요.' });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const context: AgentContext = {
          child,
          supabase,
          env: deps.env,
          fetch: deps.fetchImpl,
          emitStatus: (status) => controller.enqueue(encoder.encode(eventLine({ type: 'status', status }))),
        };

        try {
          context.emitStatus?.('질문을 살펴보고 있어요...');
          const result = await runToolLoop({ messages: body.messages ?? [], child, context, streamFinal: true });
          await streamFinalAnswer({ messages: result.messages, context, controller, encoder });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(eventLine({ type: 'error', message })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  };
}
```

- [ ] **Step 4: Add Deno entrypoint**

Create `supabase/functions/agent-chat/index.ts`:

```ts
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
```

- [ ] **Step 5: Run handler tests to verify they pass**

Run:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat/handler_test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all server tests**

Run:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat
```

Expected: PASS for all `agent-chat` tests.

- [ ] **Step 7: Commit handler**

Run:

```bash
git add supabase/functions/agent-chat/handler.ts supabase/functions/agent-chat/handler_test.ts supabase/functions/agent-chat/index.ts
git commit -m "feat: add server agent chat handler"
```

Expected: commit succeeds.

---

### Task 7: Client `runAgent` Wrapper

**Files:**

- Create: `__tests__/agent.test.ts`
- Modify: `lib/agent.ts`

- [ ] **Step 1: Write failing client wrapper tests**

Create `__tests__/agent.test.ts`:

```ts
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
```

- [ ] **Step 2: Run client test to verify it fails**

Run:

```bash
npm test -- --runInBand __tests__/agent.test.ts
```

Expected: FAIL because existing `lib/agent.ts` does not call `agent-chat` as a thin wrapper.

- [ ] **Step 3: Replace `lib/agent.ts` with server wrapper**

Replace the contents of `lib/agent.ts` with:

```ts
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

async function readStreamEvents(
  response: Response,
  options?: AgentRunOptions,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalContent = '';
  let tokenContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseEventLine(line);
      if (!event) continue;

      if (event.type === 'status') {
        options?.onStatus?.(event.status);
      } else if (event.type === 'token') {
        tokenContent += event.token;
        options?.onToken?.(event.token);
      } else if (event.type === 'final') {
        finalContent = event.content;
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  }

  const trailingEvent = parseEventLine(buffer);
  if (trailingEvent?.type === 'final') {
    finalContent = trailingEvent.content;
  } else if (trailingEvent?.type === 'error') {
    throw new Error(trailingEvent.message);
  }

  return finalContent || tokenContent;
}

export async function runAgent(
  userMessages: AgentMessage[],
  child: ChildContext,
  options?: AgentRunOptions,
): Promise<string> {
  options?.onStatus?.('질문을 살펴보고 있어요...');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  const response = await fetch(getAgentChatUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      childId: child.id,
      messages: userMessages,
      stream: Boolean(options?.onToken),
    }),
  });

  if (!response.ok) {
    let message = `AI 서버 오류 (${response.status})`;
    try {
      const data = await response.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  if (options?.onToken) {
    return await readStreamEvents(response, options);
  }

  const data = await response.json() as { content?: string };
  return data.content ?? '';
}
```

- [ ] **Step 4: Run client test to verify it passes**

Run:

```bash
npm test -- --runInBand __tests__/agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit client wrapper**

Run:

```bash
git add lib/agent.ts __tests__/agent.test.ts
git commit -m "feat: route chat through server agent"
```

Expected: commit succeeds.

---

### Task 8: Remove Keyword Routing And Verify Active Path

**Files:**

- Modify: `lib/agent.ts`
- Test: `__tests__/agent.test.ts`

- [ ] **Step 1: Search for removed keyword/rule routing in the active chat path**

Run:

```bash
rg -n "FEEDING_KEYWORDS|SLEEP_KEYWORDS|DIAPER_KEYWORDS|HEALTH_KEYWORDS|DATA_QUERY_KEYWORDS|detectDataIntent|preloadDataContext|preloadWebContext|needsWebSearch|hasBabySpecificKeyword|hasAnyDataKeyword" lib app
```

Expected: no matches.

- [ ] **Step 2: Search for client-side baby tool execution in the active chat path**

Run:

```bash
rg -n "searchBabyData|analyzePattern|searchWeb|MAX_TOOL_ITERATIONS|ToolDefinition|ToolCall" lib/agent.ts app
```

Expected: no matches.

- [ ] **Step 3: Run TypeScript type check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run client tests**

Run:

```bash
npm test -- --runInBand __tests__/agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all server agent tests**

Run:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat
```

Expected: PASS.

- [ ] **Step 6: Commit active path cleanup verification if any files changed**

If Step 1 or Step 2 found leftover active-path code and it was removed, run:

```bash
git add lib/agent.ts __tests__/agent.test.ts
git commit -m "refactor: remove client keyword agent routing"
```

Expected: commit succeeds. If no files changed after verification, skip this commit.

---

### Task 9: README And Deployment Notes

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add README section for server agent environment**

Add this section after the existing Ollama setup section in `README.md`:

````md
### 3-1. OpenRouter 서버 에이전트 설정

채팅 기능은 Supabase Edge Function `agent-chat`을 기본 AI 진입점으로 사용합니다. 이 함수는 서버에서 OpenRouter tool calling을 실행하고, 필요한 경우 Supabase 육아 기록과 Tavily 검색 도구를 호출한 뒤 최종 답변을 앱으로 스트리밍합니다.

Supabase Edge Function secrets:

```bash
supabase secrets set OPENROUTER_API_KEY=<openrouter-api-key>
supabase secrets set TAVILY_API_KEY=<tavily-api-key>
supabase secrets set OPENROUTER_MODEL=openai/gpt-oss-120b
supabase secrets set OPENROUTER_REASONING_EFFORT=low
supabase secrets set OPENROUTER_MAX_TOKENS=2048
supabase secrets set OPENROUTER_REFERER=https://baby-ai-agent-suu1006s-projects.vercel.app
supabase secrets set OPENROUTER_TITLE=Bebimom
```

Deploy:

```bash
supabase functions deploy agent-chat
```

The mobile app still needs:

```bash
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```
````

- [ ] **Step 2: Run markdown and text sanity checks**

Run:

```bash
rg -n "agent-chat|OPENROUTER_API_KEY|TAVILY_API_KEY" README.md
```

Expected: matches for the new section.

- [ ] **Step 3: Commit README update**

Run:

```bash
git add README.md
git commit -m "docs: document server agent setup"
```

Expected: commit succeeds.

---

### Task 10: Final Verification

**Files:**

- Verify: `supabase/functions/agent-chat/*`
- Verify: `lib/agent.ts`
- Verify: `__tests__/agent.test.ts`
- Verify: `README.md`

- [ ] **Step 1: Run client wrapper tests**

Run:

```bash
npm test -- --runInBand __tests__/agent.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run Deno server tests**

Run:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat
```

Expected: PASS.

- [ ] **Step 4: Verify no active keyword routing remains**

Run:

```bash
rg -n "KEYWORDS|detectDataIntent|preloadDataContext|preloadWebContext|hasBabySpecificKeyword|hasAnyDataKeyword|needsWebSearch" lib app supabase/functions/agent-chat
```

Expected: no matches.

- [ ] **Step 5: Verify server tool registry includes execution location**

Run:

```bash
rg -n "execution: 'server'|execution: 'client'|AgentTool" supabase/functions/agent-chat
```

Expected: matches in `types.ts` and `tools.ts`, including `execution: 'server'` for all initial tools.

- [ ] **Step 6: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or the worktree is clean after commits. Existing unrelated user changes may still appear and must not be reverted.

- [ ] **Step 7: Record verification results in final handoff**

Report:

```text
Verified:
- npm test -- --runInBand __tests__/agent.test.ts
- npx tsc --noEmit
- deno test --allow-env --allow-net supabase/functions/agent-chat
- rg keyword cleanup checks
```

Expected: user can see exactly which checks passed or which failed.
