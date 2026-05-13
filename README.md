# 육아 AI 에이전트 앱

OpenRouter 서버툴 기반 육아 전문 AI 어시스턴트 모바일 앱 (React Native + Expo)

## 주요 기능

- **AI 육아 상담**: OpenRouter tool calling과 Supabase 서버 도구를 활용한 아이 맞춤 육아 Q&A
- **육아 일기**: 기분, 사진, 마일스톤 포함 일별 기록
- **성장 기록**: 키/몸무게 트래킹 및 차트 시각화
- **홈 대시보드**: 오늘의 기록 요약 및 빠른 접근

## 기술 스택

- React Native + Expo (SDK 54)
- Expo Router (파일 기반 네비게이션)
- Supabase (인증, DB, 스토리지)
- OpenRouter + Supabase Edge Functions (AI 엔진/서버 도구)
- Zustand (상태 관리)

## 시작하기

### 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. `supabase/migrations`의 SQL을 Supabase SQL Editor에서 순서대로 실행
3. 앱이 Supabase·AI 등 외부 서비스에 접근하려면, 프로젝트에서 요구하는 방식으로 자격 증명(환경 변수 등)을 설정하세요.

### 2. 의존성 설치

```bash
npm install
```

### 3. OpenRouter 서버 에이전트 설정

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

### 4. 개발 서버 실행

```bash
# Expo Go로 실행
npx expo start

# iOS 시뮬레이터
npx expo start --ios

# Android 에뮬레이터
npx expo start --android
```

### Expo Go (실기기)

1. 터미널에서 `npx expo start` 실행  
2. 맥과 폰을 **같은 Wi‑Fi**에 연결  
3. **QR 코드 스캔**: iPhone은 기본 카메라, Android는 Expo Go 앱에서 스캔  

대부분은 위 세 가지만으로 연결됩니다. 같은 Wi‑Fi인데도 붙지 않을 때만 `npx expo start --tunnel`로 다시 시도하세요.

## 빌드 & 배포

### EAS Build 설치

```bash
npm install -g eas-cli
eas login
```

### 빌드

```bash
# 개발 빌드
eas build --profile development --platform ios

# 프리뷰 빌드 (내부 테스트)
eas build --profile preview --platform all

# 프로덕션 빌드
eas build --profile production --platform all
```

### 스토어 제출

```bash
# App Store
eas submit --profile production --platform ios

# Google Play
eas submit --profile production --platform android
```

## 프로젝트 구조

```
app/
├── (auth)/          # 로그인/회원가입
├── (tabs)/          # 메인 탭 화면
│   ├── index.tsx    # 홈
│   ├── chat.tsx     # AI 채팅
│   ├── diary.tsx    # 육아일기
│   ├── growth.tsx   # 성장기록
│   └── settings.tsx # 설정
├── diary/           # 일기 상세/작성
└── onboarding.tsx   # 아이 정보 등록
components/
lib/                 # supabase.ts, agent.ts, age.ts
store/               # Zustand 스토어
constants/           # 테마
supabase/migrations/ # DB 스키마
```
