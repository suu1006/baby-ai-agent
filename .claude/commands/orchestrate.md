# 오케스트레이션 에이전트

완료된 코드 변경사항을 `/push` 전에 병렬 역할 모델로 점검하고, 관련 문제를 수정해 커밋 준비 상태로 만듭니다.

이 커맨드는 **커밋과 푸시를 하지 않습니다.** 검증 완료 후 커밋과 푸시는 `/push`에서 처리하세요.

## 기본 역할

### Reviewer

변경 diff와 영향범위를 코드 리뷰 관점에서 분석합니다.

- 보안, 데이터 소유권, 비밀값 노출
- 사용자 흐름 회귀
- 타입 안전성, null/undefined 접근
- 비동기 상태, 로딩/에러 상태 누락
- 불필요한 리팩터링, 디버그 코드

Reviewer는 파일을 수정하지 않습니다. 결과는 `수정 필요`, `참고`, `무시 가능`으로 분류하세요.

### Tester

변경 파일을 기준으로 검증 명령을 선택하고 실행합니다.

- 앱 소스 또는 TypeScript 파일 변경: `npx tsc --noEmit`
- 앱, 컴포넌트, lib, store, constants, Jest 테스트 변경: `npm test -- --runInBand`
- Supabase Edge Function 변경: `deno test --allow-env --allow-net supabase/functions/agent-chat`
- 문서나 `.claude/commands/*.md`만 변경: `git diff --check`
- 마이그레이션 SQL 변경: `rg -n "create policy|alter policy|drop policy|enable row level security|auth.uid|user_id" supabase/migrations` 와 `git diff --check supabase/migrations`

Tester는 파일을 수정하지 않습니다. 실패는 `관련 실패`, `무관 실패`, `환경 실패`로 분류하세요.

### Fixer

Reviewer와 Tester 결과를 통합해 이번 변경과 직접 관련 있는 문제만 수정합니다.

- 사용자의 기존 변경을 되돌리지 마세요.
- 승인받지 않은 대규모 재설계로 확장하지 마세요.
- 실패한 검증 명령만 다시 실행하세요.
- 수정 루프는 최대 3회까지만 반복하세요.

Fixer만 파일 수정 권한을 갖습니다.

## 실행 절차

### 1단계: 변경사항 수집

아래 명령어로 현재 작업 상태를 확인하세요.

```bash
git status --short
git diff --stat
git diff
git diff --cached --stat
git diff --cached
```

변경사항이 없으면 아래처럼 보고하고 즉시 종료하세요.

```markdown
---
**[오케스트레이션 결과]**

검토할 변경사항이 없습니다.
---
```

변경사항이 있으면 파일을 다음 기준으로 분류하세요.

- 앱 화면: `app/**/*.tsx`
- 공용 컴포넌트: `components/**/*.tsx`
- 클라이언트 라이브러리와 상태: `lib/**/*.ts`, `store/**/*.ts`
- 테마와 상수: `constants/**/*.ts`
- Supabase 함수: `supabase/functions/**/*.ts`
- DB 마이그레이션: `supabase/migrations/**/*.sql`
- 설정/문서/커맨드: `package.json`, `tsconfig.json`, `app.json`, `README.md`, `docs/**`, `.claude/**`

### 2단계: 영향범위 파악

변경된 export, 함수, 컴포넌트, 타입 이름을 실제 이름으로 바꿔 참조를 찾으세요.

```bash
rg -n "변경된 export 이름|변경된 함수 이름|변경된 컴포넌트 이름" app components lib store constants supabase __tests__
```

영향범위는 내부적으로 아래 항목으로 정리하세요.

- 직접 변경 파일
- 변경 파일을 import하거나 호출하는 파일
- 변경된 사용자 흐름
- 실행해야 할 테스트 후보

### 3단계: 역할 실행

서브에이전트 병렬 실행이 가능한 환경에서는 Reviewer와 Tester를 병렬로 실행하세요.

```text
Reviewer: diff와 영향범위 기반 코드 리뷰
Tester: 변경 파일 기반 검증 명령 선택과 실행
```

병렬 실행이 불가능한 환경에서는 같은 역할을 순서대로 수행하되, 결과 보고는 반드시 Reviewer / Tester / Fixer 섹션으로 나누세요.

### 4단계: 결과 통합

Reviewer와 Tester 결과를 하나의 수정 후보 목록으로 합치세요.

우선순위:

1. 보안, 데이터 손실, 인증/소유권 문제
2. 테스트 또는 타입체크 관련 실패
3. 사용자 흐름 회귀 가능성
4. 타입 안전성과 null 처리
5. 코드 품질과 정리

아래 항목은 수정하지 말고 최종 보고서의 `남은 참고사항`에 적으세요.

- 이번 변경과 무관한 기존 문제
- 제품 결정이 필요한 동작 변경
- 대규모 재설계가 필요한 구조 문제
- 로컬 환경이나 외부 서비스 설정 문제

### 5단계: Fixer 수정 루프

Fixer는 관련 문제만 작게 수정하세요.

수정 후 실패했던 검증 명령을 다시 실행하세요. 새 수정이 앱 소스나 TypeScript 파일에 영향을 주면 `npx tsc --noEmit`도 다시 실행하세요.

루프는 최대 3회까지 반복합니다.

```text
1. 첫 번째 관련 실패 또는 심각 리뷰 항목 선택
2. 원인 파일 확인
3. 최소 범위 수정
4. 실패했던 검증 명령 재실행
5. 통과하면 다음 관련 항목 진행
```

3회 후에도 실패하면 더 이상 추측으로 수정하지 말고 남은 실패를 보고하세요.

### 6단계: 최종 보고

아래 형식으로 보고하세요.

```markdown
---
**[오케스트레이션 완료]**

**변경 파일:**
- 파일 경로: 변경 요약

**Reviewer 결과:**
- 수정한 문제
- 남은 참고사항

**Tester 결과:**
- `명령어`: 통과 / 실패 / 실행하지 않음
- 실패했다면 관련 실패 / 무관 실패 / 환경 실패 구분

**Fixer 결과:**
- 수정한 파일과 이유
- 재실행한 검증 명령

**다음 단계:**
- 검증이 통과했다면 `/push`로 커밋과 푸시를 진행하세요.
- 남은 실패가 있다면 실패 원인과 필요한 사용자 결정을 확인하세요.
---
```

## 주의사항

- 이 커맨드는 오케스트레이션과 안정화 전용입니다.
- 커밋, pull rebase, push는 실행하지 마세요.
- Reviewer와 Tester는 분석만 하고 파일을 수정하지 않습니다.
- Fixer는 이번 변경과 직접 관련된 문제만 수정합니다.
- 사용자가 만든 변경사항을 되돌리지 마세요.
- `.env`, `node_modules`, 빌드 산출물은 수정하지 마세요.
- 첫 리허설은 문서/커맨드 변경처럼 위험이 낮은 변경으로 실행하는 것을 권장합니다.
