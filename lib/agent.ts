import { supabase } from './supabase';
import {
  callLLM,
  callLLMStream,
  LLMMessage,
  ToolDefinition,
  ToolCall,
  calculateAgeInMonths,
} from './llm';

const TAVILY_API_KEY = process.env.EXPO_PUBLIC_TAVILY_API_KEY;
const MAX_TOOL_ITERATIONS = 5;

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChildContext = {
  id: string;
  name: string;
  birthdate: string;
};

// ─── 도구 정의 ────────────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_baby_data',
      description:
        '아이의 수유, 수면, 기저귀 기록 데이터를 Supabase DB에서 조회합니다. 아이의 최근 생활 패턴을 파악할 때 사용하세요.',
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            description: '조회할 데이터 유형',
            enum: ['feeding', 'sleep', 'diaper', 'all'],
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
  {
    type: 'function',
    function: {
      name: 'analyze_pattern',
      description:
        '수유/수면/기저귀 원시 데이터를 받아 통계적 패턴을 분석합니다. 평균, 최대, 최소, 빈도 등을 계산합니다.',
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
            enum: ['feeding_summary', 'sleep_summary', 'diaper_summary', 'overall'],
          },
        },
        required: ['data_json', 'analysis_type'],
      },
    },
  },
  {
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
];

// ─── 도구 실행 로직 ───────────────────────────────────────────────────────────

async function executeTool(
  toolCall: ToolCall,
  childId: string
): Promise<string> {
  const { name, arguments: args } = toolCall.function;
  console.log(`[Agent] 도구 실행: ${name}`, args);

  try {
    if (name === 'search_baby_data') {
      return await searchBabyData(childId, args.data_type as string, parseInt(args.days as string, 10) || 7);
    }
    if (name === 'analyze_pattern') {
      return analyzePattern(args.data_json as string, args.analysis_type as string);
    }
    if (name === 'search_web') {
      return await searchWeb(args.query as string);
    }
    return `알 수 없는 도구: ${name}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] 도구 오류 (${name}):`, msg);
    return `도구 실행 오류: ${msg}`;
  }
}

async function searchBabyData(
  childId: string,
  dataType: string,
  days: number
): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const result: Record<string, unknown> = {};

  if (dataType === 'feeding' || dataType === 'all') {
    const { data } = await supabase
      .from('feeding_logs')
      .select('fed_at, amount_ml, type, memo')
      .eq('child_id', childId)
      .gte('fed_at', sinceISO)
      .order('fed_at', { ascending: false })
      .limit(50);
    result.feeding = data ?? [];
  }

  if (dataType === 'sleep' || dataType === 'all') {
    const { data } = await supabase
      .from('sleep_logs')
      .select('started_at, ended_at, duration_minutes, memo')
      .eq('child_id', childId)
      .gte('started_at', sinceISO)
      .order('started_at', { ascending: false })
      .limit(50);
    result.sleep = data ?? [];
  }

  if (dataType === 'diaper' || dataType === 'all') {
    const { data } = await supabase
      .from('diaper_logs')
      .select('changed_at, type, memo')
      .eq('child_id', childId)
      .gte('changed_at', sinceISO)
      .order('changed_at', { ascending: false })
      .limit(50);
    result.diaper = data ?? [];
  }

  return JSON.stringify(result);
}

function analyzePattern(dataJson: string, analysisType: string): string {
  let data: Record<string, unknown[]>;
  try {
    data = JSON.parse(dataJson);
  } catch {
    return '데이터 파싱 오류';
  }

  const summary: Record<string, unknown> = {};

  if ((analysisType === 'feeding_summary' || analysisType === 'overall') && data.feeding) {
    const feedings = data.feeding as { amount_ml?: number; type?: string; fed_at?: string }[];
    const withAmount = feedings.filter((f) => f.amount_ml != null);
    const totalCount = feedings.length;
    const avgAmount =
      withAmount.length > 0
        ? Math.round(withAmount.reduce((s, f) => s + (f.amount_ml ?? 0), 0) / withAmount.length)
        : null;
    const typeCount = feedings.reduce<Record<string, number>>((acc, f) => {
      const t = f.type ?? 'unknown';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    summary.feeding = { totalCount, avgAmountMl: avgAmount, typeBreakdown: typeCount };
  }

  if ((analysisType === 'sleep_summary' || analysisType === 'overall') && data.sleep) {
    const sleeps = data.sleep as { duration_minutes?: number; started_at?: string }[];
    const withDuration = sleeps.filter((s) => s.duration_minutes != null);
    const totalSessions = sleeps.length;
    const avgDuration =
      withDuration.length > 0
        ? Math.round(withDuration.reduce((s, sl) => s + (sl.duration_minutes ?? 0), 0) / withDuration.length)
        : null;
    const totalMinutes = withDuration.reduce((s, sl) => s + (sl.duration_minutes ?? 0), 0);
    summary.sleep = { totalSessions, avgDurationMinutes: avgDuration, totalMinutes };
  }

  if ((analysisType === 'diaper_summary' || analysisType === 'overall') && data.diaper) {
    const diapers = data.diaper as { type?: string }[];
    const typeCount = diapers.reduce<Record<string, number>>((acc, d) => {
      const t = d.type ?? 'unknown';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    summary.diaper = { totalChanges: diapers.length, typeBreakdown: typeCount };
  }

  return JSON.stringify(summary);
}

async function searchWeb(query: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    return 'Tavily API 키가 설정되지 않아 웹 검색을 수행할 수 없습니다. .env.local에 EXPO_PUBLIC_TAVILY_API_KEY를 추가해주세요.';
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily 검색 오류 (${response.status})`);
  }

  const data = await response.json();

  const answer = data.answer ? `요약: ${data.answer}\n\n` : '';
  const results = (data.results ?? [])
    .slice(0, 3)
    .map((r: { title: string; content: string; url: string }) => `- ${r.title}: ${r.content}`)
    .join('\n');

  return answer + results;
}

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────────

function buildSystemPrompt(child: ChildContext): string {
  const ageInMonths = calculateAgeInMonths(child.birthdate);
  const ageText =
    ageInMonths < 12
      ? `${ageInMonths}개월`
      : `${Math.floor(ageInMonths / 12)}세 ${ageInMonths % 12}개월`;

  return `당신은 ${child.name}의 전담 육아 AI 어시스턴트입니다.

아이 정보:
- 이름: ${child.name}
- 나이: ${ageText}

사용 가능한 도구:
- search_baby_data: 아이의 수유/수면/기저귀 기록을 DB에서 조회
- analyze_pattern: 조회한 데이터의 통계 패턴 분석
- search_web: 외부 육아 정보 검색 (Tavily)

판단 기준:
1. 질문이 "우리 아이 데이터"에 관한 것이면 → search_baby_data 먼저 사용
2. 데이터를 분석/요약해야 하면 → analyze_pattern 사용
3. 일반 육아 지식이나 최신 정보가 필요하면 → search_web 사용
4. 복합 질문이면 여러 도구를 순차적으로 사용

응답 원칙:
- 항상 한국어로 친근하고 따뜻하게 답변
- ${child.name}의 나이에 맞는 발달 단계를 고려하여 조언
- 불안해하는 부모를 안심시키되, 위험 신호는 명확히 안내
- 응답은 간결하고 실용적으로
- 마크다운 문법(##, **, 코드블록) 없이 일반 텍스트로만 답변
- 이모지/특수기호(❓, ✅, 🔹 등) 없이 문장과 숫자 중심으로 답변`;
}

// ─── 키워드 기반 선제 라우팅 ─────────────────────────────────────────────────
// 소형 모델의 tool calling 불안정성 보완:
// 데이터 관련 키워드가 있으면 LLM 판단 전에 먼저 DB를 조회해서 context에 주입

const FEEDING_KEYWORDS = [
  '수유', '모유', '분유', '이유식', '먹', '밥', '식사',
  '얼마나', '몇 번', '몇번', '수유량', '먹었', '먹는',
  '마셨', '마시', 'ml', '밀리', '젖', '젖병', '哺乳',
];
const SLEEP_KEYWORDS = [
  '수면', '잠', '자', '낮잠', '밤잠', '몇 시간', '수면시간',
  '잤', '잠들', '깼', '깨어', '취침', '기상', '수면패턴',
];
const DIAPER_KEYWORDS = [
  '기저귀', '변', '소변', '대변', '응가', '쉬', '똥', '오줌',
  '교체', '갈았', '갈아',
];
// 데이터 조회 의도가 명시된 범용 키워드
const DATA_QUERY_KEYWORDS = [
  '기록', '데이터', '통계', '패턴', '얼마나', '몇', '최근',
  '오늘', '이번 주', '이번주', '어제', '지난', '평균', '요즘',
];

function detectDataIntent(text: string): { feeding: boolean; sleep: boolean; diaper: boolean } {
  const lower = text;
  const hasDataQuery = DATA_QUERY_KEYWORDS.some((kw) => lower.includes(kw));
  return {
    feeding: FEEDING_KEYWORDS.some((kw) => lower.includes(kw)) || (hasDataQuery && lower.includes('수유')),
    sleep: SLEEP_KEYWORDS.some((kw) => lower.includes(kw)),
    diaper: DIAPER_KEYWORDS.some((kw) => lower.includes(kw)),
  };
}

function hasAnyDataKeyword(text: string): boolean {
  return (
    FEEDING_KEYWORDS.some((kw) => text.includes(kw)) ||
    SLEEP_KEYWORDS.some((kw) => text.includes(kw)) ||
    DIAPER_KEYWORDS.some((kw) => text.includes(kw)) ||
    DATA_QUERY_KEYWORDS.some((kw) => text.includes(kw))
  );
}

async function preloadDataContext(
  userQuery: string,
  childId: string
): Promise<string | null> {
  const intent = detectDataIntent(userQuery);

  // 명시적 데이터 관련 키워드가 있으면 전체 조회
  if (!intent.feeding && !intent.sleep && !intent.diaper) {
    if (hasAnyDataKeyword(userQuery)) {
      intent.feeding = true;
      intent.sleep = true;
      intent.diaper = true;
    } else {
      return null;
    }
  }

  const dataType =
    intent.feeding && intent.sleep && intent.diaper
      ? 'all'
      : intent.feeding
      ? 'feeding'
      : intent.sleep
      ? 'sleep'
      : 'diaper';

  console.log(`[Agent] 선제 데이터 로딩: ${dataType}`);
  const rawData = await searchBabyData(childId, dataType, 7);
  const analysis = analyzePattern(rawData, dataType === 'all' ? 'overall' : `${dataType}_summary`);

  return `[아이 최근 7일 데이터]\n${analysis}\n\n[원시 데이터 요약]\n${rawData.slice(0, 500)}`;
}

// ─── 에이전트 메인 루프 ───────────────────────────────────────────────────────

export async function runAgent(
  userMessages: AgentMessage[],
  child: ChildContext,
  options?: { onToken?: (token: string) => void }
): Promise<string> {
  const latestUserQuery = userMessages.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  // 선제 데이터 로딩: 데이터 관련 질문이면 먼저 DB 조회 후 context 주입
  const preloadedContext = await preloadDataContext(latestUserQuery, child.id).catch((e) => {
    console.warn('[Agent] 선제 데이터 로딩 실패:', e);
    return null;
  });

  const systemPrompt = preloadedContext
    ? `${buildSystemPrompt(child)}\n\n${preloadedContext}`
    : buildSystemPrompt(child);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // 선제 로딩된 케이스는 tools 없이 바로 답변하므로 스트리밍 가능
  if (options?.onToken && preloadedContext) {
    console.log('[Agent] 스트리밍 모드 시작 (선제데이터 기반)');
    const streamed = await callLLMStream(messages, options.onToken);
    return streamed;
  }

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // 선제 로딩이 됐으면 tools 없이 호출 (메모리/안정성 향상)
    const result = await callLLM(messages, preloadedContext ? undefined : TOOLS);

    if (result.type === 'text') {
      console.log(`[Agent] 최종 답변 (${i + 1}회 반복 후, 선제로딩: ${!!preloadedContext})`);
      return result.content;
    }

    console.log(`[Agent] 도구 호출 ${result.toolCalls.length}개 (반복 ${i + 1}/${MAX_TOOL_ITERATIONS})`);

    messages.push({
      role: 'assistant',
      content: `도구를 사용하겠습니다: ${result.toolCalls.map((tc) => tc.function.name).join(', ')}`,
    });

    for (const toolCall of result.toolCalls) {
      const toolResult = await executeTool(toolCall, child.id);
      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      });
    }
  }

  console.warn('[Agent] 최대 반복 횟수 초과, 마지막 답변 요청');
  messages.push({
    role: 'user',
    content: '지금까지 수집한 정보를 바탕으로 최종 답변을 해주세요.',
  });
  const finalResult = await callLLM(messages);
  if (finalResult.type === 'text') return finalResult.content;
  return '죄송합니다, 응답을 생성하는 데 문제가 발생했습니다.';
}
