const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api/chat`;
const MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'gemma3n:e2b';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChildContext = {
  name: string;
  ageInMonths: number;
  recentDiary?: string;
};

function buildSystemPrompt(child: ChildContext): string {
  const ageText =
    child.ageInMonths < 12
      ? `${child.ageInMonths}개월`
      : `${Math.floor(child.ageInMonths / 12)}세 ${child.ageInMonths % 12}개월`;

  return `당신은 ${child.name}의 전담 육아 AI 어시스턴트입니다.

아이 정보:
- 이름: ${child.name}
- 나이: ${ageText}

${child.recentDiary ? `최근 일기 내용: ${child.recentDiary}` : ''}

전문 역할:
- 영유아 발달 및 성장 전문가
- 수면, 이유식, 놀이, 훈육 상담
- 건강 이상 징후 초기 안내 (단, 의학적 진단은 반드시 소아과 전문의에게 의뢰)
- 한국 육아 문화와 정서를 이해하는 따뜻한 상담사

응답 원칙:
- 항상 한국어로 친근하고 따뜻하게 답변
- ${child.name}의 나이에 맞는 발달 단계를 고려하여 조언
- 불안해하는 부모를 안심시키되, 위험 신호는 명확히 안내
- 응답은 간결하고 실용적으로 (200자 이내 권장, 필요시 더 길게)`;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  child: ChildContext
): Promise<string> {
  const response = await fetch(OLLAMA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: buildSystemPrompt(child) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Ollama Error]', response.status, errorText);
    throw new Error(`Ollama 서버 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log('[Ollama] model:', data.model, '| done:', data.done);
  return data.message.content as string;
}

export function calculateAgeInMonths(birthdate: string): number {
  const birth = new Date(birthdate);
  const now = new Date();
  return (
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  );
}
