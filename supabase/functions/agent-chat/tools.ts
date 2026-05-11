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
      const days = Number.parseInt(String(args.days ?? '7'), 10);
      return await searchBabyData(
        context.supabase,
        context.child.id,
        String(args.data_type ?? 'all'),
        Number.isFinite(days) && days > 0 ? days : 7,
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
    execute: async (args) => analyzePattern(
      String(args.data_json ?? '{}'),
      String(args.analysis_type ?? 'overall'),
    ),
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
