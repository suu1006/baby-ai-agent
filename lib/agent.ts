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

export type AgentRunOptions = {
  onToken?: (token: string) => void;
  onStatus?: (status: string) => void;
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
  days: number,
  sinceOverride?: Date
): Promise<string> {
  const since = sinceOverride ? new Date(sinceOverride.getTime()) : new Date();
  if (!sinceOverride) {
    since.setDate(since.getDate() - days);
  }
  const sinceISO = since.toISOString();

  console.log(`[DB] searchBabyData: childId=${childId}, dataType=${dataType}, since=${sinceISO}`);

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
    console.log(`[DB] feeding_logs 결과: ${data?.length ?? 0}건`);
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
    console.log(`[DB] sleep_logs 결과: ${data?.length ?? 0}건`);
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
    console.log(`[DB] diaper_logs 결과: ${data?.length ?? 0}건, 데이터: ${JSON.stringify(data)}`);
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
    const diapers = data.diaper as { type?: string; changed_at?: string }[];
    const typeCount = diapers.reduce<Record<string, number>>((acc, d) => {
      const t = d.type ?? 'unknown';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    const wetCount = (typeCount.wet ?? 0) + (typeCount.urine ?? 0) + (typeCount.pee ?? 0) + (typeCount['소변'] ?? 0);
    const dirtyCount = (typeCount.dirty ?? 0) + (typeCount.stool ?? 0) + (typeCount.poop ?? 0) + (typeCount['대변'] ?? 0);
    const bothCount = (typeCount.both ?? 0) + (typeCount.mixed ?? 0) + (typeCount['소변+대변'] ?? 0);
    const dryCount = (typeCount.dry ?? 0) + (typeCount.change ?? 0) + (typeCount['교체'] ?? 0);
    const urineCount = wetCount + bothCount;
    const stoolCount = dirtyCount + bothCount;
    summary.diaper = {
      totalChanges: diapers.length,
      urineCount,
      stoolCount,
      dryChangeCount: dryCount,
      typeBreakdown: {
        wet: wetCount,
        dirty: dirtyCount,
        both: bothCount,
        dry: dryCount,
      },
      latestChangedAt: diapers[0]?.changed_at ?? null,
    };
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

응답 원칙:
- 항상 한국어로 친근하고 따뜻하게 답변
- ${child.name}의 나이에 맞는 발달 단계를 고려하여 조언
- 불안해하는 부모를 안심시키되, 위험 신호는 명확히 안내
- 대화에 아이 기록 데이터가 제공된 경우 반드시 그 숫자를 그대로 사용하여 답변
- 소변 횟수 = wet 기록 수 + both 기록 수 (both는 소변+대변 동시 포함)
- 대변 횟수 = dirty 기록 수 + both 기록 수
- 기록이 0건이면 "오늘은 아직 기록이 없어요"라고 안내
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

function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isCurrentCountQuery(userQuery: string): boolean {
  const currentWords = ['지금', '현재', '오늘'];
  const countWords = ['몇 번', '몇번', '몇 회', '몇회', '횟수', '몇'];
  return (
    currentWords.some((kw) => userQuery.includes(kw)) ||
    countWords.some((kw) => userQuery.includes(kw))
  );
}

function isMultiDayQuery(userQuery: string): boolean {
  const multiDayWords = ['최근', '지난', '요즘', '이번 주', '이번주', '평균', '일주일', '7일'];
  return multiDayWords.some((kw) => userQuery.includes(kw));
}

function getDataWindow(userQuery: string): { label: string; days: number; since?: Date } {
  if (userQuery.includes('오늘')) {
    return { label: '오늘', days: 1, since: getTodayStart() };
  }
  if (!isMultiDayQuery(userQuery) && isCurrentCountQuery(userQuery)) {
    return { label: '오늘', days: 1, since: getTodayStart() };
  }
  return { label: '최근 7일', days: 7 };
}

function formatDataContext(
  rawDataJson: string,
  analysisJson: string,
  label: string
): string {
  let analysis: {
    diaper?: {
      totalChanges?: number;
      urineCount?: number;
      stoolCount?: number;
      dryChangeCount?: number;
      typeBreakdown?: { wet?: number; dirty?: number; both?: number; dry?: number };
      latestChangedAt?: string | null;
    };
    feeding?: unknown;
    sleep?: unknown;
  } = {};

  try {
    analysis = JSON.parse(analysisJson);
  } catch {
    return `[아이 ${label} 데이터]\n${analysisJson}\n\n[원시 데이터 요약]\n${rawDataJson.slice(0, 800)}`;
  }

  const lines = [`[아이 ${label} 데이터]`];

  if (analysis.diaper) {
    const diaper = analysis.diaper;
    const breakdown = diaper.typeBreakdown ?? {};
    lines.push(
      `기저귀 요약: 총 교체 ${diaper.totalChanges ?? 0}회`,
      `소변 횟수: ${diaper.urineCount ?? 0}회 (소변만 ${breakdown.wet ?? 0}회 + 소변+대변 ${breakdown.both ?? 0}회)`,
      `대변 횟수: ${diaper.stoolCount ?? 0}회 (대변만 ${breakdown.dirty ?? 0}회 + 소변+대변 ${breakdown.both ?? 0}회)`,
      `교체만: ${diaper.dryChangeCount ?? 0}회`,
      `가장 최근 기저귀 기록: ${diaper.latestChangedAt ?? '없음'}`,
      '소변 횟수는 wet과 both를 합산한 값이며, 질문을 받으면 이 숫자를 그대로 답변합니다.'
    );
  }

  if (analysis.feeding) {
    lines.push(`수유 요약 JSON: ${JSON.stringify(analysis.feeding)}`);
  }

  if (analysis.sleep) {
    lines.push(`수면 요약 JSON: ${JSON.stringify(analysis.sleep)}`);
  }

  return `${lines.join('\n')}\n\n[분석 JSON]\n${analysisJson}\n\n[원시 데이터 요약]\n${rawDataJson.slice(0, 800)}`;
}

const WEB_SEARCH_KEYWORDS = [
  '최신',
  '검색',
  '뉴스',
  '요즘',
  '최근 연구',
  '논문',
  '가이드라인',
  '권고',
  '질병관리청',
  '식약처',
];

function needsWebSearch(text: string): boolean {
  return WEB_SEARCH_KEYWORDS.some((kw) => text.includes(kw));
}

function hasBabySpecificKeyword(text: string): boolean {
  return (
    FEEDING_KEYWORDS.some((kw) => text.includes(kw)) ||
    SLEEP_KEYWORDS.some((kw) => text.includes(kw)) ||
    DIAPER_KEYWORDS.some((kw) => text.includes(kw))
  );
}

async function preloadWebContext(userQuery: string): Promise<string | null> {
  try {
    const result = await searchWeb(userQuery);
    if (!result || result.startsWith('Tavily API 키가')) return null;
    return `[웹 검색 결과]\n${result}`;
  } catch (e) {
    console.warn('[Agent] 웹 검색 선제 로딩 실패:', e);
    return null;
  }
}

async function preloadDataContext(
  userQuery: string,
  childId: string
): Promise<string | null> {
  const intent = detectDataIntent(userQuery);

  // 웹검색 전용 질문(뉴스, 최신 정보 등)이고 아기 특화 키워드가 없으면 데이터 조회 건너뜀
  if (needsWebSearch(userQuery) && !hasBabySpecificKeyword(userQuery)) {
    return null;
  }

  // 명시적 데이터 관련 키워드가 있으면 전체 조회
  if (!intent.feeding && !intent.sleep && !intent.diaper) {
    if (hasAnyDataKeyword(userQuery) && hasBabySpecificKeyword(userQuery)) {
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

  const window = getDataWindow(userQuery);

  console.log(`[Agent] 선제 데이터 로딩: ${dataType}, 기간: ${window.label}`);
  const rawData = await searchBabyData(childId, dataType, window.days, window.since);

  // 데이터가 0건이면 null 반환 → tool calling 폴백 사용
  let totalRecords = 0;
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown[]>;
    totalRecords = Object.values(parsed).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  } catch { /* ignore */ }

  if (totalRecords === 0) {
    console.warn(`[Agent] 선제 데이터 로딩 결과 0건 (childId=${childId}, dataType=${dataType}, since=${window.label})`);
    const typeLabel =
      dataType === 'feeding' ? '수유' :
      dataType === 'sleep' ? '수면' :
      dataType === 'diaper' ? '기저귀' : '육아';
    return `[아이 ${window.label} 데이터]\n${typeLabel} 기록 없음 - ${window.label} 기간에 ${typeLabel} 기록이 없습니다.`;
  }

  const analysis = analyzePattern(rawData, dataType === 'all' ? 'overall' : `${dataType}_summary`);
  return formatDataContext(rawData, analysis, window.label);
}

// ─── 에이전트 메인 루프 ───────────────────────────────────────────────────────

export async function runAgent(
  userMessages: AgentMessage[],
  child: ChildContext,
  options?: AgentRunOptions
): Promise<string> {
  const latestUserQuery = userMessages.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  const requiresWebSearch = needsWebSearch(latestUserQuery);
  const shouldCheckData =
    hasBabySpecificKeyword(latestUserQuery) ||
    hasAnyDataKeyword(latestUserQuery);

  options?.onStatus?.('질문을 살펴보고 있어요...');

  // 선제 데이터/웹검색은 첫 토큰 전 대기 시간을 줄이기 위해 병렬로 시작합니다.
  const preloadedContextPromise = (async () => {
    if (shouldCheckData) {
      options?.onStatus?.('아이 기록을 확인하고 있어요...');
    }
    return preloadDataContext(latestUserQuery, child.id);
  })().catch((e) => {
    console.warn('[Agent] 선제 데이터 로딩 실패:', e);
    if (hasBabySpecificKeyword(latestUserQuery)) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`아이 기록을 불러오지 못했습니다. ${msg}`);
    }
    return null;
  });

  const webContextPromise = requiresWebSearch
    ? (async () => {
        options?.onStatus?.('최신 정보를 검색하고 있어요...');
        return preloadWebContext(latestUserQuery);
      })()
    : Promise.resolve(null);

  const [preloadedContext, webContext] = await Promise.all([
    preloadedContextPromise,
    webContextPromise,
  ]);

  console.log(`[Agent] 선제로딩 완료 - 아기데이터: ${!!preloadedContext}, 웹검색: ${!!webContext}`);

  const systemPrompt = buildSystemPrompt(child);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // 선제 로딩된 컨텍스트를 assistant 메시지로 마지막 질문 직전에 주입
  const contextsToInject: string[] = [];
  if (preloadedContext) contextsToInject.push(`데이터베이스에서 아이 기록을 조회했습니다:\n\n${preloadedContext}`);
  if (webContext) contextsToInject.push(`웹에서 최신 정보를 검색했습니다:\n\n${webContext}`);

  if (contextsToInject.length > 0) {
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
      messages.splice(lastUserIdx, 0, {
        role: 'assistant',
        content: contextsToInject.join('\n\n---\n\n'),
      });
    }
  }

  // 소형 모델은 tool calling이 불안정하므로 항상 선제 로딩 후 스트리밍
  if (options?.onToken) {
    console.log(`[Agent] 스트리밍 모드`);
    options.onStatus?.('답변을 작성하고 있어요...');
    const streamed = await callLLMStream(messages, options.onToken);
    return streamed;
  }

  // onToken 없는 경우 → tool calling 루프 (비스트리밍)
  console.log(`[Agent] tool calling 모드 (비스트리밍)`);

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

    if (options?.onToken) {
      messages.push({
        role: 'user',
        content: '수집한 정보를 바탕으로 최종 답변을 해주세요.',
      });
      const streamed = await callLLMStream(messages, options.onToken);
      return streamed;
    }
  }

  console.warn('[Agent] 최대 반복 횟수 초과, 마지막 답변 요청');
  messages.push({
    role: 'user',
    content: '지금까지 수집한 정보를 바탕으로 최종 답변을 해주세요.',
  });
  if (options?.onToken) {
    const streamed = await callLLMStream(messages, options.onToken);
    return streamed;
  }
  const finalResult = await callLLM(messages);
  if (finalResult.type === 'text') return finalResult.content;
  return '죄송합니다, 응답을 생성하는 데 문제가 발생했습니다.';
}
