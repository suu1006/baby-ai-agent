# Review And Fix Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/review-and-fix` Claude command that turns finished code changes into a commit-ready state before `/push`.

**Architecture:** Implement this as one new markdown command file under `.claude/commands/review-and-fix.md`, following the existing `.claude/commands/*.md` style. The command inspects the working tree, maps impact scope, reviews changed code, fixes relevant issues, runs focused and full verification commands, loops on failures, and reports final validation without committing or pushing.

**Tech Stack:** Claude command markdown, Git CLI, React Native Expo project conventions, Jest via `npm test`, TypeScript validation via `npx tsc --noEmit`, Deno tests for Supabase Edge Function changes.

---

## File Structure

- Create: `.claude/commands/review-and-fix.md`
  - Defines the `/review-and-fix` command behavior.
  - Owns the post-change stabilization workflow: diff collection, impact analysis, code review, relevant fixes, verification loop, and final report.
  - Explicitly does not commit or push; `/push` remains responsible for staging, commit message approval, commit, pull rebase, and push.
- Read-only reference: `.claude/commands/review.md`
  - Existing review-only command. Keep it unchanged because it intentionally reports issues without modifying files.
- Read-only reference: `.claude/commands/push.md`
  - Existing commit and push command. `/review-and-fix` should hand off to `/push` after successful verification.
- Read-only reference: `package.json`
  - Source for npm scripts. The command should use `npm test` and `npx tsc --noEmit` when applicable.
- Read-only reference: `supabase/functions/agent-chat/*`
  - Source for Deno test conventions. The command should run Deno tests when changed files are under `supabase/functions`.

## Task 1: Add the Review And Fix Command

**Files:**
- Create: `.claude/commands/review-and-fix.md`

- [ ] **Step 1: Confirm the command does not already exist**

Run:

```bash
test ! -f .claude/commands/review-and-fix.md
```

Expected: command exits with status `0`. If it exits with status `1`, open the existing file and update it instead of creating a duplicate.

- [ ] **Step 2: Create `.claude/commands/review-and-fix.md`**

Create `.claude/commands/review-and-fix.md` with exactly this content:

```markdown
# 변경사항 리뷰 및 안정화 에이전트

작업이 끝난 코드 변경사항을 `/push` 전에 검토하고, 관련 오류를 직접 수정하고, 테스트와 최종 검증 결과를 정리합니다.

이 커맨드는 **커밋과 푸시를 하지 않습니다.** 커밋과 푸시는 검증 완료 후 `/push`에서 처리하세요.

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
**[검토 결과]**

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
- 설정/문서: `package.json`, `tsconfig.json`, `app.json`, `README.md`, `docs/**`, `.claude/**`

### 2단계: 영향범위 파악

변경된 각 소스 파일에 대해 관련 참조를 찾으세요.

```bash
rg -n "변경된 export 이름|변경된 함수 이름|변경된 컴포넌트 이름" app components lib store constants supabase __tests__
```

실제 이름으로 바꿔 실행하세요. 예를 들어 `runAgent`가 변경되었으면:

```bash
rg -n "runAgent" app components lib store constants supabase __tests__
```

영향범위는 아래 형식으로 내부적으로 정리한 뒤 리뷰와 테스트 선택에 사용하세요.

- 직접 변경 파일
- 변경 파일을 import하거나 호출하는 파일
- 변경된 사용자 흐름
- 실행해야 할 테스트 후보

### 3단계: 코드 리뷰

수집한 diff와 영향범위를 기준으로 아래 항목을 먼저 확인하세요.

1. **동작 회귀**
   - 기존 사용자 흐름이 깨지는 변경
   - props, 함수 인자, 반환값 변경 후 호출부 미수정
   - 비동기 상태, 로딩 상태, 에러 상태 누락

2. **로직 오류**
   - null/undefined 접근 가능성
   - 조건문 반전 또는 누락
   - 날짜, 시간, 정렬, 필터링 조건 오류
   - Promise 처리 누락

3. **타입 안전성**
   - 불필요한 `any`
   - 위험한 타입 단언
   - optional 값 처리 누락

4. **보안과 데이터**
   - 비밀값 하드코딩
   - 인증 사용자 범위 누락
   - Supabase RLS 또는 사용자 소유권 체크 훼손

5. **코드 품질**
   - 사용하지 않는 import, 변수, 함수
   - 디버그 `console.log`
   - 요청 범위를 벗어난 리팩터링

발견한 문제 중 변경사항과 직접 관련 있고 수정 가능한 항목은 직접 수정하세요.

수정하지 말아야 하는 경우:

- 현재 변경과 무관한 기존 문제
- 사용자의 제품 결정이 필요한 동작 변경
- 대규모 재설계가 필요한 구조 문제
- `.env`, `node_modules`, 빌드 산출물 수정이 필요한 경우

수정하지 않는 문제는 최종 보고서의 "남은 참고사항"에 적으세요.

### 4단계: 관련 문제 수정

수정할 때는 변경 범위를 작게 유지하세요.

- 변경된 기능의 의도를 유지하세요.
- 기존 코드 스타일과 파일 구조를 따르세요.
- 새 의존성을 추가하지 마세요.
- unrelated refactor를 하지 마세요.
- 사용자가 작성한 변경사항을 되돌리지 말고, 필요한 경우 그 위에 맞춰 수정하세요.

수정 후 다시 아래 명령어로 diff를 확인하세요.

```bash
git diff --stat
git diff
```

### 5단계: 검증 명령 선택

변경 파일에 따라 실행할 검증 명령을 선택하세요.

항상 실행:

```bash
npx tsc --noEmit
```

앱, 컴포넌트, lib, store, constants, Jest 테스트가 변경된 경우 실행:

```bash
npm test -- --runInBand
```

Supabase Edge Function이 변경된 경우 실행:

```bash
deno test --allow-env --allow-net supabase/functions/agent-chat
```

문서나 `.claude/commands/*.md`만 변경된 경우에는 테스트 실행이 필요하지 않습니다. 대신 아래 확인을 실행하세요.

```bash
git diff --check
```

마이그레이션 SQL이 변경된 경우에는 아래 확인을 실행하세요.

```bash
rg -n "create policy|alter policy|drop policy|enable row level security|auth.uid|user_id" supabase/migrations
git diff --check supabase/migrations
```

### 6단계: 실패 시 재수정 루프

검증 명령이 실패하면 실패 원인을 분류하세요.

- **관련 실패**: 이번 변경으로 발생했거나 이번 변경 파일과 직접 연결된 실패
- **무관 실패**: 변경하지 않은 영역의 기존 실패로 보이는 항목
- **환경 실패**: 도구 미설치, 네트워크, 로컬 설정 누락

관련 실패는 직접 수정하고 같은 검증 명령을 다시 실행하세요.

최대 3회까지 반복하세요.

1. 실패 로그에서 첫 번째 관련 오류를 선택
2. 원인 파일을 읽고 수정
3. 실패한 검증 명령 재실행
4. 통과하면 다음 검증 명령 진행

3회 반복 후에도 실패하면 더 이상 추측으로 수정하지 말고 아래 형식으로 보고하세요.

```markdown
---
**[검증 중단]**

**실패 명령:** `실패한 명령`
**관련 파일:** 파일 목록
**시도한 수정:** 요약
**현재 오류:** 핵심 오류 메시지
**필요한 판단:** 사용자가 결정해야 할 내용
---
```

### 7단계: 최종 검토

검증이 끝나면 마지막으로 아래 명령어를 실행하세요.

```bash
git status --short
git diff --stat
git diff --check
```

`git diff --check`가 whitespace 오류를 보고하면 수정하고 다시 실행하세요.

### 8단계: 최종 보고

아래 형식으로 결과를 보고하세요.

```markdown
---
**[리뷰 및 안정화 완료]**

**변경 파일:**
- 파일 목록과 한 줄 요약

**영향범위:**
- 직접 영향 파일 또는 사용자 흐름

**수정한 문제:**
- 없음 또는 수정한 문제 목록

**검증 결과:**
- `npx tsc --noEmit`: 통과 / 실패 / 실행하지 않음
- `npm test -- --runInBand`: 통과 / 실패 / 실행하지 않음
- `deno test --allow-env --allow-net supabase/functions/agent-chat`: 통과 / 실패 / 실행하지 않음
- `git diff --check`: 통과 / 실패

**남은 참고사항:**
- 없음 또는 사용자가 알아야 할 기존 실패/환경 이슈/제품 판단 사항

다음 단계: 문제가 없으면 `/push`로 커밋과 푸시를 진행하세요.
---
```

## 주의사항

- 커밋하지 마세요.
- 푸시하지 마세요.
- 사용자가 만든 변경사항을 임의로 되돌리지 마세요.
- 현재 변경과 무관한 리팩터링을 하지 마세요.
- 비밀값, `.env`, `node_modules`, 빌드 산출물을 수정하지 마세요.
- 실패한 테스트를 삭제하거나 약화하지 마세요.
- 검증을 실행하지 못했다면 이유를 최종 보고서에 명확히 적으세요.
```

- [ ] **Step 3: Verify the command file exists and starts with the expected title**

Run:

```bash
sed -n '1,40p' .claude/commands/review-and-fix.md
```

Expected: output starts with:

```text
# 변경사항 리뷰 및 안정화 에이전트
```

- [ ] **Step 4: Check for placeholder language**

Run:

```bash
rg -n "TBD|TODO|implement later|fill in details|적절한|필요한 경우 처리" .claude/commands/review-and-fix.md
```

Expected: no matches.

- [ ] **Step 5: Check markdown command references**

Run:

```bash
rg -n "/review-and-fix|/push|커밋하지|푸시하지|npx tsc --noEmit|npm test -- --runInBand|deno test" .claude/commands/review-and-fix.md
```

Expected: output includes references to `/review-and-fix`, `/push`, no commit/push rules, TypeScript validation, Jest validation, and Deno validation.

- [ ] **Step 6: Commit**

Run:

```bash
git add .claude/commands/review-and-fix.md
git commit -m "feat: add review and fix command"
```

Expected: commit succeeds.

## Task 2: Update the Existing Review Command Handoff

**Files:**
- Modify: `.claude/commands/review.md`

- [ ] **Step 1: Read the current handoff text**

Run:

```bash
sed -n '55,85p' .claude/commands/review.md
```

Expected: output includes:

```text
수정 후 재검토가 필요한 경우: "수정 완료 후 `/review`를 다시 실행하거나 `/push`로 진행하세요."
문제가 없는 경우: "`/push`로 푸시를 진행하세요."
```

- [ ] **Step 2: Update the handoff to mention `/review-and-fix`**

Change the handoff block in `.claude/commands/review.md` to:

```markdown
수정이 필요한 경우: "`/review-and-fix`로 수정과 검증을 진행하거나, 직접 수정 후 `/review`를 다시 실행하세요."
문제가 없는 경우: "`/push`로 커밋과 푸시를 진행하세요."
```

Keep the "주의사항" section unchanged, including the rule that `/review` does not directly modify code.

- [ ] **Step 3: Verify the updated handoff**

Run:

```bash
sed -n '65,82p' .claude/commands/review.md
```

Expected: output includes:

```text
수정이 필요한 경우: "`/review-and-fix`로 수정과 검증을 진행하거나, 직접 수정 후 `/review`를 다시 실행하세요."
문제가 없는 경우: "`/push`로 커밋과 푸시를 진행하세요."
```

- [ ] **Step 4: Confirm `/review` still says it does not modify code**

Run:

```bash
rg -n "코드를 직접 수정하지 않습니다|/review-and-fix|/push" .claude/commands/review.md
```

Expected: output includes all three ideas:

```text
코드를 직접 수정하지 않습니다
/review-and-fix
/push
```

- [ ] **Step 5: Commit**

Run:

```bash
git add .claude/commands/review.md
git commit -m "docs: update review command handoff"
```

Expected: commit succeeds.

## Task 3: Final Verification

**Files:**
- Verify: `.claude/commands/review-and-fix.md`
- Verify: `.claude/commands/review.md`

- [ ] **Step 1: Confirm command files are present**

Run:

```bash
find .claude/commands -maxdepth 1 -type f -print | sort
```

Expected: output includes:

```text
.claude/commands/push.md
.claude/commands/review-and-fix.md
.claude/commands/review.md
```

- [ ] **Step 2: Confirm `/review-and-fix` does not include commit or push execution commands**

Run:

```bash
rg -n "git commit|git push|git add -A|git add \\.|pull origin" .claude/commands/review-and-fix.md
```

Expected: no matches.

- [ ] **Step 3: Confirm `/review-and-fix` includes the full stabilization workflow**

Run:

```bash
rg -n "변경사항 수집|영향범위 파악|코드 리뷰|관련 문제 수정|검증 명령 선택|실패 시 재수정 루프|최종 검토|최종 보고" .claude/commands/review-and-fix.md
```

Expected: output includes all eight workflow headings.

- [ ] **Step 4: Confirm markdown files have no trailing whitespace errors**

Run:

```bash
git diff --check HEAD~2..HEAD
```

Expected: no output and exit status `0`.

- [ ] **Step 5: Confirm latest commits**

Run:

```bash
git log --oneline -2
```

Expected: latest two commits are:

```text
<hash> docs: update review command handoff
<hash> feat: add review and fix command
```

## Self-Review

- Spec coverage: The plan covers the requested flow: changed-file inspection, impact analysis, review, fix, test, refix loop, final validation summary, and handoff to existing commit/push command.
- Placeholder scan: No `TBD`, `TODO`, or incomplete implementation steps are present. Command text provides exact report formats, command lists, and stopping conditions.
- Type consistency: This plan only creates markdown command files, so there are no runtime types or function signatures to reconcile. Command names are consistently `/review-and-fix`, `/review`, and `/push`.
