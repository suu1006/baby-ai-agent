# 육아 AI 에이전트 앱

Claude API 기반 육아 전문 AI 어시스턴트 모바일 앱 (React Native + Expo)

## 주요 기능

- **AI 육아 상담**: Claude API를 활용한 아이 맞춤 육아 Q&A
- **육아 일기**: 기분, 사진, 마일스톤 포함 일별 기록
- **성장 기록**: 키/몸무게 트래킹 및 차트 시각화
- **홈 대시보드**: 오늘의 기록 요약 및 빠른 접근

## 기술 스택

- React Native + Expo (SDK 54)
- Expo Router (파일 기반 네비게이션)
- Supabase (인증, DB, 스토리지)
- Anthropic Claude API (AI 엔진)
- Zustand (상태 관리)

## 시작하기

### 1. 환경변수 설정

`.env.local` 파일에 아래 값들을 입력하세요:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_CLAUDE_API_KEY=your_anthropic_api_key
```

### 2. Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. `supabase/migrations/001_initial_schema.sql`을 Supabase SQL Editor에서 실행
3. 프로젝트 URL과 anon key를 `.env.local`에 입력

### 3. 의존성 설치

```bash
npm install
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
lib/                 # supabase.ts, claude.ts
store/               # Zustand 스토어
constants/           # 테마
supabase/migrations/ # DB 스키마
```
